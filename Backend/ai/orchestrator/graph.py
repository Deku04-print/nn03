"""
NEXUS AI Orchestrator — LangGraph StateGraph-based pipeline.

Graph:
  analyze_context → classify_problem → retrieve_similar
                                               ↓
                              [low confidence?] → route_specialist (general)
                              [normal]          → route_specialist
                                               ↓
                                      generate_guidance → validate_response
"""
from typing import TypedDict, List, Optional, Annotated
import json
import logging
import operator

logger = logging.getLogger('nexus.ai')


# ── State schema ──────────────────────────────────────────────────────

class NexusState(TypedDict):
    action:           str
    payload:          dict
    user_id:          str
    session_id:       str
    language:         str
    framework:        Optional[str]
    problem_summary:  str
    problem_type:     str
    category:         str
    confidence:       float
    similar_problems: List[dict]
    specialist:       str
    guidance_level:   int
    previous_hints:   List[str]
    attempt_count:    int
    user_message:     str
    conversation_history: List[dict]
    response:         Optional[dict]
    error:            Optional[str]
    enhanced_mode:    bool
    input_type:       str  # 'code', 'todo', or 'text'


# ── Conditional edge helpers ──────────────────────────────────────────

def _route_after_classify(state: NexusState) -> str:
    """
    After classification:
      - Very low confidence → skip retrieval, go straight to specialist routing
        with 'general' so we don't waste time on an empty search.
      - Normal → run retrieval.
    """
    if state.get('error'):
        return 'validate_response'
    if state.get('confidence', 0.0) < 0.30:
        return 'route_specialist'
    return 'retrieve_similar'


def _route_after_retrieve(state: NexusState) -> str:
    if state.get('error'):
        return 'validate_response'
    return 'route_specialist'


def _route_after_specialist(state: NexusState) -> str:
    if state.get('error'):
        return 'validate_response'
    return 'generate_guidance'


# ── Graph builder ─────────────────────────────────────────────────────

def _build_graph(orchestrator):
    """Build and compile the LangGraph StateGraph."""
    try:
        from langgraph.graph import StateGraph, END  # langgraph >= 0.0.26
    except ImportError:
        logger.warning('[NEXUS] langgraph not installed — falling back to sequential steps.')
        return None

    graph = StateGraph(NexusState)

    # Register nodes (each is a bound method on the orchestrator)
    graph.add_node('analyze_context',    orchestrator._analyze_context)
    graph.add_node('classify_problem',   orchestrator._classify_problem)
    graph.add_node('retrieve_similar',   orchestrator._retrieve_similar)
    graph.add_node('route_specialist',   orchestrator._route_specialist)
    graph.add_node('generate_guidance',  orchestrator._generate_guidance)
    graph.add_node('validate_response',  orchestrator._validate_response)

    # Entry point
    graph.set_entry_point('analyze_context')

    # Linear edges
    graph.add_edge('analyze_context', 'classify_problem')

    # Conditional: after classify — skip retrieval if very low confidence
    graph.add_conditional_edges(
        'classify_problem',
        _route_after_classify,
        {
            'retrieve_similar': 'retrieve_similar',
            'route_specialist': 'route_specialist',
            'validate_response': 'validate_response',
        }
    )

    # Conditional: after retrieve — allow error short-circuit
    graph.add_conditional_edges(
        'retrieve_similar',
        _route_after_retrieve,
        {
            'route_specialist': 'route_specialist',
            'validate_response': 'validate_response',
        }
    )

    # Conditional: after specialist routing
    graph.add_conditional_edges(
        'route_specialist',
        _route_after_specialist,
        {
            'generate_guidance': 'generate_guidance',
            'validate_response': 'validate_response',
        }
    )

    # Terminal edges
    graph.add_edge('generate_guidance', 'validate_response')
    graph.add_edge('validate_response', END)

    return graph.compile()


# ── Orchestrator ──────────────────────────────────────────────────────

class NexusOrchestrator:
    """
    Orchestrates the NEXUS AI pipeline via a compiled LangGraph StateGraph.
    Falls back to sequential step execution if langgraph is unavailable.
    """

    def __init__(self):
        from ai.agents.context_analyzer import ContextAnalyzer
        from ai.agents.problem_classifier import ProblemClassifier
        from ai.agents.specialist_router import SpecialistRouter
        from ai.agents.mentor_agent import MentorAgent
        from ai.retrieval.semantic_search import SemanticSearch

        self.analyzer   = ContextAnalyzer()
        self.classifier = ProblemClassifier()
        self.router     = SpecialistRouter()
        self.mentor     = MentorAgent()
        self.retrieval  = SemanticSearch()

        # Try to compile the LangGraph; fall back gracefully if unavailable
        self._graph = _build_graph(self)
        if self._graph:
            logger.info('[NEXUS] LangGraph StateGraph compiled successfully.')
        else:
            logger.info('[NEXUS] Running in sequential fallback mode.')

    # ── Public entry point ────────────────────────────────────────────

    def run(self, action: str, payload: dict, user_id: str, session_id: str) -> dict:
        initial_state: NexusState = {
            'action':           action,
            'payload':          payload,
            'user_id':          user_id,
            'session_id':       session_id,
            'language':         payload.get('language', 'unknown'),
            'framework':        None,
            'problem_summary':  '',
            'problem_type':     'unknown',
            'category':         'unknown',
            'confidence':       0.0,
            'similar_problems': [],
            'specialist':       'general',
            'guidance_level':   int(payload.get('guidance_level', 0)),
            'previous_hints':   list(payload.get('previous_hints', [])),
            'attempt_count':    int(payload.get('attempt_count', 0)),
            'user_message':     str(payload.get('user_message', '')),
            'conversation_history': list(payload.get('conversation_history', [])),
            'response':         None,
            'error':            None,
            'enhanced_mode':    bool(payload.get('enhanced_mode', False)),
            'input_type':       'text',  # will be refined by _analyze_context
        }

        if self._graph:
            try:
                final_state = self._graph.invoke(initial_state)
            except Exception as exc:
                logger.exception(f'[NEXUS] LangGraph execution failed: {exc}')
                final_state = {**initial_state, 'error': str(exc)}
        else:
            final_state = self._run_sequential(initial_state)

        if final_state.get('error'):
            return {
                'success': False,
                'error':   {'code': 'AI_ERROR', 'message': final_state['error']},
            }

        return {
            'success':    True,
            'problem_id': None,
            'response':   final_state['response'],
            'metadata': {
                'problem_category': final_state['category'],
                'problem_type':     final_state['problem_type'],
                'confidence':       final_state['confidence'],
                'specialist':       final_state['specialist'],
                'guidance_level':   final_state['guidance_level'],
                'framework':        final_state.get('framework'),
            },
        }

    def _run_sequential(self, state: NexusState) -> NexusState:
        """Sequential fallback when LangGraph is not available."""
        steps = [
            self._analyze_context,
            self._classify_problem,
            self._retrieve_similar,
            self._route_specialist,
            self._generate_guidance,
            self._validate_response,
        ]
        for step in steps:
            try:
                state = step(state)
                if state.get('error'):
                    break
            except Exception as exc:
                logger.exception(f'[NEXUS] Step {step.__name__} failed: {exc}')
                state['error'] = str(exc)
                break
        return state

    # ── Node implementations (pure state → state) ─────────────────────

    def _analyze_context(self, state: NexusState) -> NexusState:
        result = self.analyzer.analyze(state['payload'])
        state['language']        = result.get('language', state['language'])
        state['framework']       = result.get('framework')
        state['problem_summary'] = result.get('context_summary', '')

        # Use LLM-detected input_type, then apply a deterministic rule-based
        # fallback to ensure correct classification even if the LLM misses it.
        llm_input_type = result.get('input_type', '')
        if llm_input_type in ('code', 'todo', 'text'):
            state['input_type'] = llm_input_type
        else:
            state['input_type'] = self._infer_input_type(state)
        return state

    @staticmethod
    def _infer_input_type(state: NexusState) -> str:
        """Rule-based input_type fallback when the LLM doesn't return a valid value."""
        import re
        user_msg   = state.get('user_message', '').strip()
        code_text  = state.get('payload', {}).get('selection', {}).get('text', '').strip()
        if not code_text:
            code_text = state.get('payload', {}).get('surrounding_code', '').strip()

        # Has real code selected or in file context → treat as code
        if code_text and len(code_text) > 20:
            return 'code'

        # TODO / task keywords
        TODO_PATTERN = re.compile(
            r'\b(TODO|TASK|FEAT|implement|create|build|add|fix|refactor|write|develop|make)\b',
            re.IGNORECASE,
        )
        if TODO_PATTERN.search(user_msg):
            return 'todo'

        return 'text'

    def _classify_problem(self, state: NexusState) -> NexusState:
        code = state['payload'].get('selection', {}).get('text', '').strip()
        if not code:
            code = state['payload'].get('surrounding_code', '').strip()

        result = self.classifier.classify(
            code        = code,
            diagnostics = state['payload'].get('diagnostics', []),
            language    = state['language'],
            summary     = state['problem_summary'],
        )
        state['problem_type'] = result.get('problem_type', 'unknown')
        state['category']     = result.get('category', 'unknown')
        state['confidence']   = result.get('confidence', 0.0)
        return state

    def _retrieve_similar(self, state: NexusState) -> NexusState:
        similar = self.retrieval.search(
            query    = state['problem_summary'],
            language = state['language'],
            category = state['category'],
            top_k    = 3,
            user_id  = state['user_id'],
        )
        state['similar_problems'] = similar
        return state

    def _route_specialist(self, state: NexusState) -> NexusState:
        specialist = self.router.route(
            language   = state['language'],
            framework  = state['framework'],
            category   = state['category'],
            confidence = state['confidence'],
        )
        state['specialist'] = specialist
        return state

    def _generate_guidance(self, state: NexusState) -> NexusState:
        user_msg = state.get('user_message', '')
        conv_history = state.get('conversation_history', [])
        input_type = state.get('input_type', 'text')

        # If there's a user message, use conversational mode
        if user_msg:
            response = self.mentor.generate_conversational(
                user_message         = user_msg,
                conversation_history = conv_history,
                payload              = state['payload'],
                problem_summary      = state['problem_summary'],
                guidance_level       = state['guidance_level'],
                previous_hints       = state['previous_hints'],
                enhanced_mode        = state.get('enhanced_mode', False),
                input_type           = input_type,
            )
        else:
            # Initial ask / structured mode
            response = self.mentor.generate(
                action           = state['action'],
                payload          = state['payload'],
                problem_summary  = state['problem_summary'],
                problem_type     = state['problem_type'],
                category         = state['category'],
                specialist       = state['specialist'],
                similar_problems = state['similar_problems'],
                guidance_level   = state['guidance_level'],
                previous_hints   = state['previous_hints'],
                attempt_count    = state['attempt_count'],
                enhanced_mode    = state.get('enhanced_mode', False),
                input_type       = input_type,
            )
        state['response']       = response
        state['guidance_level'] = response.get('guidance_level', state['guidance_level'])
        return state

    def _validate_response(self, state: NexusState) -> NexusState:
        r = state.get('response') or {}
        # Ensure required fields exist
        for field in ['observation', 'question']:
            if field not in r:
                r[field] = ''
        # Strip code blocks — enforce no-direct-solution rule
        for field in ['observation', 'question', 'hint', 'message', 'insight']:
            if field in r and isinstance(r[field], str):
                r[field] = self._strip_code_blocks(r[field])
        for field in ['next_steps', 'suggestions']:
            if isinstance(r.get(field), list):
                r[field] = [self._strip_code_blocks(item) if isinstance(item, str) else item for item in r[field]]
        state['response'] = r
        return state

    @staticmethod
    def _strip_code_blocks(text: str) -> str:
        """Remove markdown code blocks to prevent direct code solutions."""
        import re
        return re.sub(r'```[\s\S]*?```', '[code omitted — reason through it first]', text)
