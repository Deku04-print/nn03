import hashlib
import re
from datetime import timedelta
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework import serializers
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from apps.users.models import WorkLensUser
from apps.worklens.models import WorkLensSession, Problem, ProblemContext, ProblemResolution
from apps.worklens.serializers import AnalyzeRequestSerializer
from .models import (ExpertProfile, ExpertAudit, ExpertKnowledge, AITurn, AIResponseFeedback,
                     AssistanceCase, AssistanceSession, AssistanceMessage, SessionFeedback,
                     Notification, BrowserHandoff)
from .serializers import (ExpertSettingsSerializer, KnowledgeSerializer, CaseInput, SessionInput,
                          MessageInput, EndInput, FeedbackInput)
from .services import expert_data, match_experts, notify, visual_answer, CompanyGitIntegration


def validated(cls, request):
    serializer = cls(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def case_for(user, pk):
    pk = serializers.UUIDField().run_validation(pk)
    return get_object_or_404(AssistanceCase.objects.select_related('problem__context'), pk=pk, problem__user=user)


def participant_sessions(user):
    return AssistanceSession.objects.filter(Q(case__problem__user=user) | Q(expert__user=user, mode='human')).select_related('case__problem', 'expert__user')


def session_data(session):
    return {'id': str(session.id), 'case_id': str(session.case_id), 'mode': session.mode,
            'status': session.status, 'expert': expert_data(session.expert),
            'requester_id': str(session.case.problem.user_id), 'problem_id': str(session.case.problem_id),
            'title': session.case.shared_context.get('summary', '')[:180],
            'shared_context': session.case.shared_context, 'created_at': session.created_at,
            'ended_at': session.ended_at, 'outcome': session.outcome,
            'resolution_summary': session.resolution_summary,
            'feedback_submitted': SessionFeedback.objects.filter(session=session).exists()}


def message_data(m):
    return {'id': str(m.id), 'author_id': str(m.author_id) if m.author_id else None,
            'kind': m.kind, 'text': m.text, 'created_at': m.created_at,
            'client_id': str(m.client_id), 'sources': m.sources}


class AssistanceThrottle(UserRateThrottle):
    scope = 'assistance'
    rate = '180/minute'


class BrowserThrottle(AnonRateThrottle):
    scope = 'handoff'
    rate = '120/minute'


class AuthView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AssistanceThrottle]


class CasesView(AuthView):
    def post(self, request):
        data = validated(CaseInput, request)
        problem = get_object_or_404(Problem, pk=data['problem_id'], user=request.user,
                                    session_id=data['conversation_id'])
        context = get_object_or_404(ProblemContext, pk=data['problem_context_id'], problem=problem)
        shared = {'summary': data['summary'], 'history': data['history'], 'share_code': data['share_code']}
        if data['share_code']:
            shared['selected_code'] = context.selected_code
        case, _ = AssistanceCase.objects.get_or_create(problem=problem, defaults={
            'shared_context': shared, 'consented_at': timezone.now()})
        # A reused case retains its original disclosure; new consent cannot silently broaden an active session.
        return Response({'id': str(case.id), 'problem_id': str(problem.id),
                         'conversation_id': str(problem.session_id), 'problem_context_id': str(context.id),
                         'shared_context': case.shared_context})

    def get(self, request):
        case = case_for(request.user, request.query_params.get('case_id'))
        return Response({'id': str(case.id), 'problem_id': str(case.problem_id),
                         'conversation_id': str(case.problem.session_id),
                         'problem_context_id': str(case.problem.context.id), 'shared_context': case.shared_context})


class ExplicitHelpContextView(AuthView):
    """Create a case context without requiring an AI round trip for an explicit human-help request."""
    @transaction.atomic
    def post(self, request):
        from apps.knowledge.models import ProblemDNA
        from ai.sanitizer import sanitize_payload
        data = validated(AnalyzeRequestSerializer, request)
        if data.get('problem_id'):
            problem = get_object_or_404(Problem, pk=data['problem_id'], user=request.user)
        else:
            session = (get_object_or_404(WorkLensSession, pk=data['session_id'], user=request.user)
                       if data.get('session_id') else WorkLensSession.objects.create(user=request.user))
            safe = sanitize_payload(data)
            problem = Problem.objects.create(user=request.user, session=session, language=data['language'],
                problem_type='human_assistance', category='human_assistance', description=data.get('user_message') or 'Human assistance requested')
            ProblemContext.objects.create(problem=problem, file_name=data['file_name'], file_path=data['file_path'],
                selected_code=safe.get('selection', {}).get('text', ''), surrounding_code=safe['surrounding_code'], diagnostics=safe['diagnostics'])
            ProblemDNA.objects.create(problem=problem, language=data['language'], error_type='human_assistance', category='human_assistance')
        return Response({'problem_id': str(problem.id), 'session_id': str(problem.session_id),
                         'conversation_id': str(problem.session_id), 'problem_context_id': str(problem.context.id),
                         'ai_response_count': problem.ai_turns.count(), 'human_api_suggested': True})


class ExpertsView(AuthView):
    def get(self, request):
        case = case_for(request.user, request.query_params.get('case_id'))
        return Response({'experts': match_experts(case.problem, request.user,
                         request.query_params.get('search', '')[:100], request.query_params.get('skill', '')[:80])})


class ExpertAdminView(AuthView):
    permission_classes = [IsAdminUser]

    def get(self, request, user_id):
        user = get_object_or_404(WorkLensUser, pk=user_id)
        profile = ExpertProfile.objects.filter(user=user).first()
        return Response({'profile': expert_data(profile) if profile else None,
                         'knowledge': KnowledgeSerializer(profile.knowledge.all(), many=True).data if profile else [],
                         'audit': list(profile.audit.values('id', 'actor_id', 'changes', 'created_at')) if profile else [],
                         'git_integration': CompanyGitIntegration.configuration_status()})

    @transaction.atomic
    def patch(self, request, user_id):
        user = get_object_or_404(WorkLensUser.objects.select_for_update(), pk=user_id)
        # Validate before creating a profile so bad updates have no side effects.
        ser = ExpertSettingsSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        profile, _ = ExpertProfile.objects.get_or_create(user=user)
        changes = {key: {'before': getattr(profile, key), 'after': value}
                   for key, value in ser.validated_data.items() if getattr(profile, key) != value}
        for key, value in ser.validated_data.items():
            setattr(profile, key, value)
        profile.save()
        if changes:
            ExpertAudit.objects.create(expert=profile, actor=request.user, changes=changes)
        return Response({'profile': expert_data(profile)})


class KnowledgeAdminView(AuthView):
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        profile = get_object_or_404(ExpertProfile, user_id=user_id)
        ser = KnowledgeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        record = ser.save(expert=profile, approved_by=request.user,
                          approved_at=timezone.now() if ser.validated_data.get('approved') else None)
        ExpertAudit.objects.create(expert=profile, actor=request.user, changes={'knowledge_added': str(record.id), 'approved': record.approved})
        return Response(KnowledgeSerializer(record).data, status=201)

    def patch(self, request, user_id, knowledge_id):
        record = get_object_or_404(ExpertKnowledge, pk=knowledge_id, expert__user_id=user_id)
        ser = KnowledgeSerializer(record, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save(approved_by=request.user, approved_at=timezone.now() if request.data.get('approved', record.approved) else None)
        ExpertAudit.objects.create(expert=record.expert, actor=request.user, changes={'knowledge_updated': str(record.id), 'approved': record.approved})
        return Response(ser.data)


class SessionsView(AuthView):
    def get(self, request):
        qs = participant_sessions(request.user)
        if request.query_params.get('case_id'):
            qs = qs.filter(case_id=request.query_params['case_id'])
        return Response({'sessions': [session_data(s) for s in qs[:100]]})

    @transaction.atomic
    def post(self, request):
        data = validated(SessionInput, request)
        case = case_for(request.user, data['case_id'])
        # Lock parent as well as unique open-session constraint for concurrent retries.
        AssistanceCase.objects.select_for_update().get(pk=case.pk)
        expert = get_object_or_404(ExpertProfile.objects.select_related('user'), pk=data['expert_id'], eligible=True)
        if expert.user_id == request.user.id:
            raise ValidationError('Select another expert.')
        if data['mode'] == 'visual':
            if not expert.visual_eligible:
                raise ValidationError('Visual Expert requires Exited Organization status and approved knowledge.')
        elif expert.organizational_status != 'active' or expert.availability != 'available' or not expert.user.is_active:
            raise ValidationError('This human expert is currently unavailable.')
        session = AssistanceSession.objects.filter(case=case, expert=expert, mode=data['mode'], status__in=['pending', 'active']).first()
        if not session:
            session = AssistanceSession.objects.create(case=case, expert=expert, mode=data['mode'],
                       status='active' if data['mode'] == 'visual' else 'pending')
            if data['mode'] == 'human':
                notify(session, expert.user, 'requested', 'A new Human API assistance request is waiting.')
        return Response(session_data(session), status=201)


class SessionView(AuthView):
    def get(self, request, pk):
        return Response(session_data(get_object_or_404(participant_sessions(request.user), pk=pk)))

    @transaction.atomic
    def post(self, request, pk):
        session = get_object_or_404(participant_sessions(request.user).select_for_update(), pk=pk)
        action = request.data.get('action')
        if action in ('accept', 'reject'):
            if session.mode != 'human' or session.expert.user_id != request.user.id:
                raise PermissionDenied('Only the assigned human expert can respond.')
            if session.status != 'pending':
                if session.status == ('active' if action == 'accept' else 'rejected'):
                    return Response(session_data(session))
                raise ValidationError('Request is no longer pending.')
            if action == 'accept' and (not session.expert.eligible or session.expert.organizational_status != 'active'):
                raise PermissionDenied('Expert eligibility has changed.')
            session.status = 'active' if action == 'accept' else 'rejected'
            session.accepted_at = timezone.now() if action == 'accept' else None
            notify(session, session.case.problem.user, action, 'Your expert accepted the request.' if action == 'accept' else 'Your expert declined the request.')
        elif action == 'end':
            data = validated(EndInput, request)
            if session.status in ('ended', 'rejected'):
                return Response(session_data(session))
            session.status = 'ended'
            session.ended_at = timezone.now()
            session.ended_by = request.user
            session.outcome = data['outcome']
            session.resolution_summary = data['resolution_summary']
            if session.mode == 'human':
                for recipient in [session.case.problem.user, session.expert.user]:
                    notify(session, recipient, 'ended', 'Human API session ended. Feedback is available.')
            if session.mode == 'human' and session.resolution_summary:
                # Human-reported resolution stays pending verification; do not auto-trust or overwrite DNA.
                resolution, created = ProblemResolution.objects.get_or_create(problem=session.case.problem)
                if created or resolution.verification_status == 'pending':
                    resolution.verification_details = f'Human API session {session.id}: {session.resolution_summary}'
                    resolution.save(update_fields=['verification_details'])
        else:
            raise ValidationError('Unknown session action.')
        session.save()
        return Response(session_data(session))


class MessagesView(AuthView):
    def get(self, request, pk):
        session = get_object_or_404(participant_sessions(request.user), pk=pk)
        messages = session.messages.all()
        before = request.query_params.get('before')
        if before:
            try:
                cursor = serializers.UUIDField().run_validation(before)
            except serializers.ValidationError:
                raise ValidationError('Invalid message cursor.')
            message = get_object_or_404(messages, pk=cursor)
            messages = messages.filter(Q(created_at__lt=message.created_at) | Q(created_at=message.created_at, id__lt=message.id))
        page = list(messages.order_by('-created_at', '-id')[:201])
        return Response({'messages': [message_data(m) for m in reversed(page[:200])],
                         'has_older': len(page) > 200, 'status': session.status,
                         'transport': 'automatic_polling', 'poll_interval_ms': 2000})

    def post(self, request, pk):
        data = validated(MessageInput, request)
        with transaction.atomic():
            session = get_object_or_404(participant_sessions(request.user).select_for_update(), pk=pk)
            if session.status != 'active':
                raise ValidationError('Messages require an active session.')
            if session.mode == 'human' and (not session.expert.eligible or session.expert.organizational_status != 'active'):
                raise PermissionDenied('The human expert is no longer eligible. End this session.')
            existing = session.messages.filter(client_id=data['client_id'], kind='human').first()
            if existing and (existing.author_id != request.user.id or existing.text != data['text']):
                raise ValidationError('Message identifier already used.')
            message, created = AssistanceMessage.objects.get_or_create(session=session, client_id=data['client_id'], kind='human',
                             defaults={'author': request.user, 'text': data['text']})
            if session.mode == 'human' and created:
                recipient = session.expert.user if request.user.id == session.case.problem.user_id else session.case.problem.user
                notification, _ = Notification.objects.get_or_create(session=session, recipient=recipient, event='message', defaults={'title': 'A new Human API message is available.'})
                notification.read_at = None
                notification.save(update_fields=['read_at'])
        if session.mode == 'visual' and not session.messages.filter(client_id=data['client_id'], kind='ai').exists():
            try:
                text, sources = visual_answer(session, data['text'])
            except ValueError as exc:
                raise ValidationError(str(exc))
            except Exception:
                return Response({'detail': 'The company AI service is unavailable. Your question is saved; retry to generate its answer.'}, status=503)
            with transaction.atomic():
                current = AssistanceSession.objects.select_for_update().get(pk=session.pk)
                if current.status != 'active' or not current.expert.visual_eligible:
                    raise ValidationError('Session ended or knowledge approval changed while generating the answer.')
                # Re-check source approval before persisting an answer after an admin revocation.
                source_ids = [s['id'] for s in sources]
                if ExpertKnowledge.objects.filter(id__in=source_ids, approved=True).filter(
                        Q(dna__isnull=True) | Q(dna__verification_status='verified', dna__scope_zone='organization')).count() != len(source_ids):
                    raise ValidationError('Knowledge approval changed. Retry with approved knowledge.')
                AssistanceMessage.objects.get_or_create(session=session, client_id=data['client_id'], kind='ai',
                               defaults={'text': text, 'sources': sources, 'author': None})
        return Response({'message': message_data(message), 'persisted': True}, status=201)


class SessionFeedbackView(AuthView):
    @transaction.atomic
    def post(self, request, pk):
        data = validated(FeedbackInput, request)
        session = get_object_or_404(participant_sessions(request.user).select_for_update(), pk=pk, case__problem__user=request.user)
        if session.status != 'ended':
            raise ValidationError('End the session before submitting feedback.')
        feedback, created = SessionFeedback.objects.get_or_create(session=session, defaults={'user': request.user, **data})
        return Response({'saved': True, 'created': created, 'mode': session.mode, 'id': str(feedback.id)})


class TurnFeedbackView(AuthView):
    def post(self, request, pk):
        field = serializers.ChoiceField(choices=[-1, 1])
        value = field.run_validation(request.data.get('value'))
        turn = get_object_or_404(AITurn, pk=pk, problem__user=request.user)
        feedback, _ = AIResponseFeedback.objects.update_or_create(turn=turn, defaults={'user': request.user, 'value': value})
        return Response({'saved': True, 'value': feedback.value, 'turn_id': str(turn.id), 'updated_at': feedback.updated_at})


class NotificationsView(AuthView):
    def get(self, request):
        qs = Notification.objects.filter(recipient=request.user)
        return Response({'unread_count': qs.filter(read_at__isnull=True).count(),
                         'notifications': list(qs.values('id', 'title', 'session_id', 'event', 'read_at', 'created_at')[:50])})

    def post(self, request):
        pk = serializers.UUIDField().run_validation(request.data.get('id'))
        notification = get_object_or_404(Notification, pk=pk, recipient=request.user)
        if not notification.read_at:
            notification.read_at = timezone.now()
            notification.save(update_fields=['read_at'])
        return Response({'saved': True})


class MyDashboardView(AuthView):
    def get(self, request):
        problems = Problem.objects.filter(user=request.user).order_by('-created_at')
        return Response({'profile': {'name': request.user.name, 'email': request.user.email},
                         'total_problems': problems.count(), 'resolved_problems': problems.filter(status='resolved').count(),
                         'problems': list(problems.values('id', 'description', 'language', 'status', 'created_at')[:100]),
                         'assistance_outcomes': [{'id': str(s.id), 'mode': s.mode, 'status': s.status,
                             'outcome': s.outcome, 'resolution_summary': s.resolution_summary} for s in participant_sessions(request.user)[:100]],
                         'conversations': list(AITurn.objects.filter(problem__user=request.user).order_by('-created_at').values(
                             'id', 'problem_id', 'question', 'response', 'created_at')[:100])})


class ReviewsAdminView(AuthView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response({'sessions': list(AssistanceSession.objects.values('id', 'expert_id', 'mode', 'status', 'outcome', 'resolution_summary')[:200]),
                         'feedback': list(SessionFeedback.objects.values('session_id', 'rating', 'resolved', 'understandable', 'comment', 'created_at')[:200])})


class HandoffsView(AuthView):
    def post(self, request):
        destination = request.data.get('destination', '')
        if not isinstance(destination, str) or not re.fullmatch(r'/human-api/(?:chat/)?[0-9a-fA-F-]{36}', destination):
            raise ValidationError('Invalid assistance destination.')
        # Validate permission now, not just after the browser opens.
        pk = serializers.UUIDField().run_validation(destination.rsplit('/', 1)[-1])
        if '/chat/' in destination:
            get_object_or_404(participant_sessions(request.user), pk=pk)
        else:
            case_for(request.user, pk)
        handoff = BrowserHandoff.objects.create(user=request.user, destination=destination, expires_at=timezone.now() + timedelta(minutes=2))
        return Response({'id': str(handoff.id), 'expires_at': handoff.expires_at})


class HandoffOwnerView(AuthView):
    def get(self, request, pk):
        handoff = get_object_or_404(BrowserHandoff, pk=pk, user=request.user, expires_at__gt=timezone.now(), consumed_at__isnull=True)
        return Response({'claimed': bool(handoff.proof_hash), 'verification_code': handoff.proof_hash[:8].upper()})

    def post(self, request, pk):
        code = request.data.get('verification_code', '')
        handoff = get_object_or_404(BrowserHandoff, pk=pk, user=request.user, expires_at__gt=timezone.now(), consumed_at__isnull=True)
        if not handoff.proof_hash or code != handoff.proof_hash[:8].upper():
            raise ValidationError('Browser verification code does not match.')
        BrowserHandoff.objects.filter(pk=pk, proof_hash=handoff.proof_hash).update(approved_hash=handoff.proof_hash)
        return Response({'approved': True})


class HandoffBrowserView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [BrowserThrottle]

    def post(self, request, pk):
        proof = serializers.RegexField(r'^[A-Za-z0-9_-]{43,128}$').run_validation(request.data.get('proof'))
        digest = hashlib.sha256(proof.encode()).hexdigest()
        with transaction.atomic():
            handoff = get_object_or_404(BrowserHandoff.objects.select_for_update().select_related('user'),
                        pk=pk, expires_at__gt=timezone.now(), consumed_at__isnull=True, user__is_active=True)
            if request.data.get('action') == 'claim':
                if handoff.proof_hash and handoff.proof_hash != digest:
                    raise PermissionDenied('Another browser claimed this handoff. Open Human API again from VS Code.')
                BrowserHandoff.objects.filter(pk=pk, proof_hash__in=['', digest]).update(proof_hash=digest)
                return Response({'verification_code': digest[:8].upper()})
            if handoff.proof_hash != digest:
                raise PermissionDenied('Invalid browser proof.')
            if handoff.approved_hash != digest:
                return Response({'pending': True}, status=202)
            # Conditional update enforces single use on SQLite too.
            if not BrowserHandoff.objects.filter(pk=pk, consumed_at__isnull=True).update(consumed_at=timezone.now()):
                raise PermissionDenied('Handoff already used.')
            token = RefreshToken.for_user(handoff.user)
            response = Response({'access': str(token.access_token), 'destination': handoff.destination})
            response['Cache-Control'] = 'no-store'
            return response
