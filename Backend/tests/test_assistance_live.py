"""Real HTTP integration against a loopback Django server, independent JWT users."""
import json
import uuid
import urllib.request
import urllib.error
from django.test import LiveServerTestCase
from django.core.cache import cache
from apps.users.models import WorkLensUser
from apps.worklens.models import WorkLensSession, Problem, ProblemContext
from apps.assistance.models import ExpertProfile, AssistanceMessage


class LivePollingDemoTest(LiveServerTestCase):
    def http(self, path, token=None, body=None):
        request = urllib.request.Request(self.live_server_url + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})})
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    def test_two_user_http_request_accept_poll_reply_end(self):
        cache.clear()
        users = [WorkLensUser.objects.create_user(f'live-{n}@tcs.com', f'Live {n}', 'strongpass!') for n in range(3)]
        tokens = [self.http('/api/auth/login/', body={'email': u.email, 'password': 'strongpass!'})[1]['access'] for u in users]
        a, b, c = tokens
        conversation = WorkLensSession.objects.create(user=users[0])
        problem = Problem.objects.create(user=users[0], session=conversation, language='python', category='import', problem_type='runtime', description='Import error')
        context = ProblemContext.objects.create(problem=problem, file_name='main.py', selected_code='private')
        expert = ExpertProfile.objects.create(user=users[1], eligible=True, skills=['Python'], availability='available')
        status, case = self.http('/api/assistance/cases/', a, {'problem_id': str(problem.id), 'conversation_id': str(conversation.id), 'problem_context_id': str(context.id), 'consent': True, 'summary': 'Python import issue'})
        self.assertEqual(status, 200)
        status, session = self.http('/api/assistance/sessions/', a, {'case_id': case['id'], 'expert_id': str(expert.id), 'mode': 'human'})
        self.assertEqual(status, 201)
        sid = session['id']; path = f'/api/assistance/sessions/{sid}/'
        self.assertEqual(self.http('/api/assistance/notifications/', b)[1]['unread_count'], 1)
        self.assertEqual(self.http(path, b, {'action': 'accept'})[1]['status'], 'active')
        self.assertEqual(self.http(path, a)[1]['status'], 'active')
        for author, reader, text in [(a, b, 'Import fails in VS Code'), (b, a, 'Check the selected interpreter')]:
            self.assertEqual(self.http(path + 'messages/', author, {'client_id': str(uuid.uuid4()), 'text': text})[0], 201)
            page = self.http(path + 'messages/', reader)[1]
            self.assertEqual(page['transport'], 'automatic_polling')
            self.assertIn(text, [m['text'] for m in page['messages']])
        self.assertEqual(AssistanceMessage.objects.filter(session_id=sid).count(), 2)
        self.assertEqual(self.http(path + 'messages/', c)[0], 404)
        self.assertEqual(self.http(path, b, {'action': 'end', 'outcome': 'resolved', 'resolution_summary': 'Interpreter mismatch identified'})[1]['status'], 'ended')
        self.assertEqual(self.http(path + 'messages/', a, {'client_id': str(uuid.uuid4()), 'text': 'late'})[0], 400)
        self.assertEqual(self.http(path + 'feedback/', a, {'resolved': True, 'rating': 5, 'understandable': True})[0], 200)
