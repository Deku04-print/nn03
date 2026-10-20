
from django.urls import path
from .admin_views import (
    UserListCreateView,
    UserDetailView,
    BatchListView,
    BulkUserUploadView,
    UserStatsView,
)

urlpatterns = [
    path('users/',                      UserListCreateView.as_view(), name='admin-user-list-create'),
    path('users/batches/',              BatchListView.as_view(),      name='admin-user-batches'),
    path('users/bulk-upload/',          BulkUserUploadView.as_view(), name='admin-user-bulk-upload'),
    path('users/<uuid:pk>/',            UserDetailView.as_view(),     name='admin-user-detail'),
    path('users/<uuid:pk>/stats/',      UserStatsView.as_view(),      name='admin-user-stats'),
]
