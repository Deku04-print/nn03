from rest_framework import serializers
from .models import ExpertProfile, ExpertKnowledge


class ExpertSettingsSerializer(serializers.ModelSerializer):
    skills = serializers.ListField(child=serializers.CharField(max_length=80), max_length=40)

    class Meta:
        model = ExpertProfile
        fields = ['eligible', 'bio', 'skills', 'organizational_status', 'availability', 'visual_enabled', 'git_identity']


class KnowledgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpertKnowledge
        fields = ['id', 'title', 'content', 'source_reference', 'approved', 'dna', 'approved_at']
        read_only_fields = ['id', 'approved_at']

    def validate_dna(self, dna):
        if dna and (dna.scope_zone != 'organization' or dna.verification_status != 'verified'):
            raise serializers.ValidationError('Only verified organization-approved ProblemDNA can be associated.')
        return dna


class CaseInput(serializers.Serializer):
    problem_id = serializers.UUIDField()
    conversation_id = serializers.UUIDField()
    problem_context_id = serializers.UUIDField()
    consent = serializers.BooleanField()
    summary = serializers.CharField(max_length=10000)
    history = serializers.CharField(max_length=40000, allow_blank=True, default='')
    share_code = serializers.BooleanField(default=False)

    def validate_consent(self, value):
        if not value:
            raise serializers.ValidationError('Review and authorize the shared context first.')
        return value


class SessionInput(serializers.Serializer):
    case_id = serializers.UUIDField()
    expert_id = serializers.UUIDField()
    mode = serializers.ChoiceField(choices=['human', 'visual'])


class MessageInput(serializers.Serializer):
    text = serializers.CharField(max_length=10000)
    client_id = serializers.UUIDField()


class EndInput(serializers.Serializer):
    outcome = serializers.ChoiceField(choices=['unresolved', 'resolved'], default='unresolved')
    resolution_summary = serializers.CharField(max_length=10000, allow_blank=True, default='')


class FeedbackInput(serializers.Serializer):
    resolved = serializers.BooleanField()
    rating = serializers.IntegerField(min_value=1, max_value=5)
    understandable = serializers.BooleanField()
    comment = serializers.CharField(max_length=4000, allow_blank=True, default='')
