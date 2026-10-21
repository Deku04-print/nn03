from django.urls import path
from .views import (
    ProblemDNAListCreateView,
    ProblemDNADetailView,
    ProblemDNAAnalyticsView,
    SimilarProblemsView,
    AttemptCreateView,
)

urlpatterns = [
    path('',             ProblemDNAListCreateView.as_view(), name='problems-list'),
    path('analytics/',   ProblemDNAAnalyticsView.as_view(),  name='problems-analytics'),
    path('similar/',     SimilarProblemsView.as_view(),      name='problems-similar'),
    path('<uuid:pk>/',   ProblemDNADetailView.as_view(),     name='problems-detail'),
    path('<uuid:pk>/attempts/', AttemptCreateView.as_view(), name='problems-attempts'),
]
