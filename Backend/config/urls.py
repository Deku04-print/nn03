from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),

    # Auth
    path('api/auth/', include('apps.users.urls')),

    # NEXUS core mentor endpoints
    path('api/nexus/', include('apps.nexus.urls')),

    # Problem tracking — full ProblemDNA CRUD via knowledge app
    path('api/problems/', include('apps.knowledge.urls')),

    # Analytics dashboard
    path('api/analytics/', include('apps.analytics.urls')),

    # Admin — User Management
    path('api/admin/', include('apps.users.admin_urls')),

    # Human assistance, AI feedback/reviews, and Skill Quest
    path('api/collaboration/', include('apps.collaboration.urls')),
]
