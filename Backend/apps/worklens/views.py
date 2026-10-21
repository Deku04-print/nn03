"""
WorkLens API Views — 5 mentor endpoints with full ProblemDNA lifecycle.
- analyze: creates Problem + ProblemDNA, returns problem_id
- guide/hint: records attempt, increments guidance_level
- explain: records attempt at explain level
- verify: compares diagnostics, updates Problem + ProblemResolution
"""
import logging
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status as http_status

from .models import WorkLensSession, Problem, ProblemContext, Attempt, ProblemResolution
from .serializers import AnalyzeRequestSerializer, VerifyRequestSerializer
from apps.agents.models import AgentInteraction
from apps.knowledge.models import ProblemDNA
from ai.orchestrator.graph import WorkLensOrchestrator
from ai.sanitizer import sanitize_payload
from ai.retrieval.semantic_search import SemanticSearch

logger = logging.getLogger('worklens.views')
User   = get_user_model()


class WorklensBaseView(APIView):
    permission_classes = [permissions.AllowAny]

    def _get_dev_user(self):
        user, _ = User.objects.get_or_create(
            email='dev@worklens.local',
            defaults={'name': 'Dev User', 'is_active': True}
        )
        return user

    def _resolve_user(self, request):
        if request.user and request.user.is_authenticated:
            return request.user
        return self._get_dev_user()

    def _get_or_create_session(self, request):
        user       = self._resolve_user(request)
        session_id = request.data.get('session_id')
        if session_id:
            try:
                return WorkLensSession.objects.get(id=session_id, user=user)
            except WorkLensSession.DoesNotExist:
                pass
        return WorkLensSession.objects.create(
            user=user,
            project=request.data.get('workspace', {}).get('project_name', ''),
        )

    def _resolve_problem(self, request, session, user):
        """Return an existing Problem (by problem_id) or None."""
        problem_id = request.data.get('problem_id')
        if problem_id:
            try:
                return Problem.objects.get(id=problem_id, user=user)
            except Problem.DoesNotExist:
                pass
        return None

    def _run_orchestrator(self, action, payload, session, request, problem=None):
        user = self._resolve_user(request)

        # Build state extras for conversation continuity
        previous_hints  = []
        guidance_level  = 0
        attempt_count   = 0

        if problem:
            try:
                dna = problem.dna
                previous_hints = [a.get('description', '') for a in (dna.attempts or [])]
                guidance_level = max((a.get('guidance_level', 0) for a in (dna.attempts or [])), default=0)
                attempt_count  = len(dna.attempts or [])
            except ProblemDNA.DoesNotExist:
                pass

        enriched_payload = {
            **payload,
            'previous_hints': previous_hints,
            'guidance_level': guidance_level,
            'attempt_count':  attempt_count,
            'user_message': payload.get('user_message', ''),
            'conversation_history': payload.get('conversation_history', []),
        }

        # §35-36: Sanitize before any AI processing
        payload = sanitize_payload(payload)

        orch   = WorkLensOrchestrator()
        import time
        _t0    = time.monotonic()
        result = orch.run(
            action=action, payload=enriched_payload,
            user_id=str(user.id), session_id=str(session.id)
        )
        latency_ms = int((time.monotonic() - _t0) * 1000)

        # Log interaction
        AgentInteraction.objects.create(
            session=session,
            agent_name='orchestrator',
            action=action,
            input_summary=payload.get('selection', {}).get('text', '')[:500],
            output_summary=str(result.get('response', ''))[:500],
            guidance_level=(
                result.get('response', {}).get('guidance_level', 0)
                if isinstance(result.get('response'), dict) else 0
            ),
            latency_ms=latency_ms,
        )

        # ── Vector DB match lookup ─────────────────────────────────
        try:
            ss = SemanticSearch()
            query_text = payload.get('selection', {}).get('text', '')
            if not query_text:
                diags = payload.get('diagnostics', [])
                query_text = ' '.join(d.get('message', '') for d in diags) if diags else ''
            if query_text:
                matches = ss.search(
                    query_text,
                    language=payload.get('language', ''),
                    category=payload.get('category', ''),
                    top_k=1,
                )
                if matches and matches[0].get('_score', 0) > 0:
                    best = matches[0]
                    result['vector_db_match'] = {
                        'exists': best['_score'] > 0.1,
                        'score': round(best['_score'] * 100, 1),
                        'symptoms': best.get('symptoms', ''),
                        'category': best.get('category', ''),
                    }
                else:
                    result['vector_db_match'] = {'exists': False, 'score': 0, 'symptoms': ''}
            else:
                result['vector_db_match'] = {'exists': False, 'score': 0, 'symptoms': ''}
        except Exception as exc:
            logger.warning(f'[WorkLens] Vector DB match lookup failed: {exc}')
            result['vector_db_match'] = {'exists': False, 'score': 0, 'symptoms': ''}

        return result

    # ── ProblemDNA helpers ──────────────────────────────────────────

    def _create_problem_and_dna(self, request, session, result):
        """Create Problem + ProblemContext + ProblemDNA from an analyze result."""
        user    = self._resolve_user(request)
        payload = request.data
        meta    = result.get('metadata', {})
        resp    = result.get('response', {})

        problem = Problem.objects.create(
            session=session,
            user=user,
            language=payload.get('language', 'unknown'),
            framework=meta.get('framework') or '',
            problem_type=meta.get('problem_type', 'unknown'),
            category=meta.get('problem_category', 'unknown'),
            description=resp.get('observation', '')[:1000],
            confidence=meta.get('confidence', 0.0),
        )

        ProblemContext.objects.create(
            problem=problem,
            file_name=payload.get('file_name', ''),
            file_path=payload.get('file_path', ''),
            function_name='',
            selected_code=payload.get('selection', {}).get('text', '')[:3000],
            surrounding_code=payload.get('surrounding_code', '')[:3000],
            diagnostics=payload.get('diagnostics', []),
        )

        dna = ProblemDNA.objects.create(
            problem=problem,
            language=payload.get('language', 'unknown'),
            framework=meta.get('framework') or '',
            error_type=meta.get('problem_type', 'unknown'),
            category=meta.get('problem_category', 'unknown'),
            symptoms=[d.get('message', '') for d in payload.get('diagnostics', [])],
            code_pattern=resp.get('observation', '')[:255],
            guidance=resp.get('next_steps', []),
            attempts=[],
        )

        logger.info(f'[WorkLens] Created Problem {problem.id} + ProblemDNA {dna.id}')
        return problem

    def _record_attempt(self, problem, action, result):
        """Append attempt to ProblemDNA and create Attempt record."""
        resp  = result.get('response', {})
        level = int(resp.get('guidance_level', 0))

        Attempt.objects.create(
            problem=problem,
            attempt_number=problem.attempts.count() + 1,
            description=resp.get('hint', '') or resp.get('observation', ''),
            guidance_level=level,
            result='unknown',
        )

        try:
            dna = problem.dna
            attempts = list(dna.attempts or [])
            attempts.append({
                'description':    resp.get('hint', '') or resp.get('observation', ''),
                'guidance_level': level,
                'action':         action,
                'result':         'unknown',
            })
            guidance_snippet = resp.get('hint') or resp.get('observation', '')
            if guidance_snippet not in dna.guidance:
                dna.guidance = list(dna.guidance or []) + [guidance_snippet[:255]]
            dna.attempts = attempts
            dna.save(update_fields=['attempts', 'guidance', 'updated_at'])
        except ProblemDNA.DoesNotExist:
            pass

    def _handle_verification(self, request, session, problem, result):
        """Update Problem + ProblemResolution based on verify response."""
        resp          = result.get('response', {})
        new_diags     = request.data.get('new_diagnostics', [])
        original_diags = []

        try:
            original_diags = problem.context.diagnostics or []
        except Exception:
            pass

        # Determine status from diagnostic comparison
        if not new_diags:
            verify_status = 'resolved'
            prob_status   = 'resolved'
        elif len(new_diags) < len(original_diags):
            verify_status = 'partially_resolved'
            prob_status   = 'attempted'
        elif set(d.get('message', '') for d in new_diags) == set(d.get('message', '') for d in original_diags):
            verify_status = 'failed'
            prob_status   = 'failed'
        else:
            verify_status = 'partially_resolved'
            prob_status   = 'attempted'

        problem.status = prob_status
        problem.save(update_fields=['status', 'updated_at'])

        resolution, _ = ProblemResolution.objects.get_or_create(problem=problem)
        resolution.verification_status  = verify_status
        resolution.verification_details = resp.get('observation', '')[:1000]
        resolution.root_cause           = resp.get('hint', '')[:500]
        if verify_status == 'resolved':
            from django.utils import timezone
            resolution.resolved_at = timezone.now()
        resolution.save()

        # Update ProblemDNA verification_status to trigger auto-embed signal if resolved
        try:
            dna = problem.dna
            dna.verification_status = verify_status
            if verify_status in ('resolved', 'partially_resolved'):
                dna.root_cause = resolution.root_cause
            dna.save(update_fields=['verification_status', 'root_cause', 'updated_at'])
        except ProblemDNA.DoesNotExist:
            pass

        return verify_status


# ── Views ───────────────────────────────────────────────────────────

class AnalyzeView(WorklensBaseView):
    def post(self, request):
        # Validate request payload
        ser = AnalyzeRequestSerializer(data=request.data)
        if not ser.is_valid():
            return Response(
                {'success': False, 'error': {'code': 'VALIDATION_ERROR', 'message': ser.errors}},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        session = self._get_or_create_session(request)
        result  = self._run_orchestrator('ask', request.data, session, request)
        if result.get('success'):
            problem = self._create_problem_and_dna(request, session, result)
            result['problem_id'] = str(problem.id)
        return Response({**result, 'session_id': str(session.id)})


class GuideView(WorklensBaseView):
    def post(self, request):
        ser = AnalyzeRequestSerializer(data=request.data)
        if not ser.is_valid():
            return Response(
                {'success': False, 'error': {'code': 'VALIDATION_ERROR', 'message': ser.errors}},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        session = self._get_or_create_session(request)
        user    = self._resolve_user(request)
        problem = self._resolve_problem(request, session, user)
        result  = self._run_orchestrator('guide', request.data, session, request, problem)
        if problem and result.get('success'):
            self._record_attempt(problem, 'guide', result)
        return Response({**result, 'session_id': str(session.id),
                         'problem_id': str(problem.id) if problem else None})


class HintView(WorklensBaseView):
    def post(self, request):
        ser = AnalyzeRequestSerializer(data=request.data)
        if not ser.is_valid():
            return Response(
                {'success': False, 'error': {'code': 'VALIDATION_ERROR', 'message': ser.errors}},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        session = self._get_or_create_session(request)
        user    = self._resolve_user(request)
        problem = self._resolve_problem(request, session, user)
        result  = self._run_orchestrator('hint', request.data, session, request, problem)
        if problem and result.get('success'):
            self._record_attempt(problem, 'hint', result)
        return Response({**result, 'session_id': str(session.id),
                         'problem_id': str(problem.id) if problem else None})


class ExplainView(WorklensBaseView):
    def post(self, request):
        ser = AnalyzeRequestSerializer(data=request.data)
        if not ser.is_valid():
            return Response(
                {'success': False, 'error': {'code': 'VALIDATION_ERROR', 'message': ser.errors}},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        session = self._get_or_create_session(request)
        user    = self._resolve_user(request)
        problem = self._resolve_problem(request, session, user)
        result  = self._run_orchestrator('explain', request.data, session, request, problem)
        if problem and result.get('success'):
            self._record_attempt(problem, 'explain', result)
        return Response({**result, 'session_id': str(session.id),
                         'problem_id': str(problem.id) if problem else None})


class VerifyView(WorklensBaseView):
    def post(self, request):
        ser = VerifyRequestSerializer(data=request.data)
        if not ser.is_valid():
            return Response(
                {'success': False, 'error': {'code': 'VALIDATION_ERROR', 'message': ser.errors}},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        session = self._get_or_create_session(request)
        user    = self._resolve_user(request)
        problem = self._resolve_problem(request, session, user)
        result  = self._run_orchestrator('verify', request.data, session, request, problem)
        verify_status = None
        if problem and result.get('success'):
            verify_status = self._handle_verification(request, session, problem, result)
        return Response({
            **result,
            'session_id':     str(session.id),
            'problem_id':     str(problem.id) if problem else None,
            'verify_status':  verify_status,
        })


class ChatHistoryView(WorklensBaseView):
    """Return the authenticated user's last 4 chat sessions."""

    def get(self, request):
        user = self._resolve_user(request)
        problems = Problem.objects.filter(user=user).order_by('-created_at')[:4]
        history = [
            {
                'id': str(p.id),
                'description': (p.description or 'Untitled session')[:80],
                'language': p.language,
                'created_at': p.created_at.isoformat(),
            }
            for p in problems
        ]
        return Response({'success': True, 'history': history})


class ProblemDetailView(WorklensBaseView):
    """Return full details for a single problem so the client can restore a session."""

    def get(self, request, problem_id):
        user = self._resolve_user(request)
        try:
            problem = Problem.objects.get(id=problem_id, user=user)
        except Problem.DoesNotExist:
            return Response(
                {'success': False, 'error': {'code': 'NOT_FOUND', 'message': 'Problem not found.'}},
                status=http_status.HTTP_404_NOT_FOUND,
            )

        # Context (file / code / diagnostics)
        ctx = {}
        try:
            c = problem.context
            ctx = {
                'file_name': c.file_name,
                'file_path': c.file_path,
                'selected_code': c.selected_code,
                'diagnostics': c.diagnostics or [],
            }
        except ProblemContext.DoesNotExist:
            pass

        # Attempts (AI conversation turns stored in ProblemDNA)
        attempts = []
        try:
            dna = problem.dna
            attempts = [
                {
                    'description': a.get('description', ''),
                    'guidance_level': a.get('guidance_level', 0),
                    'action': a.get('action', 'ask'),
                }
                for a in (dna.attempts or [])
            ]
        except Exception:
            pass

        return Response({
            'success': True,
            'problem': {
                'id': str(problem.id),
                'session_id': str(problem.session_id),
                'language': problem.language,
                'description': problem.description,
                'problem_type': problem.problem_type,
                'category': problem.category,
                'confidence': problem.confidence,
                'status': problem.status,
                'created_at': problem.created_at.isoformat(),
            },
            'context': ctx,
            'attempts': attempts,
        })



class GenerateDocsView(WorklensBaseView):
    """
    POST /api/worklens/generate-docs/
    Workspace Document Generator Agent: analyzes workspace file tree & dependencies
    and synthesizes Markdown (.md), Mermaid architecture (.mmd), and PDF (.pdf) reports.
    """
    def post(self, request):
        workspace_name = request.data.get('workspace_name') or 'Workspace Project'
        file_tree = request.data.get('file_tree') or []
        dependencies = request.data.get('dependencies') or {}
        prompt = request.data.get('prompt') or ''

        try:
            from ai.agents.doc_generator import DocumentGeneratorAgent
            agent = DocumentGeneratorAgent()
            result = agent.generate(
                workspace_name=workspace_name,
                file_tree=file_tree,
                dependencies=dependencies,
                prompt=prompt
            )
            return Response(result, status=http_status.HTTP_200_OK)
        except Exception as e:
            logger.exception("Failed to generate documentation")
            return Response(
                {'success': False, 'error': {'code': 'GENERATION_ERROR', 'message': str(e)}},
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class GenerateTestsView(WorklensBaseView):
    """
    POST /api/worklens/generate-tests/
    Workspace Test Suite Generator Agent: analyzes files/folders and synthesizes
    unit tests for pytest, jest, vitest, junit, and karma.
    """
    def post(self, request):
        target_name = request.data.get('target_name') or 'Workspace Target'
        files = request.data.get('files') or []
        framework = request.data.get('framework')
        prompt = request.data.get('prompt') or ''

        try:
            from ai.agents.test_generator import TestSuiteGeneratorAgent
            agent = TestSuiteGeneratorAgent()
            result = agent.generate(
                target_name=target_name,
                files=files,
                framework=framework,
                prompt=prompt
            )
            return Response(result, status=http_status.HTTP_200_OK)
        except Exception as e:
            logger.exception("Failed to generate test suite")
            return Response(
                {'success': False, 'error': {'code': 'TEST_GEN_ERROR', 'message': str(e)}},
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class GenerateInfraView(WorklensBaseView):
    """
    POST /api/worklens/generate-infra/
    Workspace Infrastructure & DevOps Generator Agent: analyzes topology, .env, and
    frameworks to synthesize production Docker, Compose, Nginx, and Kubernetes manifests.
    """
    def post(self, request):
        topology = request.data.get('topology') or {}
        prompt = request.data.get('prompt') or ''

        try:
            from ai.agents.infra_generator import InfraGeneratorAgent
            agent = InfraGeneratorAgent()
            result = agent.generate(
                topology=topology,
                prompt=prompt
            )
            return Response(result, status=http_status.HTTP_200_OK)
        except Exception as e:
            logger.exception("Failed to generate infrastructure manifests")
            return Response(
                {'success': False, 'error': {'code': 'INFRA_GEN_ERROR', 'message': str(e)}},
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class GenerateCommandView(WorklensBaseView):
    """
    POST /api/worklens/generate-command/
    Terminal Command Orchestrator Agent: synthesizes safe, contextual terminal commands
    from natural language directives, with OS awareness and risk evaluation.
    """
    def post(self, request):
        prompt = request.data.get('prompt') or ''
        env_info = request.data.get('envInfo') or {}

        try:
            from ai.agents.command_generator import CommandGeneratorAgent
            agent = CommandGeneratorAgent()
            result = agent.plan_command(prompt=prompt, env_info=env_info)
            return Response(result, status=http_status.HTTP_200_OK)
        except Exception as e:
            logger.exception("Failed to synthesize terminal command")
            return Response(
                {'success': False, 'error': {'code': 'COMMAND_GEN_ERROR', 'message': str(e)}},
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )