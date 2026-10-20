
"""
Problem Classifier — classifies into one of 16 NEXUS problem categories.
Tries LLM classification first; falls back to rule-based when unavailable.
"""
import json
import logging
from ai.llm.client import call_llm

logger = logging.getLogger('nexus.ai.classifier')

CATEGORIES = [
    'syntax_error', 'runtime_error', 'logic_error', 'type_error',
    'null_reference', 'index_boundary', 'loop_error', 'async_error',
    'dependency_error', 'configuration_error', 'api_error', 'database_error',
    'query_error', 'framework_error', 'testing_error', 'build_error',
]

SYSTEM_PROMPT = f"""You are a problem classification engine.
Given code, diagnostics, and a summary, classify the problem.
Return ONLY a JSON object with:
- problem_type: one of ["runtime_error", "logic_error", "syntax_error", "type_error", "other"]
- category: one of {json.dumps(CATEGORIES)}
- confidence: float 0.0 to 1.0

Be precise. If unsure, use lower confidence."""


class ProblemClassifier:
    def classify(self, code: str, diagnostics: list, language: str, summary: str) -> dict:
        diag_text = '\n'.join(f"[{d.get('severity','?')}] {d.get('message','')}" for d in diagnostics)
        prompt = f"""Language: {language}
Summary: {summary}
Code: {code[:600]}
Diagnostics: {diag_text or 'None'}"""

        try:
            raw    = call_llm(system=SYSTEM_PROMPT, user=prompt)
            result = self._parse(raw)
            if result.get('problem_type') and result.get('category'):
                return result
        except Exception as exc:
            logger.warning(f'[NEXUS] Classifier LLM call failed: {exc}')

        # Graceful fallback — rule-based when LLM unavailable or returns garbage
        return self._fallback(diagnostics=diagnostics, language=language)

    def _fallback(self, diagnostics: list, language: str = 'unknown') -> dict:
        """Rule-based classifier used when the LLM is unavailable or returns invalid output."""
        combined = ' '.join(d.get('message', '') for d in diagnostics).lower()

        if 'indexerror' in combined or 'index out of range' in combined:
            return {'problem_type': 'runtime_error', 'category': 'index_boundary', 'confidence': 0.85}
        if 'nonetype' in combined and ('not iterable' in combined or 'has no attribute' in combined):
            return {'problem_type': 'runtime_error', 'category': 'null_reference', 'confidence': 0.85}
        if 'typeerror' in combined:
            return {'problem_type': 'runtime_error', 'category': 'type_error', 'confidence': 0.80}
        if 'syntaxerror' in combined or 'invalid syntax' in combined:
            return {'problem_type': 'syntax_error', 'category': 'syntax_error', 'confidence': 0.90}
        if 'nameerror' in combined or 'is not defined' in combined:
            return {'problem_type': 'runtime_error', 'category': 'runtime_error', 'confidence': 0.75}
        if 'modulenotfounderror' in combined or 'no module named' in combined:
            return {'problem_type': 'runtime_error', 'category': 'dependency_error', 'confidence': 0.90}
        if 'referenceerror' in combined or ('promise' in combined and language == 'javascript'):
            return {'problem_type': 'runtime_error', 'category': 'async_error', 'confidence': 0.75}
        if 'databaseerror' in combined or 'integrityerror' in combined:
            return {'problem_type': 'runtime_error', 'category': 'database_error', 'confidence': 0.80}
        if 'assertionerror' in combined:
            return {'problem_type': 'logic_error', 'category': 'testing_error', 'confidence': 0.65}

        return {'problem_type': 'runtime_error', 'category': 'runtime_error', 'confidence': 0.50}

    def _parse(self, raw: str) -> dict:
        try:
            start = raw.find('{')
            end   = raw.rfind('}') + 1
            return json.loads(raw[start:end])
        except Exception:
            return {}

