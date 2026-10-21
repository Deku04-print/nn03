"""
Embeddings helper — DISABLED.
sentence-transformers has been removed. generate_embedding() always returns None.
The rest of the system gracefully handles None embeddings (keyword fallback is used instead).
"""
import logging

logger = logging.getLogger('worklens.ai.embeddings')


def generate_embedding(text: str):
    """
    Embeddings are disabled (sentence-transformers removed).
    Returns None — callers fall back to keyword-based matching.
    """
    return None