from django.urls import path
from .views import (
    OverviewView,
    ProblemsAnalyticsView,
    CategoriesView,
    ResolutionView,
    AgentsView,
    DevelopersListView,
    DeveloperDetailAnalyticsView,
)

urlpatterns = [
    path('overview/',                     OverviewView.as_view(),                 name='analytics-overview'),
    path('problems/',                     ProblemsAnalyticsView.as_view(),        name='analytics-problems'),
    path('categories/',                   CategoriesView.as_view(),               name='analytics-categories'),
    path('resolution/',                   ResolutionView.as_view(),               name='analytics-resolution'),
    path('agents/',                       AgentsView.as_view(),                   name='analytics-agents'),
    path('developers/',                   DevelopersListView.as_view(),           name='analytics-developers-list'),
    path('developers/<uuid:user_id>/',    DeveloperDetailAnalyticsView.as_view(), name='analytics-developer-detail'),
]
