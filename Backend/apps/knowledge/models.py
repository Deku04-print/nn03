
"""
ProblemDNA — structured knowledge record for every debugging problem.
Lifecycle: created → attempts recorded → root cause identified → verified → embedded.
"""
import uuid
from django.db import models
from apps.nexus.models import Problem


class ProblemDNA(models.Model):
    VERIFY_STATUS = [
        ('pending',           'Pending'),
        ('partially_resolved','Partially Resolved'),
        ('verified',          'Verified'),
        ('failed',            'Failed'),
    ]

    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    problem             = models.OneToOneField(
                              Problem, on_delete=models.CASCADE,
                              related_name='dna', null=True, blank=True)

    # Classification ---------------------------------------------------
    language            = models.CharField(max_length=50, db_index=True)
    framework           = models.CharField(max_length=100, blank=True, null=True)
    error_type          = models.CharField(max_length=80)
    category            = models.CharField(max_length=80, db_index=True)

    # Structured knowledge ---------------------------------------------
    symptoms            = models.JSONField(default=list)   # list[str]
    code_pattern        = models.CharField(max_length=255, blank=True)
    attempts            = models.JSONField(default=list)   # list[{description, result}]
    root_cause          = models.TextField(blank=True)
    guidance            = models.JSONField(default=list)   # list[str]

    # Verification, governance & enterprise reuse ----------------------
    SCOPE_ZONES = [
        ('private',      'Private (Twin)'),
        ('team',         'Team Shared'),
        ('organization', 'Enterprise Global'),
    ]

    verification_status = models.CharField(
                              max_length=25, choices=VERIFY_STATUS, default='pending')
    scope_zone          = models.CharField(
                              max_length=30, choices=SCOPE_ZONES, default='organization', db_index=True)
    reuse_count         = models.PositiveIntegerField(default=0, db_index=True)
    reliability_score   = models.FloatField(default=0.85)
    verified_at         = models.DateTimeField(null=True, blank=True)
    fix_snippet         = models.TextField(blank=True, default='')
    embedding_text      = models.TextField(blank=True)     # normalised text used for embedding

    # JSON vectors keep semantic retrieval portable without requiring pgvector.
    embedding            = models.JSONField(null=True, blank=True)
    embedding_model      = models.CharField(max_length=100, blank=True, default='')

    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'nexus_problem_dna'

    def build_embedding_text(self) -> str:
        """Produce a normalised plain-text representation for embedding."""
        parts = [
            f"Language: {self.language}",
            f"Problem type: {self.error_type}",
            f"Category: {self.category}",
            f"Symptoms:\n" + "\n".join(f"- {s}" for s in (self.symptoms or [])),
        ]
        if self.code_pattern:
            parts.append(f"Pattern: {self.code_pattern}")
        if self.root_cause:
            parts.append(f"Root cause: {self.root_cause}")
        if self.guidance:
            parts.append("Guidance:\n" + "\n".join(f"- {g}" for g in self.guidance))
        return "\n\n".join(parts)

    def __str__(self):
        return f"ProblemDNA [{self.category}] {self.language} — {self.id}"

