
# seed_admin.py
import os

from django.core.management.base import BaseCommand, CommandError
from apps.users.models import NexusUser

class Command(BaseCommand):
    help = 'Create or update the NEXUS super-admin account.'

    def handle(self, *args, **options):
        email = os.environ.get('NEXUS_ADMIN_EMAIL')
        password = os.environ.get('NEXUS_ADMIN_PASSWORD')
        name = os.environ.get('NEXUS_ADMIN_NAME', 'NEXUS Admin')
        if not email or not password:
            raise CommandError('Set NEXUS_ADMIN_EMAIL and NEXUS_ADMIN_PASSWORD first.')
        if len(password) < 12:
            raise CommandError('NEXUS_ADMIN_PASSWORD must be at least 12 characters.')

        user, created = NexusUser.objects.get_or_create(
            email=email,
            defaults={'name': name},
        )
        user.is_staff     = True
        user.is_superuser = True
        user.is_active    = True
        user.set_password(password)
        user.save()

        action = 'Created' if created else 'Updated'
        self.stdout.write(self.style.SUCCESS(f'{action} admin: {user.email}'))

