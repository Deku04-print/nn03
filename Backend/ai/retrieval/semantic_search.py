"""
Hybrid Semantic Search — keyword-based fallback (no external model required).

sentence-transformers and FAISS have been removed.
Search uses keyword overlap scoring instead of vector embeddings.

Hybrid scoring:
  score = w_keyword  * keyword_overlap(query, record_text)
        + w_language * (1 if lang_match)
        + w_category * (1 if cat_match)
        + w_verified * (1 if verified)

The public SemanticSearch interface (add / search) is unchanged.
"""
import os
import logging
import re

logger = logging.getLogger('worklens.ai.retrieval')

FAISS_INDEX_PATH = os.environ.get('FAISS_INDEX_PATH', './data/faiss_index')


# ── Keyword scoring ──────────────────────────────────────────────────

def _tokenise(text: str) -> set:
    """Lower-case word tokens from text."""
    return set(re.findall(r'\w+', text.lower()))


def _keyword_score(query: str, record_text: str) -> float:
    """
    Jaccard-like overlap score between query tokens and record tokens.
    Returns a float in [0.0, 1.0].
    """
    q_tokens = _tokenise(query)
    r_tokens = _tokenise(record_text)
    if not q_tokens or not r_tokens:
        return 0.0
    return len(q_tokens & r_tokens) / len(q_tokens | r_tokens)


def _record_text(record: dict) -> str:
    """Combine searchable fields from a record dict into one string."""
    return ' '.join(filter(None, [
        record.get('symptoms', ''),
        record.get('root_cause', ''),
        record.get('guidance', ''),
        record.get('category', ''),
        record.get('language', ''),
    ]))


# ── Helpers ──────────────────────────────────────────────────────────

def _using_postgres() -> bool:
    """True when the default DB engine is PostgreSQL."""
    try:
        from django.db import connection
        return 'postgres' in connection.settings_dict.get('ENGINE', '')
    except Exception:
        return False


def _get_retrieval_weights() -> dict:
    """Read hybrid scoring weights from Django settings with safe defaults."""
    try:
        from django.conf import settings
        return getattr(settings, 'RETRIEVAL_WEIGHTS', {
            'semantic': 0.60, 'language': 0.15,
            'category': 0.15, 'verified': 0.10,
        })
    except Exception:
        return {'semantic': 0.60, 'language': 0.15, 'category': 0.15, 'verified': 0.10}


def _hybrid_score(
    keyword_sim: float,
    lang_match: bool,
    cat_match: bool,
    is_verified: bool,
    weights: dict,
) -> float:
    """Compute the composite hybrid retrieval score."""
    return (
        weights['semantic'] * keyword_sim
        + weights['language'] * (1.0 if lang_match else 0.0)
        + weights['category'] * (1.0 if cat_match else 0.0)
        + weights['verified'] * (1.0 if is_verified else 0.0)
    )


# ── pgvector backend (embedding skipped — keyword only) ──────────────

def _pgvector_add(dna_instance, text: str):
    """
    Embeddings are disabled; this is a no-op.
    Records are still stored in the database via Django ORM (no embedding column needed).
    """
    logger.debug('[WorkLens][pgvector] Embeddings disabled — skipping embedding store.')


def _pgvector_search(query: str, language: str = '', category: str = '', top_k: int = 5) -> list:
    """Keyword-based search across all ProblemDNA rows (no vector column needed)."""
    try:
        from apps.knowledge.models import ProblemDNA

        weights = _get_retrieval_weights()
        results = []

        for dna in ProblemDNA.objects.all():
            record_text = ' '.join(filter(None, [
                dna.symptoms, dna.root_cause, str(getattr(dna, 'guidance', '')),
                dna.category, dna.language,
            ]))
            keyword_sim = _keyword_score(query, record_text)
            lang_match  = language.lower() == dna.language.lower() if language else False
            cat_match   = category.lower() == dna.category.lower() if category else False
            is_verified = dna.verification_status in ('verified', 'partially_resolved')

            score = _hybrid_score(keyword_sim, lang_match, cat_match, is_verified, weights)
            results.append({
                'id':         str(dna.id),
                'language':   dna.language,
                'category':   dna.category,
                'symptoms':   dna.symptoms,
                'root_cause': dna.root_cause,
                'guidance':   getattr(dna, 'guidance', ''),
                'verified':   is_verified,
                '_score':     score,
            })

        results.sort(key=lambda r: r['_score'], reverse=True)
        return results[:top_k]

    except Exception as exc:
        logger.error(f'[WorkLens][pgvector] keyword search failed: {exc}')
        return []


# ── In-memory backend (replaces FAISS) ───────────────────────────────

class _KeywordBackend:
    """
    In-memory record store with keyword-overlap search.
    Replaces FAISS — no model download required.
    """
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._records = []
        return cls._instance

    def add(self, record: dict, text: str):
        self._records.append(record)
        logger.debug(f'[WorkLens][KeywordSearch] Added record. Total: {len(self._records)}')

    def search(self, query: str, language: str = '', category: str = '', top_k: int = 5) -> list:
        if not self._records:
            return []

        weights  = _get_retrieval_weights()
        results  = []

        for rec in self._records:
            keyword_sim = _keyword_score(query, _record_text(rec))
            lang_match  = language.lower() == rec.get('language', '').lower() if language else False
            cat_match   = category.lower() == rec.get('category', '').lower() if category else False
            is_verified = rec.get('verification_status') in ('verified', 'partially_resolved')

            score = _hybrid_score(keyword_sim, lang_match, cat_match, is_verified, weights)
            results.append({**rec, '_score': score, 'verified': is_verified})

        results.sort(key=lambda r: r['_score'], reverse=True)
        return results[:top_k]


# ── unified public interface ─────────────────────────────────────────

class SemanticSearch:
    """
    Auto-selects backend:
      • PostgreSQL detected → pgvector path (keyword search, no embeddings)
      • otherwise          → in-memory keyword search

    Usage:
        ss = SemanticSearch()
        ss.add(dna_instance, embedding_text)
        results = ss.search("IndexError list index", language="python")
    """

    def add(self, record, text: str):
        if _using_postgres():
            _pgvector_add(record, text)
        else:
            _KeywordBackend().add(
                {'id': str(record.pk), 'language': record.language,
                 'category': record.category, 'symptoms': record.symptoms,
                 'root_cause': record.root_cause},
                text
            )

    def search(self, query: str, language: str = '', category: str = '', top_k: int = 5) -> list:
        if _using_postgres():
            return _pgvector_search(query, language, category, top_k)
        return _KeywordBackend().search(query, language, category, top_k)