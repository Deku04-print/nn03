"""
Mentor Agent — generates progressive, educational guidance.

Response schema (6 fields):
  observation       — what the AI observes about the problem (1–2 sentences)
  insight           — why this pattern typically causes the issue (the "aha" moment)
  question          — one targeted guiding question to drive the developer toward the answer
  next_steps        — list of 2–3 concrete debugging actions in plain English (NO code)
  confidence_signal — short encouragement phrase when developer is close; empty string otherwise
  guidance_level    — integer 0–5 (escalates with each hint request)

Rules:
  - NEVER write corrected code, not even a single line.
  - NEVER repeat a hint already in previous_hints.
  - Escalate guidance_level only when action is 'hint' or 'explain'.
"""
import json
import logging
import re
from ai.llm.client import call_llm
from ai.prompts.specialists import get_specialist_prompt

logger = logging.getLogger('worklens.ai.mentor')

GUIDANCE_ACTIONS = {
    'ask':     0,
    'guide':   1,
    'hint':    2,
    'explain': 3,
    'verify':  0,
}

_RESPONSE_SCHEMA = (
    '{"observation": "...", "insight": "...", "question": "...", '
    '"next_steps": ["...", "..."], "confidence_signal": "...", "guidance_level": 0, '
    '"suggestions": ["...", "..."], "file_errors": []}'
)

_ENHANCED_RESPONSE_SCHEMA = (
    '{"observation": "...", "insight": "...", "question": "...", '
    '"next_steps": ["...", "..."], "confidence_signal": "...", "guidance_level": 0, '
    '"suggestions": ["...", "..."], '
    '"file_errors": [{"file": "filename.py", "error_type": "SyntaxError", "description": "..."}]}'
)

_FIELD_DEFAULTS = {
    'observation':       '',
    'insight':           '',
    'question':          '',
    'next_steps':        [],
    'confidence_signal': '',
    'guidance_level':    0,
    'suggestions':       [],
    'file_errors':       [],
}


class MentorAgent:
    def generate(
        self,
        action: str,
        payload: dict,
        problem_summary: str,
        problem_type: str,
        category: str,
        specialist: str,
        similar_problems: list,
        guidance_level: int,
        previous_hints: list = None,
        attempt_count: int = 0,
        enhanced_mode: bool = False,
        input_type: str = 'text',
    ) -> dict:

        if action == 'verify':
            return self._generate_verify(payload, problem_summary, guidance_level)

        target_level = max(guidance_level, GUIDANCE_ACTIONS.get(action, 0))
        system       = get_specialist_prompt(specialist, problem_type, category)

        # ── Build context blocks ──────────────────────────────────
        similar_text = ''
        if similar_problems:
            similar_text = '\nSimilar problems encountered before:\n' + '\n'.join(
                f"  • {p.get('symptoms', '')}: {p.get('guidance', '')}"
                for p in similar_problems[:2]
            )

        previous_text = ''
        if previous_hints:
            previous_text = (
                '\nHints already given — DO NOT repeat any of these:\n'
                + '\n'.join(f'  • {h}' for h in (previous_hints or [])[-4:])
            )

        attempt_note = (
            f'\nThis is attempt #{attempt_count + 1} by the developer.\n'
            if attempt_count > 0 else ''
        )

        # ── Prompt ───────────────────────────────────────────────
        language  = payload.get('language', 'unknown')
        file_name = payload.get('file_name', '')
        code_text = payload.get('selection', {}).get('text', '').strip()
        if not code_text:
            code_text = payload.get('surrounding_code', '').strip()[:2500]
        else:
            code_text = code_text[:1500]

        diag_text = '; '.join(
            d.get('message', '') for d in payload.get('diagnostics', [])[:5]
        )
        user_message = payload.get('user_message', '')

        # Guard: if there is no code context provided in selection or surrounding code
        no_code_guard = ''
        if not code_text.strip():
            no_code_guard = (
                '\nIMPORTANT: There is NO code context provided. '
                'Respond only to the user message in a helpful, natural way.\n'
            )

        file_info = f"File      : {file_name}\n" if file_name else ""
        terminal_output = payload.get('terminal_output', '')
        terminal_info = f"Terminal Output / Error Log:\n```\n{terminal_output[:2500]}\n```\n" if terminal_output else ""
        user_prompt = f"""Language  : {language}
{file_info}{terminal_info}Problem   : {problem_summary[:350]}
User said : {user_message[:300]}
Code      : {code_text or '(none)'}
Errors    : {diag_text or '(none)'}
Action    : {action}
Guidance level target: {target_level}
{no_code_guard}{similar_text}{previous_text}{attempt_note}"""

        # ── Enhanced mode: inject linked file pairs + per-file error map ──
        if enhanced_mode:
            user_prompt += self._build_enhanced_context(payload)
            schema = _ENHANCED_RESPONSE_SCHEMA
        else:
            schema = _RESPONSE_SCHEMA

        user_prompt += f"""
Reply ONLY with JSON matching this exact schema — no markdown, no extra text:
{schema}

Rules:
- observation   : describe what you see (1–2 sentences, no code)
- insight       : explain the underlying concept or why this pattern fails
- question      : one clear guiding question to make the developer think
- next_steps    : 2–3 debugging actions in plain English, no code snippets
- confidence_signal: encouragement if developer is close; empty string if not
- guidance_level: {target_level}"""
        if enhanced_mode:
            user_prompt += (
                "\n- file_errors   : list each file that has errors with its error_type and description."
                " Empty array if no errors detected."
            )

        raw    = call_llm(system=system, user=user_prompt)
        result = self._parse_and_fill(raw)
        result['guidance_level'] = max(target_level, result.get('guidance_level', target_level))
        return result

    # ── Conversational (follow-up) ────────────────────────────────────

    def generate_conversational(
        self,
        user_message: str,
        conversation_history: list = None,
        payload: dict = None,
        problem_summary: str = '',
        guidance_level: int = 0,
        previous_hints: list = None,
        enhanced_mode: bool = False,
        input_type: str = 'text',
    ) -> dict:
        """Generate a dynamic, conversational response for follow-up messages.

        Instead of the rigid 6-field template, this produces a single free-form
        'message' field plus guidance_level.  The LLM receives the full
        conversation history so it can reference earlier turns naturally.
        """
        from ai.llm.client import call_llm_conversation

        payload = payload or {}
        language  = payload.get('language', 'unknown')
        file_name = payload.get('file_name', '')
        code_text = payload.get('selection', {}).get('text', '').strip()
        if not code_text:
            code_text = payload.get('surrounding_code', '').strip()[:3500]
        else:
            code_text = code_text[:2000]

        diag_text = '; '.join(
            d.get('message', '') for d in payload.get('diagnostics', [])[:5]
        )

        # If code context is present, promote input_type to 'code'
        if code_text and input_type == 'text':
            input_type = 'code'

        # ── Build mode-specific instructions based on input_type ──────────────
        terminal_output = payload.get('terminal_output', '')
        if terminal_output or input_type == 'terminal':
            mode_rules = (
                "INPUT TYPE: TERMINAL & SERVER ERROR ANALYSIS\n"
                "The user has highlighted an error, server traceback, or command output from their terminal.\n"
                "YOUR JOB:\n"
                "- Directly inspect the 'Selected Terminal Output' below and any referenced workspace file code.\n"
                "- Pinpoint the exact root cause in the user's workspace.\n"
                "- Explain likely causes, diagnostic steps, and how to verify the result; never provide corrected code.\n"
            )
        elif input_type == 'todo':
            mode_rules = (
                "INPUT TYPE: TASK / TODO\n"
                "The user has provided a task description, feature request, or TODO item — NOT code to debug.\n"
                "YOUR JOB:\n"
                "- Provide clear, numbered step-by-step instructions to complete the task.\n"
                "- Break it down into logical phases (e.g., Setup, Implementation, Testing).\n"
                "- Each step should be actionable and specific.\n"
                "- Do NOT say 'No syntax error' — this is NOT a code syntax check.\n"
                "- Do NOT say 'I cannot help with that' — tasks are always within scope.\n"
            )
        elif input_type == 'code':
            mode_rules = (
                "INPUT TYPE: CODE DEBUGGING & ANALYSIS\n"
                "The user is asking about their code or looking for bugs/errors.\n"
                "YOUR JOB:\n"
                "- You HAVE the code of their file in the 'Current File Code Context' below. Review it directly.\n"
                "- Explain whether there are any syntax errors, logic bugs, unhandled nulls, or improvements.\n"
                "- Guide the developer clearly and concisely.\n"
                "- Do NOT ask the user to share or paste code — you already have it below!\n"
            )
        else:  # 'text' — general question or conversation
            mode_rules = (
                "INPUT TYPE: GENERAL QUESTION / CONVERSATION\n"
                "The user is asking a general question.\n"
                "YOUR JOB:\n"
                "- Answer naturally and helpfully, like a knowledgeable colleague.\n"
                "- Be concise and directly relevant to what the user asked.\n"
            )

        file_header = f"ACTIVE FILE: {file_name} ({language})\n" if file_name else f"LANGUAGE: {language}\n"
        terminal_note = f"\n=== Selected Terminal Output ({payload.get('terminal_name', 'Terminal')}) ===\n{terminal_output}\n" if terminal_output else ""
        code_block = ""
        if code_text or terminal_note:
            code_block = (
                f"{terminal_note}"
                f"\n=== Current File Code Context ({file_name or 'Active File'}) ===\n"
                f"{code_text}\n"
                f"=== Diagnostics ===\n"
                f"{diag_text or 'No compiler errors flagged'}\n"
            )

        system_prompt = (
            "You are WorkLens, an AI developer mentor embedded inside VS Code. "
            "You have direct access to the developer's workspace and active files provided below.\n\n"
            f"{file_header}"
            f"{code_block}\n"
            f"{mode_rules}\n"
            "CRITICAL CAPABILITY RULES:\n"
            "- Provide troubleshooting guidance, diagnostic steps, and verification; NEVER return corrected code or ready-to-paste snippets.\n"
            "- You ARE integrated in VS Code and you DO have direct access to the user's file code provided above.\n"
            "- NEVER say 'as an AI language model, I don't have access to your workspace or files directly'. You DO have access to the code above!\n"
            "- NEVER ask the user to 'please provide the code snippet' if code is already present above. Inspect and analyze the provided code directly!\n"
            "- Understand and reference previous messages in the conversation.\n"
            "- suggestions: provide 2-3 short follow-up prompts (max 8 words each) the developer might ask next.\n\n"
            "Reply ONLY with JSON — no markdown fences, no extra text:\n"
            '{"message": "your natural response here", "guidance_level": 0, "suggestions": ["...", "..."]}\n'
        )

        # Build context note
        context_note = ''
        if problem_summary:
            context_note = f"\n[Problem Summary: {problem_summary[:250]}]"

        # Enhanced mode: inject linked file pairs and per-file error info
        enhanced_note = ''
        if enhanced_mode:
            enhanced_note = self._build_enhanced_context(payload)
            system_prompt += (
                "\n\nENHANCED MODE — you also have access to linked imported files below."
                " For each file that has errors, populate the file_errors array in your JSON:\n"
                '{"message": "your natural response here", "guidance_level": 0, '
                '"suggestions": ["..."], '
                '"file_errors": [{"file": "...", "error_type": "...", "description": "..."}]}\n'
            )

        # Build messages array for multi-turn conversation
        messages = [{'role': 'system', 'content': system_prompt + context_note + enhanced_note}]

        # Add conversation history (last 5 turns)
        if conversation_history:
            for turn in conversation_history[-10:]:  # up to 5 user+assistant pairs
                role = turn.get('role', 'user')
                content = turn.get('content', '')
                if role in ('user', 'assistant') and content:
                    messages.append({'role': role, 'content': content})

        # Add current user message
        messages.append({'role': 'user', 'content': user_message})

        raw = call_llm_conversation(messages)
        result = self._parse_conversational(raw)
        result['guidance_level'] = max(guidance_level, result.get('guidance_level', guidance_level))
        return result

    # ── Enhanced mode helpers ─────────────────────────────────────────

    def _build_enhanced_context(self, payload: dict) -> str:
        """Build the extra context block injected when enhanced_mode=True.

        Includes:
        - Per-file error summary (file name, error type, message) from diagnostics.
        - Each pair of linked imported files as labelled code blocks.
        """
        lines = []

        # ── Per-file error map (from VS Code diagnostics) ─────────────
        file_name = payload.get('file_name', '')
        diagnostics = payload.get('diagnostics', [])
        if diagnostics:
            lines.append('\n\n=== File Error Summary ===')
            for d in diagnostics[:5]:
                msg      = d.get('message', '')
                severity = d.get('severity', 'error')
                # Map severity int (0=error, 1=warning) to label
                if isinstance(severity, int):
                    sev_label = 'Error' if severity == 0 else 'Warning'
                else:
                    sev_label = str(severity).capitalize()
                # Try to infer error type from message (e.g. "SyntaxError: ...")
                error_type = 'Diagnostic'
                if ':' in msg:
                    candidate = msg.split(':')[0].strip()
                    if len(candidate) < 40 and ' ' not in candidate:
                        error_type = candidate
                lines.append(
                    f'  \U0001f4c1 {file_name or "active file"} \u2192 '
                    f'\u274c {sev_label} ({error_type}): {msg[:150]}'
                )

        # ── Linked file pairs (related_file_batches) ──────────────────
        batches = payload.get('related_file_batches', [])
        if batches:
            lines.append('\n\n=== Linked Files (imported dependencies) ===')
            for pair_idx, pair in enumerate(batches, start=1):
                lines.append(f'\n-- Batch {pair_idx} --')
                for f in pair:
                    path    = f.get('path', 'unknown')
                    why     = f.get('why', '')
                    content = f.get('content', '')[:400]  # cap per file
                    lines.append(f'File: {path} ({why})')
                    lines.append(f'```\n{content}\n```')

        return '\n'.join(lines)

    # ── Verify ───────────────────────────────────────────────────────

    def _generate_verify(self, payload: dict, problem_summary: str, guidance_level: int) -> dict:
        """Generate a mentor response for the verify action."""
        new_diags      = payload.get('new_diagnostics', [])
        original_diags = payload.get('diagnostics', [])
        user_message   = payload.get('user_message', '')

        diag_before = [d.get('message', '') for d in original_diags]
        diag_after  = [d.get('message', '') for d in new_diags]

        if not new_diags:
            situation = 'All diagnostics cleared — the error appears resolved.'
        elif diag_after == diag_before:
            situation = 'Diagnostics unchanged — the same error is still present.'
        else:
            situation = (
                f'Diagnostics changed.\n'
                f'  Before: {", ".join(diag_before[:3])}\n'
                f'  After : {", ".join(diag_after[:3])}'
            )

        system = """You are a developer mentor verifying whether a fix worked.
Do NOT write code. Ask the developer to interpret the diagnostic change.
Reply ONLY with JSON:
{"observation": "...", "insight": "...", "question": "...", "next_steps": ["...", "..."], "confidence_signal": "...", "guidance_level": 0}"""

        user_prompt = f"""Problem : {problem_summary[:300]}
Dev note: {user_message or '(none)'}
Change  : {situation[:500]}

Reply ONLY with JSON — no markdown, no extra text.
observation: describe what changed
insight: explain what this diagnostic change means conceptually
question: ask the developer to confirm their understanding
next_steps: 1–2 follow-up actions
confidence_signal: encouragement if resolved, empty string if still failing
guidance_level: integer 0–5"""

        raw    = call_llm(system=system, user=user_prompt)
        result = self._parse_and_fill(raw)
        if 'guidance_level' not in result or result['guidance_level'] == 0:
            result['guidance_level'] = guidance_level
        return result

    # ── Helpers ──────────────────────────────────────────────────────

    def _parse_and_fill(self, raw: str) -> dict:
        """Parse JSON from LLM output and fill in any missing fields with defaults."""
        result = {}
        try:
            start = raw.find('{')
            end   = raw.rfind('}') + 1
            if start != -1 and end > start:
                result = json.loads(raw[start:end], strict=False)
        except Exception:
            logger.warning('[WorkLens] MentorAgent could not parse LLM JSON response')

        # Fill missing fields with safe defaults
        for field, default in _FIELD_DEFAULTS.items():
            if field not in result:
                result[field] = default

        # Ensure next_steps is always a list
        if not isinstance(result.get('next_steps'), list):
            ns = result.get('next_steps', '')
            result['next_steps'] = [ns] if ns else []

        # Ensure file_errors is always a list of dicts
        if not isinstance(result.get('file_errors'), list):
            result['file_errors'] = []
        result['file_errors'] = [
            e for e in result['file_errors']
            if isinstance(e, dict) and e.get('file')
        ]

        return result

    def _parse_conversational(self, raw: str) -> dict:
        """Parse the conversational response format: {message, guidance_level, suggestions, file_errors}."""
        result = {}
        cleaned_raw = raw.strip()

        # 1. Try parsing strict=False on JSON slice
        start = cleaned_raw.find('{')
        end   = cleaned_raw.rfind('}') + 1
        if start != -1 and end > start:
            json_candidate = cleaned_raw[start:end]
            try:
                result = json.loads(json_candidate, strict=False)
            except Exception:
                try:
                    result = json.loads(json_candidate)
                except Exception:
                    pass

        # 2. If 'message' was not extracted via json.loads, use robust regex extraction
        if not result.get('message'):
            msg_match = re.search(
                r'["\']message["\']\s*:\s*["\']([\s\S]*?)(?:["\'],\s*["\'](?:guidance_level|suggestions|file_errors)["\']|["\']\s*\}|\Z)',
                cleaned_raw
            )
            if msg_match:
                extracted = msg_match.group(1).strip()
                if extracted.endswith('"') or extracted.endswith("'"):
                    extracted = extracted[:-1].strip()
                result['message'] = extracted.replace('\\n', '\n').replace('\\"', '"').replace('\\/', '/')

        # 3. Suggestions regex fallback if json.loads failed
        if not result.get('suggestions'):
            sug_match = re.search(r'["\']suggestions["\']\s*:\s*\[([\s\S]*?)\]', cleaned_raw)
            if sug_match:
                items = re.findall(r'["\']([^"\']+)["\']', sug_match.group(1))
                if items:
                    result['suggestions'] = [it.strip() for it in items if it.strip()][:3]

        # 4. Fallback if still no message found
        if not result.get('message'):
            result['message'] = cleaned_raw if cleaned_raw else 'I understood your question. Could you provide more details?'

        # 5. Sanitize message: NEVER leak raw JSON syntax or wrappers to the developer!
        msg_str = str(result.get('message', '')).strip()
        if msg_str.startswith('{') or msg_str.startswith('`{'):
            sub_m = re.search(r'["\']message["\']\s*:\s*["\']([\s\S]*?)(?:["\'],\s*["\']|\Z)', msg_str)
            if sub_m:
                msg_str = sub_m.group(1).strip()
                if msg_str.endswith('"') or msg_str.endswith("'"):
                    msg_str = msg_str[:-1].strip()
                result['message'] = msg_str.replace('\\n', '\n').replace('\\"', '"')
            else:
                msg_str = re.sub(r'^\s*\{?\s*["\'](?:message|observation)["\']\s*:\s*["\']?', '', msg_str)
                msg_str = re.sub(r'["\']?\s*\}?\s*$', '', msg_str)
                result['message'] = msg_str

        if 'guidance_level' not in result:
            result['guidance_level'] = 0

        # Ensure suggestions is always a list of strings
        if not isinstance(result.get('suggestions'), list):
            result['suggestions'] = []
        result['suggestions'] = [s for s in result['suggestions'] if isinstance(s, str) and s.strip()][:3]

        # Ensure file_errors is always a clean list of dicts
        if not isinstance(result.get('file_errors'), list):
            result['file_errors'] = []
        result['file_errors'] = [
            e for e in result['file_errors']
            if isinstance(e, dict) and e.get('file')
        ]

        return result
