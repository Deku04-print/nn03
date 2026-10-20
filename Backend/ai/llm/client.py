"""
Ollama LLM Client — optimised for low-latency responses.

Speed knobs applied:
  - num_predict: cap output tokens (mentor hints don't need long essays)
  - num_ctx:     reduce context window (less to process per token)
  - temperature: kept low for deterministic, quick responses
  - repeat_penalty: slightly above 1.0 to avoid repetition loops  
  - streaming:   optional — call call_llm_stream() for token streaming
  - timeout:     reduced from 60→45s (if it hasn't replied in 45s, it won't be useful)
"""
import json
import urllib.request
import urllib.error
import logging
import os
import socket

logger = logging.getLogger('nexus.ai.llm')

OLLAMA_BASE_URL = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
OLLAMA_MODEL    = os.environ.get('OLLAMA_MODEL', 'qwen3:4b')
OLLAMA_TIMEOUT_SECONDS = int(os.environ.get('OLLAMA_TIMEOUT_SECONDS', '45'))
OLLAMA_API_KEY = os.environ.get('OLLAMA_API_KEY', '').strip()

# ── Speed-optimised defaults ────────────────────────────────────────
# Override any via env vars at startup
_NUM_PREDICT  = int(os.environ.get('OLLAMA_NUM_PREDICT', '256')) # max output tokens
_NUM_CTX      = int(os.environ.get('OLLAMA_NUM_CTX',     '1024')) # context window
_TEMPERATURE  = float(os.environ.get('OLLAMA_TEMPERATURE', '0.2'))


def _build_options(temperature: float = None, num_predict: int = None) -> dict:
    return {
        'temperature':    temperature if temperature is not None else _TEMPERATURE,
        'num_predict':    num_predict if num_predict is not None else _NUM_PREDICT,
        'num_ctx':        _NUM_CTX,
        'repeat_penalty': 1.1,
        'top_k':          20,    # narrow token sampling → faster
        'top_p':          0.8,
    }


def _ollama_http_error(exc: urllib.error.HTTPError) -> RuntimeError:
    """Translate upstream failures to actionable messages without exposing internals."""
    try:
        detail = exc.read().decode('utf-8', errors='replace').strip()
        try:
            detail = json.loads(detail).get('error', detail)
        except (json.JSONDecodeError, AttributeError):
            pass
    except Exception:
        detail = ''
    logger.warning('[NEXUS] Ollama returned HTTP %s: %s', exc.code, detail or exc.reason)
    lowered = detail.lower()
    if exc.code == 404 or 'model' in lowered and ('not found' in lowered or 'pull' in lowered):
        return RuntimeError(
            f'NEXUS: The configured Ollama model ({OLLAMA_MODEL}) is unavailable. '
            'Install that model on the configured Ollama service or select an installed model.'
        )
    if exc.code in (401, 403):
        return RuntimeError('NEXUS: The configured Ollama service rejected its credentials.')
    if 'unable to allocate cpu buffer' in lowered or 'failed to allocate buffer' in lowered:
        return RuntimeError(
            f'NEXUS: Ollama could not fit model {OLLAMA_MODEL} in available memory. '
            'Use a smaller installed model or free memory, then retry.'
        )
    if exc.code >= 500:
        return RuntimeError('NEXUS: The configured Ollama service failed while generating a response. Try again later.')
    return RuntimeError(f'NEXUS: The configured Ollama service rejected the request (HTTP {exc.code}).')


def _request_headers() -> dict:
    headers = {'Content-Type': 'application/json'}
    if OLLAMA_API_KEY:
        headers['Authorization'] = f'Bearer {OLLAMA_API_KEY}'
    return headers


def _ollama_connection_error(exc: urllib.error.URLError) -> RuntimeError:
    reason = exc.reason
    if isinstance(reason, (TimeoutError, socket.timeout)):
        return RuntimeError('NEXUS: The configured Ollama service timed out. Check that it is running and retry.')
    if isinstance(reason, ConnectionRefusedError):
        return RuntimeError('NEXUS: The configured Ollama service refused the connection. Start it or check its configuration.')
    logger.warning('[NEXUS] Ollama connection failed: %s', type(reason).__name__)
    return RuntimeError('NEXUS: The configured Ollama service is unavailable. Check the service configuration and network access.')


def call_llm(system: str, user: str, temperature: float = None, timeout: int = None) -> str:
    """
    Call Ollama /api/chat — non-streaming, returns full response string.
    For progressive display, use call_llm_stream() instead.
    """
    payload = json.dumps({
        'model':   OLLAMA_MODEL,
        'messages': [
            {'role': 'system', 'content': system},
            {'role': 'user',   'content': user},
        ],
        'stream':  False,
        'options': _build_options(temperature),
    }).encode('utf-8')

    req = urllib.request.Request(
        f'{OLLAMA_BASE_URL}/api/chat',
        data=payload,
        headers=_request_headers(),
        method='POST',
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout or OLLAMA_TIMEOUT_SECONDS) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            content = data['message']['content']
            logger.debug(
                f'[NEXUS] LLM done | model={OLLAMA_MODEL} '
                f'tokens={data.get("eval_count","?")} '
                f'ms={data.get("eval_duration",0)//1_000_000}'
            )
            return content
    except urllib.error.HTTPError as exc:
        raise _ollama_http_error(exc) from exc
    except urllib.error.URLError as exc:
        raise _ollama_connection_error(exc) from exc


def call_llm_conversation(messages: list, temperature: float = None, timeout: int = None) -> str:
    """
    Call Ollama /api/chat with a full multi-turn messages array.
    Each message should be {role: 'system'|'user'|'assistant', content: str}.
    Returns full response string.
    """
    payload = json.dumps({
        'model':   OLLAMA_MODEL,
        'messages': messages,
        'stream':  False,
        'options': _build_options(temperature),
    }).encode('utf-8')

    req = urllib.request.Request(
        f'{OLLAMA_BASE_URL}/api/chat',
        data=payload,
        headers=_request_headers(),
        method='POST',
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout or OLLAMA_TIMEOUT_SECONDS) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            content = data['message']['content']
            logger.debug(
                f'[NEXUS] LLM conversation done | model={OLLAMA_MODEL} '
                f'tokens={data.get("eval_count","?")} '
                f'ms={data.get("eval_duration",0)//1_000_000}'
            )
            return content
    except urllib.error.HTTPError as exc:
        raise _ollama_http_error(exc) from exc
    except urllib.error.URLError as exc:
        raise _ollama_connection_error(exc) from exc


def call_llm_stream(system: str, user: str, temperature: float = None, timeout: int = None):
    """
    Generator — yields text chunks as they arrive from Ollama.
    Use this for streaming responses to the VS Code sidebar for perceived speed.

    Usage:
        for chunk in call_llm_stream(system, user):
            print(chunk, end='', flush=True)
    """
    payload = json.dumps({
        'model':   OLLAMA_MODEL,
        'messages': [
            {'role': 'system', 'content': system},
            {'role': 'user',   'content': user},
        ],
        'stream':  True,
        'options': _build_options(temperature),
    }).encode('utf-8')

    req = urllib.request.Request(
        f'{OLLAMA_BASE_URL}/api/chat',
        data=payload,
        headers=_request_headers(),
        method='POST',
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout or OLLAMA_TIMEOUT_SECONDS) as resp:
            for raw_line in resp:
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                    token = chunk.get('message', {}).get('content', '')
                    if token:
                        yield token
                    if chunk.get('done'):
                        break
                except json.JSONDecodeError:
                    continue
    except urllib.error.HTTPError as exc:
        raise _ollama_http_error(exc) from exc
    except urllib.error.URLError as exc:
        raise _ollama_connection_error(exc) from exc
