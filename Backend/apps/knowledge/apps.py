"""
Knowledge app config — registers post-save signal to auto-embed verified ProblemDNA.
"""
import logging
from django.apps import AppConfig

logger = logging.getLogger('worklens.knowledge')


class KnowledgeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.knowledge'

    def ready(self):
        from django.db.models.signals import post_save
        from django.dispatch import receiver

        # Import here to avoid circular import at module level
        try:
            from apps.knowledge.models import ProblemDNA
            from ai.retrieval.semantic_search import SemanticSearch

            @receiver(post_save, sender=ProblemDNA, weak=False)
            def auto_embed_verified_dna(sender, instance, **kwargs):
                """When a ProblemDNA is marked verified, add it to the FAISS index."""
                if instance.verification_status == 'verified':
                    try:
                        record = {
                            'id':         str(instance.id),
                            'language':   instance.language,
                            'framework':  instance.framework,
                            'category':   instance.category,
                            'error_type': instance.error_type,
                            'symptoms':   instance.symptoms,
                            'root_cause': instance.root_cause,
                            'guidance':   instance.guidance,
                        }
                        text = instance.build_embedding_text()
                        SemanticSearch().add(record, text)
                        logger.info(f'[WorkLens] ProblemDNA {instance.id} embedded and indexed.')
                    except Exception as exc:
                        logger.warning(f'[WorkLens] Auto-embed failed for {instance.id}: {exc}')
        except ImportError:
            pass  # Graceful: AI deps may not be present
