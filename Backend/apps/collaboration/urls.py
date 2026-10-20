from django.urls import path

from .views import (
    AssistanceMessageView, AssistanceSessionDetailView, AssistanceSessionListCreateView,
    ExpertDetailView, ExpertListView, ExpertProfileSelfView, FeedbackView, LearningProgressView,
    ReviewClaimView, ReviewListCreateView, ReviewOutcomeView,
    SessionFeedbackView, SessionOutcomeView, SkillQuestView,
    VisualExpertAskView, VisualExpertSourcesView,
)

urlpatterns = [
    path('feedback/', FeedbackView.as_view(), name='ai-response-feedback'),
    path('experts/', ExpertListView.as_view(), name='expert-list'),
    path('experts/me/', ExpertProfileSelfView.as_view(), name='expert-profile-self'),
    path('experts/<uuid:expert_id>/', ExpertDetailView.as_view(), name='expert-detail'),
    path('sessions/', AssistanceSessionListCreateView.as_view(), name='assistance-session-list-create'),
    path('sessions/<uuid:session_id>/', AssistanceSessionDetailView.as_view(), name='assistance-session-detail-actions'),
    path('sessions/<uuid:session_id>/messages/', AssistanceMessageView.as_view(), name='assistance-session-messages'),
    path('sessions/<uuid:session_id>/feedback/', SessionFeedbackView.as_view(), name='assistance-session-feedback'),
    path('sessions/<uuid:session_id>/outcome/', SessionOutcomeView.as_view(), name='assistance-session-outcome'),
    path('reviews/', ReviewListCreateView.as_view(), name='ai-review-list-create'),
    path('reviews/<uuid:review_id>/claim/', ReviewClaimView.as_view(), name='ai-review-claim'),
    path('reviews/<uuid:review_id>/outcome/', ReviewOutcomeView.as_view(), name='ai-review-outcome'),
    path('skill-quest/', SkillQuestView.as_view(), name='skill-quest'),
    path('skill-quest/<uuid:recommendation_id>/progress/', LearningProgressView.as_view(), name='skill-quest-progress'),
    path('visual-expert/sources/', VisualExpertSourcesView.as_view(), name='visual-expert-sources'),
    path('visual-expert/ask/', VisualExpertAskView.as_view(), name='visual-expert-ask'),
]
