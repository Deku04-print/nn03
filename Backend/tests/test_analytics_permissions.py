from rest_framework.test import APITestCase

from apps.users.models import NexusUser


class AnalyticsAccessTests(APITestCase):
    def setUp(self):
        self.user = NexusUser.objects.create_user('dev-analytics@nexus.test', 'Developer', 'pass12345')
        self.admin = NexusUser.objects.create_superuser('admin-analytics@nexus.test', 'Admin', 'pass12345')

    def test_organization_analytics_is_not_public(self):
        response = self.client.get('/api/analytics/overview/')
        self.assertEqual(response.status_code, 401)

    def test_regular_user_cannot_read_cohort_analytics(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/analytics/developers/')
        self.assertEqual(response.status_code, 403)

    def test_admin_metrics_use_stored_data_without_sample_fallbacks(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/analytics/overview/')
        self.assertEqual(response.status_code, 200)
        data = response.data['data']
        self.assertEqual(data['problems_encountered'], 0)
        self.assertEqual(data['hints_requested'], 0)
        self.assertIsNone(data['resolution_rate'])
        self.assertIsNone(data['most_common_problem'])
        self.assertIsNone(data['most_common_tech'])
        self.assertEqual(data['dna_signatures'], 0)
        self.assertEqual(data['total_reuses'], 0)
        self.assertIsNone(data['hours_saved'])
