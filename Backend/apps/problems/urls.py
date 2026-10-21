from django.urls import path
from rest_framework.response import Response
from rest_framework.views import APIView


class ProblemsPlaceholderView(APIView):
    """Placeholder — problem-tracking endpoints coming soon."""
    def get(self, request):
        return Response({'success': True, 'data': []})


urlpatterns = [
    path('', ProblemsPlaceholderView.as_view(), name='problems-list'),
]
