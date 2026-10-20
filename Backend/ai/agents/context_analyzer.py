

"""
Context Analyzer Agent — understands language, framework, code structure, and summarizes the problem.
"""
import logging
import json
from ai.llm.client import call_llm

logger = logging.getLogger('nexus.ai.context')

SYSTEM_PROMPT = """You are a code analysis assistant. Analyze the given code, diagnostics, and user message.
Return ONLY a JSON object with these fields:
- language: programming language detected
- framework: framework if identifiable, else null
- problem_area: the area of code where the issue occurs (e.g., "loop", "function", "import")
- relevant_symbols: list of variable/function names involved
- error_present: true if there is a clear error
- context_summary: 1-2 sentence plain English summary of what the code is doing and what seems wrong
- input_type: classify the user's intent — MUST be one of:
    "code"  — selected_code is non-empty AND contains programming syntax (functions, variables, statements)
    "todo"  — user message contains "TODO", "TASK", "FEAT", or action verbs like implement/create/build/add/fix/refactor/write, AND there is little or no code context
    "text"  — any other input: a question, explanation request, or general conversation

Do NOT suggest solutions. Do NOT write corrected code. Just analyze."""


class ContextAnalyzer:
    def analyze(self, payload: dict) -> dict:
        selection   = payload.get('selection', {}).get('text', '').strip()
        if not selection:
            selection = payload.get('surrounding_code', '').strip()[:1500]
        diagnostics = payload.get('diagnostics', [])
        language    = payload.get('language', 'unknown')
        user_msg    = payload.get('user_message', '')
        file_name   = payload.get('file_name', '')

        diag_text = '\n'.join(f"- [{d.get('severity','?')}] {d.get('message','')}" for d in diagnostics)

        file_line = f"File: {file_name}\n" if file_name else ""
        prompt = f"""Language: {language}
{file_line}User message: {user_msg[:300]}
Code:
{selection or '(none)'}

Diagnostics:
{diag_text or 'None'}

Surrounding context (excerpt):
{payload.get('surrounding_code', '')[:800]}
"""
        raw = call_llm(system=SYSTEM_PROMPT, user=prompt)
        return self._parse(raw)

    def _parse(self, raw: str) -> dict:
        try:
            start = raw.find('{')
            end   = raw.rfind('}') + 1
            return json.loads(raw[start:end])
        except Exception:
            return {}
