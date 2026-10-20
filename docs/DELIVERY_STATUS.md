# NEXUS delivery status

**Status date:** 2026-10-20  
**Scope:** Checkpoints A through H were progressed in order. “Verified Complete” is reserved for behavior with recorded execution evidence. The listed sprint labels remain Sprint 0 through Sprint 5.

## Checkpoint status

| Checkpoint | Status | Evidence and remaining work |
| --- | --- | --- |
| A — Repository audit | Verified Complete (static audit) | [`CODEBASE_AUDIT.md`](CODEBASE_AUDIT.md) records stack, routes, models, gaps and source evidence. This was a source review, not a runtime audit. |
| B — Portability | In Progress | Added root and backend environment templates, ignore rules, configurable Ollama timeout/model/URL and safer user-facing errors, and setup instructions. Django/PostgreSQL local connectivity and Ollama request checks pass; Docker Compose is unavailable here. |
| C — Architecture and planning | Verified Complete (documentation artifacts) | Architecture, data-flow, API, schema, security, six-sprint plans, team responsibilities, demo plan and five-sheet workbook created. Workbook regenerated/validated after implementation updates. |
| D — Extension and session UX | In Progress | Normal/Advanced chat scope approval, bounded file selection, cancellation/clear, suggested follow-ups, Human API/Skill Quest/Visual Expert entry points and one-time dashboard session exchange implemented. Extension and embedded webview JavaScript syntax pass. Bounded local conversation history, switching, thread titles and clear-history controls are implemented in webview state; extension-host code context is session-only. Separate theme controls and Extension Host UI tests remain. |
| E — Human API and governance | In Progress | Extension discovers experts from the active problem, confirms sharing the stored sanitized snippet/diagnostics/AI answer, creates the request without a repeat explanation form, and opens session chat. Expert dashboard polls and displays an incoming-request dialog; experts can review flagged AI answers even when unavailable for new chats. Human outcomes remain private ProblemDNA evidence pending governance review. WebSocket push, scheduled expiry, production hardening and browser E2E remain. |
| F — AI, Visual Expert and ProblemDNA | In Progress | Existing Ollama/LangGraph retained; hybrid Ollama-embedding/cosine plus keyword retrieval and a backfill command are implemented with keyword fallback. Visual Expert supports contextual launch from an analyzed problem, owner-checked saved context, selected expert skill routing, automatic question framing, citations and approved-source use. Automatic company Git ingestion remains blocked on authorized host/repository/policy details. |
| G — Skill Quest | In Progress | Personal category-based recommendations and feedback/progress exist; added admin-reviewed learning resource catalogue and links. Real course catalogue and broader evidence quality depend on approved source data. |
| H - Verification and delivery | In Progress | The current backend suite passes 124 tests. Migration 0004 widens the one-time dashboard destination field for contextual Visual Expert handoff. The current frontend production build, extension syntax, and Python syntax checks pass. Live Ollama context handoff, two-user notification/chat, Docker, and interactive Extension Host behavior remain unverified. |

## Implemented in this pass

- Configurable Ollama URL, model, timeout and optional server-side gateway bearer token; upstream errors are mapped to user-safe messages.
- Secret-free `.env.example` files, `.gitignore` protections and root setup guide.
- Advanced Chat file-scope selection with Workspace Trust, exclusions, path review, bounded reads and explicit approval. The user must still issue a separate analysis message before selected files are sent.
- Authenticated NEXUS endpoints and owner/admin scope on ProblemDNA APIs; retrieval no longer uses a process-local cache that can mix user-private records.
- Human API cancellation/audit metadata, developer dashboard workflow, expert profile self-service, context visibility for participants, and approved resource catalogue.
- Hashed, 45-second default, one-time extension-to-dashboard exchange codes bound to callback URI and matching Origin. Codes travel in the URL fragment, then are cleared before exchange. This is application session reuse; corporate identity-provider SSO is not implemented.
- Route-level lazy loading for dashboard areas; Vite API launcher runs the configured React/Vite build without config auto-bundling; it emits per-page chunks instead of a single 1 MB initial JavaScript bundle.
- Inactivity feedback reminder resets when the user interacts with chat and includes a dismiss action.
- Local conversation history stores visible chat turns/results, supports switching and clearing, and passes recent user/assistant turns to the existing backend conversation field.
- Additional backend tests for code expiry, one-time use, and rejected callback origins.
- Added eight prompt-policy regression tests and eight adversarial scenario fixtures covering complete-code requests, missing context, incorrect assumptions, cross-file/inheritance context, repeated failure, sensitive input, and human escalation. These assert prompt policy and fixture coverage; model-generated response evaluation remains pending.
- Added the Visual Expert dashboard page, admin-only source curation/review APIs, AI-labeled multi-turn answers with citations, and extension dashboard navigation.
- Added configurable local Ollama embeddings (`EMBEDDING_MODEL`) with JSON vector persistence, cosine plus keyword ranking, keyword fallback, and a `rebuild_embeddings` backfill command. The PostgreSQL pgvector server extension is not required for this implementation.
- Reduced Human API browser and extension message refresh to three seconds; this remains polling rather than push/WebSocket delivery.
- Contextual Human API matching, explicit one-click consent for saved sanitized context, auto-written case summaries, expert arrival dialog, per-expert Visual Expert launch, and private pending ProblemDNA evidence for human outcomes/reviews.
- Widened the dashboard one-time-code destination column through migration `0004_widen_dashboard_next_path`; the contextual Visual Expert route exceeded the previous 40-character database limit.

## Verification evidence

| Check | Result |
| --- | --- |
| `python manage.py check` | Passed (0 issues). |
| `python manage.py makemigrations --check --dry-run` | Passed: no model changes missing from migrations. |
| `python -m pytest --ds=config.settings -q` | Passed: 124 tests, including contextual Human API, Visual Expert handoff and validated dashboard route coverage. |
| `python manage.py makemigrations --check --dry-run` | Passed: no model changes missing from the additive migrations. |
| `npm.cmd run build` | Passed: Visual Expert and Human API page chunks compiled. |
| `node --check extension.js` | Passed. |
| `node --check "NEXUS Extension/extension.js"` and embedded webview script parse | Passed. |
| `npm run package` in `NEXUS Extension` with output directed to a temporary file | Passed; VSIX includes the manifest, README, extension code, and icon. Packaging warns that repository metadata and a license file are absent; neither was fabricated. |
| `npm run build` (`Frontend/scripts/vite.mjs`) | Passed; 857 modules transformed and page chunks emitted. |
| `npm run dev` and HTTP smoke checks | Passed: dashboard and Django admin return HTTP 200; Vite `/api/auth/me/` proxy reaches Django and returns expected 401 without a token. |
| PostgreSQL connection and migration plan | Passed: configured PostgreSQL connection succeeds; 0 pending migrations. pgvector extension is not installed in the configured database. |
| Ollama local inference | Passed: backend Ollama client returned a response from local `qwen3:8b`. |
| Docker Compose startup | Not run; Docker executable is not installed here. |

The suite originally found five stale expectations for unauthenticated access. Tests were updated to authenticate or retain authenticated requests in line with the new server-side access policy. No access checks were loosened to satisfy tests.

## Blockers and honest limitations

- Automatic Visual Expert repository ingestion requires the authorized Git host/repository, scoped access method, exclusions, and source/retention policy. Admin-curated excerpts work now; nothing was guessed or cloned.
- Skill Quest has no verified course catalogue yet. Administrators can create resources in Django admin; each resource must be approved before it is returned by recommendation APIs.
- No corporate identity provider was supplied. Current dashboard handoff reuses the NEXUS application session with a one-time code but does not implement enterprise SSO, refresh, or logout coordination.
- Semantic retrieval code is implemented, but this pass did not install or run `nomic-embed-text` or backfill live records. Until that is done, records without vectors use keyword matching. Embeddings are stored as JSON, not a pgvector column.
- Visible conversation messages/results are retained locally in VS Code webview state (up to 15 threads and 40 messages per thread), with switching and clear-history controls. Code context remains in extension-host memory and is not restored after restart. Streaming, stop-generation, explicit theme switching, and full inactivity-feedback tests remain. The 4.5-minute feedback reminder now resets on chat interaction and can be dismissed. Current and prior user/assistant messages are sanitized server-side before model requests.
- Human API updates are polled. There is no notification queue or scheduled session-expiry worker; backend operations enforce expiry.
- No production security review or live multi-role browser end-to-end run was performed.

## Change and verification log

| Date | Checkpoint | Work and evidence |
| --- | --- | --- |
| 2026-10-19 | A | Audited actual repository and wrote source-based feature classification. |
| 2026-10-19 | B | Added configuration/docs and passed Django system check. |
| 2026-10-19 | C | Wrote architecture/data-flow/API/security/schema/sprint artifacts and generated workbook. |
| 2026-10-19 | D | Added Advanced Chat permission path, extension navigation and session exchange; extension syntax passed. |
| 2026-10-19 | E | Added Human API cancellation/audit and developer flow; tests pass. |
| 2026-10-19 | F | Tightened AI guidance and API/data access; current retrieval remains keyword-only. |
| 2026-10-19 | G | Added reviewed learning-resource catalogue and user progress/feedback states. |
| 2026-10-19 | H | 114 backend tests, Django check, migration consistency, extension/webview syntax and VSIX packaging pass; `npm.cmd run build`, `npm.cmd run dev`, PostgreSQL connectivity/migration plan and local Ollama inference pass; Docker and interactive Extension Host/browser checks remain unavailable. |
| 2026-10-20 | F/E/H | Added Visual Expert UI and reviewed-source APIs, local Ollama embedding support/backfill and three-second Human API polling; 118 backend tests, Django checks, migration consistency, frontend build and extension syntax pass. Live embedding model, Docker and browser/Extension Host flows remain unverified. |
