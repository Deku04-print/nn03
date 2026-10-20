
import hashlib
import secrets
from datetime import timedelta
from urllib.parse import parse_qs, urlencode, urlsplit
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import generics, permissions, serializers as drf_serializers, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from .models import DashboardLoginCode, NexusUser


# ── Custom JWT login — accepts { email, password } ───────────────────────────
class NexusTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Override username_field so SimpleJWT uses 'email' not 'username'."""
    username_field = NexusUser.USERNAME_FIELD  # 'email'


class NexusTokenObtainPairView(TokenObtainPairView):
    serializer_class = NexusTokenObtainPairSerializer


# ── User serializer ────────────────────────────────────────────────────────
class UserSerializer(drf_serializers.ModelSerializer):
    password   = drf_serializers.CharField(write_only=True, min_length=8)
    super_user = drf_serializers.SerializerMethodField()
    is_staff = drf_serializers.BooleanField(read_only=True)
    is_expert = drf_serializers.SerializerMethodField()

    def get_super_user(self, obj):
        return 1 if obj.is_staff else 0

    def get_is_expert(self, obj):
        return hasattr(obj, 'expert_profile')

    class Meta:
        model  = NexusUser
        fields = ['id', 'email', 'name', 'password', 'super_user', 'is_staff', 'is_expert', 'created_at']
        read_only_fields = ['id', 'super_user', 'is_staff', 'is_expert', 'created_at']

    def validate_email(self, value):
        if not value.lower().endswith('@tcs.com'):
            raise drf_serializers.ValidationError(
                'Registration is restricted to TCS employees. '
                'Please use your @tcs.com email address.'
            )
        return value

    def create(self, validated_data):
        return NexusUser.objects.create_user(**validated_data)


class RegisterView(generics.CreateAPIView):
    queryset = NexusUser.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response({'success': True, 'user': UserSerializer(user).data}, status=201)


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response({'success': True, 'user': UserSerializer(request.user).data})


class DashboardLoginCodeCreateView(APIView):
    """Issue a short-lived, single-use browser exchange code for an authenticated extension."""
    permission_classes = [permissions.IsAuthenticated]

    class InputSerializer(drf_serializers.Serializer):
        redirect_uri = drf_serializers.URLField(max_length=1000)
        next_path = drf_serializers.CharField(max_length=300, required=False, default='/')

        def validate_next_path(self, value):
            if value in ('/', '/learning', '/human-api', '/visual-expert'):
                return value
            parsed = urlsplit(value)
            if parsed.path != '/visual-expert' or parsed.fragment or parsed.netloc:
                raise drf_serializers.ValidationError('Dashboard destination is not allowed.')
            try:
                query = parse_qs(parsed.query, strict_parsing=True)
                if set(query) - {'problem_id', 'expert_id'} or len(query.get('problem_id', [])) != 1:
                    raise ValueError()
                UUID(query['problem_id'][0])
                if 'expert_id' in query:
                    if len(query['expert_id']) != 1:
                        raise ValueError()
                    UUID(query['expert_id'][0])
            except (ValueError, KeyError):
                raise drf_serializers.ValidationError('Visual Expert context link is invalid.')
            return parsed.path + '?' + urlencode({key: values[0] for key, values in query.items()})

    def post(self, request):
        serializer = self.InputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        redirect_uri = serializer.validated_data['redirect_uri']
        parsed = urlsplit(redirect_uri)
        origin = f'{parsed.scheme}://{parsed.netloc}'
        allowed_origins = {value.strip().rstrip('/') for value in getattr(settings, 'CORS_ALLOWED_ORIGINS', []) if value.strip()}
        allowed_origins.add(getattr(settings, 'FRONTEND_ORIGIN', '').rstrip('/'))
        if (
            parsed.scheme not in ('http', 'https')
            or (not settings.DEBUG and parsed.scheme != 'https')
            or parsed.username or parsed.password
            or parsed.path != '/auth/exchange'
            or parsed.query or parsed.fragment
            or origin.rstrip('/') not in allowed_origins
        ):
            return Response({'success': False, 'error': 'Dashboard redirect is not allowed.'}, status=status.HTTP_400_BAD_REQUEST)

        code = secrets.token_urlsafe(32)
        now = timezone.now()
        DashboardLoginCode.objects.filter(used_at__isnull=True, expires_at__lt=now).delete()
        DashboardLoginCode.objects.create(
            user=request.user,
            code_hash=hashlib.sha256(code.encode('utf-8')).hexdigest(),
            redirect_uri=redirect_uri,
            next_path=serializer.validated_data['next_path'],
            expires_at=now + timedelta(seconds=settings.DASHBOARD_LOGIN_CODE_TTL_SECONDS),
        )
        return Response({'success': True, 'code': code, 'redirect_uri': redirect_uri}, status=status.HTTP_201_CREATED)


class DashboardLoginCodeExchangeView(APIView):
    """Consume a one-time code from the dashboard callback and issue a short-lived access token."""
    permission_classes = [permissions.AllowAny]

    class InputSerializer(drf_serializers.Serializer):
        code = drf_serializers.CharField(max_length=128)
        redirect_uri = drf_serializers.URLField(max_length=1000)

    def post(self, request):
        serializer = self.InputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        redirect_uri = serializer.validated_data['redirect_uri']
        parsed = urlsplit(redirect_uri)
        origin_header = request.headers.get('Origin')
        if not origin_header or origin_header.rstrip('/') != f'{parsed.scheme}://{parsed.netloc}'.rstrip('/'):
            return Response({'success': False, 'error': 'Dashboard origin did not match the authorization request.'}, status=status.HTTP_400_BAD_REQUEST)
        digest = hashlib.sha256(serializer.validated_data['code'].encode('utf-8')).hexdigest()
        with transaction.atomic():
            grant = DashboardLoginCode.objects.select_for_update().filter(
                code_hash=digest, redirect_uri=redirect_uri, used_at__isnull=True,
                expires_at__gt=timezone.now(), user__is_active=True,
            ).select_related('user').first()
            if not grant:
                return Response({'success': False, 'error': 'This sign-in link is expired or has already been used. Return to VS Code and open the dashboard again.'}, status=status.HTTP_400_BAD_REQUEST)
            grant.used_at = timezone.now()
            grant.save(update_fields=['used_at'])
            access = str(RefreshToken.for_user(grant.user).access_token)
            next_path = grant.next_path
        return Response({'success': True, 'access': access, 'next_path': next_path})
