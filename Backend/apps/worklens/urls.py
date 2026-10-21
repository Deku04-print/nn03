from django.urls import path
from .views import (
    AnalyzeView, GuideView, HintView, ExplainView, VerifyView,
    ChatHistoryView, ProblemDetailView, GenerateDocsView, GenerateTestsView, GenerateInfraView,
    GenerateCommandView
)

urlpatterns = [
    path('analyze/',       AnalyzeView.as_view(),       name='worklens-analyze'),
    path('guide/',         GuideView.as_view(),         name='worklens-guide'),
    path('hint/',          HintView.as_view(),          name='worklens-hint'),
    path('explain/',       ExplainView.as_view(),       name='worklens-explain'),
    path('verify/',        VerifyView.as_view(),        name='worklens-verify'),
    path('history/',       ChatHistoryView.as_view(),   name='worklens-history'),
    path('problem/<uuid:problem_id>/', ProblemDetailView.as_view(), name='worklens-problem-detail'),
    path('generate-docs/',  GenerateDocsView.as_view(),  name='worklens-generate-docs'),
    path('generate-tests/', GenerateTestsView.as_view(), name='worklens-generate-tests'),
    path('generate-infra/', GenerateInfraView.as_view(), name='worklens-generate-infra'),
    path('generate-command/', GenerateCommandView.as_view(), name='worklens-generate-command'),
]