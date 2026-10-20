
from django.db import models
from apps.nexus.models import NexusSession
import uuid


class AgentInteraction(models.Model):
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session        = models.ForeignKey(NexusSession, on_delete=models.CASCADE, related_name='interactions')
    agent_name     = models.CharField(max_length=100)
    action         = models.CharField(max_length=50)
    input_summary  = models.TextField(blank=True)
    output_summary = models.TextField(blank=True)
    guidance_level = models.PositiveIntegerField(default=0)
    latency_ms     = models.IntegerField(default=0)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'nexus_agent_interactions'

