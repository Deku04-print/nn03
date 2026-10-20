
"""
NEXUS Request Serializers — validate all inbound payloads before AI processing.
"""
from rest_framework import serializers


class DiagnosticSerializer(serializers.Serializer):
    message  = serializers.CharField(max_length=2000)
    severity = serializers.ChoiceField(
        choices=['error', 'warning', 'information', 'hint'], default='error', required=False,
    )
    line     = serializers.IntegerField(min_value=0, default=0, required=False)
    column   = serializers.IntegerField(min_value=0, required=False, default=0)

    def to_internal_value(self, data):
        if isinstance(data, dict):
            data = dict(data)
            sev = data.get('severity', 'error')
            # Handle VS Code numeric severities: 0=error, 1=warning, 2=information, 3=hint
            if sev == 0 or sev == '0':
                data['severity'] = 'error'
            elif sev == 1 or sev == '1':
                data['severity'] = 'warning'
            elif sev == 2 or sev == '2':
                data['severity'] = 'information'
            elif sev == 3 or sev == '3':
                data['severity'] = 'hint'
            elif not isinstance(sev, str):
                data['severity'] = 'error'
        return super().to_internal_value(data)


class SelectionSerializer(serializers.Serializer):
    text       = serializers.CharField(allow_blank=True, max_length=10_000)
    start_line = serializers.IntegerField(min_value=0, default=0)
    end_line   = serializers.IntegerField(min_value=0, default=0)
    cursor     = serializers.DictField(child=serializers.IntegerField(), required=False, allow_null=True)

    def validate(self, data):
        if data.get('end_line', 0) < data.get('start_line', 0):
            raise serializers.ValidationError('end_line must be >= start_line')
        return data


class RelatedFileSerializer(serializers.Serializer):
    path     = serializers.CharField(max_length=1024)
    language = serializers.CharField(max_length=50, required=False, default='', allow_blank=True)
    content  = serializers.CharField(max_length=40_000, allow_blank=True)


class AnalyzeRequestSerializer(serializers.Serializer):
    """Validates the payload for analyze / guide / hint / explain endpoints."""
    action          = serializers.ChoiceField(
        choices=['ask', 'guide', 'hint', 'explain'],
        default='ask',
    )
    language        = serializers.CharField(max_length=50, default='unknown', required=False, allow_blank=True)
    file_name       = serializers.CharField(max_length=255, allow_blank=True, default='')
    file_path       = serializers.CharField(max_length=1024, allow_blank=True, default='')
    selection       = SelectionSerializer(required=False, default=dict)
    surrounding_code = serializers.CharField(
        max_length=20_000, allow_blank=True, required=False, default='',
    )
    diagnostics     = DiagnosticSerializer(many=True, required=False, default=list)
    related_files   = RelatedFileSerializer(many=True, required=False, default=list)
    workspace       = serializers.DictField(required=False, default=dict)
    user_message    = serializers.CharField(max_length=10_000, allow_blank=True, required=False, default='')
    terminal_output = serializers.CharField(max_length=20_000, allow_blank=True, required=False, default='')
    terminal_name   = serializers.CharField(max_length=255, allow_blank=True, required=False, default='')
    tagged_files    = serializers.ListField(required=False, default=list)
    enhanced_mode   = serializers.BooleanField(required=False, default=False)
    # Conversation continuity fields (sent by extension on follow-up requests)
    session_id      = serializers.UUIDField(required=False, allow_null=True)
    problem_id      = serializers.UUIDField(required=False, allow_null=True)
    previous_hints  = serializers.ListField(
        child=serializers.CharField(max_length=2000),
        required=False, default=list,
    )
    guidance_level  = serializers.IntegerField(min_value=0, max_value=5, default=0)
    attempt_count   = serializers.IntegerField(min_value=0, default=0)


class VerifyRequestSerializer(AnalyzeRequestSerializer):
    """Extends AnalyzeRequestSerializer with new_diagnostics for verification."""
    action          = serializers.ChoiceField(choices=['verify'], default='verify')
    new_diagnostics = DiagnosticSerializer(many=True, required=False, default=list)
    user_message    = serializers.CharField(
        max_length=2000, allow_blank=True, required=False, default='',
    )
