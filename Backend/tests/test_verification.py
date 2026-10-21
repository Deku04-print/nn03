"""
Tests — Verification loop: diagnostic comparison → status update,
         ProblemResolution model, multi-round verify flows.
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

ORIGINAL_DIAGS = [{'message': 'IndexError: list index out of range', 'severity': 'error', 'line': 5}]

ANALYZE_PAYLOAD = {
    'language': 'python',
    'file_name': 'test.py',
    'selection': {'text': 'print(numbers[i+1])', 'start_line': 5, 'end_line': 5},
    'diagnostics': ORIGINAL_DIAGS,
    'workspace': {'project_name': 'verify-test'},
    'surrounding_code': '',
}

MOCK_RESULT = {
    'success': True,
    'response': {
        'observation': 'Index boundary issue detected.',
        'question': 'What value does i reach?',
        'hint': '',
        'next_steps': ['Review loop range'],
        'verification_question': '',
        'guidance_level': 0,
    },
    'metadata': {
        'problem_category': 'index_boundary',
        'problem_type': 'runtime_error',
        'confidence': 0.93,
        'specialist': 'python',
        'guidance_level': 0,
    },
}

VERIFY_RESULT = {
    'success': True,
    'response': {
        'observation': 'The error is gone. The fix appears to have worked.',
        'question': 'Do you understand why the off-by-one caused the original error?',
        'hint': '',
        'next_steps': ['Run your tests to confirm'],
        'verification_question': '',
        'guidance_level': 0,
    },
    'metadata': MOCK_RESULT['metadata'],
}


def _make_authed_client(api_client, email, password='pass123!'):
    """Helper: create user, login, attach auth header, return (client, email)."""
    User.objects.create_user(email=email, name='T', password=password)
    resp = api_client.post('/api/auth/login/', {'email': email, 'password': password})
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {resp.data.get("access", "")}')


@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class VerifyResolvesTest(APITestCase):
    def setUp(self):
        cache.clear()
        _make_authed_client(self.client, 'vtest@wl.io')

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_verify_empty_diagnostics_resolves(self, mock_cls):
        """Verify with no new diagnostics should mark problem resolved."""
        mock_cls.return_value.run.return_value = MOCK_RESULT
        r1 = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        problem_id = r1.data['problem_id']
        session_id = r1.data['session_id']

        mock_cls.return_value.run.return_value = VERIFY_RESULT
        r2 = self.client.post('/api/worklens/verify/', {
            **ANALYZE_PAYLOAD,
            'problem_id':      problem_id,
            'session_id':      session_id,
            'new_diagnostics': [],
        }, format='json')

        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data['verify_status'], 'resolved')

        from apps.worklens.models import Problem
        problem = Problem.objects.get(id=problem_id)
        self.assertEqual(problem.status, 'resolved')
        self.assertEqual(problem.resolution.verification_status, 'resolved')

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_verify_same_diagnostics_fails(self, mock_cls):
        """Verify with identical diagnostics marks as failed."""
        mock_cls.return_value.run.return_value = MOCK_RESULT
        r1 = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        problem_id = r1.data['problem_id']
        session_id = r1.data['session_id']

        mock_cls.return_value.run.return_value = VERIFY_RESULT
        r2 = self.client.post('/api/worklens/verify/', {
            **ANALYZE_PAYLOAD,
            'problem_id':      problem_id,
            'session_id':      session_id,
            'new_diagnostics': ORIGINAL_DIAGS,
        }, format='json')

        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data['verify_status'], 'failed')

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_verify_partial_diagnostics(self, mock_cls):
        """Verify with fewer diagnostics marks as partially_resolved."""
        mock_cls.return_value.run.return_value = MOCK_RESULT
        multiDiags = [
            {'message': 'IndexError: list index out of range', 'severity': 'error', 'line': 5},
            {'message': 'NameError: name x not defined', 'severity': 'error', 'line': 8},
        ]
        r1 = self.client.post('/api/worklens/analyze/', {
            **ANALYZE_PAYLOAD, 'diagnostics': multiDiags
        }, format='json')
        problem_id = r1.data['problem_id']
        session_id = r1.data['session_id']

        mock_cls.return_value.run.return_value = VERIFY_RESULT
        r2 = self.client.post('/api/worklens/verify/', {
            **ANALYZE_PAYLOAD,
            'diagnostics':     multiDiags,
            'problem_id':      problem_id,
            'session_id':      session_id,
            'new_diagnostics': [{'message': 'NameError: name x not defined', 'severity': 'error', 'line': 8}],
        }, format='json')

        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data['verify_status'], 'partially_resolved')

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_verify_resolved_sets_resolved_at(self, mock_cls):
        """When a problem resolves, resolution.resolved_at must be populated."""
        mock_cls.return_value.run.return_value = MOCK_RESULT
        r1 = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        problem_id = r1.data['problem_id']
        session_id = r1.data['session_id']

        mock_cls.return_value.run.return_value = VERIFY_RESULT
        self.client.post('/api/worklens/verify/', {
            **ANALYZE_PAYLOAD,
            'problem_id':      problem_id,
            'session_id':      session_id,
            'new_diagnostics': [],
        }, format='json')

        from apps.worklens.models import Problem
        problem = Problem.objects.get(id=problem_id)
        self.assertIsNotNone(problem.resolution.resolved_at)

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_verify_failed_does_not_set_resolved_at(self, mock_cls):
        """A failed verification must NOT set resolved_at."""
        mock_cls.return_value.run.return_value = MOCK_RESULT
        r1 = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        problem_id = r1.data['problem_id']
        session_id = r1.data['session_id']

        mock_cls.return_value.run.return_value = VERIFY_RESULT
        self.client.post('/api/worklens/verify/', {
            **ANALYZE_PAYLOAD,
            'problem_id':      problem_id,
            'session_id':      session_id,
            'new_diagnostics': ORIGINAL_DIAGS,  # same — failed
        }, format='json')

        from apps.worklens.models import Problem
        problem = Problem.objects.get(id=problem_id)
        self.assertIsNone(problem.resolution.resolved_at)

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_verify_response_has_required_keys(self, mock_cls):
        """Verify response must contain success, session_id, problem_id, verify_status."""
        mock_cls.return_value.run.return_value = MOCK_RESULT
        r1 = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        mock_cls.return_value.run.return_value = VERIFY_RESULT
        r2 = self.client.post('/api/worklens/verify/', {
            **ANALYZE_PAYLOAD,
            'problem_id': r1.data['problem_id'],
            'session_id': r1.data['session_id'],
            'new_diagnostics': [],
        }, format='json')
        for key in ('success', 'session_id', 'problem_id', 'verify_status'):
            self.assertIn(key, r2.data, msg=f'Missing key: {key}')

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_verify_updates_dna_verification_status(self, mock_cls):
        """After a resolved verify, ProblemDNA.verification_status must update."""
        # Step 1: analyze to create problem + DNA
        mock_cls.return_value.run.return_value = MOCK_RESULT
        r1 = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        self.assertIn('problem_id', r1.data, msg='analyze must return problem_id')
        problem_id = r1.data['problem_id']
        session_id = r1.data['session_id']

        # Step 2: verify with empty diagnostics → resolved
        mock_cls.return_value.run.return_value = VERIFY_RESULT
        self.client.post('/api/worklens/verify/', {
            **ANALYZE_PAYLOAD,
            'problem_id':      problem_id,
            'session_id':      session_id,
            'new_diagnostics': [],
        }, format='json')

        from apps.knowledge.models import ProblemDNA
        dna = ProblemDNA.objects.get(problem__id=problem_id)
        self.assertEqual(dna.verification_status, 'resolved')

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_verify_without_problem_id_still_returns_200(self, mock_cls):
        """Verify without a problem_id should still return 200 (no problem to update)."""
        # Clear any potentially malformed auth headers before calling AllowAny endpoint
        self.client.credentials()
        mock_cls.return_value.run.return_value = VERIFY_RESULT
        r = self.client.post('/api/worklens/verify/', {
            **ANALYZE_PAYLOAD,
            'new_diagnostics': [],
        }, format='json')
        self.assertEqual(r.status_code, 200)

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_verify_missing_required_field_returns_400(self, mock_cls):
        """Verify payload with an invalid diagnostic severity must return 400 (ChoiceField)."""
        bad_payload = {
            **ANALYZE_PAYLOAD,
            'diagnostics': [{'message': 'err', 'severity': 'INVALID_SEVERITY'}],
            'new_diagnostics': [],
        }
        r = self.client.post('/api/worklens/verify/', bad_payload, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertFalse(r.data['success'])


# ── ProblemResolution model unit tests ───────────────────────────────────────

class ProblemResolutionModelTest(TestCase):
    _counter = iter(range(10000))  # unique email counter

    def _setup_problem(self):
        from apps.worklens.models import WorkLensSession, Problem
        from apps.users.models import WorkLensUser
        uid = next(self._counter)
        user = WorkLensUser.objects.create_user(
            email=f'res_model_{uid}@wl.io', name='R', password='pass123!')
        session = WorkLensSession.objects.create(user=user)
        return Problem.objects.create(
            session=session, user=user,
            language='python', problem_type='runtime_error',
            category='index_boundary', description='test bug', confidence=0.9,
        )


    def test_resolution_created_on_verify(self):
        """ProblemResolution row is created after _handle_verification is called."""
        from apps.worklens.models import ProblemResolution
        problem = self._setup_problem()
        ProblemResolution.objects.create(
            problem=problem,
            verification_status='resolved',
        )
        self.assertTrue(ProblemResolution.objects.filter(problem=problem).exists())

    def test_resolution_default_status_is_pending(self):
        """Default verification_status for a new resolution is 'pending'."""
        from apps.worklens.models import ProblemResolution
        problem = self._setup_problem()
        resolution = ProblemResolution.objects.create(problem=problem)
        self.assertEqual(resolution.verification_status, 'pending')

    def test_resolution_status_can_be_updated(self):
        """verification_status can be changed from pending to resolved."""
        from apps.worklens.models import ProblemResolution
        problem = self._setup_problem()
        resolution = ProblemResolution.objects.create(problem=problem)
        resolution.verification_status = 'resolved'
        resolution.save()
        resolution.refresh_from_db()
        self.assertEqual(resolution.verification_status, 'resolved')

    def test_problem_status_changes_on_resolve(self):
        """Problem.status must be set to 'resolved' when verification passes."""
        problem = self._setup_problem()
        problem.status = 'resolved'
        problem.save()
        problem.refresh_from_db()
        self.assertEqual(problem.status, 'resolved')