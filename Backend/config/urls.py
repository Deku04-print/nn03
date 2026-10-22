from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('api/assistance/', include('apps.assistance.urls')),
    path('admin/', admin.site.urls),

    # Auth
    path('api/auth/', include('apps.users.urls')),

    # WorkLens core mentor endpoints
    path('api/worklens/', include('apps.worklens.urls')),

    # Problem tracking — full ProblemDNA CRUD via knowledge app
    path('api/problems/', include('apps.knowledge.urls')),

    # Analytics dashboard
    path('api/analytics/', include('apps.analytics.urls')),

    # Admin — User Management
    path('api/admin/', include('apps.users.admin_urls')),
]
