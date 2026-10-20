# NEXUS Human API and SkillQuest

## How the features work

- The VS Code extension records feedback against the persisted AI response ID. A developer can request a private expert session or put an answer in the expert review queue.
- Expert matching uses configured language, framework and category lists, availability and active-session capacity. The profile modal shows saved profile fields and counts derived from NEXUS sessions/reviews; it does not invent repository contribution data.
- Expert and developer sessions use authenticated REST calls and polling. Pending requests expire after `NEXUS_EXPERT_RESPONSE_MINUTES` (default 10); accepted sessions expire after `NEXUS_SESSION_IDLE_MINUTES` without a message or other server-side activity (default 30). Expiration is evaluated on collaboration API requests.
- Code and diagnostics are shared only when the developer opts in to sharing context. Context is sanitized before persistence. AI response reviews share only problem summary/metadata when the separate review-consent checkbox is selected.
- SkillQuest groups the authenticated developer's saved problems by category, language and framework. It creates a practice activity only after the configured minimum count (default 2). Progress is user-managed and is not treated as proof of mastery.

## Database and API

The `apps.collaboration` app adds `nexus_ai_responses`, `nexus_ai_response_feedback`, `nexus_expert_profiles`, `nexus_assistance_sessions`, `nexus_assistance_messages`, `nexus_expert_session_feedback`, `nexus_ai_response_reviews`, and `nexus_learning_recommendations`. Existing NEXUS users, problems, attempts and project sessions remain the source of identity and troubleshooting history.

All routes below require the existing JWT bearer token:

| Route | Use |
| --- | --- |
| `GET /api/collaboration/experts/?problem_id=<uuid>` | List available experts ranked by matching stored skills |
| `GET /api/collaboration/experts/<user-uuid>/` | View an available expert profile |
| `POST /api/collaboration/feedback/` | Upsert feedback for an owned AI response |
| `GET, POST /api/collaboration/sessions/` | List own sessions or request an expert session |
| `GET, POST /api/collaboration/sessions/<uuid>/` | Read own session or accept, decline or close it |
| `POST /api/collaboration/sessions/<uuid>/messages/` | Send a private message in an accepted session |
| `POST /api/collaboration/sessions/<uuid>/feedback/` | Developer rates an ended session |
| `POST /api/collaboration/sessions/<uuid>/outcome/` | Assigned expert records outcome and closes session |
| `GET, POST /api/collaboration/reviews/` | Developer review history/request; experts use `?queue=1` |
| `POST /api/collaboration/reviews/<uuid>/claim/` | Claim a queued answer review |
| `POST /api/collaboration/reviews/<uuid>/outcome/` | Assigned expert records review findings |
| `GET /api/collaboration/skill-quest/` | Get own recommendations; staff may specify `?user_id=<uuid>` |
| `PATCH /api/collaboration/skill-quest/<uuid>/progress/` | Update own recommendation progress |

## Configure real experts

1. Start the backend and apply migrations with `python manage.py migrate` from `Backend`.
2. Sign in to the NEXUS dashboard as an administrator. In **User Management**, create a real expert account and set its password. Keep it a regular user unless it also needs administration.
3. Open Django Admin at `/admin/` with a staff account. In **Expert profiles**, create a profile for that existing account. Enter only verified languages, frameworks, categories and experience. Set `is_available` and a reasonable `max_active_sessions`.
4. The expert signs in to the dashboard with the same NEXUS credentials. A configured profile grants access to the Human API Desk; the rest of the admin dashboard stays restricted to staff.

If there are no available profile records, extension discovery returns an honest empty state. GitHub/GitLab or internal contribution verification is not connected; those stats are deliberately not displayed.
