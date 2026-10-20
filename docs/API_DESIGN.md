# NEXUS API design inventory

This is an inventory of the existing route prefixes and a target contract direction, not a claim that all endpoints have been tested. Exact request/response schemas are defined by serializers and views under `Backend/apps/`.

## Existing route groups

| Prefix | Current purpose | Source |
| --- | --- | --- |
| `/api/auth/` | register, JWT login/refresh, current identity | `Backend/apps/users/urls.py` |
| `/api/nexus/` | analyze, guide, hint, explain, verify, history, problem detail, document/test/infrastructure/command generators | `Backend/apps/nexus/urls.py` |
| `/api/problems/` | ProblemDNA list/detail, analytics, similar search, attempts | `Backend/apps/knowledge/urls.py` |
| `/api/analytics/` | dashboard metrics and developer/agent analytics | `Backend/apps/analytics/urls.py` |
| `/api/admin/` | admin user management | `Backend/apps/users/admin_urls.py` |
| `/api/collaboration/` | AI feedback/reviews, experts, assistance sessions/messages/outcomes, Skill Quest/progress | `Backend/apps/collaboration/urls.py` |
| `/api/collaboration/visual-expert/` | Approved knowledge source discovery/curation and cited AI questions | `Backend/apps/collaboration/urls.py`; staff-only source writes |

Dashboard handoff endpoints under `/api/auth/` are `POST /dashboard-code/` (authenticated extension; allowlisted callback and next route) and `POST /dashboard-code/exchange/` (single-use code exchange; returns a short-lived access token). The callback code is not a bearer token, is carried in a URL fragment, and is bound to the exact redirect URI and matching browser Origin.

All `/api/analytics/` endpoints expose organization-level records and now require a staff account. Hiding these views in the client is not the authorization control.

## Contract rules for new work

- Keep the existing `/api/` and route names unless a versioned, documented migration is justified.
- Authenticate with the existing Bearer JWT contract until an approved shared auth design is implemented. Never include tokens in URLs.
- Enforce access in DRF permissions and object-level checks; hiding a UI control is not authorization.
- Return stable, user-safe errors with a machine-readable code and useful message. Do not return upstream URLs, credentials, traces, or raw model/server output to ordinary clients.
- Validate UUIDs, enumerated state transitions, input sizes, user ownership and explicit consent on the backend.
- Keep AI feedback and human review separate from the original response. Tie each feedback/review to the exact response ID.
- For Human API, restrict session detail/messages/outcomes to the developer and assigned expert, and enforce lifecycle transitions on the server.
- Pagination and filtering should be bounded for list endpoints; preserve current behavior until actual serializer/view contracts are audited.

## Remaining additions

| Capability | Candidate API shape | Required controls |
| --- | --- | --- |
| Advanced context consent | Current extension submits selected `related_files` to existing `/api/nexus/analyze/` or `/api/nexus/guide/` after local scope approval. | Client previews paths and reads only after approval; backend sanitizes and caps to five files. Add tests for exclusion, payload size, and no silent expansion. A dedicated server-side preview/audit endpoint is still a possible future improvement. |
| Human API context and notifications | `GET /api/collaboration/experts/?problem_id=<uuid>`; `POST /api/collaboration/sessions/`; existing session detail/message/outcome routes | Expert matching uses the owned problem metadata. Explicit consent gates stored snippet/diagnostics sharing. Session owner and assigned expert are checked; expert page polls and raises an incoming-request dialog. Human outcomes remain private ProblemDNA evidence pending review. |
| Visual Expert source management and contextual chat | `GET/POST/PATCH /api/collaboration/visual-expert/sources/`; `POST /api/collaboration/visual-expert/ask/` with optional owned `problem_id` and `expert_id` | Source curation writes are staff-only; approved sources only; backend checks problem ownership, includes context only after extension confirmation, routes using expert-declared skills without impersonation, and returns cited AI guidance. |
| Learning catalog | Implemented admin model in Django admin and links on Skill Quest recommendations; no standalone catalogue REST endpoint yet. | Reviewed links, source/last-verified fields; do not fabricate internal courses. |
| Shared dashboard auth | `POST /api/auth/dashboard-code/` and `POST /api/auth/dashboard-code/exchange/` | Short expiry, exact callback allowlist, hashed single-use code, origin check, no JWT/password in URL. Corporate IdP SSO remains future work. |
| Audit events | Collaboration audit events are stored and visible read-only in Django admin; no filtered REST endpoint or complete admin audit coverage yet. | Redaction, least privilege, actor/object/action/time, immutable or tamper-evident storage policy. |

The Human API and Visual Expert rows describe implemented routes. Other rows identify remaining or future work. Do not build duplicate auth or knowledge systems before confirming the identity provider, company Git service, and data-retention requirements.

## Authorization finding

`NexusBaseView` now requires `IsAuthenticated`, and regression tests cover anonymous access. Continue checking object ownership and permissions as APIs are added. Source: `Backend/apps/nexus/views.py`.
