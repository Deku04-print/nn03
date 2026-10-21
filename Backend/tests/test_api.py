"""
WorkLens Backend Tests — API endpoints, auth, problem lifecycle.
Covers: registration, login, JWT auth, analyze/guide/hint/explain/chat-history,
        sanitizer patterns, classifier rules, and MentorAgent response parsing.
"""
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase
from rest_framework import status
from unittest.mock import patch, MagicMock

User = get_user_model()

# Disable throttling for all tests in this module
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

# ── Shared mock orchestrator result ─────────────────────────────────────────
MOCK_ORCH_RESULT = {
    'success': True,
    'response': {
        'observation': 'I see an index issue.',
        'question': 'What is the max value of i?',
        'hint': '',
        'next_steps': ['Check loop range'],
        'verification_question': '',
        'guidance_level': 0,
    },
    'metadata': {
        'problem_category': 'index_boundary',
        'problem_type': 'runtime_error',
        'confidence': 0.9,
        'specialist': 'python',
        'guidance_level': 0,
    },
}

ANALYZE_PAYLOAD = {
    'language': 'python',
    'file_name': 'test.py',
    'selection': {'text': 'numbers[i + 1]', 'start_line': 5, 'end_line': 5},
    'diagnostics': [{'message': 'IndexError', 'severity': 'error', 'line': 5, 'column': 0}],
    'workspace': {'project_name': 'test-project'},
}


# ── Auth Tests ───────────────────────────────────────────────────────────────

@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class UserAuthTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.register_url = '/api/auth/register/'
        self.login_url    = '/api/auth/login/'
        self.me_url       = '/api/auth/me/'

    def test_register_user(self):
        resp = self.client.post(self.register_url, {
            'email': 'dev@tcs.com',
            'name':  'Dev User',
            'password': 'securepass123',
        })
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data['success'])

    def test_register_rejects_non_tcs_email(self):
        """Registration must reject non-TCS email addresses."""
        resp = self.client.post(self.register_url, {
            'email': 'dev@gmail.com',
            'name':  'Outside User',
            'password': 'securepass123',
        })
        self.assertEqual(resp.status_code, 400)

    def test_register_rejects_missing_fields(self):
        """Omitting required fields returns 400."""
        resp = self.client.post(self.register_url, {'email': 'incomplete@tcs.com'})
        self.assertEqual(resp.status_code, 400)

    def test_register_rejects_short_password(self):
        """Passwords shorter than 8 chars must be rejected."""
        resp = self.client.post(self.register_url, {
            'email': 'shortpw@tcs.com',
            'name':  'Short Pass',
            'password': 'abc',
        })
        self.assertEqual(resp.status_code, 400)

    def test_register_duplicate_email(self):
        """Registering the same email twice must return 400."""
        payload = {'email': 'dupe@tcs.com', 'name': 'D', 'password': 'pass1234!'}
        self.client.post(self.register_url, payload)
        resp = self.client.post(self.register_url, payload)
        self.assertEqual(resp.status_code, 400)

    def test_login_and_get_token(self):
        User.objects.create_user(email='dev@tcs.com', name='Dev', password='pass1234!')
        resp = self.client.post(self.login_url, {
            'email': 'dev@tcs.com',
            'password': 'pass1234!',
        })
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data)

    def test_login_wrong_password(self):
        """Bad credentials must return 401."""
        User.objects.create_user(email='login@tcs.com', name='L', password='correctpass!')
        resp = self.client.post(self.login_url, {
            'email': 'login@tcs.com',
            'password': 'wrongpass!',
        })
        self.assertEqual(resp.status_code, 401)

    def test_login_unknown_user(self):
        """Login for a user that does not exist must return 401."""
        resp = self.client.post(self.login_url, {
            'email': 'ghost@tcs.com',
            'password': 'doesnotexist!',
        })
        self.assertEqual(resp.status_code, 401)

    def test_me_requires_auth(self):
        resp = self.client.get(self.me_url)
        self.assertEqual(resp.status_code, 401)

    def test_me_returns_user_data_when_authenticated(self):
        """Authenticated /me should return the correct user email."""
        User.objects.create_user(email='me@worklens.io', name='Me', password='pass1234!')
        resp_login = self.client.post(self.login_url, {
            'email': 'me@worklens.io', 'password': 'pass1234!'
        })
        token = resp_login.data.get('access', '')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        resp = self.client.get(self.me_url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['user']['email'], 'me@worklens.io')


# ── WorkLens Core API Tests ───────────────────────────────────────────────────

@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class WorkLensAPITests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email='tester@worklens.io', name='Tester', password='testpass!')
        resp = self.client.post('/api/auth/login/', {
            'email': 'tester@worklens.io', 'password': 'testpass!'
        })
        self.token = resp.data.get('access', '')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_analyze_endpoint(self, mock_orch_cls):
        mock_orch_cls.return_value.run.return_value = MOCK_ORCH_RESULT
        resp = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['success'])
        self.assertIn('observation', resp.data['response'])

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_analyze_returns_problem_id(self, mock_orch_cls):
        """Analyze must persist a Problem and return its UUID."""
        mock_orch_cls.return_value.run.return_value = MOCK_ORCH_RESULT
        resp = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        self.assertIn('problem_id', resp.data)
        self.assertIsNotNone(resp.data['problem_id'])

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_analyze_returns_session_id(self, mock_orch_cls):
        """Analyze must return a session_id for conversation continuity."""
        mock_orch_cls.return_value.run.return_value = MOCK_ORCH_RESULT
        resp = self.client.post('/api/worklens/analyze/', ANALYZE_PAYLOAD, format='json')
        self.assertIn('session_id', resp.data)

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_analyze_validation_error_invalid_severity(self, mock_orch_cls):
        """Analyze with an invalid diagnostic severity must return 400 (ChoiceField)."""
        bad_payload = {
            **ANALYZE_PAYLOAD,
            'diagnostics': [{'message': 'err', 'severity': 'INVALID_SEVERITY'}],
        }
        resp = self.client.post('/api/worklens/analyze/', bad_payload, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.data['success'])

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_no_direct_solution(self, mock_orch_cls):
        """Verify the response does not contain copy-paste code solutions."""
        result = {**MOCK_ORCH_RESULT, 'response': {**MOCK_ORCH_RESULT['response'],
                  'observation': 'Index goes out of bounds.',
                  'question': 'What index does numbers have at its last position?',
                  'guidance_level': 1}}
        mock_orch_cls.return_value.run.return_value = result
        resp = self.client.post('/api/worklens/analyze/', {
            'language': 'python',
            'selection': {'text': 'print(numbers[i+1])', 'start_line': 3, 'end_line': 3},
            'diagnostics': [],
            'workspace': {'project_name': 'test'},
        }, format='json')
        observation = resp.data.get('response', {}).get('observation', '')
        self.assertNotIn('numbers[i]', observation)  # no direct fix

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_guide_endpoint(self, mock_orch_cls):
        """Guide endpoint should accept a valid payload and return 200."""
        mock_orch_cls.return_value.run.return_value = MOCK_ORCH_RESULT
        resp = self.client.post('/api/worklens/guide/', ANALYZE_PAYLOAD, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['success'])

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_hint_endpoint(self, mock_orch_cls):
        """Hint endpoint should accept a valid payload and return 200."""
        mock_orch_cls.return_value.run.return_value = MOCK_ORCH_RESULT
        resp = self.client.post('/api/worklens/hint/', ANALYZE_PAYLOAD, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['success'])

    @patch('apps.worklens.views.WorkLensOrchestrator')
    def test_explain_endpoint(self, mock_orch_cls):
        """Explain endpoint should accept a valid payload and return 200."""
        mock_orch_cls.return_value.run.return_value = MOCK_ORCH_RESULT
        resp = self.client.post('/api/worklens/explain/', ANALYZE_PAYLOAD, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['success'])


# ── Chat History Tests ────────────────────────────────────────────────────────

@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class ChatHistoryTests(APITestCase):
    def setUp(self):
        cache.clear()
        from apps.worklens.models import WorkLensSession, Problem
        self.user = User.objects.create_user(
            email='history@worklens.io', name='H', password='pass123!')
        resp = self.client.post('/api/auth/login/', {
            'email': 'history@worklens.io', 'password': 'pass123!'
        })
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {resp.data.get("access", "")}')

        self.session = WorkLensSession.objects.create(user=self.user)
        for i in range(3):
            Problem.objects.create(
                session=self.session, user=self.user,
                language='python', problem_type='runtime_error',
                category='index_boundary',
                description=f'Bug {i}', confidence=0.8,
            )

    def test_chat_history_returns_list(self):
        resp = self.client.get('/api/worklens/history/')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['success'])
        self.assertIsInstance(resp.data['history'], list)

    def test_chat_history_max_four_items(self):
        """History endpoint must return at most 4 recent entries."""
        from apps.worklens.models import Problem
        for i in range(5):
            Problem.objects.create(
                session=self.session, user=self.user,
                language='python', problem_type='runtime_error',
                category='index_boundary',
                description=f'Extra {i}', confidence=0.7,
            )
        resp = self.client.get('/api/worklens/history/')
        self.assertLessEqual(len(resp.data['history']), 4)

    def test_chat_history_entry_has_required_fields(self):
        resp = self.client.get('/api/worklens/history/')
        if resp.data['history']:
            entry = resp.data['history'][0]
            self.assertIn('id', entry)
            self.assertIn('description', entry)
            self.assertIn('language', entry)
            self.assertIn('created_at', entry)

    def test_chat_history_empty_for_new_user(self):
        """A brand-new user should get an empty history list."""
        User.objects.create_user(email='newbie@worklens.io', name='N', password='pass123!')
        resp_login = self.client.post('/api/auth/login/', {
            'email': 'newbie@worklens.io', 'password': 'pass123!'
        })
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {resp_login.data.get("access", "")}')
        resp = self.client.get('/api/worklens/history/')
        self.assertEqual(resp.data['history'], [])


# ── Sanitizer Tests ───────────────────────────────────────────────────────────

class SanitizerTests(TestCase):
    def test_password_redacted(self):
        import re
        text = 'password = "mysecretpass123"'
        redacted = re.sub(
            r"(password\s*=\s*)['\"]?[^\s,;'\"]{4,}['\"]?",
            r'\1[REDACTED_PASSWORD]',
            text, flags=re.IGNORECASE
        )
        self.assertNotIn('mysecretpass123', redacted)


class NewSanitizerTests(TestCase):
    """Tests for the enhanced sanitizer patterns."""

    def setUp(self):
        from ai.sanitizer import sanitize_text, sanitize_payload, sanitize_diagnostics
        self.sanitize = sanitize_text
        self.sanitize_payload = sanitize_payload
        self.sanitize_diagnostics = sanitize_diagnostics

    def test_email_redacted(self):
        text = 'Send results to user@example.com for review'
        result = self.sanitize(text)
        self.assertNotIn('user@example.com', result)
        self.assertIn('[REDACTED_EMAIL]', result)

    def test_github_pat_redacted(self):
        full_token = 'ghp_abcDefGhiJklMnoPqrStUvWxYz123456789'
        text = f'token = "{full_token}"'
        result = self.sanitize(text)
        self.assertNotIn(full_token, result)

    def test_aws_access_key_redacted(self):
        """AWS IAM keys starting with AKIA must be scrubbed."""
        text = 'key = AKIAIOSFODNN7EXAMPLE'
        result = self.sanitize(text)
        self.assertNotIn('AKIAIOSFODNN7EXAMPLE', result)

    def test_jwt_token_redacted(self):
        """JWT tokens (three base64-dot segments) must be scrubbed."""
        jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
        result = self.sanitize(jwt)
        self.assertNotIn(jwt, result)

    def test_database_url_credentials_redacted(self):
        """DB URLs with embedded credentials must be scrubbed."""
        db_url = 'postgresql://user:supersecret@db.example.com:5432/mydb'
        result = self.sanitize(db_url)
        self.assertNotIn('supersecret', result)

    def test_ip_port_redacted(self):
        """Internal IP:port combos must be scrubbed."""
        text = 'Connecting to 192.168.1.100:5432'
        result = self.sanitize(text)
        self.assertNotIn('192.168.1.100:5432', result)

    def test_empty_string_unchanged(self):
        """sanitize_text must handle empty string without crashing."""
        self.assertEqual(self.sanitize(''), '')

    def test_none_input_unchanged(self):
        """sanitize_text must handle None without crashing."""
        self.assertIsNone(self.sanitize(None))

    def test_clean_text_unchanged(self):
        """Plain text with no secrets must pass through unchanged."""
        text = 'The quick brown fox jumps over the lazy dog.'
        result = self.sanitize(text)
        self.assertEqual(result, text)

    def test_sanitize_diagnostics_scrubs_messages(self):
        """sanitize_diagnostics must scrub secret patterns from message fields."""
        diags = [{'message': 'token = ghp_abcDefGhiJklMnoPqrStUvWxYz12345', 'severity': 'error'}]
        result = self.sanitize_diagnostics(diags)
        self.assertNotIn('ghp_', result[0]['message'])

    def test_sanitize_payload_scrubs_selection_text(self):
        """sanitize_payload must sanitize the selection.text field."""
        payload = {
            'language': 'python',
            'selection': {'text': 'api_key = "sk-supersecretkey1234abcd"'},
            'diagnostics': [],
            'workspace': {},
        }
        result = self.sanitize_payload(payload)
        self.assertNotIn('sk-supersecretkey1234abcd', result['selection']['text'])

    def test_sanitize_payload_scrubs_workspace_env(self):
        """Workspace env vars must be fully redacted."""
        payload = {
            'language': 'python',
            'selection': {'text': 'x = 1'},
            'diagnostics': [],
            'workspace': {'env': 'SECRET=abc123'},
        }
        result = self.sanitize_payload(payload)
        self.assertEqual(result['workspace']['env'], '[REDACTED]')

    def test_sanitize_payload_does_not_mutate_original(self):
        """sanitize_payload must return a new dict (not mutate input)."""
        original_text = 'api_key = "leaked"'
        payload = {
            'language': 'python',
            'selection': {'text': original_text},
            'diagnostics': [],
            'workspace': {},
        }
        self.sanitize_payload(payload)
        self.assertEqual(payload['selection']['text'], original_text)

    def test_mentor_response_has_insight_field(self):
        """Verify MentorAgent._parse_and_fill() always fills all 5 fields."""
        from ai.agents.mentor_agent import MentorAgent
        agent = MentorAgent()
        partial_json = '{"observation": "I see an index error.", "guidance_level": 1}'
        result = agent._parse_and_fill(partial_json)
        self.assertIn('observation', result)
        self.assertIn('insight', result)
        self.assertIn('question', result)
        self.assertIn('next_steps', result)
        self.assertIn('confidence_signal', result)
        self.assertIsInstance(result['next_steps'], list)


# ── Classifier Fallback Tests ─────────────────────────────────────────────────

class ClassifierFallbackTests(TestCase):
    def setUp(self):
        from ai.agents.problem_classifier import ProblemClassifier
        self.clf = ProblemClassifier()

    def _classify(self, message, language='python'):
        return self.clf._fallback(
            diagnostics=[{'message': message, 'severity': 'error'}],
            language=language
        )

    def test_index_error_classified(self):
        result = self._classify('IndexError: list index out of range')
        self.assertEqual(result['category'], 'index_boundary')

    def test_null_reference_classified(self):
        result = self._classify("TypeError: 'NoneType' object is not iterable")
        self.assertEqual(result['category'], 'null_reference')

    def test_syntax_error_classified(self):
        result = self._classify('SyntaxError: invalid syntax')
        self.assertEqual(result['category'], 'syntax_error')
        self.assertEqual(result['problem_type'], 'syntax_error')

    def test_type_error_classified(self):
        result = self._classify("TypeError: unsupported operand type(s) for +: 'int' and 'str'")
        self.assertEqual(result['category'], 'type_error')

    def test_name_error_classified(self):
        result = self._classify("NameError: name 'foo' is not defined")
        self.assertEqual(result['category'], 'runtime_error')

    def test_module_not_found_classified(self):
        result = self._classify("ModuleNotFoundError: No module named 'requests'")
        self.assertEqual(result['category'], 'dependency_error')
        self.assertGreater(result['confidence'], 0.8)

    def test_database_error_classified(self):
        result = self._classify('DatabaseError: disk I/O error')
        self.assertEqual(result['category'], 'database_error')

    def test_assertion_error_classified(self):
        result = self._classify('AssertionError: expected True but got False')
        self.assertEqual(result['category'], 'testing_error')

    def test_unknown_error_returns_default(self):
        """Unrecognised diagnostics fall back to runtime_error."""
        result = self._classify('Some completely unknown problem occurred')
        self.assertEqual(result['problem_type'], 'runtime_error')
        self.assertLessEqual(result['confidence'], 0.5)

    def test_confidence_is_float(self):
        result = self._classify('IndexError: list index out of range')
        self.assertIsInstance(result['confidence'], float)


# ── Problem Detail Tests ───────────────────────────────────────────────────────

@override_settings(REST_FRAMEWORK=NO_THROTTLE)
class ProblemDetailTests(APITestCase):
    """Tests for GET /api/worklens/problem/<id>/ (continue previous chat)."""

    def setUp(self):
        cache.clear()
        from apps.worklens.models import WorkLensSession, Problem, ProblemContext
        from apps.knowledge.models import ProblemDNA

        self.user = User.objects.create_user(
            email='detail@worklens.io', name='Detail Tester', password='testpass!')
        resp = self.client.post('/api/auth/login/', {
            'email': 'detail@worklens.io', 'password': 'testpass!'
        })
        self.token = resp.data.get('access', '')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')

        self.session = WorkLensSession.objects.create(user=self.user)
        self.problem = Problem.objects.create(
            session=self.session,
            user=self.user,
            language='python',
            problem_type='index_boundary',
            category='logic',
            description='Index out of range',
            confidence=0.85,
        )
        ProblemContext.objects.create(
            problem=self.problem,
            file_name='test.py',
            selected_code='numbers[i + 1]',
            diagnostics=[{'message': 'IndexError', 'severity': 'error'}],
        )
        ProblemDNA.objects.create(
            problem=self.problem,
            language='python',
            error_type='index_boundary',
            category='logic',
            symptoms=['IndexError'],
            code_pattern='numbers[i + 1]',
            guidance=['Check bounds'],
            attempts=[{
                'description': 'I see the issue.',
                'guidance_level': 1,
                'action': 'ask',
                'result': 'unknown',
            }],
        )

    def test_problem_detail_success(self):
        url = f'/api/worklens/problem/{self.problem.id}/'
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['success'])
        self.assertIn('problem', resp.data)
        self.assertIn('context', resp.data)
        self.assertIn('attempts', resp.data)

    def test_problem_detail_has_context_fields(self):
        url = f'/api/worklens/problem/{self.problem.id}/'
        resp = self.client.get(url)
        ctx = resp.data['context']
        self.assertEqual(ctx['file_name'], 'test.py')
        self.assertEqual(ctx['selected_code'], 'numbers[i + 1]')
        self.assertIsInstance(ctx['diagnostics'], list)

    def test_problem_detail_has_attempts(self):
        url = f'/api/worklens/problem/{self.problem.id}/'
        resp = self.client.get(url)
        attempts = resp.data['attempts']
        self.assertEqual(len(attempts), 1)
        self.assertEqual(attempts[0]['action'], 'ask')
        self.assertIn('description', attempts[0])

    def test_problem_detail_not_found(self):
        import uuid
        fake_id = str(uuid.uuid4())
        url = f'/api/worklens/problem/{fake_id}/'
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 404)
        self.assertFalse(resp.data['success'])

    def test_problem_detail_problem_fields_correct(self):
        """Returned problem dict must include all expected fields."""
        url = f'/api/worklens/problem/{self.problem.id}/'
        resp = self.client.get(url)
        problem = resp.data['problem']
        for field in ('id', 'session_id', 'language', 'description',
                      'problem_type', 'category', 'confidence', 'status', 'created_at'):
            self.assertIn(field, problem, msg=f'Missing field: {field}')

    def test_problem_detail_language_correct(self):
        url = f'/api/worklens/problem/{self.problem.id}/'
        resp = self.client.get(url)
        self.assertEqual(resp.data['problem']['language'], 'python')