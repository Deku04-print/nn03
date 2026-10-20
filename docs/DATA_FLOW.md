# NEXUS data flows

## Developer troubleshooting request

1. The user invokes analysis from the VS Code extension. The current extension gathers the selected text, a bounded surrounding excerpt, diagnostics, file metadata and language. It does not recursively scan the workspace.
2. The extension sends an authenticated request to Django. See `NEXUS Extension/extension.js` and `/api/nexus/analyze/`.
3. The backend prepares the payload, runs its sanitizer and invokes the LangGraph pipeline (or sequential fallback): context analysis, problem classification, similar ProblemDNA lookup, specialist routing, mentor response, response validation.
4. The configured Ollama endpoint receives the LLM prompt and user/context data. It is local by default; company service access is environment-dependent. No external-provider fallback is configured.
5. Django returns the structured response and metadata. User feedback and review are separate actions/endpoints; human corrections are stored separately from the original response.

The extension keeps a bounded local display history (up to 15 threads / 40 messages each) in VS Code webview state. User-entered chat text and AI replies are stored there; selected/approved source files are not stored by the history feature. The extension host retains the selected analysis context only in memory; after host restart, a new analysis is needed for code-specific follow-up. The user-triggered analysis is the current consent boundary for selection/context transmission. Normal Chat sends the selection and bounded nearby excerpt. Advanced Chat requires a trusted workspace, previews eligible names and exact selected paths, then asks for approval before reading. It caps scope at five files and the backend sanitizes/caps again. Sanitization is best-effort, not a guarantee that secrets are removed.

## Dashboard data

The React dashboard calls `/api/auth/`, `/api/analytics/`, `/api/problems/`, `/api/admin/`, and `/api/collaboration/` through its API client. Dashboard JWT is held in browser localStorage. The extension requests a hashed, single-use code bound to an allowlisted callback and opens it in the URL fragment, which is not sent to the web server. The dashboard removes the fragment before exchanging the code and storing the returned access token. Corporate identity-provider SSO is not integrated.

## Human API

1. After analysis, a signed-in developer clicks Human API in the extension, or opens the dashboard Human API page which preselects the most recent analyzed issue. The extension sends the current problem ID and matches available expert profiles against its language, framework and category.
2. Starting a chat asks the developer to confirm sharing the stored, sanitized snippet, diagnostics and NEXUS response. The backend checks problem/response ownership and prepares a concise reason from the recorded issue and AI guidance; the developer does not retype the issue.
3. The backend creates a private pending session. The developer chat opens in the extension immediately. The expert dashboard polls every three seconds and displays an incoming-request dialog while the page is open.
4. The assigned expert accepts or declines. After acceptance, both participants can read/write messages only in that assigned session. The backend checks ownership, roles, state and idle expiry.
5. A human outcome updates the Problem and stores expert evidence in the linked ProblemDNA as private and pending governance review. It is not promoted to organization-wide verified knowledge automatically.
6. AI response review creates a separate record linked to the immutable original response. Experts can claim reviews even while unavailable for new assistance requests; a correction remains distinct from the original answer and is added to private ProblemDNA evidence.

Pending requests can be cancelled by their developer. Expiry is evaluated during API operations, not by a scheduled worker.

## Contextual Visual Expert

1. From a matched expert card, the developer can launch that expert's AI Visual Expert. VS Code shows a separate consent prompt explaining that the saved analyzed snippet, diagnostics and NEXUS guidance will be sent to configured Ollama.
2. The extension passes only owner-scoped problem and expert UUIDs through the allowlisted, short-lived dashboard handoff; code and diagnostics are never placed in a URL.
3. The backend verifies the problem belongs to the signed-in user, retrieves the saved context, adds the selected expert's declared skill profile, and chooses active administrator-approved sources matching the issue/profile (or approved general sources when no exact metadata match exists).
4. The page starts the conversation automatically. The response is labeled AI-generated and does not impersonate the expert. The AI can use only approved sources and cites them. Source/model/network failure is shown instead of inventing human availability or expertise.

## ProblemDNA and Skill Quest

Problem reports/attempts/resolutions and ProblemDNA knowledge are held in PostgreSQL through Django. A local Ollama embedding model can create JSON vectors; the management command backfills existing verified records and hybrid search combines cosine similarity with keyword/language/category/verification scores. Missing vectors fall back to keyword matching. Skill Quest groups the current user's repeated problem categories and persists learning recommendations/progress. It does not currently query an approved course catalog.

## Planned flows and explicit gaps

- Advanced Chat: the extension now enumerates eligible names, lets the user choose up to five, shows exact paths in a modal approval, reads only after approval, supports cancel/clear/return to Normal Chat, and attaches files to the next explicit request. The backend caps and sanitizes contents again. Runtime tests, file-exclusion edge cases and transmission preview remain to be verified.
- Visual Expert: admin enters an approved technical excerpt and source reference -> pending review -> admin approves -> signed-in user chooses sources for a standalone question, or starts a contextual conversation from an analyzed problem -> backend owner-checks/sanitizes context, selects approved references, calls configured Ollama and returns a labeled AI answer with citations. Automatic Git ingestion remains unavailable pending authorized repository details.
- Shared application session: extension identity -> short-lived server-validated one-time code -> dashboard session. The code, never a JWT/password, is placed in the callback fragment and removed before exchange. A corporate identity provider remains unintegrated.
- Team insights: aggregate only authorized metrics and avoid exposing personal chat content. Current reporting needs a privacy and analytics accuracy review.
