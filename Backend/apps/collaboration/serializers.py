from rest_framework import serializers

from .models import (
    AIResponseFeedback, AIResponseReview, AssistanceMessage,
    AssistanceSession, ExpertProfile, LearningRecommendation, SessionFeedback,
    VisualExpertKnowledge,
)


class ExpertProfileSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(source='user.name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    completed_sessions = serializers.IntegerField(read_only=True)
    resolved_sessions = serializers.IntegerField(read_only=True)
    completed_reviews = serializers.IntegerField(read_only=True)
    active_sessions = serializers.IntegerField(read_only=True)

    class Meta:
        model = ExpertProfile
        fields = [
            'user_id', 'name', 'email', 'bio', 'languages', 'frameworks', 'categories',
            'years_experience', 'is_available', 'max_active_sessions',
            'completed_sessions', 'resolved_sessions', 'completed_reviews',
            'active_sessions',
        ]


class ExpertProfileSelfUpdateSerializer(serializers.Serializer):
    bio = serializers.CharField(required=False, allow_blank=True, max_length=3000)
    languages = serializers.ListField(child=serializers.CharField(max_length=80), required=False, allow_empty=True, max_length=30)
    frameworks = serializers.ListField(child=serializers.CharField(max_length=100), required=False, allow_empty=True, max_length=30)
    categories = serializers.ListField(child=serializers.CharField(max_length=100), required=False, allow_empty=True, max_length=30)
    years_experience = serializers.IntegerField(required=False, allow_null=True, min_value=0, max_value=60)
    is_available = serializers.BooleanField(required=False)


class FeedbackInputSerializer(serializers.Serializer):
    response_id = serializers.UUIDField()
    category = serializers.ChoiceField(choices=AIResponseFeedback.CATEGORIES)
    details = serializers.CharField(required=False, allow_blank=True, max_length=3000)


class SessionCreateSerializer(serializers.Serializer):
    expert_id = serializers.UUIDField()
    problem_id = serializers.UUIDField(required=False, allow_null=True)
    response_id = serializers.UUIDField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=3000)
    share_context = serializers.BooleanField(default=False)
    context = serializers.DictField(required=False, default=dict)


class MessageInputSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=6000, trim_whitespace=True)


class SessionFeedbackInputSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    problem_resolved = serializers.BooleanField(required=False, allow_null=True)
    explanation_understandable = serializers.BooleanField(required=False, allow_null=True)
    expert_helpful = serializers.BooleanField(required=False, allow_null=True)
    comments = serializers.CharField(required=False, allow_blank=True, max_length=3000)


class ReviewCreateSerializer(serializers.Serializer):
    response_id = serializers.UUIDField()
    reason = serializers.ChoiceField(choices=[
        ('not_helpful', 'Not helpful'), ('incorrect', 'Incorrect or misleading'),
        ('more_explanation', 'Need more explanation'), ('partially_helpful', 'Partially helpful'),
    ])
    notes = serializers.CharField(required=False, allow_blank=True, max_length=3000)
    share_context = serializers.BooleanField(default=False)


class ReviewOutcomeSerializer(serializers.Serializer):
    outcome = serializers.ChoiceField(choices=AIResponseReview.OUTCOMES)
    explanation = serializers.CharField(max_length=5000)
    suggested_correction = serializers.CharField(required=False, allow_blank=True, max_length=5000)


class SessionOutcomeSerializer(serializers.Serializer):
    outcome = serializers.ChoiceField(choices=AssistanceSession.OUTCOMES)
    summary = serializers.CharField(required=False, allow_blank=True, max_length=3000)


class LearningProgressSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=LearningRecommendation.STATUSES)


class VisualExpertKnowledgeSerializer(serializers.ModelSerializer):
    content = serializers.CharField(max_length=50000)

    class Meta:
        model = VisualExpertKnowledge
        fields = ['id', 'title', 'topic', 'technology', 'source_label', 'source_reference', 'content', 'review_status', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class VisualExpertAskSerializer(serializers.Serializer):
    question = serializers.CharField(max_length=3000, trim_whitespace=True, required=False, allow_blank=True, default='')
    source_ids = serializers.ListField(child=serializers.UUIDField(), max_length=20, required=False, default=list)
    problem_id = serializers.UUIDField(required=False)
    expert_id = serializers.UUIDField(required=False)
    conversation = serializers.ListField(child=serializers.DictField(), max_length=8, required=False, default=list)

    def validate_conversation(self, messages):
        cleaned = []
        for item in messages:
            role, content = item.get('role'), item.get('content')
            if role not in ('user', 'assistant') or not isinstance(content, str) or len(content) > 3000:
                raise serializers.ValidationError('Conversation history must contain only short user and assistant text turns.')
            cleaned.append({'role': role, 'content': content})
        return cleaned


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source='sender.name', read_only=True)

    class Meta:
        model = AssistanceMessage
        fields = ['id', 'sender_id', 'sender_name', 'content', 'created_at']

