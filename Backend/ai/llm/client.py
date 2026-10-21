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

logger = logging.getLogger('worklens.ai.llm')

OLLAMA_BASE_URL = os.environ.get('OLLAMA_BASE_URL', 'http://172.20.203.113:5011')
OLLAMA_MODEL    = os.environ.get('OLLAMA_MODEL', 'qwen3:8b')

# ── Speed-optimised defaults ────────────────────────────────────────
# Override any via env vars at startup
_NUM_PREDICT  = int(os.environ.get('OLLAMA_NUM_PREDICT', '256')) # max output tokens
_NUM_CTX      = int(os.environ.get('OLLAMA_NUM_CTX',     '4096')) # context window
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


def call_llm(system: str, user: str, temperature: float = None, timeout: int = 45) -> str:
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
        headers={'Content-Type': 'application/json'},
        method='POST',
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            content = data['message']['content']
            logger.debug(
                f'[WorkLens] LLM done | model={OLLAMA_MODEL} '
                f'tokens={data.get("eval_count","?")} '
                f'ms={data.get("eval_duration",0)//1_000_000}'
            )
            return content
    except urllib.error.URLError as exc:
        raise RuntimeError(
            f'WorkLens: Cannot reach Ollama at {OLLAMA_BASE_URL}. '
            f'Make sure Ollama is running. Error: {exc}'
        ) from exc


def call_llm_conversation(messages: list, temperature: float = None, timeout: int = 45) -> str:
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
        headers={'Content-Type': 'application/json'},
        method='POST',
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            content = data['message']['content']
            logger.debug(
                f'[WorkLens] LLM conversation done | model={OLLAMA_MODEL} '
                f'tokens={data.get("eval_count","?")} '
                f'ms={data.get("eval_duration",0)//1_000_000}'
            )
            return content
    except urllib.error.URLError as exc:
        raise RuntimeError(
            f'WorkLens: Cannot reach Ollama at {OLLAMA_BASE_URL}. '
            f'Make sure Ollama is running. Error: {exc}'
        ) from exc


def call_llm_stream(system: str, user: str, temperature: float = None, timeout: int = 45):
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
        headers={'Content-Type': 'application/json'},
        method='POST',
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
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
    except urllib.error.URLError as exc:
        raise RuntimeError(
            f'WorkLens: Cannot reach Ollama at {OLLAMA_BASE_URL}. Error: {exc}'
        ) from exc