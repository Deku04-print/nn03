"""Local Ollama embeddings for optional semantic retrieval.

Embedding failures are deliberately non-fatal: callers retain the keyword
retrieval path when the configured embedding model is unavailable.
"""
import json
import logging
import os
import urllib.error
import urllib.request

logger = logging.getLogger('nexus.ai.embeddings')

EMBEDDING_MODEL = os.environ.get('EMBEDDING_MODEL', 'embeddinggemma')
OLLAMA_BASE_URL = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434').rstrip('/')
OLLAMA_API_KEY = os.environ.get('OLLAMA_API_KEY', '').strip()
EMBEDDING_TIMEOUT_SECONDS = int(os.environ.get('EMBEDDING_TIMEOUT_SECONDS', '15'))


def generate_embeddings(texts):
    """Return a vector per input using Ollama's local `/api/embed` endpoint.

    Returns `None` if Ollama/model is unavailable. Inputs are truncated so a
    long saved problem cannot exceed the embedding model's context window.
    """
    texts = [str(text or '')[:6000] for text in texts]
    if not texts or not any(text.strip() for text in texts):
        return None

    payload = json.dumps({
        'model': EMBEDDING_MODEL,
        'input': texts,
        'truncate': True,
        'keep_alive': '0',
    }).encode('utf-8')
    headers = {'Content-Type': 'application/json'}
    if OLLAMA_API_KEY:
        headers['Authorization'] = f'Bearer {OLLAMA_API_KEY}'
    request = urllib.request.Request(
        f'{OLLAMA_BASE_URL}/api/embed', data=payload,
        headers=headers, method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=EMBEDDING_TIMEOUT_SECONDS) as response:
            body = json.loads(response.read().decode('utf-8'))
        vectors = body.get('embeddings')
        if not isinstance(vectors, list) or len(vectors) != len(texts):
            logger.warning('[NEXUS] Ollama returned an unexpected embedding response.')
            return None
        clean = []
        dimension = None
        for vector in vectors:
            if not isinstance(vector, list) or not vector:
                return None
            values = [float(value) for value in vector]
            if dimension is None:
                dimension = len(values)
            if len(values) != dimension:
                return None
            clean.append(values)
        return clean
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, KeyError) as exc:
        logger.info('[NEXUS] Embeddings unavailable; using keyword retrieval (%s).', type(exc).__name__)
        return None


def generate_embedding(text):
    """Return one local embedding vector or None when unavailable."""
    vectors = generate_embeddings([text])
    return vectors[0] if vectors else None
