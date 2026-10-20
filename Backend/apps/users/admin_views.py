
"""
NEXUS Admin User Management Views
Requires is_staff=True (IsAdminUser permission).
"""
import io
import openpyxl
from openpyxl import Workbook
from datetime import timedelta
from django.utils import timezone
from django.db.models import Count, Sum, ExpressionWrapper, F, DurationField

from django.http import HttpResponse

from rest_framework import serializers as drf_serializers, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import NexusUser

# ── Serializer ─────────────────────────────────────────────────────────────
class UserAdminSerializer(drf_serializers.ModelSerializer):
    password   = drf_serializers.CharField(
        write_only=True, required=True, min_length=12
    )
    # Write-only alias sent by the frontend on create
    super_user_input = drf_serializers.IntegerField(
        write_only=True, required=False, default=0
    )
    # Read field so admin status is visible in list/detail responses
    super_user = drf_serializers.SerializerMethodField()

    def get_super_user(self, obj):
        return 1 if obj.is_staff else 0

    class Meta:
        model = NexusUser
        fields = [
            'id', 'name', 'email', 'batch', 'sub_batch',
            'is_active', 'is_staff', 'created_at', 'password',
            'super_user', 'super_user_input',
        ]
        read_only_fields = ['id', 'created_at', 'super_user']   # is_staff is writable

    def validate_email(self, value):
        value = value.lower()
        if not value.endswith('@tcs.com'):
            raise drf_serializers.ValidationError(
                'Email must end with @tcs.com.'
            )
        return value

    def create(self, validated_data):
        password   = validated_data.pop('password')
        super_user = validated_data.pop('super_user_input', 0)
        is_staff   = validated_data.pop('is_staff', False) or bool(super_user)

        user = NexusUser.objects.create_user(
            email=validated_data['email'],
            name=validated_data['name'],
            password=password,
            batch=validated_data.get('batch', ''),
            sub_batch=validated_data.get('sub_batch', ''),
        )
        if is_staff:
            user.is_staff     = True
            user.is_superuser = True
            user.save(update_fields=['is_staff', 'is_superuser'])
        return user

    def update(self, instance, validated_data):
        validated_data.pop('super_user_input', None)   # handled separately
        validated_data.pop('password', None)      # password not editable via patch
        is_staff = validated_data.pop('is_staff', None)
        if is_staff is not None:
            instance.is_staff     = is_staff
            instance.is_superuser = is_staff
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


# ── List + Create ──────────────────────────────────────────────────────────
class UserListCreateView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = NexusUser.objects.all().order_by('name')

        # Filters
        batch = request.query_params.get('batch', '').strip()
        sub_batch = request.query_params.get('sub_batch', '').strip()
        status_param = request.query_params.get('status', 'active').lower()

        if batch:
            qs = qs.filter(batch__iexact=batch)
        if sub_batch:
            qs = qs.filter(sub_batch__iexact=sub_batch)
        if status_param == 'active':
            qs = qs.filter(is_active=True)
        elif status_param == 'inactive':
            qs = qs.filter(is_active=False)
        # 'all' → no filter

        serializer = UserAdminSerializer(qs, many=True)
        return Response({'success': True, 'users': serializer.data})

    def post(self, request):
        serializer = UserAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {'success': True, 'user': UserAdminSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


# ── Retrieve + Patch (activate/deactivate) + Delete ───────────────────────
class UserDetailView(APIView):
    permission_classes = [IsAdminUser]

    def _get_user(self, pk):
        try:
            return NexusUser.objects.get(pk=pk)
        except NexusUser.DoesNotExist:
            return None

    def get(self, request, pk):
        user = self._get_user(pk)
        if not user:
            return Response({'detail': 'Not found.'}, status=404)
        return Response({'success': True, 'user': UserAdminSerializer(user).data})

    def patch(self, request, pk):
        user = self._get_user(pk)
        if not user:
            return Response({'detail': 'Not found.'}, status=404)
        # Only allow toggling is_active via this endpoint
        serializer = UserAdminSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'success': True, 'user': UserAdminSerializer(user).data})

    def delete(self, request, pk):
        user = self._get_user(pk)
        if not user:
            return Response({'detail': 'Not found.'}, status=404)
        # Prevent admin from deleting themselves
        if user.pk == request.user.pk:
            return Response({'detail': 'Cannot delete your own account.'}, status=400)
        user.delete()
        return Response({'success': True}, status=status.HTTP_204_NO_CONTENT)


# ── Distinct batches & sub-batches for filter dropdowns ───────────────────
class BatchListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        batches = (
            NexusUser.objects
            .exclude(batch='')
            .values_list('batch', flat=True)
            .distinct()
            .order_by('batch')
        )
        sub_batches = (
            NexusUser.objects
            .exclude(sub_batch='')
            .values_list('sub_batch', flat=True)
            .distinct()
            .order_by('sub_batch')
        )
        return Response({
            'success': True,
            'batches': list(batches),
            'sub_batches': list(sub_batches),
        })


# ── Bulk Upload via Excel ──────────────────────────────────────────────────
class BulkUserUploadView(APIView):
    permission_classes = [IsAdminUser]
    parser_classes = [MultiPartParser]

    REQUIRED_COLS = {'name', 'email', 'batch', 'sub_batch', 'password'}

    def post(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'detail': 'No file provided.'}, status=400)

        try:
            wb = openpyxl.load_workbook(filename=io.BytesIO(file_obj.read()), data_only=True)
        except Exception:
            return Response({'detail': 'Invalid Excel file.'}, status=400)

        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return Response({'detail': 'File is empty.'}, status=400)

        # Normalise header row
        header = [str(c).strip().lower() if c else '' for c in rows[0]]
        if not self.REQUIRED_COLS.issubset(set(header)):
            missing = self.REQUIRED_COLS - set(header)
            return Response(
                {'detail': f'Missing columns: {", ".join(missing)}'},
                status=400,
            )

        col = {name: idx for idx, name in enumerate(header)}
        created, skipped, errors = [], [], []

        for row_num, row in enumerate(rows[1:], start=2):
            name      = str(row[col['name']] or '').strip()
            email     = str(row[col['email']] or '').strip().lower()
            batch     = str(row[col['batch']] or '').strip()
            sub_batch = str(row[col['sub_batch']] or '').strip()
            password  = str(row[col['password']] or '')

            if not name or not email:
                skipped.append(row_num)
                continue

            if len(password) < 12:
                errors.append({'row': row_num, 'email': email, 'detail': 'Password must be at least 12 characters.'})
                continue

            if not email.endswith('@tcs.com'):
                errors.append({'row': row_num, 'email': email, 'detail': 'Email must end with @tcs.com.'})
                continue

            if NexusUser.objects.filter(email=email).exists():
                skipped.append(row_num)
                continue

            try:
                user = NexusUser.objects.create_user(
                    email=email,
                    name=name,
                    password=password,
                    batch=batch,
                    sub_batch=sub_batch,
                )
                created.append(UserAdminSerializer(user).data)
            except Exception as exc:
                errors.append({'row': row_num, 'email': email, 'detail': str(exc)})

        return Response({
            'success': True,
            'created_count': len(created),
            'skipped_count': len(skipped),
            'error_count': len(errors),
            'errors': errors,
        }, status=status.HTTP_201_CREATED)


# ── Per-user Stats for Admin Modal ────────────────────────────────────────
class UserStatsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        from apps.nexus.models import NexusSession, Problem

        try:
            user = NexusUser.objects.get(pk=pk)
        except NexusUser.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        problems = Problem.objects.filter(user=user)
        total_questions = problems.count()

        # Most common problem category
        most_common_problem = (
            problems.values('category')
            .annotate(cnt=Count('id'))
            .order_by('-cnt')
            .first()
        )

        # Most used language
        most_used_language = (
            problems.values('language')
            .annotate(cnt=Count('id'))
            .order_by('-cnt')
            .first()
        )

        # Total extension usage time: sum of closed session durations
        sessions = NexusSession.objects.filter(user=user, status='closed').exclude(ended_at=None)
        total_minutes = 0
        for s in sessions:
            delta = s.ended_at - s.started_at
            total_minutes += int(delta.total_seconds() // 60)

        # Top 5 problem categories breakdown
        category_breakdown = list(
            problems.values('category')
            .annotate(count=Count('id'))
            .order_by('-count')[:5]
        )

        # Language breakdown
        language_breakdown = list(
            problems.values('language')
            .annotate(count=Count('id'))
            .order_by('-count')[:5]
        )

        return Response({
            'success': True,
            'stats': {
                'name': user.name,
                'email': user.email,
                'total_questions': total_questions,
                'total_usage_minutes': total_minutes,
                'most_common_problem': most_common_problem['category'] if most_common_problem else None,
                'most_used_language': most_used_language['language'] if most_used_language else None,
                'category_breakdown': category_breakdown,
                'language_breakdown': language_breakdown,
            }
        })
