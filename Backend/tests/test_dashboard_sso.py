from datetime import timedelta

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.users.models import DashboardLoginCode, NexusUser


@override_settings(
    DEBUG=True,
    FRONTEND_ORIGIN='http://localhost:3456',
    CORS_ALLOWED_ORIGINS=['http://localhost:3456'],
)
class DashboardCodeExchangeTests(APITestCase):
    def setUp(self):
        self.user = NexusUser.objects.create_user(
            email='dashboard-sso@test.local', name='Dashboard SSO', password='local-test-password'
        )
        self.callback = 'http://localhost:3456/auth/exchange'

    def issue_code(self):
        self.client.force_authenticate(self.user)
        response = self.client.post('/api/auth/dashboard-code/', {
            'redirect_uri': self.callback,
            'next_path': '/learning',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertNotIn('access', response.data)
        return response.data['code']

    def test_code_is_single_use_and_returns_access_token(self):
        code = self.issue_code()
        self.client.force_authenticate(user=None)
        response = self.client.post('/api/auth/dashboard-code/exchange/', {
            'code': code, 'redirect_uri': self.callback,
        }, format='json', HTTP_ORIGIN='http://localhost:3456')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['access'])
        self.assertEqual(response.data['next_path'], '/learning')

        repeated = self.client.post('/api/auth/dashboard-code/exchange/', {
            'code': code, 'redirect_uri': self.callback,
        }, format='json', HTTP_ORIGIN='http://localhost:3456')
        self.assertEqual(repeated.status_code, 400)

    def test_expired_code_is_rejected(self):
        code = self.issue_code()
        grant = DashboardLoginCode.objects.get(user=self.user)
        grant.expires_at = timezone.now() - timedelta(seconds=1)
        grant.save(update_fields=['expires_at'])
        self.client.force_authenticate(user=None)
        response = self.client.post('/api/auth/dashboard-code/exchange/', {
            'code': code, 'redirect_uri': self.callback,
        }, format='json', HTTP_ORIGIN='http://localhost:3456')
        self.assertEqual(response.status_code, 400)

    def test_unapproved_callback_is_rejected(self):
        self.client.force_authenticate(self.user)
        response = self.client.post('/api/auth/dashboard-code/', {
            'redirect_uri': 'http://attacker.invalid/auth/exchange',
            'next_path': '/',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(DashboardLoginCode.objects.count(), 0)

    def test_dashboard_home_is_the_default_destination(self):
        self.client.force_authenticate(self.user)
        response = self.client.post('/api/auth/dashboard-code/', {
            'redirect_uri': self.callback,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        grant = DashboardLoginCode.objects.get(user=self.user)
        self.assertEqual(grant.next_path, '/')

    def test_extension_can_open_visual_expert_page(self):
        self.client.force_authenticate(self.user)
        response = self.client.post('/api/auth/dashboard-code/', {
            'redirect_uri': self.callback,
            'next_path': '/visual-expert',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(DashboardLoginCode.objects.get(user=self.user).next_path, '/visual-expert')

    def test_contextual_visual_expert_destination_accepts_only_uuid_context(self):
        self.client.force_authenticate(self.user)
        problem_id = '2c7c88d2-35cb-4ec4-ad8d-c93ab7c124ad'
        expert_id = '6e1a0c39-3a35-4752-9111-554d0acb2737'
        response = self.client.post('/api/auth/dashboard-code/', {
            'redirect_uri': self.callback,
            'next_path': f'/visual-expert?problem_id={problem_id}&expert_id={expert_id}',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(DashboardLoginCode.objects.get(user=self.user).next_path, f'/visual-expert?problem_id={problem_id}&expert_id={expert_id}')

    def test_contextual_visual_expert_destination_rejects_external_route(self):
        self.client.force_authenticate(self.user)
        response = self.client.post('/api/auth/dashboard-code/', {
            'redirect_uri': self.callback,
            'next_path': '/visual-expert?problem_id=not-a-uuid&next=https://attacker.invalid',
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_exchange_requires_matching_browser_origin(self):
        code = self.issue_code()
        self.client.force_authenticate(user=None)
        response = self.client.post('/api/auth/dashboard-code/exchange/', {
            'code': code, 'redirect_uri': self.callback,
        }, format='json', HTTP_ORIGIN='http://attacker.invalid')
        self.assertEqual(response.status_code, 400)
        missing_origin = self.client.post('/api/auth/dashboard-code/exchange/', {
            'code': code, 'redirect_uri': self.callback,
        }, format='json')
        self.assertEqual(missing_origin.status_code, 400)
