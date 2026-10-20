"""Permission-scoped hybrid search over persisted ProblemDNA records.

Ollama embeddings are stored as JSON vectors, so retrieval works without the
PostgreSQL pgvector extension. Records without a current vector still receive
keyword scoring until they are embedded.
"""
import logging
import math
import re

logger = logging.getLogger('nexus.ai.retrieval')


def _tokenise(text):
    return set(re.findall(r'\w+', str(text or '').lower()))


def _keyword_score(query, record_text):
    query_tokens = _tokenise(query)
    record_tokens = _tokenise(record_text)
    if not query_tokens or not record_tokens:
        return 0.0
    return len(query_tokens & record_tokens) / len(query_tokens | record_tokens)


def _cosine(left, right):
    if not isinstance(left, list) or not isinstance(right, list) or len(left) != len(right) or not left:
        return None
    try:
        dot = sum(float(a) * float(b) for a, b in zip(left, right))
        norm_left = math.sqrt(sum(float(a) ** 2 for a in left))
        norm_right = math.sqrt(sum(float(b) ** 2 for b in right))
        if not norm_left or not norm_right:
            return None
        return max(0.0, min(1.0, dot / (norm_left * norm_right)))
    except (TypeError, ValueError):
        return None


def _weights():
    try:
        from django.conf import settings
        return getattr(settings, 'RETRIEVAL_WEIGHTS', {
            'semantic': .60, 'language': .15, 'category': .15, 'verified': .10,
        })
    except Exception:
        return {'semantic': .60, 'language': .15, 'category': .15, 'verified': .10}


def _record_text(dna):
    symptoms = dna.symptoms if isinstance(dna.symptoms, list) else [dna.symptoms]
    guidance = dna.guidance if isinstance(dna.guidance, list) else [dna.guidance]
    return ' '.join(str(value) for value in [
        *symptoms, dna.root_cause, *guidance, dna.category, dna.language,
        dna.framework or '', dna.error_type,
    ] if value)


class SemanticSearch:
    """Search verified organization knowledge and the caller's own private data."""

    def add(self, record, text=''):
        """Compatibility adapter; persisted records are indexed by their model signal."""
        instance = getattr(record, 'save', None)
        if callable(instance):
            record.save()

    def search(self, query, language='', category='', top_k=5, user_id=None):
        query = str(query or '').strip()[:6000]
        if not query:
            return []
        try:
            from django.conf import settings
            from django.db.models import Q
            from apps.knowledge.models import ProblemDNA
            from ai.embeddings import EMBEDDING_MODEL, generate_embedding

            visible = Q(scope_zone='organization', verification_status='verified')
            if user_id:
                visible |= Q(scope_zone='private', problem__user_id=user_id)
            records = ProblemDNA.objects.filter(visible).select_related('problem')

            has_current_embeddings = records.filter(
                embedding_model=EMBEDDING_MODEL, embedding__isnull=False,
            ).exists()
            query_vector = generate_embedding(query) if has_current_embeddings else None
            weights = _weights()
            results = []
            for dna in records.iterator():
                text = _record_text(dna)
                keyword = _keyword_score(query, text)
                semantic = None
                if query_vector and dna.embedding_model == EMBEDDING_MODEL:
                    semantic = _cosine(query_vector, dna.embedding)
                content_score = keyword if semantic is None else (.9 * semantic + .1 * keyword)
                language_match = bool(language and language.casefold() == dna.language.casefold())
                category_match = bool(category and category.casefold() == dna.category.casefold())
                verified = dna.verification_status == 'verified'
                score = (
                    weights.get('semantic', .60) * content_score
                    + weights.get('language', .15) * language_match
                    + weights.get('category', .15) * category_match
                    + weights.get('verified', .10) * verified
                )
                results.append({
                    'id': str(dna.id), 'language': dna.language,
                    'category': dna.category, 'symptoms': dna.symptoms,
                    'root_cause': dna.root_cause, 'guidance': dna.guidance,
                    'verified': verified, 'match_type': 'semantic' if semantic is not None else 'keyword',
                    '_score': round(score, 6),
                })
            results.sort(key=lambda item: (item['_score'], item['verified']), reverse=True)
            return results[:min(20, max(1, int(top_k)))]
        except Exception:
            logger.exception('[NEXUS] ProblemDNA search failed; returning no matches.')
            return []
