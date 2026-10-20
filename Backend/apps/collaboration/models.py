import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone


class AIResponse(models.Model):
    """Immutable record of an AI answer so feedback/review targets one answer."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='ai_responses')
    problem = models.ForeignKey('nexus.Problem', on_delete=models.SET_NULL, null=True, blank=True, related_name='ai_responses')
    project_session = models.ForeignKey('nexus.NexusSession', on_delete=models.SET_NULL, null=True, blank=True, related_name='ai_responses')
    action = models.CharField(max_length=30, default='analyze')
    content = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'nexus_ai_responses'
        ordering = ['-created_at']


class AIResponseFeedback(models.Model):
    CATEGORIES = [
        ('helpful', 'Helpful'), ('partially_helpful', 'Partially helpful'),
        ('not_helpful', 'Not helpful'), ('incorrect', 'Incorrect or misleading'),
        ('more_explanation', 'Need more explanation'), ('human_help', 'Want human assistance'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    response = models.ForeignKey(AIResponse, on_delete=models.CASCADE, related_name='feedback')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='ai_feedback')
    category = models.CharField(max_length=32, choices=CATEGORIES)
    details = models.TextField(blank=True, max_length=3000)
    human_help_requested = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'nexus_ai_response_feedback'
        constraints = [models.UniqueConstraint(fields=['response', 'user'], name='nexus_unique_ai_feedback')]


class ExpertProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, primary_key=True, on_delete=models.CASCADE, related_name='expert_profile')
    bio = models.TextField(blank=True, max_length=3000)
    languages = models.JSONField(default=list, blank=True)
    frameworks = models.JSONField(default=list, blank=True)
    categories = models.JSONField(default=list, blank=True)
    years_experience = models.PositiveSmallIntegerField(null=True, blank=True)
    is_available = models.BooleanField(default=False, db_index=True)
    max_active_sessions = models.PositiveSmallIntegerField(default=3)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'nexus_expert_profiles'

    def __str__(self):
        return f'Expert profile: {self.user.email}'


class AssistanceSession(models.Model):
    STATUSES = [
        ('pending', 'Waiting for expert'), ('accepted', 'Active'),
        ('declined', 'Declined'), ('cancelled', 'Cancelled'),
        ('closed', 'Closed'), ('expired', 'Expired'),
    ]
    OUTCOMES = [
        ('resolved', 'Resolved'), ('partially_resolved', 'Partially resolved'),
        ('unresolved', 'Unresolved'), ('escalated', 'Escalated'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    developer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='human_help_sessions')
    expert = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='expert_help_sessions')
    problem = models.ForeignKey('nexus.Problem', on_delete=models.SET_NULL, null=True, blank=True, related_name='human_help_sessions')
    ai_response = models.ForeignKey(AIResponse, on_delete=models.SET_NULL, null=True, blank=True, related_name='human_help_sessions')
    status = models.CharField(max_length=20, choices=STATUSES, default='pending', db_index=True)
    developer_reason = models.TextField(blank=True, max_length=3000)
    approved_context = models.JSONField(default=dict, blank=True)
    context_shared = models.BooleanField(default=False)
    requested_at = models.DateTimeField(auto_now_add=True, db_index=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    last_activity_at = models.DateTimeField(default=timezone.now, db_index=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    resolution_outcome = models.CharField(max_length=24, choices=OUTCOMES, blank=True)
    resolution_summary = models.TextField(blank=True, max_length=3000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'nexus_assistance_sessions'
        ordering = ['-requested_at']
        constraints = [
            models.UniqueConstraint(
                fields=['developer'], condition=Q(status__in=['pending', 'accepted']),
                name='nexus_one_open_human_session_per_dev',
            ),
        ]


class AssistanceMessage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(AssistanceSession, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='human_help_messages')
    content = models.TextField(max_length=6000)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'nexus_assistance_messages'
        ordering = ['created_at']


class SessionFeedback(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.OneToOneField(AssistanceSession, on_delete=models.CASCADE, related_name='developer_feedback')
    developer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='human_session_feedback')
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    problem_resolved = models.BooleanField(null=True, blank=True)
    explanation_understandable = models.BooleanField(null=True, blank=True)
    expert_helpful = models.BooleanField(null=True, blank=True)
    comments = models.TextField(blank=True, max_length=3000)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'nexus_expert_session_feedback'


class AIResponseReview(models.Model):
    OUTCOMES = [
        ('correct', 'Correct'), ('partially_correct', 'Partially correct'),
        ('incorrect', 'Incorrect'), ('insufficient', 'Insufficient'),
    ]
    STATUSES = [('queued', 'Queued'), ('claimed', 'Claimed'), ('reviewed', 'Reviewed'), ('cancelled', 'Cancelled')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    response = models.ForeignKey(AIResponse, on_delete=models.CASCADE, related_name='reviews')
    developer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='requested_ai_reviews')
    expert = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='completed_ai_reviews')
    reason = models.CharField(max_length=32, choices=AIResponseFeedback.CATEGORIES)
    notes = models.TextField(blank=True, max_length=3000)
    context_shared = models.BooleanField(default=False)
    approved_context = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=STATUSES, default='queued', db_index=True)
    outcome = models.CharField(max_length=24, choices=OUTCOMES, blank=True)
    explanation = models.TextField(blank=True, max_length=5000)
    suggested_correction = models.TextField(blank=True, max_length=5000)
    created_at = models.DateTimeField(auto_now_add=True)
    claimed_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'nexus_ai_response_reviews'
        ordering = ['-created_at']
        constraints = [models.UniqueConstraint(fields=['response', 'developer'], name='nexus_unique_ai_review_request')]


class LearningRecommendation(models.Model):
    STATUSES = [
        ('recommended', 'Recommended'), ('in_progress', 'In progress'),
        ('completed', 'Completed'), ('needs_practice', 'Needs more practice'),
        ('dismissed', 'Not useful'), ('useful', 'Useful'), ('already_known', 'Already known'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='learning_recommendations')
    topic = models.CharField(max_length=160)
    language = models.CharField(max_length=80, blank=True)
    framework = models.CharField(max_length=100, blank=True)
    category = models.CharField(max_length=100, blank=True)
    evidence_count = models.PositiveIntegerField(default=0)
    evidence_problem_ids = models.JSONField(default=list, blank=True)
    rationale = models.TextField(max_length=1000)
    activity_title = models.CharField(max_length=200)
    activity = models.TextField(max_length=3000)
    status = models.CharField(max_length=20, choices=STATUSES, default='recommended', db_index=True)
    resources = models.ManyToManyField('LearningResource', blank=True, related_name='recommendations')
    generated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'nexus_learning_recommendations'
        ordering = ['status', '-evidence_count', '-generated_at']
        constraints = [models.UniqueConstraint(fields=['user', 'topic', 'language', 'framework'], name='nexus_unique_learning_topic')]


class CollaborationAuditEvent(models.Model):
    """Minimal audit metadata for sensitive collaboration/review transitions."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='collaboration_audit_events',
    )
    action = models.CharField(max_length=80, db_index=True)
    target_type = models.CharField(max_length=80)
    target_id = models.CharField(max_length=80, db_index=True)
    event_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'nexus_collaboration_audit_events'
        ordering = ['-created_at']


class LearningResource(models.Model):
    DIFFICULTIES = [('beginner', 'Beginner'), ('intermediate', 'Intermediate'), ('advanced', 'Advanced')]
    SOURCES = [('internal', 'Internal'), ('udemy', 'Udemy'), ('external', 'External')]
    REVIEW_STATES = [('pending', 'Pending review'), ('approved', 'Approved'), ('rejected', 'Rejected')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=240)
    description = models.TextField(blank=True, max_length=3000)
    topic = models.CharField(max_length=160, db_index=True)
    technology = models.CharField(max_length=100, blank=True, db_index=True)
    difficulty = models.CharField(max_length=20, choices=DIFFICULTIES, default='beginner')
    prerequisites = models.JSONField(default=list, blank=True)
    objectives = models.JSONField(default=list, blank=True)
    url = models.URLField(max_length=1000)
    source_type = models.CharField(max_length=20, choices=SOURCES)
    source_label = models.CharField(max_length=240, blank=True)
    review_status = models.CharField(max_length=20, choices=REVIEW_STATES, default='pending', db_index=True)
    last_verified_at = models.DateField(null=True, blank=True)
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='reviewed_learning_resources')
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'nexus_learning_resources'
        ordering = ['topic', 'difficulty', 'title']
        indexes = [models.Index(fields=['topic', 'technology', 'review_status'])]

    def __str__(self):
        return f'{self.topic}: {self.title}'


class VisualExpertKnowledge(models.Model):
    """Admin-reviewed, approved technical knowledge used by Visual Expert."""
    REVIEW_STATES = [('pending', 'Pending review'), ('approved', 'Approved'), ('rejected', 'Rejected')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=240)
    topic = models.CharField(max_length=160, db_index=True)
    technology = models.CharField(max_length=100, blank=True, db_index=True)
    source_label = models.CharField(max_length=240)
    source_reference = models.CharField(max_length=1000, blank=True)
    content = models.TextField()
    review_status = models.CharField(max_length=20, choices=REVIEW_STATES, default='pending', db_index=True)
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='reviewed_visual_expert_knowledge')
    is_active = models.BooleanField(default=True, db_index=True)
    embedding = models.JSONField(null=True, blank=True)
    embedding_model = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'nexus_visual_expert_knowledge'
        ordering = ['technology', 'topic', 'title']

    def __str__(self):
        return f'{self.title} ({self.review_status})'
