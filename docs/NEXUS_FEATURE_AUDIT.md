# NEXUS feature audit

Inspected 22 October 2026 before implementation. Existing uncommitted changes are in the development SQLite database, tracked Python caches, and tracked frontend dependencies. Preserve them; do not reset or migrate the original database during verification.

## Actual implementation and flow

- Extension: `NEXUS Extension/extension.js` registers commands, `src/commands/worklensCommand.js` captures and sanitizes context, `src/api/worklensApi.js` sends JWT authenticated troubleshooting requests and retains session/problem IDs. Tokens use VS Code SecretStorage. `src/ui/worklensPanel.js`/`webview.js` and `media/worklens.js`/`.css` render chat. `src/storage/chatHistoryManager.js` writes workspace-local transcripts; these are not shared chat persistence. New-chat currently resets only the UI, and restoring local history does not restore backend IDs.
- Browser: Vite/React, port 3456, custom CSS, React Router (`Frontend/src/App.jsx`). `services/api.js` keeps JWTs in localStorage; `hooks/useAuth.jsx` rejects non-admin login. `components/Layout.jsx` exposes admin navigation to everyone who gets through. Dashboard, Problems, Patterns, Agents, Learning, UserManagement are admin-oriented.
- Backend: Django 4.2, DRF, SimpleJWT; `config/{settings,urls}.py`; `apps/users` custom UUID/email user with independent staff and active flags, batch/sub-batch, no expert profile. Existing admin APIs require staff. `apps/worklens` owns WorkLensSession, Problem, one-to-one ProblemContext, Attempt and ProblemResolution. `apps/knowledge` owns one-to-one ProblemDNA and verification. `apps/agents.AgentInteraction` logs truncated summaries, not exact chat messages. Migrations are applied through users 0002, worklens 0002, knowledge 0004, agents 0002.
- AI: `ai/orchestrator/graph.py` routes context/classifier/retrieval/specialist/mentor with LangGraph. `ai/llm/client.py` calls configurable company Ollama/Qwen. **Contrary to the supplied assumptions, embeddings are disabled in `ai/embeddings/__init__.py`; retrieval is keyword fallback, not working EmbeddingGemma ingestion.** Preserve this implementation; do not invent a replacement integration. Visual Expert can reuse the existing keyword scorer and LLM client with an explicitly approved, expert-scoped corpus.
- Architecture: supplied `docs/ARCHITECTURE.mmd` matches extension -> DRF/JWT -> orchestrator -> relational/ProblemDNA and SecretStorage. It does not contain live transport or expert services. No additional image diagram was supplied.
- Read-only SQLite inspection: one user; zero sessions/problems/contexts/DNA/agent interactions. No expert records or approved employee knowledge. No Git contribution fetcher/integration was found.
- Security defects blocking safe user access: core mentor endpoints permit anonymous fallback to a shared dev user; analytics and knowledge APIs allow anonymous access to organization-wide data. Secure these before exposing ordinary-user routes. Existing conversational terminal instructions also request precise code edits despite the mentoring policy; apply only the narrow policy correction.
- Assets: extension references missing `media/logo1.png`, `name_tag.png`, and manifest `icon.png`; only worklens-icon.svg exists. Frontend uses inline logos, no missing image imports found.

## Baseline checks

- Django check passes. 86 existing tests run: 84 pass, one error and one failure caused by accepting invalid diagnostic severity. Fix validation while retaining numeric VS Code severity normalization.
- Frontend build fails on missing `hooks/usePolling.js`; implementation was accidentally stored in `hooks/useAuth.js`. UserManagement also imports nonexistent `utils/errors` (actual file is `utils/error.js`).
- Extension test script points to absent `test/runTest.js`; JavaScript needs no compilation. Add meaningful Node tests and syntax checks.

## Planned incremental changes

Modify core views/serializers only to enforce authentication/ownership, reuse problems on follow-up, persist exact successful AI turns, and expose response IDs. Keep existing response fields, prompts (except narrow policy fix), models/provider/orchestrator and evaluation contracts.

New `apps/assistance` module is required: expert profile (one-to-one existing user, approved skills, organization status separate from availability, demo marker, verified Git metadata); immutable admin audit; approved expert knowledge references (optionally existing DNA); exact AI turns and feedback; escalation case (one-to-one existing Problem); separate human/visual sessions and messages; session feedback; per-recipient notifications; short-lived browser handoff records. No duplicate ProblemDNA, user database, or vector infrastructure. Add one reversible additive migration referencing existing tables.

Browser handoff: browser generates a proof secret, polls a public random handoff ID, extension approves that ID using existing JWT, browser exchanges its proof in a POST body for its own JWT. URL carries only a non-authorizing ID, no token/secret. Expiration, single use, and destination validation required.

Transport: no existing realtime infrastructure or Channels dependency. Use automatic authenticated 2-second polling for chat and 10-second polling for notifications, with reconnection/error states, server persistence, idempotency, and lifecycle checks. Document latency honestly; no Redis/WebSocket infrastructure is needed.

Frontend changes: separate protected discovery/chat routes, new personal dashboard, role guards and restricted nav, staff expert settings in existing UserManagement. Extension changes: configurable response-count CTA, exact-response ratings, notification bell, browser handoff, conversation restore/reset fixes and local SVG placeholders. New idempotent demo command and tests, `.env.example`, root README, company handover and changed-file manifest.

## Required verification

Test admin/user/expert permissions, mixed roles, matching, status audit, approved-only Visual Expert retrieval, source references, AI response IDs/feedback/threshold/deduplication, handoff expiration/replay/proof, two-user polling lifecycle/message persistence and third-user denial, end/feedback/retry behavior, notification privacy, own-dashboard filtering. Apply and reverse new migration on a temporary copy of the database; never reset original data. Run full Django suite/check/migration drift, frontend production build, extension Node tests/syntax checks and asset resolution. Company Ollama generation and interactive two-machine VS Code/browser demo require company-network access and must be reported separately from mocked/local tests.
