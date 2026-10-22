"""
Tests — ProblemDNA creation, retrieval, attempt recording, embedding text,
        and the similar-problems knowledge endpoint.
"""
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase
from unittest.mock import patch

User = get_user_model()

NO_THROTTLE = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_THROTTLE_CLASSES': [],
    'DEFAULT_THROTTLE_RATES': {},
    'EXCEPTION_HANDLER': 'config.exceptions.worklens_exception_handler',
}

ANALYZE_PAYLOAD = {
    'language': 'python',
    'file_name': 'test.py',
    'selection': {'text': 'print(numbers[i+1])', 'start_line': 5, 'end_line': 5},
    'diagnostics': [{'message': 'IndexError: list index out of range', 'severity': 'error', 'line': 5}],
    'workspace': {'project_name': 'test-project'},
    'surrounding_code': '',
}

MOCK_ORCH_RESULT = {
    'success': True,
    'response': {
        'observation': 'The loop accesses an out-of-bounds index.',
        'question': 'What is the largest value of i?',
        'hint': '',
        'next_steps': ['Check loop range', 'Check index expression'],
        'verification_question': 'Did the error change?',
        'guidance_level': 0,
    },
    'metadata': {
        'problem_category': 'index_boundary',
        'problem_type': 'runtime_error',
        'confidence': 0.94,
        'specialist': 'python',
        'guidance_level': 0,
    },
}


# ── ProblemDNA creation via /analyze/ ────────────────────────────────────────

@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class ProblemDNACreateTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email='ptest@wl.io', name='P', password='pass123!')
        r = self.client.post('/api/auth/login/', {'email': 'ptest@wl.io', 'password': 'pass123!'})
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {r.data.get("access", "")}')

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_analyze_creates_problem_dna(self, mock_cls):
        mock_cls.return_value.run.return_value = MOCK_ORCH_RESULT
        resp = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['success'])
        self.assertIn('problem_id', resp.data)
        self.assertIsNotNone(resp.data['problem_id'])

        from apps.knowledge.models import ProblemDNA
        from apps.worklens.models import Problem
        problem = Problem.objects.get(id=resp.data['problem_id'])
        self.assertTrue(hasattr(problem, 'dna'))
        self.assertEqual(problem.dna.category, 'index_boundary')
        self.assertEqual(problem.dna.language, 'python')

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_dna_symptoms_populated(self, mock_cls):
        """ProblemDNA symptoms should mirror the request diagnostics."""
        mock_cls.return_value.run.return_value = MOCK_ORCH_RESULT
        resp = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        from apps.worklens.models import Problem
        problem = Problem.objects.get(id=resp.data['problem_id'])
        self.assertIn('IndexError: list index out of range', problem.dna.symptoms)

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_dna_guidance_populated(self, mock_cls):
        """ProblemDNA guidance field should contain the AI next_steps."""
        mock_cls.return_value.run.return_value = MOCK_ORCH_RESULT
        resp = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        from apps.worklens.models import Problem
        dna = Problem.objects.get(id=resp.data['problem_id']).dna
        self.assertTrue(len(dna.guidance) > 0)

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_dna_attempts_empty_on_create(self, mock_cls):
        """Freshly created ProblemDNA must have no recorded attempts."""
        mock_cls.return_value.run.return_value = MOCK_ORCH_RESULT
        resp = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        from apps.worklens.models import Problem
        dna = Problem.objects.get(id=resp.data['problem_id']).dna
        self.assertEqual(dna.attempts, [])

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_dna_error_type_matches_metadata(self, mock_cls):
        """ProblemDNA error_type must match the orchestrator's problem_type."""
        mock_cls.return_value.run.return_value = MOCK_ORCH_RESULT
        resp = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        from apps.worklens.models import Problem
        dna = Problem.objects.get(id=resp.data['problem_id']).dna
        self.assertEqual(dna.error_type, 'runtime_error')

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_problem_status_open_on_create(self, mock_cls):
        """Newly created Problem must have status 'open'."""
        mock_cls.return_value.run.return_value = MOCK_ORCH_RESULT
        resp = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        from apps.worklens.models import Problem
        problem = Problem.objects.get(id=resp.data['problem_id'])
        self.assertEqual(problem.status, 'open')

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_problem_confidence_stored(self, mock_cls):
        """Problem confidence must match the orchestrator metadata value."""
        mock_cls.return_value.run.return_value = MOCK_ORCH_RESULT
        resp = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        from apps.worklens.models import Problem
        problem = Problem.objects.get(id=resp.data['problem_id'])
        self.assertAlmostEqual(problem.confidence, 0.94, places=2)


# ── Attempt recording via /hint/ ─────────────────────────────────────────────

@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class AttemptRecordTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email='atest@wl.io', name='A', password='pass123!')
        r = self.client.post('/api/auth/login/', {'email': 'atest@wl.io', 'password': 'pass123!'})
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {r.data.get("access", "")}')

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_hint_records_attempt(self, mock_cls):
        mock_cls.return_value.run.return_value = MOCK_ORCH_RESULT

        r1 = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        problem_id = r1.data['problem_id']
        session_id = r1.data['session_id']

        hint_result = {**MOCK_ORCH_RESULT, 'response': {**MOCK_ORCH_RESULT['response'],
                                                         'hint': 'Check if i+1 exceeds len(numbers)-1',
                                                         'guidance_level': 2}}
        mock_cls.return_value.run.return_value = hint_result

        r2 = self.client.post('/api/worklens/hint/', {
            **ANALYZE_PAYLOAD,
            'problem_id': problem_id,
            'session_id': session_id,
        }, format='json')

        self.assertEqual(r2.status_code, 200)

        from apps.knowledge.models import ProblemDNA
        dna = ProblemDNA.objects.get(problem__id=problem_id)
        self.assertEqual(len(dna.attempts), 1)
        self.assertEqual(dna.attempts[0]['action'], 'hint')

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_multiple_hints_accumulate_attempts(self, mock_cls):
        """Each hint call should append a new entry to dna.attempts."""
        mock_cls.return_value.run.return_value = MOCK_ORCH_RESULT
        r1 = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        problem_id = r1.data['problem_id']
        session_id = r1.data['session_id']

        hint_result = {**MOCK_ORCH_RESULT, 'response': {**MOCK_ORCH_RESULT['response'],
                                                         'hint': 'Use len() - 1',
                                                         'guidance_level': 1}}
        mock_cls.return_value.run.return_value = hint_result

        for _ in range(3):
            self.client.post('/api/worklens/hint/', {
                **ANALYZE_PAYLOAD,
                'problem_id': problem_id,
                'session_id': session_id,
            }, format='json')

        from apps.knowledge.models import ProblemDNA
        dna = ProblemDNA.objects.get(problem__id=problem_id)
        self.assertEqual(len(dna.attempts), 3)

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_guide_records_attempt_with_correct_action(self, mock_cls):
        """Guide action must be recorded as 'guide' in dna.attempts."""
        mock_cls.return_value.run.return_value = MOCK_ORCH_RESULT
        r1 = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        problem_id = r1.data['problem_id']
        session_id = r1.data['session_id']

        guide_result = {**MOCK_ORCH_RESULT, 'response': {**MOCK_ORCH_RESULT['response'],
                                                          'observation': 'Think about loop bounds.',
                                                          'guidance_level': 1}}
        mock_cls.return_value.run.return_value = guide_result

        self.client.post('/api/worklens/guide/', {
            **ANALYZE_PAYLOAD,
            'problem_id': problem_id,
            'session_id': session_id,
        }, format='json')

        from apps.knowledge.models import ProblemDNA
        dna = ProblemDNA.objects.get(problem__id=problem_id)
        self.assertEqual(len(dna.attempts), 1)
        self.assertEqual(dna.attempts[0]['action'], 'guide')


# ── ProblemDNA model unit tests ───────────────────────────────────────────────

class ProblemDNAModelTest(TestCase):
    """Unit tests for ProblemDNA.build_embedding_text()."""

    _counter = iter(range(10000))  # unique email counter per test run

    def _make_dna(self, **kwargs):
        from apps.knowledge.models import ProblemDNA
        from apps.worklens.models import WorkLensSession, Problem
        from apps.users.models import WorkLensUser
        uid = next(self._counter)
        user = WorkLensUser.objects.create_user(
            email=f'dna_model_{uid}@wl.io', name='M', password='pass123!')
        session = WorkLensSession.objects.create(user=user)
        problem = Problem.objects.create(
            session=session, user=user,
            language='python', problem_type='runtime_error',
            category='index_boundary', description='test', confidence=0.9,
        )
        return ProblemDNA.objects.create(problem=problem, **kwargs)

    def test_build_embedding_text_contains_language(self):
        dna = self._make_dna(
            language='python', error_type='runtime_error',
            category='index_boundary', symptoms=['IndexError'],
            guidance=['Check bounds'], root_cause='Off-by-one',
        )
        text = dna.build_embedding_text()
        self.assertIn('python', text)

    def test_build_embedding_text_contains_category(self):
        dna = self._make_dna(
            language='python', error_type='runtime_error',
            category='index_boundary', symptoms=['IndexError'],
        )
        text = dna.build_embedding_text()
        self.assertIn('index_boundary', text)

    def test_build_embedding_text_contains_symptoms(self):
        dna = self._make_dna(
            language='python', error_type='runtime_error',
            category='index_boundary', symptoms=['IndexError', 'off-by-one'],
        )
        text = dna.build_embedding_text()
        self.assertIn('IndexError', text)

    def test_build_embedding_text_includes_root_cause(self):
        dna = self._make_dna(
            language='javascript', error_type='null_reference',
            category='null_reference', symptoms=['TypeError: Cannot read property'],
            root_cause='Variable was never initialised.',
        )
        text = dna.build_embedding_text()
        self.assertIn('Variable was never initialised.', text)

    def test_build_embedding_text_includes_guidance(self):
        dna = self._make_dna(
            language='python', error_type='runtime_error',
            category='index_boundary', symptoms=['IndexError'],
            guidance=['Use range(len(arr) - 1)'],
        )
        text = dna.build_embedding_text()
        self.assertIn('Use range(len(arr) - 1)', text)

    def test_str_representation(self):
        dna = self._make_dna(
            language='python', error_type='runtime_error',
            category='index_boundary', symptoms=['IndexError'],
        )
        self.assertIn('index_boundary', str(dna))


# ── Similar problems knowledge endpoint ──────────────────────────────────────

@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class SimilarProblemsTest(APITestCase):
    def setUp(self):
        cache.clear()
        admin = User.objects.create_superuser('knowledge-admin@tcs.com', 'Knowledge Admin', 'strongpass!')
        self.client.force_authenticate(admin)

    def test_similar_returns_list(self):
        """Similar endpoint returns a list even with no data."""
        resp = self.client.get('/api/problems/similar/?q=IndexError&language=python')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['success'])
        self.assertIsInstance(resp.data['data'], list)

    def test_similar_requires_query(self):
        """Without q param, returns empty list gracefully."""
        resp = self.client.get('/api/problems/similar/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['data'], [])

    def test_similar_accepts_language_filter(self):
        """language param must be accepted without error."""
        resp = self.client.get('/api/problems/similar/?q=TypeError&language=javascript')
        self.assertEqual(resp.status_code, 200)

    def test_similar_response_structure(self):
        """Response must have 'success' and 'data' keys."""
        resp = self.client.get('/api/problems/similar/?q=SyntaxError')
        self.assertIn('success', resp.data)
        self.assertIn('data', resp.data)
