"""
Specialist Router — routes to the right specialist prompt based on language/framework/category.
"""
from typing import Optional

SPECIALIST_MAP = {
    # Python
    ('python', None):           'python',
    ('python', 'django'):       'django',
    ('python', 'flask'):        'python',
    ('python', 'fastapi'):      'python',
    # JavaScript / Node
    ('javascript', None):       'javascript',
    ('javascript', 'react'):    'react',
    ('javascript', 'next'):     'react',
    ('javascript', 'node'):     'nodejs',
    ('javascript', 'express'):  'nodejs',
    # TypeScript
    ('typescript', None):       'typescript',
    ('typescript', 'react'):    'react',
    ('typescript', 'next'):     'react',
    ('typescript', 'node'):     'nodejs',
    ('typescript', 'express'):  'nodejs',
    # SQL
    ('sql', None):              'sql',
    ('postgresql', None):       'sql',
    ('mysql', None):            'sql',
    ('sqlite', None):           'sql',
    # Others — general fallback
    ('java', None):             'general',
    ('csharp', None):           'general',
    ('go', None):               'general',
    ('rust', None):             'general',
    ('ruby', None):             'general',
    ('php', None):              'general',
}

CATEGORY_SPECIALIST_OVERRIDE = {
    'database_error':   'sql',
    'query_error':      'sql',
    'async_error':      'javascript',
    'framework_error':  'general',
    # Node-specific signals
    'stream_error':     'nodejs',
    'event_loop_error': 'nodejs',
}


class SpecialistRouter:
    def route(self, language: str, framework: Optional[str], category: str, confidence: float) -> str:
        lang  = (language or 'unknown').lower()
        fw    = (framework or '').lower() or None

        # Category override takes priority for certain categories
        if category in CATEGORY_SPECIALIST_OVERRIDE:
            return CATEGORY_SPECIALIST_OVERRIDE[category]

        # Exact lang+framework match
        if (lang, fw) in SPECIALIST_MAP:
            return SPECIALIST_MAP[(lang, fw)]

        # Language-only match
        if (lang, None) in SPECIALIST_MAP:
            return SPECIALIST_MAP[(lang, None)]

        # Low-confidence: use general
        if confidence < 0.5:
            return 'general'

        return 'general'
