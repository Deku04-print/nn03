from django.contrib import admin
from django.utils import timezone

from .models import (
    AIResponse, AIResponseFeedback, AIResponseReview, AssistanceMessage,
    AssistanceSession, CollaborationAuditEvent, ExpertProfile, LearningRecommendation,
    LearningResource, SessionFeedback, VisualExpertKnowledge,
)


@admin.register(ExpertProfile)
class ExpertProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'is_available', 'years_experience', 'max_active_sessions')
    list_filter = ('is_available',)
    search_fields = ('user__email', 'user__name')


@admin.register(AssistanceSession)
class AssistanceSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'developer', 'expert', 'status', 'requested_at', 'resolution_outcome')
    list_filter = ('status', 'resolution_outcome')
    readonly_fields = ('id', 'requested_at', 'accepted_at', 'last_activity_at', 'closed_at')


@admin.register(CollaborationAuditEvent)
class CollaborationAuditEventAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'actor', 'action', 'target_type', 'target_id')
    list_filter = ('action', 'target_type', 'created_at')
    search_fields = ('target_id', 'actor__email')
    readonly_fields = ('id', 'actor', 'action', 'target_type', 'target_id', 'event_data', 'created_at')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(LearningResource)
class LearningResourceAdmin(admin.ModelAdmin):
    list_display = ('title', 'topic', 'technology', 'difficulty', 'source_type', 'review_status', 'last_verified_at', 'is_active')
    list_filter = ('source_type', 'review_status', 'difficulty', 'is_active', 'technology')
    search_fields = ('title', 'topic', 'technology', 'source_label', 'url')
    readonly_fields = ('reviewer', 'created_at', 'updated_at')
    fieldsets = (
        ('Learning resource', {'fields': ('title', 'description', 'topic', 'technology', 'difficulty', 'prerequisites', 'objectives')}),
        ('Source and review', {'fields': ('url', 'source_type', 'source_label', 'review_status', 'last_verified_at', 'reviewer', 'is_active')}),
        ('Timestamps', {'fields': ('created_at', 'updated_at')}),
    )

    def save_model(self, request, obj, form, change):
        if obj.review_status == 'approved':
            obj.reviewer = request.user
            obj.last_verified_at = obj.last_verified_at or timezone.localdate()
        super().save_model(request, obj, form, change)


admin.site.register([AIResponse, AIResponseFeedback, AIResponseReview, AssistanceMessage, SessionFeedback, LearningRecommendation])


@admin.register(VisualExpertKnowledge)
class VisualExpertKnowledgeAdmin(admin.ModelAdmin):
    list_display = ('title', 'technology', 'topic', 'source_label', 'review_status', 'is_active', 'updated_at')
    list_filter = ('review_status', 'is_active', 'technology')
    search_fields = ('title', 'topic', 'technology', 'source_label', 'source_reference')
    readonly_fields = ('embedding', 'embedding_model', 'reviewer', 'created_at', 'updated_at')
    fields = ('title', 'topic', 'technology', 'source_label', 'source_reference', 'content', 'review_status', 'reviewer', 'is_active', 'embedding', 'embedding_model', 'created_at', 'updated_at')

    def save_model(self, request, obj, form, change):
        if obj.review_status == 'approved':
            obj.reviewer = request.user
        super().save_model(request, obj, form, change)
