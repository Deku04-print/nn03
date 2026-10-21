from rest_framework import generics, permissions, serializers as drf_serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from .models import WorkLensUser


# ── Custom JWT login — accepts { email, password } ───────────────────────────
class WorkLensTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Override username_field so SimpleJWT uses 'email' not 'username'."""
    username_field = WorkLensUser.USERNAME_FIELD  # 'email'


class WorkLensTokenObtainPairView(TokenObtainPairView):
    serializer_class = WorkLensTokenObtainPairSerializer


# ── User serializer ────────────────────────────────────────────────────────
class UserSerializer(drf_serializers.ModelSerializer):
    password   = drf_serializers.CharField(write_only=True, min_length=8)
    super_user = drf_serializers.SerializerMethodField()

    def get_super_user(self, obj):
        return 1 if obj.is_staff else 0

    class Meta:
        model  = WorkLensUser
        fields = ['id', 'email', 'name', 'password', 'super_user', 'created_at']
        read_only_fields = ['id', 'super_user', 'created_at']

    def validate_email(self, value):
        if not value.lower().endswith('@tcs.com'):
            raise drf_serializers.ValidationError(
                'Registration is restricted to TCS employees. '
                'Please use your @tcs.com email address.'
            )
        return value

    def create(self, validated_data):
        return WorkLensUser.objects.create_user(**validated_data)


class RegisterView(generics.CreateAPIView):
    queryset = WorkLensUser.objects.all()
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
