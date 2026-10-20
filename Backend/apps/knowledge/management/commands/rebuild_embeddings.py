"""Backfill current-model local embeddings for approved knowledge records."""
from django.core.management.base import BaseCommand

from ai.embeddings import EMBEDDING_MODEL, generate_embeddings
from apps.knowledge.models import ProblemDNA
from apps.collaboration.models import VisualExpertKnowledge


class Command(BaseCommand):
    help = 'Generate or refresh local Ollama embeddings for verified ProblemDNA and approved Visual Expert sources.'

    def add_arguments(self, parser):
        parser.add_argument('--batch-size', type=int, default=16)

    def handle(self, *args, **options):
        batch_size = max(1, min(64, options['batch_size']))
        total_updated = 0
        targets = [
            (ProblemDNA.objects.filter(verification_status='verified'), lambda item: item.build_embedding_text()),
            (VisualExpertKnowledge.objects.filter(review_status='approved', is_active=True), lambda item: item.content[:6000]),
        ]
        for queryset, get_text in targets:
            page = []
            for item in queryset.iterator(chunk_size=batch_size):
                page.append(item)
                if len(page) >= batch_size:
                    total_updated += self._embed_page(page, get_text)
                    page = []
            if page:
                total_updated += self._embed_page(page, get_text)
        self.stdout.write(self.style.SUCCESS(f'Updated {total_updated} embedding(s) using {EMBEDDING_MODEL}.'))

    def _embed_page(self, records, get_text):
        vectors = generate_embeddings([get_text(record) for record in records])
        if not vectors:
            self.stderr.write(self.style.WARNING('Embedding service unavailable; remaining records are left on keyword fallback.'))
            return 0
        if records and isinstance(records[0], ProblemDNA):
            for record, vector in zip(records, vectors):
                record.embedding = vector
                record.embedding_model = EMBEDDING_MODEL
                record.embedding_text = get_text(record)
            ProblemDNA.objects.bulk_update(records, ['embedding', 'embedding_model', 'embedding_text'])
        else:
            for record, vector in zip(records, vectors):
                record.embedding = vector
                record.embedding_model = EMBEDDING_MODEL
            VisualExpertKnowledge.objects.bulk_update(records, ['embedding', 'embedding_model'])
        return len(records)
