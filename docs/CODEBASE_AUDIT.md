# NEXUS Codebase Audit

> Baseline static audit from 2026-10-19. Follow-up implementation status for Visual Expert, semantic retrieval, extension routing, and expert-chat polling is recorded in [`DELIVERY_STATUS.md`](DELIVERY_STATUS.md); this baseline is retained as historical audit evidence.

**Checkpoint:** A — repository reconnaissance only  
**Audit date:** 2026-10-19  
**Scope:** Existing source, manifests, configuration templates, docs, migrations, and test files in this workspace. No credentials or `.env` values are reproduced here.

## Executive summary

NEXUS is an existing multi-part application, not a blank project. It contains a CommonJS VS Code extension, a React/Vite dashboard, a Django REST Framework API, PostgreSQL configuration with a pgvector-enabled Docker image, an Ollama client, a LangGraph pipeline with a sequential fallback, ProblemDNA records, Human API sessions, AI response reviews, and a basic Skill Quest flow.

A repository search of the current application code, deployment configuration, and project documentation found no active `WorkLens` branding references. Pasted reference files were excluded from the application audit.

Several features are implemented only in part or are not connected end to end. In particular, the current retrieval implementation is keyword matching; embeddings are disabled and the current ProblemDNA model stores an embedding value as JSON. The repository has no Visual Expert or Advanced Chat workflow, no shared SSO between the extension and dashboard, and no approved internal Git or course-catalog integration. The extension's current user token and the dashboard's browser token are separate. Some dashboard agent/analytics values are hard-coded presentation defaults rather than verified telemetry.

The most important security finding is that `NexusBaseView` sets `AllowAny`, overriding the project-wide authenticated default for NEXUS analysis, guide, history, and related endpoints. The admin user-management APIs and collaboration APIs have explicit permission checks, but the core mentoring endpoints need an authorization review before an enterprise deployment.

No test suite, migration check, server startup, or clean-machine setup was run for this audit. Existing test files cover several API/data paths, but their presence is not treated as a passing test result.

## Classification key

- **Implemented and verified** — source and a validation run confirm the behavior. No feature is given this status in this audit because runtime verification was not performed in this checkpoint.
- **Partially implemented** — there is working-looking source and/or targeted test coverage, but material requirements or integration are absent or not verified.
- **Present but not integrated** — a helper, API, model, or page exists without a complete user-facing or runtime connection.
- **Planned but missing** — no implementation was found in the inspected source.
- **Blocked** — completing it requires authorized infrastructure, credentials, or reference data not present in this checkout.
- **Broken or requiring refactoring** — inspected code/configuration has a concrete security, accuracy, integration, or maintainability concern.

## Post-audit implementation update

This section records changes made after the initial audit. It does not rewrite what was true at the Checkpoint A snapshot. See [`DELIVERY_STATUS.md`](DELIVERY_STATUS.md) for test evidence.

- Core mentor endpoints now require authentication; ProblemDNA reads/writes are owner/admin scoped, and similar retrieval is limited to verified organization records plus the caller's private records.
- Ollama URL/model/timeout and optional gateway key are environment-configurable. User-facing errors avoid returning internal endpoint details.
- Advanced Chat now has Workspace Trust gating, scope preview, path approval, cancellation and bounded file reads; the backend caps and sanitizes supplied related files.
- Extension-to-dashboard handoff now exchanges a hashed, single-use, callback-bound code. Corporate identity-provider SSO remains absent.
- Human API adds developer-side request UI, cancellation state, audit metadata, and participant access to approved shared context. Skill Quest adds an admin-reviewed resource catalogue.
- Approved experts can now edit their own profile skills and availability; expert account creation/approval remains an administrator action.
- Mentor policy coverage now includes deterministic tests and eight adversarial scenario fixtures; these verify prompt policy presence, not model output quality.
- The extension now stores up to 15 visible conversation threads locally, with switching and clearing; selected/approved file contents are not automatically persisted by this feature, and extension-host code context remains session-only. Current/prior chat messages are sanitized before model requests.
- Dashboard and agent pages had sample metric fallbacks removed or relabeled. `Frontend/scripts/vite.mjs` invokes the existing React/Vite configuration through Vite's Node API, avoiding config auto-bundling; the ordinary `npm.cmd run build` and `npm.cmd run dev` commands pass. Dashboard and admin pages returned HTTP 200, and the Vite API proxy reached Django (401 without a token).
- Organization-wide analytics now require staff access, and the backend no longer injects sample counts, categories, or unsupported hours-saved estimates when tables are empty.
- Backend verification currently passes 114 pytest tests, Django system check, and migration consistency. The configured PostgreSQL connection succeeds and has zero pending migrations; pgvector is not installed in that database. The backend Ollama client received a response from local `qwen3:8b`. Extension/webview syntax and VSIX packaging pass. Docker and interactive VS Code Extension Host/browser workflows are not verified.

## Existing stack and boundaries

| Area | Found in repository | Audit status |
|---|---|---|
| VS Code extension | `NEXUS Extension/extension.js`, `package.json`; CommonJS extension host, VS Code webview sidebar, commands, VS Code SecretStorage | Partially implemented |
| Web dashboard | `Frontend/src`; React, Vite, React Router, Recharts; pages for overview, problems, patterns, agents, learning, user management, and Human API | Partially implemented |
| Backend | `Backend/config`, `Backend/apps`; Django REST Framework with SimpleJWT | Partially implemented |
| AI | Ollama `/api/chat` client; LangGraph state graph with sequential fallback; specialist/context/mentor agents and prompts | Partially implemented; local model runtime not verified here |
| Relational database | Django ORM and migrations; PostgreSQL 16 in Compose; SQLite fallback in settings | Present and configured |
| Vector retrieval | pgvector image and extension initialization exist, but embedding generation returns `None` and retrieval is keyword-based | Present but not integrated as vector search |
| File/object storage | No object-storage service or approved document store found | Planned but missing |
| Background jobs | No Celery, task queue, or scheduled worker found; session expiry is evaluated during API access | Planned but missing |
| Knowledge graph | No graph database or graph service found | Planned but missing |
| Human API | Models, APIs, React expert desk, extension discovery/request/chat controls | Partially implemented |
| Visual Expert | No Visual Expert implementation or repository ingestion found | Planned but missing; company repository access is also blocked pending authorized details |
| Skill Quest | Recommendations are derived from repeated recorded problem categories and progress is stored | Partially implemented; no course catalogue found |

## Feature audit

### 1. VS Code extension and chat

**Status: Partially implemented.**

- The manifest declares the `nexus.sidebar` webview, Activity Bar container, sign-in, sign-out, analyze, follow-up, dashboard, and backend URL commands. See [`NEXUS Extension/package.json`](../NEXUS%20Extension/package.json#L1) and [`NEXUS Extension/extension.js`](../NEXUS%20Extension/extension.js#L8).
- Login asks for credentials through VS Code input boxes and stores the access JWT using `context.secrets`. Analysis sends the selected text, nearby lines, diagnostics, file path, and language after the user requests analysis. See [`extension.js`](../NEXUS%20Extension/extension.js#L215) and [`extension.js`](../NEXUS%20Extension/extension.js#L249).
- The sidebar has analysis and follow-up controls, result feedback, expert discovery, and Human API session controls. It has a basic current chat composer, but its visible chat messages are appended in the webview and do not provide conversation switching or durable message history. The backend history endpoint is not called by this extension UI.
- `call_llm_stream()` exists in the backend, but the regular request path uses `stream: false`; extension handling waits for a completed API response. Streaming is present as an unused helper, not an integrated feature.
- No Normal/Advanced Chat switch or approval flow for collecting additional workspace files was found. The analysis path currently sends the selected code and a bounded surrounding excerpt; it does not recursively inspect the workspace.
- The extension's Dashboard action opens a configured external URL. It does not exchange its SecretStorage token for a dashboard session. See [`extension.js`](../NEXUS%20Extension/extension.js#L397).
- VS Code's theme is used by the sidebar CSS, but there is no explicit NEXUS theme switch. Retry, cancellation of in-flight LLM work, persistent conversation switching, and suggested follow-up prompts were not found.

### 2. Dashboard and authentication

**Status: Partially implemented; session sharing is missing.**

- React Router defines protected routes for dashboard, problems, patterns, agent analytics, learning, user management, and Human API. See [`Frontend/src/App.jsx`](../Frontend/src/App.jsx#L15).
- Dashboard authentication stores a JWT in browser `localStorage` under `nexus_token`; the extension stores a separate JWT in VS Code SecretStorage. No SSO provider, secure shared cookie, or token exchange between them was found. See [`Frontend/src/services/api.js`](../Frontend/src/services/api.js#L6) and [`NEXUS Extension/extension.js`](../NEXUS%20Extension/extension.js#L4).
- The dashboard opens in the browser and therefore requires its own sign-in today. This is also stated in the root README.
- Dashboard routes are client-side role gated, and admin user APIs use DRF `IsAdminUser`. Backend authorization remains the actual security boundary and should be reviewed independently of UI visibility.
- The dashboard uses a light-oriented palette and many page-level inline styles. No complete dark/light theme system or switch was found.
- `Dashboard.jsx` substitutes fixed sample values (for example problem totals and hours saved) when API values are missing. `Agents.jsx` also seeds counts, latencies, and a 100% fleet status with fixed values. These should not be presented as live verified analytics. See [`Dashboard.jsx`](../Frontend/src/pages/Dashboard.jsx#L135) and [`Agents.jsx`](../Frontend/src/pages/Agents.jsx#L129).

### 3. Backend APIs, authorization, and identity

**Status: Partially implemented; core endpoint permission configuration requires refactoring.**

- Root URL routes mount auth, NEXUS mentoring, ProblemDNA, analytics, admin user management, and collaboration APIs. See [`Backend/config/urls.py`](../Backend/config/urls.py#L1).
- Project-wide DRF defaults specify JWT authentication and `IsAuthenticated`, but [`NexusBaseView`](../Backend/apps/nexus/views.py#L28) explicitly sets `AllowAny`. This affects its inherited analyze, guide, hint, explain, verify, history, problem-detail, and generator views unless overridden. Treat this as a high-priority authorization finding, not as verified intentional public access.
- Collaboration endpoints use `IsAuthenticated`; user-management views use `IsAdminUser`. Expert checks and session ownership checks are present in collaboration views. See [`Backend/apps/collaboration/views.py`](../Backend/apps/collaboration/views.py#L86) and [`Backend/apps/users/admin_views.py`](../Backend/apps/users/admin_views.py#L87).
- Identity is based on a custom `NexusUser` model with staff/expert profile association. Login is JWT-based; no SSO, issuer/audience validation flow, or dashboard session reuse implementation was found.
- The extension login stores the token but does not call `/api/auth/me/` to establish the identity/role in its UI. Backend authorization still needs to be enforced on every endpoint.

### 4. Ollama, LangGraph, prompts, and AI response handling

**Status: Partially implemented; service configuration is portable for local development, but runtime and enterprise deployment are unverified.**

- The backend client reads `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_NUM_CTX`, and `OLLAMA_NUM_PREDICT`; defaults now use local Ollama and the lower-memory `qwen3:4b` with a 1024-token context and 256-token output cap. Compose uses the internal Ollama service hostname. No company-hosted URL is included in the inspected source/config templates. See [`client.py`](../Backend/ai/llm/client.py#L20), [`settings.py`](../Backend/config/settings.py#L139), and [`docker-compose.yml`](../docker-compose.yml#L20).
- The client makes non-streaming `/api/chat` requests by default, has per-call timeout defaults and some agent-specific timeout overrides, and provides a separate stream helper. A single configurable `OLLAMA_TIMEOUT_SECONDS` setting was not found.
- `NexusOrchestrator` builds LangGraph nodes for context analysis, classification, retrieval, specialist routing, guidance generation, and response validation, and falls back to sequential execution if LangGraph is unavailable. See [`graph.py`](../Backend/ai/orchestrator/graph.py#L76) and [`graph.py`](../Backend/ai/orchestrator/graph.py#L140).
- Existing mentor prompts require educational guidance and prohibit corrected code, while separate document/test/infrastructure/command generator endpoints intentionally generate artifacts. Code-block stripping is applied to selected response fields in `_validate_response`; this is not a comprehensive guarantee against inline or alternate-field code output. Prompt-specific safety tests were not found.
- The sanitizer includes patterns for tokens, credentials, emails, database URLs, and IP:port values, but it is regex-based and only walks specific payload fields. It should not be treated as a complete data-loss-prevention boundary. See [`sanitizer.py`](../Backend/ai/sanitizer.py).
- The previous local Ollama probe found that the configured 8B model fails to allocate CPU memory. This audit did not retry the model or claim the AI runtime is operational.
- Support for an authorized company-hosted Ollama instance is **blocked** until its approved endpoint and any required network/auth details are supplied through server-side configuration. No internal endpoint is recorded in this audit.

### 5. Database, migrations, and ProblemDNA retrieval

**Status: Relational persistence is present; semantic RAG is partially implemented and pgvector use is not integrated.**

- Compose uses `pgvector/pgvector:pg16` and runs `CREATE EXTENSION IF NOT EXISTS vector`; `pgvector` is listed in backend requirements. See [`docker-compose.yml`](../docker-compose.yml#L3), [`001-pgvector.sql`](../Backend/db/init/001-pgvector.sql#L1), and [`requirements.txt`](../Backend/requirements.txt#L8).
- Django settings read `DATABASE_URL` and default to local SQLite if it is not set. The migration set is the authoritative schema.
- Current `ProblemDNA.embedding` is a JSON field, not a pgvector field. `generate_embedding()` returns `None`; `semantic_search.py` documents and implements keyword-overlap scoring over ProblemDNA records rather than vector similarity. See [`models.py`](../Backend/apps/knowledge/models.py#L11), [`embeddings/__init__.py`](../Backend/ai/embeddings/__init__.py#L11), and [`semantic_search.py`](../Backend/ai/retrieval/semantic_search.py#L3).
- ProblemDNA stores category, symptoms, attempts, guidance, scope, verification status, reuse count, and reliability score. Problem/attempt/resolution/context records exist under `apps.nexus`.
- Existing [`docs/DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) claims a 384-dimensional vector embedding, which does not match the current `ProblemDNA` model or disabled embedding helper. The schema documentation is stale on this point.
- No document ingestion pipeline, file chunking/indexing service, reranker, object storage, or knowledge graph was found. Keyword retrieval is the present fallback, not full vector RAG.

### 6. Human API and AI review

**Status: Partially implemented; backend lifecycle and extension/dashboard flows exist, with runtime verification pending.**

- `ExpertProfile`, `AssistanceSession`, `AssistanceMessage`, `SessionFeedback`, `AIResponse`, `AIResponseFeedback`, and `AIResponseReview` models exist. See [`collaboration/models.py`](../Backend/apps/collaboration/models.py#L10).
- APIs support expert discovery, session request, accept/decline, private messages, session feedback, outcome reporting, AI feedback, review queue, claiming, and review outcomes. The Human API dashboard has an expert desk and review actions; the extension exposes expert discovery/request/chat controls.
- Context sharing has an explicit `share_context` field and sanitized approved context. Tests include opt-in sharing and cross-user session isolation cases, but they were not run in this checkpoint.
- Current session states include pending, accepted, declined, closed, and expired. Resolution outcomes include resolved, partially resolved, unresolved, and escalated. There is no separate cancelled status. Pending/idle expiry is computed during API operations; no background scheduler was found.
- Human/API flows have no persistent general audit-event model for all sensitive administrative actions. Notification delivery and robust reconnection/event streaming were not found.
- Expert profile and stats are based on profile fields and recorded NEXUS sessions/reviews. Internal Git contribution verification is explicitly absent in [`docs/HUMAN_API_SKILLQUEST.md`](HUMAN_API_SKILLQUEST.md).

### 7. Skill Quest and learning data

**Status: Partially implemented.**

- The Skill Quest endpoint groups a user's recorded problems, waits for a minimum repeat count, creates generic practice recommendations, and stores progress. The threshold is configurable. See [`collaboration/views.py`](../Backend/apps/collaboration/views.py#L417) and [`collaboration/models.py`](../Backend/apps/collaboration/models.py#L158).
- The React Learning page displays progress and recommendations, and an admin can inspect a selected developer's learning view.
- Recommendations are currently generic activities generated from repeated problem categories. No curated course catalogue, approved internal course links, course verification metadata, or user feedback action specifically for “useful/irrelevant/already known” was found.
- Current evidence is repeated problem records, not a complete analysis of troubleshooting attempts, course progress, or demonstrated mastery. The implementation text appropriately avoids treating one question as a skill deficit.

### 8. Visual Expert and company Git knowledge

**Status: Planned but missing; company source integration is blocked.**

- No Visual Expert selection, persona/knowledge source model, authorized repository ingestion, commit/file citations, ingestion status, or review workflow was found in the application source.
- No `EXPERT_GIT_BASE_URL`, repository, or access-token configuration exists in the inspected templates/source. The authorized company Git URL/repository/access must be supplied before this integration can be built or verified.
- No individual coding-style inference should be assumed from the current expert profiles; the existing Human API profile is separate from Visual Expert.

### 9. Admin governance, analytics, and audit

**Status: Partially implemented; analytics accuracy and audit coverage require refactoring.**

- Staff-only user management APIs and dashboard views exist. Dashboard analytics cover overview, problem categories, resolution status, agent interactions, and developers.
- AI feedback and human review records are separate from the original `AIResponse` record, matching the requirement to preserve an original answer and a reviewer outcome.
- Review claim/outcome APIs and expert UI actions exist, but there is no full administrator governance console for all audit events, source ingestion, knowledge archival/deletion, or prompt release approval.
- Hard-coded fallback KPI and agent telemetry values are a data-integrity risk and should be removed or clearly labelled as sample content before presenting operational analytics.
- `DEBUG=True` and a development-only fallback `SECRET_KEY` are defaults in settings; Compose also defaults DEBUG to true. These are local-development defaults and must not be used for a reachable deployment. See [`settings.py`](../Backend/config/settings.py#L14) and [`docker-compose.yml`](../docker-compose.yml#L51).

### 10. Configuration, portability, and developer setup

**Status: Partially implemented; deployment portability needs a single, documented configuration pass.**

- Root `.env.example` contains placeholder secrets/passwords and local Ollama settings. Root README describes Docker and manual development paths. No real secret value was copied into this audit.
- Ollama URL and model are environment-configurable in Python and Compose. Several service endpoints remain fixed to local defaults or Compose service names as appropriate; the extension has configurable API/dashboard URLs. No `AI_PROVIDER`, configurable service auth, or uniform Ollama timeout variable was found.
- The current `.gitignore` excludes `.env`, dependencies, build output, SQLite files, and logs, but does not exclude `.venv`. `Backend/.venv/` appears in the pre-existing untracked Git status and should be addressed in the portability checkpoint.
- Docker Compose includes PostgreSQL/pgvector, Ollama/model pull, backend, and frontend; no company deployment profile or offline model-import procedure was found.
- Root `README.md` is concise and offers basic startup commands, but does not yet cover complete clean-machine setup, version matrix, role-specific auth, full migration/seed workflow, all offline/network limits, company service access, or rollback/troubleshooting details.
- The Compose model-pull step requires access to the configured model registry on first startup. The repository does not make that model available offline.

## Existing tests and verification state

Test source files found:

- `Backend/tests/test_api.py` — authentication, mentoring API, chat history, and related API cases.
- `Backend/tests/test_problem_dna.py` — ProblemDNA creation, attempts, embedding text, and similarity endpoint cases.
- `Backend/tests/test_verification.py` — verification and resolution cases.
- `Backend/tests/test_collaboration.py` — Human API, review, privacy, and Skill Quest cases.
- Static inspection found 93 `test_*` methods across these four files. This is a source count, not a claim that 93 tests pass.
- No extension test suite, frontend component test suite, or dedicated prompt-safety evaluation file was found.
- Tests, frontend build, Django checks, migrations, Ollama inference, and clean-machine startup were **not run for this Checkpoint A audit**.

## Git/worktree preservation note

Before this audit file was created, `git status --short` showed extensive pre-existing staged, unstaged, deleted, and untracked files across backend, frontend, docs, and the extension, including `Backend/.venv/`. Those changes were not reset, staged, or overwritten. This checkpoint adds only `docs/CODEBASE_AUDIT.md`.

## Audit snapshot note

The classifications above describe the initial Checkpoint A source snapshot; the post-audit update records later code changes. Current verification and remaining work are tracked in [`DELIVERY_STATUS.md`](DELIVERY_STATUS.md), and the complete developer runbook is in [`README.md`](../README.md). The initial audit did not include runtime verification; later checks are reported separately rather than retroactively changing that snapshot.
