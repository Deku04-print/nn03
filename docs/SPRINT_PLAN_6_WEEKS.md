# NEXUS six-week sprint plan

Planning periods retain the requested labels **Sprint 0, Sprint 1, Sprint 2, Sprint 3, Sprint 4, Sprint 5**. Week labels below are planning estimates. Statuses are current as of 2026-10-19 and are not claims of historical delivery.

## Status definitions and evidence

- **Not Started:** no implementation work verified for the task.
- **In Progress:** artifacts exist, but acceptance requirements or verification remain.
- **Blocked:** required authorized service, repository, identity provider or reference data is unavailable.
- **Verified Complete:** acceptance behavior was run and evidence is recorded.

The repository baseline and initial gaps come from [`CODEBASE_AUDIT.md`](CODEBASE_AUDIT.md). Work and verification completed after that audit are recorded in [`DELIVERY_STATUS.md`](DELIVERY_STATUS.md). Existing PPT/market-analysis artifacts are not evidenced in this repository and are not recorded as completed.

## Sprint 0 — Incubation and product definition (Week 0)

**Objective:** validate product direction and boundaries for a developer mentor, expert escalation, Visual Expert, ProblemDNA and learning recommendations.

| Team | Tasks and paths | Dependencies | Acceptance, tests and demo evidence | Status |
| --- | --- | --- | --- | --- |
| Frontend | Map developer journeys and sketch extension/dashboard navigation; review `NEXUS Extension/extension.js`, `Frontend/src/App.jsx`. | Product decisions and developer workflow input. | Reviewed flow map; keyboard/accessibility criteria; walkthrough of current UX and gaps. | In Progress (repository review); design artifact not verified |
| Backend | Define existing API boundaries and identity/session concepts in `docs/API_DESIGN.md`, `docs/ARCHITECTURE.md`. | Existing Django model/view inventory. | Each current route group and auth boundary documented; permission findings linked. | In Progress |
| DevOps and Testing | Record prerequisites, environments, quality gates and data handling in `README.md`, `docs/SECURITY_AND_PRIVACY.md`. | Approved workstation constraints. | Fresh setup checklist can be followed; secret handling and external dependencies explicit. | In Progress |
| AI/ML | Map Ollama, LangGraph, prompts, keyword retrieval and evaluation gaps in `docs/CODEBASE_AUDIT.md`. | Local model and source inventory. | Pipeline nodes, limits and no-cloud fallback documented; no fabricated model results. | In Progress |

**Risks/blockers:** internal company services/course content are not provided; no claims about incubation deck or market analysis without artifacts. **Demo:** architecture diagram plus a list of verified gaps.

## Sprint 1 — Project initialization, wireframes and authentication (Week 1)

**Objective:** stabilize reproducible local development and document existing authentication/UI contracts.

| Team | Tasks and paths | Dependencies | Acceptance, tests and demo evidence | Status |
| --- | --- | --- | --- | --- |
| Frontend | Verify and refine shared shell/login/navigation; `Frontend/src/App.jsx`, `Frontend/src/components/Layout.jsx`, `Frontend/src/pages/Login.jsx`. | Auth/API contract from Backend. | Role-specific routes and useful loading/error states; build and auth walkthrough recorded. | In Progress |
| Backend | Inspect/fix auth and user roles; `Backend/apps/users/`, `Backend/config/settings.py`, `Backend/config/urls.py`. | User/role policy. | Login/me/refresh and server-side role permissions covered by API tests. | In Progress; authentication tests pass; production identity setup remains |
| DevOps and Testing | Provide local setup, env templates and smoke commands; `README.md`, `.env.example`, `Backend/.env.example`, `.gitignore`. | Supported Python/Postgres/Ollama versions. | Clean-machine install and smoke test evidence; no committed secret. | In Progress |
| AI/ML | Verify current Ollama setup and guided response contract; `Backend/ai/llm/client.py`, `Backend/ai/prompts/specialists.py`, `Backend/ai/orchestrator/graph.py`. | Ollama/model availability. | Configured service connection, failure behavior and prompt cases recorded. | In Progress; local qwen3:8b inference verified, corporate-hosted endpoint not supplied |

**Dependencies:** Backend permissions precede role-sensitive UI; Ollama and PostgreSQL need local access. **Demo evidence:** login + API checks from synthetic accounts and successful local AI request. **Risks:** sample dashboard values can misrepresent actual telemetry.

## Sprint 2 — Shared UI, administration, experts and foundational APIs (Week 2)

**Objective:** align reusable interfaces with real backend contracts and close the first authorization gaps.

| Team | Tasks and paths | Dependencies | Acceptance, tests and demo evidence | Status |
| --- | --- | --- | --- | --- |
| Frontend | Reusable components, theme/accessibility foundations; admin/expert workflows `Frontend/src/components/`, `Frontend/src/pages/UserManagement.jsx`, `Frontend/src/pages/HumanAPI.jsx`, `Frontend/src/index.css`. | Confirmed API contracts and role rules. | Responsive admin/expert views, consent labels, empty/error states; UI smoke and keyboard evidence. | In Progress (current UI exists; redesign incomplete) |
| Backend | User/expert profile, skills/availability and session endpoints `Backend/apps/users/`, `Backend/apps/collaboration/`. | State transitions and expert role policy. | Ownership, capacity and transition API tests pass; migrations have rollback notes. | In Progress |
| DevOps and Testing | API contract, auth isolation, configuration tests; `Backend/tests/test_api.py`, `Backend/tests/test_collaboration.py`. | Stable endpoint schemas. | Unauthorized, role-denied and cross-user cases execute and results are recorded. | In Progress; 114 backend tests pass; `npm.cmd run build` passes; local HTTP smoke checks pass; interactive browser/Extension Host verification pending |
| AI/ML | Define response metadata/source fields for review and approved retrieval; `Backend/ai/orchestrator/`, `Backend/apps/collaboration/models.py`. | Backend response persistence contract. | Original AI response remains immutable; metadata does not store unrestricted source by default. | In Progress |

**Demo evidence:** synthetic expert discovery/request/accept/message path plus denied cross-user access. **Risks:** no universal audit-event model, notifications or background expiry worker.

## Sprint 3 — AI services, Visual Expert, RAG and Skill Quest (Week 3)

**Objective:** improve the existing AI system, ground retrieval claims in actual storage, and build only authorized knowledge/learning sources.

| Team | Tasks and paths | Dependencies | Acceptance, tests and demo evidence | Status |
| --- | --- | --- | --- | --- |
| Frontend | Visual Expert selection, Skill Quest evidence and progress views; `Frontend/src/pages/Learning.jsx`, new approved-source UI only after API contract. | Backend source/catalog schemas. | Recommendations show evidence and can be corrected/dismissed; no invented course/verification data. | In Progress (basic learning UI exists); Visual Expert blocked |
| Backend | Source/catalog APIs and review metadata; `Backend/apps/knowledge/`, `Backend/apps/collaboration/`. | Approved Git endpoint, credentials, course catalogue and retention policy. | Source access is server-side and scoped; CRUD role tests and deletion flow pass. | Blocked (company source/catalog details) |
| DevOps and Testing | Ollama connectivity, retrieval failure, auth and ingestion security checks; `Backend/tests/`, configuration docs. | Runnable local model, source allowlist. | Model errors classified; unauthorized source and secret exclusion tests recorded. | Not Started |
| AI/ML | Guided troubleshooting evals; inspect `Backend/ai/llm/`, `Backend/ai/prompts/`, `Backend/ai/retrieval/`, `Backend/ai/embeddings/`. | Evaluation cases and chosen embedding model if vector restored. | Evidence/uncertainty marked; no code solution in mentor mode; retrieval only from approved, verified records. | In Progress; embeddings disabled |

**Dependencies/risks:** vector dimension/model/index decision and safe migration; authorized company Git and course data. Do not start ingestion without rights and exclusions. **Demo evidence:** local synthetic ProblemDNA query and honest keyword-based explanation; Visual Expert shown as roadmap until source access exists.

## Sprint 4 — Integration, Human API and end-to-end workflows (Week 4)

**Objective:** connect extension/dashboard/API without weakening consent or session isolation.

| Team | Tasks and paths | Dependencies | Acceptance, tests and demo evidence | Status |
| --- | --- | --- | --- | --- |
| Frontend | Extension chat states, Human API request flow, safe context preview, Normal/Advanced controls; `NEXUS Extension/extension.js`, `Frontend/src/pages/HumanAPI.jsx`. | Context preview API, reviewed auth, finalized APIs. | Advanced mode previews exact scope, supports selection/approval/cancel; extension navigation uses approved one-time code exchange. | In Progress; syntax passes, interactive tests remain |
| Backend | Session lifecycle, consent, private messages, expiry, shared auth design; `Backend/apps/collaboration/`, `Backend/apps/users/`, `Backend/config/`. | Approved identity provider or architecture decision. | Server rejects invalid transitions/expired sessions and cross-participant access; no credentials in URL. | In Progress |
| DevOps and Testing | Extension-to-API/dashboard E2E, reconnect/timeout and role tests. | Extension host and services available. | Reproducible scripted scenarios for developer, expert and admin with logs/screenshots redacted. | In Progress; backend tests pass, browser E2E pending |
| AI/ML | Pass approved problem context and retrieved knowledge; persist review metadata. | Backend consent/data contract. | No silent context expansion; model uncertainty/escalation behavior shown with evaluations. | In Progress |

**Risks:** SSO provider and event delivery are unknown; no realtime transport was found. **Demo evidence:** only flows that passed isolation and consent tests.

## Sprint 5 — Governance, analytics, final integration and demo (Week 5)

**Objective:** close governance, verify clean setup, and present only tested capability.

| Team | Tasks and paths | Dependencies | Acceptance, tests and demo evidence | Status |
| --- | --- | --- | --- | --- |
| Frontend | Remove/label fallback analytics; finish themes, feedback/inactivity UX; `Frontend/src/pages/Dashboard.jsx`, `Frontend/src/pages/Agents.jsx`, `Frontend/src/index.css`, extension webview. | Verified API telemetry and design. | No synthetic values appear as live metrics; timers clean up; keyboard/theme/empty-state checks pass. | In Progress; fake KPI/latency defaults removed; `npm.cmd run build` and VSIX packaging pass; HTTP smoke checks pass; browser verification pending |
| Backend | Audit trail, knowledge approval/archive, feedback/review/admin controls; `Backend/apps/collaboration/`, `Backend/apps/knowledge/`, `Backend/apps/analytics/`. | Retention/access policy. | Sensitive admin operations audited; validated knowledge has source/status/scope; deletion/rollback tested. | In Progress (partial models/API) |
| DevOps and Testing | Regression, builds, clean-machine setup, deployment/rollback docs and evidence workbook. | Stable release candidate and external services. | Backend tests, frontend build, extension packaging, migration check and setup walkthrough results recorded separately. | In Progress; backend checks, `npm.cmd run build`, Vite/Django HTTP smoke checks, PostgreSQL connection/migration plan, local Ollama inference and VSIX packaging pass; Docker and Extension Host verification pending |
| AI/ML | Prompt/retrieval/Skill Quest evaluation and review feedback analysis. | Approved test cases and grounded data. | Evaluations reproducible; no unreviewed feedback auto-trains model/prompts; known limits disclosed. | Not Started |

**Demo:** follow `DEMO_SCRIPT.md`, mark all unverified or blocked items, and use synthetic data. **Risks:** schedule depends on company identity, Git, training and model access decisions.

## Cross-sprint task and risk register

| ID | Sprint | Team | Task | Existing / planned paths | Priority / effort estimate | Acceptance and test evidence | Dependency / risk | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-01 | 1–2 | Backend + DevOps/Testing | Resolve `NexusBaseView` permission override and add auth/ownership tests. | `Backend/apps/nexus/views.py`, `Backend/tests/test_api.py` | Critical / 2–4 days estimate | Anonymous request denied; authenticated owner permitted; role/object tests pass. | Confirm any intentionally public route. | Verified Complete (114-test suite) |
| CFG-01 | 1 | DevOps/Testing | Validate env and local setup. | `.env.example`, `Backend/.env.example`, `README.md`, settings/client | High / 1–2 days estimate | Clean Windows/local startup recorded. | Local services. | In Progress |
| EXT-01 | 4 | Frontend | Add permission-controlled Advanced Chat. | `NEXUS Extension/extension.js` | High / 4–6 days estimate | Scope preview, exclusions, user approve/reject/narrow/cancel and transmission preview tests. | API/context design. | In Progress (syntax passes; interactive tests pending) |
| EXT-02 | 4 | Frontend | Implement local thread history, switching, timestamps and clearing; sanitize prior turns on the existing conversation API. | `NEXUS Extension/extension.js`, `NEXUS Extension/README.md`, `Backend/ai/sanitizer.py` | High / 2?4 days estimate | Up to 15 local threads/40 turns; selected/approved source payloads are not saved by history; Extension Host interactions tested. | VS Code webview state; extension context remains session-only. | In Progress (implementation, syntax and package verified; Extension Host interaction pending) |
| SSO-01 | 4 | Backend + Frontend | Implement application dashboard session reuse. | `Backend/apps/users/`, extension dashboard command, dashboard auth | High / 4–8 days estimate | Secure one-time exchange/session reuse, expiry/replay/origin tests. | Corporate identity provider decision for enterprise SSO. | In Progress (114 tests include exchange safeguards) |
| HUM-01 | 2–5 | Backend + Frontend | Complete Human API lifecycle/audit and E2E isolation. | `Backend/apps/collaboration/`, `Frontend/src/pages/HumanAPI.jsx`, extension | High / 5–8 days estimate | State transition, expiry, context consent, privacy, feedback scenarios pass. | Notification/realtime decision. | In Progress (backend tests pass; browser E2E remains) |
| AI-01 | 3–5 | AI/ML + Backend | Add grounded mentor evaluation and reviewed ProblemDNA reuse. | `Backend/ai/`, `Backend/apps/knowledge/`, `Backend/tests/evaluation/` | High / 5–10 days estimate | Prompt cases pass; only approved verified sources reused. | Embedding choice for semantic RAG. | In Progress |
| VE-01 | 3–4 | AI/ML + Backend | Visual Expert over approved company knowledge. | New integration under `Backend/apps/knowledge/` | High / 5–10 days estimate | Citations point to authorized sources; deletion/exclusions tested. | **Blocked:** company Git URL, repo, access and source policy. | Blocked |
| SQ-01 | 3–5 | Backend + AI/ML + Frontend | Learning catalog, evidence and progress feedback. | `Backend/apps/collaboration/`, `Frontend/src/pages/Learning.jsx` | Medium / 3–6 days estimate | Recommendations show evidence, provenance, progress and dismiss/useful action. | **Blocked:** approved internal course data. | In Progress (catalog model/admin/API added) |
| ANA-01 | 5 | Frontend + Backend | Correct dashboard metric fallbacks and aggregate governance. | `Frontend/src/pages/Dashboard.jsx`, `Agents.jsx`, analytics app | High / 2–4 days estimate | Missing values render unavailable/empty; all displayed counts trace to API. | Analytics definitions. | In Progress; placeholder metrics removed; npm production build and HTTP smoke pass, browser interaction check pending |
| REL-01 | 5 | DevOps/Testing | Verify migrations, build, clean install and demo. | all runtime components; `README.md`, `DELIVERY_STATUS.md` | High / 3–5 days estimate | Commands, results, date and blockers recorded. | Docker/local DB/Ollama availability. | In Progress (114 backend tests, frontend build/dev HTTP smoke, PostgreSQL connection (zero pending migrations), Ollama qwen3:8b inference and VSIX package pass; Docker/Extension Host checks pending) |

Effort values are estimates for planning, not time tracking or committed delivery dates.
