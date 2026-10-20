
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.db import models
import uuid

class NexusUserManager(BaseUserManager):
    def create_user(self, email, name, password=None, batch='', sub_batch=''):
        if not email:
            raise ValueError('Email required')
        email = self.normalize_email(email)
        user = self.model(email=email, name=name, batch=batch, sub_batch=sub_batch)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, name, password):
        user = self.create_user(email, name, password)
        user.is_staff = True
        user.is_superuser = True
        user.save(using=self._db)
        return user


class NexusUser(AbstractBaseUser, PermissionsMixin):
    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email     = models.EmailField(unique=True)
    name      = models.CharField(max_length=150)
    batch     = models.CharField(max_length=100, blank=True, default='')
    sub_batch = models.CharField(max_length=100, blank=True, default='')
    is_active = models.BooleanField(default=True)
    is_staff  = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD  = 'email'
    REQUIRED_FIELDS = ['name']
    objects = NexusUserManager()

    class Meta:
        db_table = 'nexus_users'

    def __str__(self):
        return f'{self.name} <{self.email}>'


class DashboardLoginCode(models.Model):
    """Short-lived, single-use code used to exchange an extension session for a dashboard JWT."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(NexusUser, on_delete=models.CASCADE, related_name='dashboard_login_codes')
    code_hash = models.CharField(max_length=64, unique=True, db_index=True)
    redirect_uri = models.URLField(max_length=1000)
    next_path = models.CharField(max_length=300, default='/')
    expires_at = models.DateTimeField(db_index=True)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'nexus_dashboard_login_codes'

    def __str__(self):
        return f'Dashboard login code for {self.user_id}'

