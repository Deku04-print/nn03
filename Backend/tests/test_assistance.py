import copy
import hashlib
import uuid
from datetime import timedelta
from unittest.mock import patch
from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase, APIClient
from apps.users.models import WorkLensUser
from apps.worklens.models import WorkLensSession, Problem, ProblemContext
from apps.knowledge.models import ProblemDNA
from apps.assistance.models import (ExpertProfile, ExpertKnowledge, ExpertAudit, AssistanceCase,
    AssistanceSession, AssistanceMessage, Notification, SessionFeedback, AITurn, BrowserHandoff)
from .test_api import MOCK_ORCH_RESULT, ANALYZE_PAYLOAD

BASE = '/api/assistance/'


class AssistanceTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = WorkLensUser.objects.create_user('a@tcs.com', 'User A', 'strongpass!')
        self.expert_user = WorkLensUser.objects.create_user('b@tcs.com', 'Expert B', 'strongpass!')
        self.third = WorkLensUser.objects.create_user('c@tcs.com', 'User C', 'strongpass!')
        self.admin = WorkLensUser.objects.create_superuser('admin@tcs.com', 'Admin', 'strongpass!')
        self.expert = ExpertProfile.objects.create(user=self.expert_user, eligible=True, skills=['React', 'JavaScript'], availability='available')
        self.conversation = WorkLensSession.objects.create(user=self.user)
        self.problem = Problem.objects.create(user=self.user, session=self.conversation, language='javascriptreact',
            framework='React', category='state', problem_type='logic', description='React state is stale')
        self.context = ProblemContext.objects.create(problem=self.problem, file_name='private.jsx', selected_code='PRIVATE_SOURCE')
        self.dna = ProblemDNA.objects.create(problem=self.problem, language='javascriptreact', category='state', error_type='logic')
        self.client.force_authenticate(self.user)

    def create_case(self, **extra):
        response = self.client.post(BASE + 'cases/', {'problem_id': str(self.problem.id),
            'conversation_id': str(self.conversation.id), 'problem_context_id': str(self.context.id),
            'consent': True, 'summary': 'React state issue', 'history': 'Reviewed troubleshooting history', **extra}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return response.data['id']

    def create_session(self, mode='human'):
        response = self.client.post(BASE + 'sessions/', {'case_id': self.create_case(), 'expert_id': str(self.expert.id), 'mode': mode}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['id']

    def client_for(self, user):
        client = APIClient()
        login = client.post('/api/auth/login/', {'email': user.email, 'password': 'strongpass!'}, format='json')
        self.assertEqual(login.status_code, 200)
        client.credentials(HTTP_AUTHORIZATION='Bearer ' + login.data['access'])
        return client

    def test_two_authenticated_users_poll_persistent_chat(self):
        # Real JWTs and shared DB; the exact HTTP calls used by the polling clients.
        a, b, c = [self.client_for(u) for u in [self.user, self.expert_user, self.third]]
        self.client = a
        sid = self.create_session()
        notifications = b.get(BASE + 'notifications/').data
        self.assertEqual(notifications['unread_count'], 1)
        self.assertEqual(str(notifications['notifications'][0]['session_id']), sid)
        self.assertEqual(b.post(BASE + f'sessions/{sid}/', {'action': 'accept'}, format='json').status_code, 200)
        self.assertEqual(a.get(BASE + f'sessions/{sid}/').data['status'], 'active')
        for client, peer, text in [(a, b, 'State seems stale'), (b, a, 'Inspect the event closure')]:
            payload = {'text': text, 'client_id': str(uuid.uuid4())}
            self.assertEqual(client.post(BASE + f'sessions/{sid}/messages/', payload, format='json').status_code, 201)
            self.assertIn(text, [m['text'] for m in peer.get(BASE + f'sessions/{sid}/messages/').data['messages']])
            client.post(BASE + f'sessions/{sid}/messages/', payload, format='json')
        self.assertEqual(AssistanceMessage.objects.filter(session_id=sid).count(), 2)
        self.assertEqual(c.get(BASE + f'sessions/{sid}/messages/').status_code, 404)
        self.assertEqual(c.post(BASE + f'sessions/{sid}/', {'action': 'end'}, format='json').status_code, 404)
        self.assertEqual(a.post(BASE + f'sessions/{sid}/', {'action': 'end', 'outcome': 'resolved', 'resolution_summary': 'Reviewed closure'}, format='json').status_code, 200)
        self.assertEqual(b.post(BASE + f'sessions/{sid}/messages/', {'text': 'late', 'client_id': str(uuid.uuid4())}, format='json').status_code, 400)
        self.assertEqual(ProblemDNA.objects.count(), 1)
        self.problem.refresh_from_db()
        self.assertEqual(self.problem.dna.verification_status, 'pending')

    def test_session_and_context_isolation(self):
        sid = self.create_session()
        self.client.force_authenticate(self.expert_user)
        data = self.client.get(BASE + f'sessions/{sid}/').data
        self.assertNotIn('PRIVATE_SOURCE', str(data))
        self.assertEqual(data['shared_context']['history'], 'Reviewed troubleshooting history')
        self.assertEqual(self.client.get(f'/api/worklens/problem/{self.problem.id}/').status_code, 404)
        self.client.force_authenticate(self.third)
        self.assertEqual(self.client.get(BASE + 'experts/?case_id=' + data['case_id']).status_code, 404)

    def test_consent_and_ids_required(self):
        self.assertEqual(self.client.post(BASE + 'cases/', {'consent': False}, format='json').status_code, 400)
        self.assertEqual(self.client.get(BASE + 'experts/?case_id=bad').status_code, 400)
        sid = self.create_session()
        self.assertEqual(self.client.post(BASE + f'sessions/{sid}/', {'action': 'accept'}, format='json').status_code, 403)

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_explicit_human_help_needs_no_ai_response_and_reuses_existing_problem(self, orch):
        data = self.client.post(BASE + 'explicit-help-context/', {'user_message': 'I need human help', 'language': 'python'}, format='json').data
        self.assertEqual(data['ai_response_count'], 0)
        self.assertTrue(data['human_api_suggested'])
        self.assertIsNotNone(data['problem_context_id'])
        again = self.client.post(BASE + 'explicit-help-context/', {'problem_id': data['problem_id']}, format='json').data
        self.assertEqual(again['problem_id'], data['problem_id'])
        orch.assert_not_called()
        self.client.force_authenticate(self.third)
        self.assertEqual(self.client.post(BASE + 'explicit-help-context/', {'problem_id': data['problem_id']}, format='json').status_code, 404)

    def test_case_and_request_retries_do_not_duplicate_notifications(self):
        a = self.create_session(); b = self.create_session()
        self.assertEqual(a, b)
        self.assertEqual(AssistanceCase.objects.count(), 1)
        self.assertEqual(Notification.objects.count(), 1)

    def test_notifications_are_private_and_readable(self):
        self.create_session()
        notification = Notification.objects.get()
        self.assertEqual(self.client.get(BASE + 'notifications/').data['unread_count'], 0)
        self.assertEqual(self.client.post(BASE + 'notifications/', {'id': str(notification.id)}, format='json').status_code, 404)
        self.client.force_authenticate(self.expert_user)
        self.client.post(BASE + 'notifications/', {'id': str(notification.id)}, format='json')
        self.assertEqual(self.client.get(BASE + 'notifications/').data['unread_count'], 0)

    def test_admin_only_status_and_audit_and_nonexclusive_expert_role(self):
        path = BASE + f'admin/experts/{self.expert_user.id}/'
        self.assertEqual(self.client.patch(path, {'organizational_status': 'exited'}, format='json').status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(path, {'organizational_status': 'exited', 'visual_enabled': True}, format='json').status_code, 200)
        audit = ExpertAudit.objects.get()
        self.assertEqual(audit.actor, self.admin)
        self.assertEqual(audit.changes['organizational_status']['before'], 'active')
        self.expert_user.refresh_from_db()
        self.assertTrue(self.expert_user.is_active)
        self.assertFalse(self.expert_user.is_staff)
        self.client.force_authenticate(self.expert_user)
        self.assertEqual(self.client.get(BASE + 'dashboard/').status_code, 200)

    def test_database_competencies_rank_react_above_java(self):
        ExpertProfile.objects.create(user=self.third, eligible=True, skills=['Java'], availability='available')
        response = self.client.get(BASE + 'experts/?case_id=' + self.create_case())
        experts = response.data['experts']
        self.assertEqual(experts[0]['id'], str(self.expert.id))
        self.assertIn('React', experts[0]['matched_skills'])
        self.assertEqual(experts[1]['matched_skills'], [])
        self.assertIsNone(experts[0]['rating'])

    def test_active_offline_is_not_visual_expert(self):
        self.expert.availability = 'offline'; self.expert.visual_enabled = True; self.expert.save()
        ExpertKnowledge.objects.create(expert=self.expert, title='React', content='React state', source_reference='test:1', approved=True)
        self.assertFalse(self.expert.visual_eligible)
        response = self.client.post(BASE + 'sessions/', {'case_id': self.create_case(), 'expert_id': str(self.expert.id), 'mode': 'visual'}, format='json')
        self.assertEqual(response.status_code, 400)

    def make_visual(self):
        self.expert.organizational_status = 'exited'; self.expert.visual_enabled = True; self.expert.save()
        return ExpertKnowledge.objects.create(expert=self.expert, title='React state', content='React state snapshots require inspecting closures.', source_reference='approved:react', approved=True)

    @patch('apps.assistance.services.call_llm', return_value='Evidence: snapshots. Inference: inspect closure values.')
    def test_visual_uses_only_selected_approved_knowledge_and_persists_sources(self, llm):
        knowledge = self.make_visual()
        ExpertKnowledge.objects.create(expert=self.expert, title='Secret React', content='UNAPPROVED_SENTINEL', source_reference='private:1', approved=False)
        other = ExpertProfile.objects.create(user=self.third, eligible=True)
        ExpertKnowledge.objects.create(expert=other, title='React', content='OTHER_EXPERT_SENTINEL', source_reference='other:1', approved=True)
        sid = self.create_session('visual')
        payload = {'text': 'React state snapshots', 'client_id': str(uuid.uuid4())}
        response = self.client.post(BASE + f'sessions/{sid}/messages/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        prompt = llm.call_args.kwargs['user']
        self.assertIn(knowledge.content, prompt)
        self.assertNotIn('UNAPPROVED_SENTINEL', prompt)
        self.assertNotIn('OTHER_EXPERT_SENTINEL', prompt)
        self.assertNotIn('Reviewed troubleshooting history', prompt)
        answer = AssistanceMessage.objects.get(session_id=sid, kind='ai')
        self.assertIn('AI-generated', answer.text)
        self.assertIsNone(answer.author)
        self.assertEqual(answer.sources[0]['id'], str(knowledge.id))
        self.client.post(BASE + f'sessions/{sid}/messages/', payload, format='json')
        self.assertEqual(llm.call_count, 1)
        self.assertEqual(AssistanceMessage.objects.count(), 2)

    @patch('apps.assistance.services.call_llm')
    def test_no_relevant_knowledge_discloses_limitation_without_model_call(self, llm):
        self.make_visual(); sid = self.create_session('visual')
        self.client.post(BASE + f'sessions/{sid}/messages/', {'text': 'Kubernetes certificate rotation', 'client_id': str(uuid.uuid4())}, format='json')
        answer = AssistanceMessage.objects.get(session_id=sid, kind='ai')
        self.assertIn('No relevant approved', answer.text)
        llm.assert_not_called()

    def test_visual_requires_approved_knowledge_and_revocation_enforced(self):
        knowledge = self.make_visual(); sid = self.create_session('visual')
        knowledge.approved = False; knowledge.save()
        response = self.client.post(BASE + f'sessions/{sid}/messages/', {'text': 'React', 'client_id': str(uuid.uuid4())}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(AssistanceMessage.objects.filter(kind='ai').exists())

    def test_feedback_validates_range_and_exact_session_and_is_idempotent(self):
        sid = self.create_session()
        body = {'resolved': True, 'rating': 5, 'understandable': True, 'comment': 'Clear guidance'}
        self.assertEqual(self.client.post(BASE + f'sessions/{sid}/feedback/', body, format='json').status_code, 400)
        self.client.post(BASE + f'sessions/{sid}/', {'action': 'end'}, format='json')
        self.assertEqual(self.client.post(BASE + f'sessions/{sid}/feedback/', {**body, 'rating': 6}, format='json').status_code, 400)
        for _ in range(2): self.assertEqual(self.client.post(BASE + f'sessions/{sid}/feedback/', body, format='json').status_code, 200)
        self.assertEqual(SessionFeedback.objects.count(), 1)
        self.client.force_authenticate(self.expert_user)
        self.assertEqual(self.client.post(BASE + f'sessions/{sid}/feedback/', body, format='json').status_code, 404)

    @override_settings(HUMAN_API_RESPONSE_THRESHOLD=4)
    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_ai_turn_feedback_count_retry_and_context_preserved(self, orch):
        orch.return_value.run.side_effect = lambda **kwargs: copy.deepcopy(MOCK_ORCH_RESULT)
        payload = {**ANALYZE_PAYLOAD, 'client_turn_id': str(uuid.uuid4())}
        first = self.client.post('/api/worklens/analyze/', payload, format='json').data
        retry = self.client.post('/api/worklens/analyze/', payload, format='json').data
        self.assertEqual(first['response_id'], retry['response_id'])
        self.assertEqual(retry['ai_response_count'], 1)
        for n in range(2, 5):
            response = self.client.post('/api/worklens/hint/', {**payload, 'problem_id': first['problem_id'],
                'session_id': first['session_id'], 'client_turn_id': str(uuid.uuid4())}, format='json').data
            self.assertEqual(response['ai_response_count'], n)
            self.assertEqual(response['human_api_suggested'], n >= 4)
            self.assertEqual(response['problem_context_id'], first['problem_context_id'])
        for value in [1, -1, -1]:
            result = self.client.post(BASE + f"turns/{first['response_id']}/feedback/", {'value': value}, format='json')
            self.assertEqual(result.data['value'], value)
        turn = AITurn.objects.get(pk=first['response_id'])
        self.assertEqual(turn.feedback.user, self.user)
        self.assertEqual(turn.feedback.value, -1)
        self.client.force_authenticate(self.third)
        self.assertEqual(self.client.post(BASE + f"turns/{first['response_id']}/feedback/", {'value': 1}, format='json').status_code, 404)

    def test_own_dashboard_and_privileged_apis(self):
        self.assertEqual(len(self.client.get(BASE + 'dashboard/').data['problems']), 1)
        self.client.force_authenticate(self.third)
        self.assertEqual(self.client.get(BASE + 'dashboard/').data['problems'], [])
        self.assertEqual(self.client.get('/api/analytics/overview/').status_code, 403)
        self.assertEqual(self.client.get('/api/problems/').status_code, 403)
        self.client.force_authenticate(None)
        for path in ['dashboard/', 'notifications/', 'sessions/']:
            self.assertEqual(self.client.get(BASE + path).status_code, 401)

    def test_handoff_requires_proof_approval_single_use_and_expiry(self):
        cid = self.create_case()
        response = self.client.post(BASE + 'handoffs/', {'destination': '/human-api/' + cid}, format='json')
        self.assertEqual(response.status_code, 200)
        hid = response.data['id']; proof = 'A' * 43
        browser = APIClient()
        path = BASE + f'handoffs/{hid}/browser/'
        claimed = browser.post(path, {'action': 'claim', 'proof': proof}, format='json')
        self.assertEqual(browser.post(path, {'proof': proof}, format='json').status_code, 202)
        self.assertEqual(browser.post(path, {'proof': 'B' * 43}, format='json').status_code, 403)
        self.assertEqual(self.client.post(BASE + f'handoffs/{hid}/', {'verification_code': 'WRONG'}, format='json').status_code, 400)
        self.client.post(BASE + f'handoffs/{hid}/', {'verification_code': claimed.data['verification_code']}, format='json')
        exchange = browser.post(path, {'proof': proof}, format='json')
        self.assertEqual(exchange.status_code, 200)
        browser.credentials(HTTP_AUTHORIZATION='Bearer ' + exchange.data['access'])
        self.assertEqual(str(browser.get('/api/auth/me/').data['user']['id']), str(self.user.id))
        self.assertEqual(browser.post(path, {'proof': proof}, format='json').status_code, 404)
        expired = BrowserHandoff.objects.create(user=self.user, destination='/human-api/' + cid, expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(browser.post(BASE + f'handoffs/{expired.id}/browser/', {'proof': proof, 'action': 'claim'}, format='json').status_code, 404)

    def test_handoff_cannot_redirect_offsite_or_access_other_users_case(self):
        cid = self.create_case()
        self.assertEqual(self.client.post(BASE + 'handoffs/', {'destination': 'https://evil.invalid'}, format='json').status_code, 400)
        self.client.force_authenticate(self.third)
        self.assertEqual(self.client.post(BASE + 'handoffs/', {'destination': '/human-api/' + cid}, format='json').status_code, 404)

    def test_demo_seed_idempotent_and_cleanup_preserves_real_users(self):
        call_command('seed_demo_experts', verbosity=0); call_command('seed_demo_experts', verbosity=0)
        self.assertEqual(ExpertProfile.objects.filter(is_demo=True).count(), 5)
        for p in ExpertProfile.objects.filter(is_demo=True):
            self.assertTrue(p.visual_eligible); self.assertFalse(p.user.has_usable_password())
        call_command('seed_demo_experts', remove=True, verbosity=0)
        self.assertEqual(ExpertProfile.objects.filter(is_demo=True).count(), 0)
        self.assertTrue(WorkLensUser.objects.filter(pk=self.user.pk).exists())
