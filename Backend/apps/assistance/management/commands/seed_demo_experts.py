from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from apps.users.models import WorkLensUser
from apps.assistance.models import ExpertProfile, ExpertKnowledge


DEMO = [
    ('Mira Vale', ['React', 'JavaScript'], 'React state updates', 'React state updates schedule a render. Inspect stale closures, component identity, and mutation of state. Compare render-time values with event-time values; verify the component re-renders after an immutable state update.'),
    ('Arun Fen', ['Java', 'Backend'], 'Java inheritance diagnostics', 'For Java inheritance issues, inspect method signatures, visibility, override annotations, and the runtime type. Distinguish overloading from overriding. Verify which implementation is dispatched with a focused test.'),
    ('Nora Finch', ['Python', 'Backend'], 'Python import troubleshooting', 'For Python import errors, inspect the active interpreter, working directory, package initialization, and circular imports. Compare installed dependencies with the interpreter selected in the editor; verify by running a focused import test.'),
    ('Theo Moss', ['SQL', 'PostgreSQL'], 'SQL query diagnostics', 'For SQL performance problems, inspect the query plan, join cardinality, predicates, and index coverage. Compare estimated and actual row counts. Verify improvements on representative data without exposing production records.'),
    ('Lina Brook', ['TypeScript', 'React'], 'React effect lifecycle', 'For React effects, inspect dependency arrays, cleanup behavior, unstable references, and repeated renders. Distinguish development strict-mode checks from production behavior. Verify subscriptions and timers are cleaned up when the component unmounts.'),
]


class Command(BaseCommand):
    help = 'Idempotently seed fictional Visual Expert profiles; --remove deletes unused demos and retires used ones.'

    def add_arguments(self, parser):
        parser.add_argument('--remove', action='store_true')

    @transaction.atomic
    def handle(self, *args, **options):
        if options['remove']:
            for profile in ExpertProfile.objects.filter(is_demo=True, user__email__endswith='@demo.nexus.invalid'):
                if profile.assistance_sessions.exists():
                    profile.eligible = False
                    profile.visual_enabled = False
                    profile.save()
                    self.stdout.write(f'Retired used demo {profile.user.name}; session history preserved.')
                else:
                    user = profile.user
                    profile.audit.all().delete()
                    user.delete()
            return
        for index, (name, skills, title, content) in enumerate(DEMO, 1):
            email = f'former-expert-{index}@demo.nexus.invalid'
            user = WorkLensUser.objects.filter(email=email).first()
            if user and not ExpertProfile.objects.filter(user=user, is_demo=True).exists():
                raise CommandError(f'Refusing to modify non-demo identity {email}')
            if not user:
                user = WorkLensUser.objects.create_user(email=email, name=f'{name} (Demo)')
                user.is_active = False
                user.save(update_fields=['is_active'])
            profile, _ = ExpertProfile.objects.get_or_create(user=user, defaults={
                'eligible': True, 'skills': skills, 'bio': 'Fictional former employee. Synthetic technical demonstration only.',
                'organizational_status': 'exited', 'availability': 'offline', 'visual_enabled': True, 'is_demo': True,
                'git_identity': f'demo-{index}', 'git_contributions': {'label': 'Synthetic demonstration; not company Git evidence', 'sample_commits': 10 + index}})
            ExpertKnowledge.objects.get_or_create(expert=profile, source_reference=f'demo:synthetic-note-{index}', defaults={
                'title': f'Demonstration: {title}', 'content': content, 'approved': True, 'approved_at': timezone.now()})
        self.stdout.write(self.style.SUCCESS('Five fictional Visual Expert profiles are available. No real users were overwritten.'))
