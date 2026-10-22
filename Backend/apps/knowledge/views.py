"""
Knowledge app views — ProblemDNA CRUD + similar-problem search + analytics + verification governance.
"""
import logging
from django.utils import timezone
from django.db.models import Sum, Count, Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status as http_status

from .models import ProblemDNA
from .serializers import ProblemDNASerializer
from ai.retrieval.semantic_search import SemanticSearch

logger = logging.getLogger('worklens.knowledge')


class ProblemDNAListCreateView(APIView):
    """GET /api/problems/   POST /api/problems/"""
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        qs = ProblemDNA.objects.all()

        # Query filters
        language = request.query_params.get('language')
        category = request.query_params.get('category')
        status_val = request.query_params.get('status')
        scope = request.query_params.get('scope_zone')
        search = request.query_params.get('search')
        sort = request.query_params.get('sort', '-created_at')

        if language:
            qs = qs.filter(language__iexact=language)
        if category:
            qs = qs.filter(category__iexact=category)
        if status_val:
            qs = qs.filter(verification_status=status_val)
        if scope:
            qs = qs.filter(scope_zone=scope)
        if search:
            qs = qs.filter(
                Q(error_type__icontains=search) |
                Q(category__icontains=search) |
                Q(language__icontains=search) |
                Q(root_cause__icontains=search) |
                Q(code_pattern__icontains=search)
            )

        if sort in ('-created_at', 'created_at', '-reuse_count', 'reuse_count', '-reliability_score'):
            qs = qs.order_by(sort)
        else:
            qs = qs.order_by('-created_at')

        limit = int(request.query_params.get('limit', 200))
        qs = qs[:limit]
        return Response({'success': True, 'data': ProblemDNASerializer(qs, many=True).data})

    def post(self, request):
        ser = ProblemDNASerializer(data=request.data)
        if not ser.is_valid():
            return Response({'success': False, 'errors': ser.errors},
                            status=http_status.HTTP_400_BAD_REQUEST)
        dna = ser.save()
        return Response({'success': True, 'data': ProblemDNASerializer(dna).data},
                        status=http_status.HTTP_201_CREATED)


class ProblemDNADetailView(APIView):
    """GET /api/problems/<id>/   PATCH /api/problems/<id>/"""
    permission_classes = [permissions.IsAdminUser]

    def get(self, request, pk):
        try:
            dna = ProblemDNA.objects.get(pk=pk)
        except ProblemDNA.DoesNotExist:
            return Response({'success': False, 'error': 'Not found'},
                            status=http_status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': ProblemDNASerializer(dna).data})

    def patch(self, request, pk):
        try:
            dna = ProblemDNA.objects.get(pk=pk)
        except ProblemDNA.DoesNotExist:
            return Response({'success': False, 'error': 'Not found'},
                            status=http_status.HTTP_404_NOT_FOUND)

        ser = ProblemDNASerializer(dna, data=request.data, partial=True)
        if not ser.is_valid():
            return Response({'success': False, 'errors': ser.errors},
                            status=http_status.HTTP_400_BAD_REQUEST)

        new_status = request.data.get('verification_status')
        if new_status == 'verified' and dna.verification_status != 'verified':
            dna.verified_at = timezone.now()
            if 'reliability_score' not in request.data:
                dna.reliability_score = max(0.92, dna.reliability_score)
        elif new_status == 'failed':
            if 'reliability_score' not in request.data:
                dna.reliability_score = min(0.40, dna.reliability_score)

        updated_dna = ser.save()
        logger.info(f'[ProblemDNA] Updated DNA {dna.id} — status: {updated_dna.verification_status}, scope: {updated_dna.scope_zone}')
        return Response({'success': True, 'data': ProblemDNASerializer(updated_dna).data})


class ProblemDNAAnalyticsView(APIView):
    """GET /api/problems/analytics/"""
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        total = ProblemDNA.objects.count()
        if total == 0:
            return Response({'success': True, 'data': {
                'total_signatures': 0,
                'verified_count': 0,
                'verified_rate': 0.0,
                'total_reuses': 0,
                'hours_saved': 0.0,
                'expert_deflection_rate': 0.0,
                'by_status': {},
                'by_scope': {},
                'top_reused': []
            }})

        verified_count = ProblemDNA.objects.filter(verification_status='verified').count()
        partially_count = ProblemDNA.objects.filter(verification_status='partially_resolved').count()
        pending_count = ProblemDNA.objects.filter(verification_status='pending').count()
        failed_count = ProblemDNA.objects.filter(verification_status='failed').count()

        total_reuses = ProblemDNA.objects.aggregate(s=Sum('reuse_count'))['s'] or 0
        hours_saved = round(total_reuses * 0.75, 1)  # 45 mins saved per reuse
        verified_rate = round((verified_count / total) * 100, 1)

        # Deflection: proportion of reuse events
        expert_deflection_rate = round((total_reuses / max(1, total_reuses + total)) * 100, 1)

        by_scope = dict(
            ProblemDNA.objects.values('scope_zone')
            .annotate(count=Count('id'))
            .values_list('scope_zone', 'count')
        )

        top_reused_qs = ProblemDNA.objects.order_by('-reuse_count')[:5]
        top_reused = ProblemDNASerializer(top_reused_qs, many=True).data

        return Response({
            'success': True,
            'data': {
                'total_signatures': total,
                'verified_count': verified_count,
                'verified_rate': verified_rate,
                'total_reuses': total_reuses,
                'hours_saved': hours_saved,
                'expert_deflection_rate': expert_deflection_rate,
                'by_status': {
                    'verified': verified_count,
                    'partially_resolved': partially_count,
                    'pending': pending_count,
                    'failed': failed_count,
                },
                'by_scope': by_scope,
                'top_reused': top_reused,
            }
        })


class SimilarProblemsView(APIView):
    """GET /api/problems/similar/?q=...&language=...&category=..."""
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        query    = request.query_params.get('q', '')
        language = request.query_params.get('language', '')
        category = request.query_params.get('category', '')

        if not query:
            return Response({'success': True, 'data': []})

        results = SemanticSearch().search(
            query=query, language=language, category=category, top_k=5
        )
        return Response({'success': True, 'data': results})


class AttemptCreateView(APIView):
    """POST /api/problems/<id>/attempts/"""
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        try:
            dna = ProblemDNA.objects.get(pk=pk)
        except ProblemDNA.DoesNotExist:
            return Response({'success': False, 'error': 'Not found'},
                            status=http_status.HTTP_404_NOT_FOUND)

        description    = request.data.get('description', '')
        result         = request.data.get('result', 'unknown')
        guidance_level = request.data.get('guidance_level', 0)

        attempts = list(dna.attempts or [])
        attempts.append({
            'attempt_number': len(attempts) + 1,
            'description':    description,
            'result':         result,
            'guidance_level': guidance_level,
        })
        dna.attempts = attempts
        dna.save(update_fields=['attempts', 'updated_at'])

        return Response({'success': True, 'data': ProblemDNASerializer(dna).data})
