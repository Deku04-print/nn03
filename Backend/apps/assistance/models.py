"""Additive assistance records linked to the existing identity and problem case."""
import uuid
from django.conf import settings
from django.db import models


class Record(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True


class ExpertProfile(Record):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='expert_profile')
    eligible = models.BooleanField(default=False)
    bio = models.TextField(blank=True)
    skills = models.JSONField(default=list)
    organizational_status = models.CharField(max_length=20, choices=[('active', 'Active'), ('exited', 'Exited Organization')], default='active')
    availability = models.CharField(max_length=12, choices=[('available', 'Available'), ('offline', 'Offline'), ('busy', 'Busy')], default='offline')
    visual_enabled = models.BooleanField(default=False)
    is_demo = models.BooleanField(default=False, editable=False)
    git_identity = models.CharField(max_length=200, blank=True)
    git_contributions = models.JSONField(default=dict, blank=True)
    git_verified_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def visual_eligible(self):
        return (self.eligible and self.organizational_status == 'exited' and self.visual_enabled
                and self.knowledge.filter(approved=True).exists())


class ExpertAudit(Record):
    expert = models.ForeignKey(ExpertProfile, on_delete=models.PROTECT, related_name='audit')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    changes = models.JSONField(default=dict)


class ExpertKnowledge(Record):
    expert = models.ForeignKey(ExpertProfile, on_delete=models.CASCADE, related_name='knowledge')
    title = models.CharField(max_length=255)
    content = models.TextField()
    source_reference = models.CharField(max_length=500)
    approved = models.BooleanField(default=False)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    dna = models.ForeignKey('knowledge.ProblemDNA', on_delete=models.SET_NULL, null=True, blank=True)


class AITurn(Record):
    problem = models.ForeignKey('worklens.Problem', on_delete=models.CASCADE, related_name='ai_turns')
    client_id = models.UUIDField(default=uuid.uuid4)
    question = models.TextField(blank=True)
    response = models.JSONField()
    action = models.CharField(max_length=20)

    class Meta:
        ordering = ['created_at', 'id']
        constraints = [models.UniqueConstraint(fields=['problem', 'client_id'], name='unique_ai_problem_turn')]


class AIResponseFeedback(Record):
    turn = models.OneToOneField(AITurn, on_delete=models.CASCADE, related_name='feedback')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    value = models.SmallIntegerField(choices=[(1, 'Helpful'), (-1, 'Unhelpful')])
    updated_at = models.DateTimeField(auto_now=True)


class AssistanceCase(Record):
    problem = models.OneToOneField('worklens.Problem', on_delete=models.CASCADE, related_name='assistance_case')
    # Frozen, user-reviewed disclosure. Never expose the underlying private ProblemContext to experts.
    shared_context = models.JSONField(default=dict)
    consented_at = models.DateTimeField()


class AssistanceSession(Record):
    case = models.ForeignKey(AssistanceCase, on_delete=models.CASCADE, related_name='assistance_sessions')
    expert = models.ForeignKey(ExpertProfile, on_delete=models.PROTECT, related_name='assistance_sessions')
    mode = models.CharField(max_length=10, choices=[('human', 'Human API'), ('visual', 'Visual Expert')])
    status = models.CharField(max_length=12, choices=[('pending', 'Pending'), ('active', 'Active'), ('rejected', 'Rejected'), ('ended', 'Ended')], default='pending')
    accepted_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    ended_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    outcome = models.CharField(max_length=20, choices=[('unresolved', 'Unresolved'), ('resolved', 'Reported resolved')], default='unresolved')
    resolution_summary = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [models.UniqueConstraint(fields=['case', 'expert', 'mode'], condition=models.Q(status__in=['pending', 'active']), name='one_open_assistance_session')]


class AssistanceMessage(Record):
    session = models.ForeignKey(AssistanceSession, on_delete=models.CASCADE, related_name='messages')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    kind = models.CharField(max_length=12, choices=[('human', 'Human authored'), ('ai', 'AI generated')])
    text = models.TextField()
    client_id = models.UUIDField(default=uuid.uuid4)
    sources = models.JSONField(default=list)

    class Meta:
        ordering = ['created_at', 'id']
        constraints = [models.UniqueConstraint(fields=['session', 'client_id', 'kind'], name='unique_session_message')]


class SessionFeedback(Record):
    session = models.OneToOneField(AssistanceSession, on_delete=models.CASCADE, related_name='feedback')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    resolved = models.BooleanField()
    rating = models.PositiveSmallIntegerField()
    understandable = models.BooleanField()
    comment = models.TextField(blank=True)


class Notification(Record):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='assistance_notifications')
    session = models.ForeignKey(AssistanceSession, on_delete=models.CASCADE, related_name='notifications')
    event = models.CharField(max_length=30)
    title = models.CharField(max_length=180)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [models.UniqueConstraint(fields=['recipient', 'session', 'event'], name='unique_recipient_session_event')]


class BrowserHandoff(Record):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    destination = models.CharField(max_length=150)
    expires_at = models.DateTimeField()
    proof_hash = models.CharField(max_length=64, blank=True)
    approved_hash = models.CharField(max_length=64, blank=True)
    consumed_at = models.DateTimeField(null=True, blank=True)
