# seed_admin.py
from django.core.management.base import BaseCommand
from apps.users.models import WorkLensUser

class Command(BaseCommand):
    help = 'Create or update the WorkLens super-admin account.'

    def handle(self, *args, **options):
        user, created = WorkLensUser.objects.get_or_create(
            email='3228250@tcs.com',
            defaults={'name': 'Super Admin'},
        )
        user.is_staff     = True
        user.is_superuser = True
        user.is_active    = True
        user.set_password('Tcs#1234')
        user.save()

        action = 'Created' if created else 'Updated'
        self.stdout.write(self.style.SUCCESS(f'{action} admin: {user.email}'))
