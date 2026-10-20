"""
Context Sanitizer — strips secrets and sensitive data before sending to the LLM.

Patterns detected and replaced:
  - API keys / Bearer tokens
  - AWS credentials
  - Private keys (PEM blocks)
  - JWT tokens
  - Passwords / secrets in env-style assignments
  - Database connection strings with credentials
  - Email addresses (PII)
  - IPv4 addresses with ports
  - GitHub Personal Access Tokens (ghp_, gho_, ghs_, ghr_)
  - GitLab Personal Access Tokens (glpat-)
  - Generic high-entropy strings (40+ hex chars or 32+ base64 chars)
"""
import re
import logging

logger = logging.getLogger('nexus.sanitizer')

# ── Regex patterns ──────────────────────────────────────────────────
_PATTERNS = [
    # PEM private key blocks
    (r'-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----',
     '[REDACTED_PRIVATE_KEY]'),

    # AWS keys
    (r'(?:AKIA|AIPA|ASIA|AROA)[A-Z0-9]{16}',
     '[REDACTED_AWS_KEY]'),
    (r'aws[_-]?secret[_-]?(?:access[_-]?)?key\s*[=:]\s*["\']?([A-Za-z0-9+/]{40})["\']?',
     'aws_secret_key=[REDACTED_SECRET]'),

    # GitHub PATs: ghp_ gho_ ghs_ ghr_ (classic + fine-grained)
    (r'\bgh[posr]_[A-Za-z0-9]{20,}\b',
     '[REDACTED_GITHUB_TOKEN]'),

    # GitLab PATs
    (r'\bglpat-[A-Za-z0-9\-_]{20,}\b',
     '[REDACTED_GITLAB_TOKEN]'),

    # Authorization headers / Bearer tokens
    (r'(?i)(?:Authorization|Bearer)\s*[:\s]+[A-Za-z0-9\-._~+/]+=*',
     '[REDACTED_TOKEN]'),

    # JWT tokens (3-part base64 with dots)
    (r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}',
     '[REDACTED_JWT]'),

    # Database URLs with credentials
    (r'(?i)(?:postgres(?:ql)?|mysql|mongodb|redis)://[^:]+:[^@]+@',
     'db://[REDACTED]@'),

    # Password / secret assignments (env-style or code-style)
    (r'(?i)(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)\s*[=:]\s*["\']?([^\s"\']{6,})["\']?',
     lambda m: m.group(0).split(m.group(1))[0] + '[REDACTED_SECRET]'),

    # Email addresses (PII)
    (r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b',
     '[REDACTED_EMAIL]'),

    # IPv4 addresses with ports (e.g. 192.168.1.1:5432)
    (r'\b(?:\d{1,3}\.){3}\d{1,3}:\d{2,5}\b',
     '[REDACTED_IP:PORT]'),

    # Generic high-entropy strings that look like tokens (40+ hex chars)
    (r'\b[0-9a-fA-F]{40,}\b',
     '[REDACTED_HASH]'),

    # Generic long base64-ish strings (32+ chars, likely tokens)
    (r'(?<![A-Za-z0-9_])[A-Za-z0-9+/]{32,}={0,2}(?![A-Za-z0-9+/=])',
     '[REDACTED_TOKEN]'),
]

_COMPILED = [
    (re.compile(pat, re.MULTILINE), repl)
    for pat, repl in _PATTERNS
]


def sanitize_text(text: str) -> str:
    """Replace known secret/PII patterns in a string with redaction placeholders."""
    if not text:
        return text
    for pattern, replacement in _COMPILED:
        try:
            text = pattern.sub(replacement, text)
        except Exception:
            pass  # never crash on sanitization failure
    return text


def sanitize_diagnostics(diagnostics: list) -> list:
    """Sanitize the message field of each diagnostic entry. Returns a new list."""
    result = []
    for d in diagnostics:
        entry = dict(d)
        if entry.get('message'):
            entry['message'] = sanitize_text(entry['message'])
        result.append(entry)
    return result


def sanitize_payload(payload: dict) -> dict:
    """
    Sanitize a NEXUS payload dict before it is sent to the AI pipeline.
    Walks: selection.text, surrounding_code, diagnostics, workspace.env.
    Returns a new dict — does not mutate the original.
    """
    import copy
    p = copy.deepcopy(payload)

    # Selected code
    if p.get('selection', {}).get('text'):
        original = p['selection']['text']
        p['selection']['text'] = sanitize_text(original)
        if p['selection']['text'] != original:
            logger.info('[NEXUS] Sanitized selected code (secret/PII detected)')

    # Surrounding code
    if p.get('surrounding_code'):
        p['surrounding_code'] = sanitize_text(p['surrounding_code'])

    if isinstance(p.get('user_message'), str):
        p['user_message'] = sanitize_text(p['user_message'][:6000])

    if isinstance(p.get('conversation_history'), list):
        p['conversation_history'] = [
            {'role': item['role'], 'content': sanitize_text(str(item.get('content', ''))[:6000])}
            for item in p['conversation_history'][-10:]
            if isinstance(item, dict) and item.get('role') in ('user', 'assistant')
        ]

    # Advanced Chat files are user-approved before collection. Sanitize and cap
    # them again server-side; the client-side preview is not a trust boundary.
    if isinstance(p.get('related_files'), list):
        safe_files = []
        for item in p['related_files'][:5]:
            if not isinstance(item, dict):
                continue
            safe_files.append({
                'path': sanitize_text(str(item.get('path', ''))[:1024]),
                'language': sanitize_text(str(item.get('language', ''))[:80]),
                'content': sanitize_text(str(item.get('content', ''))[:8000]),
            })
        p['related_files'] = safe_files

    # Diagnostic messages
    if p.get('diagnostics'):
        p['diagnostics'] = sanitize_diagnostics(p['diagnostics'])

    # Git/env context
    if p.get('workspace', {}).get('env'):
        p['workspace']['env'] = '[REDACTED]'

    return p
