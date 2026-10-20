
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (DashboardLoginCodeCreateView, DashboardLoginCodeExchangeView,
                    RegisterView, MeView, NexusTokenObtainPairView)

urlpatterns = [
    path('register/', RegisterView.as_view(),                   name='register'),
    path('login/',    NexusTokenObtainPairView.as_view(),    name='token_obtain_pair'),
    path('refresh/',  TokenRefreshView.as_view(),               name='token_refresh'),
    path('me/',       MeView.as_view(),                         name='me'),
    path('dashboard-code/', DashboardLoginCodeCreateView.as_view(), name='dashboard-login-code'),
    path('dashboard-code/exchange/', DashboardLoginCodeExchangeView.as_view(), name='dashboard-login-code-exchange'),
]


