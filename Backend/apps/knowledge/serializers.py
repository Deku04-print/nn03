"""
ProblemDNA DRF Serializer.
"""
from rest_framework import serializers
from .models import ProblemDNA


class ProblemDNASerializer(serializers.ModelSerializer):
    problem_id = serializers.UUIDField(source='problem.id', read_only=True)

    class Meta:
        model  = ProblemDNA
        fields = [
            'id', 'problem_id',
            'language', 'framework', 'error_type', 'category',
            'symptoms', 'code_pattern', 'attempts', 'root_cause', 'guidance',
            'verification_status', 'scope_zone', 'reuse_count', 'reliability_score',
            'verified_at', 'fix_snippet', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
