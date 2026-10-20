
from django.contrib import admin
from .models import NexusSession, Problem, ProblemContext, Attempt, ProblemResolution


@admin.register(NexusSession)
class NexusSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'project', 'status', 'started_at')
    list_filter = ('status',)
    ordering = ('-started_at',)


@admin.register(Problem)
class ProblemAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'language', 'category', 'status', 'confidence', 'created_at')
    list_filter = ('language', 'status', 'category')
    search_fields = ('description',)
    readonly_fields = ('id', 'created_at', 'updated_at')
    ordering = ('-created_at',)


@admin.register(ProblemContext)
class ProblemContextAdmin(admin.ModelAdmin):
    list_display = ('id', 'problem', 'file_name')


@admin.register(Attempt)
class AttemptAdmin(admin.ModelAdmin):
    list_display = ('id', 'problem', 'attempt_number', 'guidance_level', 'result')
    list_filter = ('result',)


@admin.register(ProblemResolution)
class ProblemResolutionAdmin(admin.ModelAdmin):
    list_display = ('id', 'problem', 'verification_status', 'resolved_at')
    list_filter = ('verification_status',)