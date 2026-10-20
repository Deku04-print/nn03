from rest_framework.test import APITestCase
from unittest.mock import patch

from apps.collaboration.models import (
    AIResponse, AIResponseFeedback, AIResponseReview, AssistanceSession,
    ExpertProfile, LearningRecommendation,
    VisualExpertKnowledge,
)
from apps.nexus.models import NexusSession, Problem, ProblemContext
from apps.knowledge.models import ProblemDNA
from apps.users.models import NexusUser


class CollaborationApiTests(APITestCase):
    def setUp(self):
        self.developer = NexusUser.objects.create_user('dev@nexus.test', 'Developer', 'pass12345')
        self.expert = NexusUser.objects.create_user('expert@nexus.test', 'Expert', 'pass12345')
        self.other = NexusUser.objects.create_user('other@nexus.test', 'Other', 'pass12345')
        self.profile = ExpertProfile.objects.create(
            user=self.expert, languages=['python'], frameworks=['django'],
            categories=['runtime_error'], years_experience=5, is_available=True,
        )
        self.project_session = NexusSession.objects.create(user=self.developer, project='sample')
        self.problem = Problem.objects.create(
            session=self.project_session, user=self.developer, language='python',
            framework='django', problem_type='runtime', category='runtime_error',
            description='A runtime issue',
        )
        ProblemContext.objects.create(
            problem=self.problem, file_name='app.py', selected_code='password = "example-secret"',
            surrounding_code='print(password)', diagnostics=[],
        )
        self.ai_response = AIResponse.objects.create(
            user=self.developer, problem=self.problem,
            content={'observation': 'Check how the value is produced.'},
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_expert_can_update_only_their_profile_skills_and_availability(self):
        self.authenticate(self.expert)
        response = self.client.patch('/api/collaboration/experts/me/', {
            'bio': 'Python mentor', 'languages': [' python ', 'python', 'javascript'],
            'frameworks': ['Django'], 'categories': ['runtime_error'],
            'years_experience': 6, 'is_available': False, 'max_active_sessions': 999,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.languages, ['python', 'javascript'])
        self.assertEqual(self.profile.years_experience, 6)
        self.assertFalse(self.profile.is_available)
        self.assertEqual(self.profile.max_active_sessions, 3)

    def test_non_expert_cannot_edit_expert_profile(self):
        self.authenticate(self.developer)
        response = self.client.patch('/api/collaboration/experts/me/', {'is_available': True}, format='json')
        self.assertEqual(response.status_code, 404)

    def test_expert_match_uses_skills_and_shows_only_real_profile_data(self):
        self.authenticate(self.developer)
        response = self.client.get('/api/collaboration/experts/', {'problem_id': str(self.problem.id)})
        self.assertEqual(response.status_code, 200)
        expert = response.data['experts'][0]
        self.assertEqual(expert['user_id'], str(self.expert.id))
        self.assertEqual(set(expert['match_criteria']), {'language', 'framework', 'category'})
        self.assertEqual(expert['completed_sessions'], 0)

    def test_session_context_is_opt_in_sanitized_and_private(self):
        self.authenticate(self.developer)
        created = self.client.post('/api/collaboration/sessions/', {
            'expert_id': str(self.expert.id), 'problem_id': str(self.problem.id),
            'share_context': True,
        }, format='json')
        self.assertEqual(created.status_code, 201)
        session_id = created.data['session']['id']
        self.authenticate(self.expert)
        expert_view = self.client.get(f'/api/collaboration/sessions/{session_id}/')
        self.assertEqual(expert_view.status_code, 200)
        self.assertTrue(expert_view.data['session']['context_shared'])
        self.assertNotIn('example-secret', str(expert_view.data['session']['approved_context']))
        self.authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/collaboration/sessions/{session_id}/').status_code, 404)

    def test_session_request_builds_issue_summary_without_user_form(self):
        self.authenticate(self.developer)
        created = self.client.post('/api/collaboration/sessions/', {
            'expert_id': str(self.expert.id), 'problem_id': str(self.problem.id),
            'response_id': str(self.ai_response.id), 'share_context': True,
        }, format='json')
        self.assertEqual(created.status_code, 201)
        self.assertIn('NEXUS context summary', created.data['session']['reason'])
        session = AssistanceSession.objects.get(id=created.data['session']['id'])
        self.assertTrue(session.context_shared)
        self.assertEqual(session.ai_response_id, self.ai_response.id)
        self.assertIn('code_context', session.approved_context)
        self.assertIn('Check how the value is produced.', session.developer_reason)

    def test_accepted_session_supports_private_messages_and_expert_outcome(self):
        self.authenticate(self.developer)
        created = self.client.post('/api/collaboration/sessions/', {
            'expert_id': str(self.expert.id), 'problem_id': str(self.problem.id),
            'response_id': str(self.ai_response.id),
        }, format='json')
        session_id = created.data['session']['id']
        self.authenticate(self.expert)
        accepted = self.client.post(f'/api/collaboration/sessions/{session_id}/', {'action': 'accept'}, format='json')
        self.assertEqual(accepted.data['session']['status'], 'accepted')
        sent = self.client.post(f'/api/collaboration/sessions/{session_id}/messages/', {'content': 'What does this value contain?'}, format='json')
        self.assertEqual(sent.status_code, 201)
        self.authenticate(self.other)
        self.assertEqual(self.client.post(f'/api/collaboration/sessions/{session_id}/messages/', {'content': 'private'}, format='json').status_code, 404)
        self.authenticate(self.expert)
        closed = self.client.post(f'/api/collaboration/sessions/{session_id}/outcome/', {
            'outcome': 'partially_resolved', 'summary': 'One cause was identified.'
        }, format='json')
        self.assertEqual(closed.data['session']['status'], 'closed')

    def test_human_resolution_is_saved_as_private_problem_dna_evidence(self):
        dna = ProblemDNA.objects.create(
            problem=self.problem, language='python', error_type='runtime',
            category='runtime_error', symptoms=['A runtime issue'],
        )
        self.authenticate(self.developer)
        created = self.client.post('/api/collaboration/sessions/', {
            'expert_id': str(self.expert.id), 'problem_id': str(self.problem.id),
        }, format='json')
        session_id = created.data['session']['id']
        self.authenticate(self.expert)
        self.client.post(f'/api/collaboration/sessions/{session_id}/', {'action': 'accept'}, format='json')
        self.client.post(f'/api/collaboration/sessions/{session_id}/outcome/', {
            'outcome': 'resolved', 'summary': 'The database transaction boundary caused the failure.'
        }, format='json')
        dna.refresh_from_db()
        self.assertEqual(dna.scope_zone, 'private')
        self.assertEqual(dna.verification_status, 'pending')
        self.assertTrue(any(item.get('kind') == 'human_resolution' for item in dna.attempts))

    def test_session_feedback_requires_developer_and_ended_session(self):
        self.authenticate(self.developer)
        created = self.client.post('/api/collaboration/sessions/', {
            'expert_id': str(self.expert.id), 'problem_id': str(self.problem.id),
        }, format='json')
        session_id = created.data['session']['id']
        self.assertEqual(self.client.post(f'/api/collaboration/sessions/{session_id}/feedback/', {'rating': 5}, format='json').status_code, 409)
        self.client.post(f'/api/collaboration/sessions/{session_id}/', {'action': 'close'}, format='json')
        self.authenticate(self.expert)
        self.assertEqual(self.client.post(f'/api/collaboration/sessions/{session_id}/feedback/', {'rating': 1}, format='json').status_code, 404)
        self.authenticate(self.developer)
        saved = self.client.post(f'/api/collaboration/sessions/{session_id}/feedback/', {
            'rating': 5, 'problem_resolved': True, 'explanation_understandable': True,
            'expert_helpful': True, 'comments': 'Clear explanation',
        }, format='json')
        self.assertEqual(saved.status_code, 201)

    def test_feedback_is_bound_to_response_owner(self):
        self.authenticate(self.developer)
        response = self.client.post('/api/collaboration/feedback/', {
            'response_id': str(self.ai_response.id), 'category': 'partially_helpful', 'details': 'More context needed',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(AIResponseFeedback.objects.get().user, self.developer)
        self.authenticate(self.other)
        denied = self.client.post('/api/collaboration/feedback/', {
            'response_id': str(self.ai_response.id), 'category': 'incorrect',
        }, format='json')
        self.assertEqual(denied.status_code, 404)

    def test_review_queue_shows_answer_and_only_consented_problem_summary(self):
        self.authenticate(self.developer)
        submitted = self.client.post('/api/collaboration/reviews/', {
            'response_id': str(self.ai_response.id), 'reason': 'incorrect', 'share_context': True,
        }, format='json')
        self.assertEqual(submitted.status_code, 201)
        self.authenticate(self.expert)
        queue = self.client.get('/api/collaboration/reviews/?queue=1')
        self.assertEqual(queue.status_code, 200)
        review = queue.data['reviews'][0]
        self.assertEqual(review['ai_response'], self.ai_response.content)
        self.assertTrue(review['context_shared'])
        self.assertNotIn('selected_code', review['context'])

    def test_expert_can_review_when_not_accepting_new_requests(self):
        self.authenticate(self.developer)
        self.client.post('/api/collaboration/reviews/', {
            'response_id': str(self.ai_response.id), 'reason': 'incorrect',
        }, format='json')
        self.profile.is_available = False
        self.profile.save(update_fields=['is_available'])
        self.authenticate(self.expert)
        queue = self.client.get('/api/collaboration/reviews/?queue=1')
        self.assertEqual(queue.status_code, 200)
        review_id = queue.data['reviews'][0]['id']
        claimed = self.client.post(f'/api/collaboration/reviews/{review_id}/claim/', {}, format='json')
        self.assertEqual(claimed.status_code, 200)

    def test_skill_quest_requires_repeated_evidence_and_tracks_progress(self):
        self.authenticate(self.developer)
        first = self.client.get('/api/collaboration/skill-quest/')
        self.assertTrue(first.data['insufficient_history'])
        Problem.objects.create(
            session=self.project_session, user=self.developer, language='python',
            framework='django', problem_type='runtime', category='runtime_error',
            description='Another runtime issue',
        )
        result = self.client.get('/api/collaboration/skill-quest/')
        self.assertFalse(result.data['insufficient_history'])
        item = result.data['recommendations'][0]
        self.assertEqual(item['evidence_count'], 2)
        updated = self.client.patch(
            f"/api/collaboration/skill-quest/{item['id']}/progress/",
            {'status': 'completed'}, format='json',
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(LearningRecommendation.objects.get().status, 'completed')

    def test_visual_expert_sources_require_admin_approval_before_user_visibility(self):
        self.authenticate(self.developer)
        payload = {
            'title': 'Django transaction guide', 'topic': 'transactions', 'technology': 'Django',
            'source_label': 'Approved internal guide', 'source_reference': 'docs/transactions.md',
            'content': 'Use transactions when related writes must succeed together.',
        }
        self.assertEqual(self.client.post('/api/collaboration/visual-expert/sources/', payload, format='json').status_code, 403)

        admin = NexusUser.objects.create_user('admin@nexus.test', 'Admin', 'pass12345')
        admin.is_staff = True
        admin.save(update_fields=['is_staff'])
        self.authenticate(admin)
        created = self.client.post('/api/collaboration/visual-expert/sources/', payload, format='json')
        self.assertEqual(created.status_code, 201)
        source_id = created.data['source']['id']
        self.authenticate(self.developer)
        self.assertEqual(self.client.get('/api/collaboration/visual-expert/sources/').data['sources'], [])

        self.authenticate(admin)
        approved = self.client.patch('/api/collaboration/visual-expert/sources/', {
            'id': source_id, 'review_status': 'approved',
        }, format='json')
        self.assertEqual(approved.status_code, 200)
        self.authenticate(self.developer)
        visible = self.client.get('/api/collaboration/visual-expert/sources/')
        self.assertEqual(len(visible.data['sources']), 1)
        self.assertNotIn('content', visible.data['sources'][0])

    @patch('ai.embeddings.generate_embedding', return_value=None)
    @patch('ai.llm.client.call_llm_conversation', return_value='Check the transaction boundary [S1].')
    def test_visual_expert_uses_selected_approved_sources_and_returns_citations(self, _llm, _embedding):
        source = VisualExpertKnowledge.objects.create(
            title='Django transaction guide', topic='transactions', technology='Django',
            source_label='Approved internal guide', source_reference='docs/transactions.md',
            content='Use transactions when related writes must succeed together.',
            review_status='approved',
        )
        self.authenticate(self.developer)
        response = self.client.post('/api/collaboration/visual-expert/ask/', {
            'question': 'How do I make related writes succeed together?',
            'source_ids': [str(source.id)],
            'conversation': [{'role': 'user', 'content': 'What is a transaction?'}],
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['ai_generated'])
        self.assertEqual(response.data['sources'][0]['citation'], '[S1]')
        self.assertIn('[S1]', response.data['answer'])
        messages = _llm.call_args.args[0]
        self.assertEqual([item['role'] for item in messages], ['system', 'user', 'user'])
        self.assertEqual(messages[1]['content'], 'What is a transaction?')

    @patch('ai.embeddings.generate_embedding', return_value=None)
    def test_visual_expert_cannot_query_unapproved_sources(self, _embedding):
        source = VisualExpertKnowledge.objects.create(
            title='Pending guide', topic='topic', source_label='Internal', content='Not reviewed yet.',
        )
        self.authenticate(self.developer)
        response = self.client.post('/api/collaboration/visual-expert/ask/', {
            'question': 'What does the source say?', 'source_ids': [str(source.id)],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    @patch('ai.embeddings.generate_embedding', return_value=None)
    @patch('ai.llm.client.call_llm_conversation', return_value='Check the approved guide and verify the transaction boundary.')
    def test_visual_expert_receives_owner_authorized_problem_context_and_expert_profile(self, _llm, _embedding):
        VisualExpertKnowledge.objects.create(
            title='Python runtime guide', topic='runtime', technology='Python',
            source_label='Approved guide', content='Inspect the value before the transaction boundary.',
            review_status='approved',
        )
        self.authenticate(self.developer)
        response = self.client.post('/api/collaboration/visual-expert/ask/', {
            'problem_id': str(self.problem.id), 'expert_id': str(self.expert.id),
        }, format='json')
        self.assertEqual(response.status_code, 200)
        prompt = _llm.call_args.args[0][-1]['content']
        system = _llm.call_args.args[0][0]['content']
        self.assertIn('app.py', prompt)
        self.assertNotIn('example-secret', prompt)
        self.assertIn('languages=[\'python\']', system)

