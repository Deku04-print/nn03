
from django.urls import path
from .views import (
    AnalyzeView, GuideView, HintView, ExplainView, VerifyView,
    ChatHistoryView, ProblemDetailView, GenerateDocsView, GenerateTestsView, GenerateInfraView,
    GenerateCommandView
)

urlpatterns = [
    path('analyze/',       AnalyzeView.as_view(),       name='nexus-analyze'),
    path('guide/',         GuideView.as_view(),         name='nexus-guide'),
    path('hint/',          HintView.as_view(),          name='nexus-hint'),
    path('explain/',       ExplainView.as_view(),       name='nexus-explain'),
    path('verify/',        VerifyView.as_view(),        name='nexus-verify'),
    path('history/',       ChatHistoryView.as_view(),   name='nexus-history'),
    path('problem/<uuid:problem_id>/', ProblemDetailView.as_view(), name='nexus-problem-detail'),
    path('generate-docs/',  GenerateDocsView.as_view(),  name='nexus-generate-docs'),
    path('generate-tests/', GenerateTestsView.as_view(), name='nexus-generate-tests'),
    path('generate-infra/', GenerateInfraView.as_view(), name='nexus-generate-infra'),
    path('generate-command/', GenerateCommandView.as_view(), name='nexus-generate-command'),
]