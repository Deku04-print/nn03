from django.urls import path
from . import views as v

urlpatterns = [
    path('explicit-help-context/', v.ExplicitHelpContextView.as_view()),
    path('cases/', v.CasesView.as_view()),
    path('experts/', v.ExpertsView.as_view()),
    path('admin/experts/<uuid:user_id>/', v.ExpertAdminView.as_view()),
    path('admin/experts/<uuid:user_id>/knowledge/', v.KnowledgeAdminView.as_view()),
    path('admin/experts/<uuid:user_id>/knowledge/<uuid:knowledge_id>/', v.KnowledgeAdminView.as_view()),
    path('admin/reviews/', v.ReviewsAdminView.as_view()),
    path('sessions/', v.SessionsView.as_view()),
    path('sessions/<uuid:pk>/', v.SessionView.as_view()),
    path('sessions/<uuid:pk>/messages/', v.MessagesView.as_view()),
    path('sessions/<uuid:pk>/feedback/', v.SessionFeedbackView.as_view()),
    path('turns/<uuid:pk>/feedback/', v.TurnFeedbackView.as_view()),
    path('notifications/', v.NotificationsView.as_view()),
    path('dashboard/', v.MyDashboardView.as_view()),
    path('handoffs/', v.HandoffsView.as_view()),
    path('handoffs/<uuid:pk>/', v.HandoffOwnerView.as_view()),
    path('handoffs/<uuid:pk>/browser/', v.HandoffBrowserView.as_view()),
]
