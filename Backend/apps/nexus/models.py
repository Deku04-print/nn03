
from django.db import models
from apps.users.models import NexusUser
import uuid


class NexusSession(models.Model):
    STATUS = [('active', 'Active'), ('closed', 'Closed')]
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user       = models.ForeignKey(NexusUser, on_delete=models.CASCADE, related_name='sessions')
    project    = models.CharField(max_length=255, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at   = models.DateTimeField(null=True, blank=True)
    status     = models.CharField(max_length=20, choices=STATUS, default='active')

    class Meta:
        db_table = 'nexus_sessions'


class Problem(models.Model):
    SEVERITY = [('error','Error'),('warning','Warning'),('info','Info')]
    STATUS   = [('open','Open'),('attempted','Attempted'),('resolved','Resolved'),('failed','Failed')]

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session      = models.ForeignKey(NexusSession, on_delete=models.CASCADE, related_name='problems')
    user         = models.ForeignKey(NexusUser, on_delete=models.CASCADE, related_name='problems')
    language     = models.CharField(max_length=50)
    framework    = models.CharField(max_length=100, blank=True, null=True)
    problem_type = models.CharField(max_length=80)
    category     = models.CharField(max_length=80)
    severity     = models.CharField(max_length=20, choices=SEVERITY, default='error')
    description  = models.TextField()
    status       = models.CharField(max_length=20, choices=STATUS, default='open')
    confidence   = models.FloatField(default=0.0)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'nexus_problems'


class ProblemContext(models.Model):
    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    problem         = models.OneToOneField(Problem, on_delete=models.CASCADE, related_name='context')
    file_name       = models.CharField(max_length=255)
    file_path       = models.CharField(max_length=1024, blank=True)
    function_name   = models.CharField(max_length=255, blank=True)
    selected_code   = models.TextField()
    surrounding_code = models.TextField(blank=True)
    diagnostics     = models.JSONField(default=list)

    class Meta:
        db_table = 'nexus_problem_contexts'


class Attempt(models.Model):
    RESULTS = [('unknown','Unknown'),('failed','Failed'),('partial','Partial'),('success','Success')]
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    problem        = models.ForeignKey(Problem, on_delete=models.CASCADE, related_name='attempts')
    attempt_number = models.PositiveIntegerField(default=1)
    description    = models.TextField()
    guidance_level = models.PositiveIntegerField(default=0)
    result         = models.CharField(max_length=20, choices=RESULTS, default='unknown')
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'nexus_attempts'


class ProblemResolution(models.Model):
    VERIFY = [
        ('pending',            'Pending'),
        ('partially_resolved', 'Partially Resolved'),
        ('verified',           'Verified'),
        ('failed',             'Failed'),
    ]
    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    problem             = models.OneToOneField(Problem, on_delete=models.CASCADE, related_name='resolution')
    root_cause          = models.TextField(blank=True)
    concept             = models.CharField(max_length=255, blank=True)
    verification_status = models.CharField(max_length=20, choices=VERIFY, default='pending')
    verification_details = models.TextField(blank=True)
    resolved_at         = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'nexus_resolutions'
