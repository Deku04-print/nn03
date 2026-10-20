"""Generate the NEXUS sprint workbook from the documented current plan."""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "NEXUS_SPRINT_AND_TEAM_PLAN.xlsx"

overview_headers = [
    "Sprint", "Period or week", "Objective", "Main deliverables",
    "Frontend responsibilities", "Backend responsibilities",
    "DevOps and Testing responsibilities", "AI/ML responsibilities",
    "Dependencies", "Acceptance criteria", "Evidence required", "Status", "Blockers",
]
overview = [
    ["Sprint 0", "Week 0 (planning estimate)", "Validate product direction and boundaries.",
     "Workflow maps; initial architecture, API, security and data-flow inventory.",
     "Map extension/dashboard journeys and accessibility needs.", "Document existing routes, identity and session boundaries.",
     "Document prerequisites, environments and quality gates.", "Map Ollama/LangGraph/retrieval and evaluation needs.",
     "Developer workflow and source inventory.", "Document current evidence and unresolved requirements.",
     "Review notes and architecture walkthrough; no unverified PPT claims.", "In Progress", "Incubation deck/market analysis artifacts not found."],
    ["Sprint 1", "Week 1 (planning estimate)", "Stabilize setup and auth/UI contracts.",
     "Local setup, role-aware UI/auth checks, AI config and prompt cases.",
     "Login, navigation, loading/error states.", "Audit user roles and core endpoint permissions.",
     "Environment templates and clean setup checks.", "Verify current Ollama and guided response behavior.",
     "Supported local toolchain and access to local services.", "Auth checks and local startup pass with evidence.",
     "Test logs, setup walkthrough and AI request record.", "In Progress", "Backend auth is fixed and tested; local service startup not verified."],
    ["Sprint 2", "Week 2 (planning estimate)", "Align administration, experts and foundational APIs.",
     "Shared components, expert profile/availability and API role tests.",
     "Reusable admin/expert UI, responsive/accessibility states.", "Profiles, skills, availability, session APIs and ownership.",
     "API contract, auth isolation and migration tests.", "Response metadata for review and knowledge.",
     "Agreed role rules and endpoint contracts.", "Participant isolation and role denial verified.",
     "Synthetic expert flow and API test results.", "In Progress", "Audit-event model and background expiry absent."],
    ["Sprint 3", "Week 3 (planning estimate)", "Improve AI, retrieval, Visual Expert and learning data.",
     "Grounded prompt evals; authorized source/catalog design.",
     "Evidence-based Skill Quest UI; Visual Expert entry point.", "Source/catalog APIs, review and deletion controls.",
     "Ollama, retrieval, ingestion and secret-exclusion checks.", "Troubleshooting evals; choose RAG model/index only if supported.",
     "Approved Git source and learning references; model availability.", "Cited evidence is authorized; no fabricated course claims.",
     "Evaluation results and synthetic retrieval demo.", "In Progress", "Visual Expert blocked on authorized Git details; approved course catalogue unavailable."],
    ["Sprint 4", "Week 4 (planning estimate)", "Integrate extension, dashboard and Human API safely.",
     "Context consent, session lifecycle and approved identity flow.",
     "Advanced scope preview, Human API and dashboard navigation.", "Lifecycle, consent, expiry, privacy and shared-auth contracts.",
     "E2E tests for roles, isolation, timeout and reconnect.", "Use only consented context; review metadata and escalation.",
     "Context API and identity-provider decision.", "No silent expansion or token in URL; ownership tests pass.",
     "Recorded synthetic end-to-end scenarios.", "In Progress", "One-time application code exchange exists; corporate SSO and realtime notifications remain."],
    ["Sprint 5", "Week 5 (planning estimate)", "Finish governance, analytics verification and demo.",
     "Accurate metrics, themes, feedback timers and demo-ready states.",
     "Audit/review/knowledge governance and retention.", "Regression, clean setup, rollback and release evidence.",
     "Prompt/retrieval/learning evaluation and human correction review.",
     "Verified regression/build/setup results and demo script.", "Stable candidate and external service access.",
     "Only evidence-backed features shown; no live-looking sample metrics.",
     "Test/build output, workbook and demo evidence.", "In Progress", "114 backend tests pass; npm build/dev and HTTP smoke pass; PostgreSQL connects with zero pending migrations; Ollama qwen3:8b inference and extension VSIX packaging pass; Docker and Extension Host unavailable."],
]

task_headers = ["Task ID", "Sprint", "Team", "Task title", "Detailed task description", "Existing file/module", "Planned file/module", "API or data dependency", "Acceptance criteria", "Test evidence", "Priority", "Estimated effort (estimate)", "Status", "Notes"]
tasks = [
    ["AUD-01", "Sprint 0", "All teams", "Repository audit", "Inventory the current app and classify features with source evidence.", "docs/CODEBASE_AUDIT.md", "docs/CODEBASE_AUDIT.md", "Repository access", "Feature state is evidence-based; no runtime claims without runs.", "Static source review", "High", "2 days", "Verified Complete", "Audit is source inspection only."],
    ["CFG-01", "Sprint 1", "DevOps and Testing Team", "Portable environment setup", "Validate env templates, ignore rules and Windows/manual/Compose setup.", ".env.example; Backend/config/settings.py", "README.md; Backend/.env.example", "PostgreSQL, Ollama", "Clean machine can follow steps; secrets remain local.", "Startup checks pending", "High", "1–2 days", "In Progress", "Docker unavailable in this environment."],
    ["SEC-01", "Sprint 1–2", "Backend Team", "Core API permissions", "Replace inappropriate AllowAny defaults and add authentication/object ownership coverage.", "Backend/apps/nexus/views.py", "Backend/tests/test_api.py", "Role policy", "Anonymous denied; permitted role and owner access covered.", "114 backend tests pass", "Critical", "2–4 days", "Verified Complete", "Production permission review remains."],
    ["UI-01", "Sprint 1–2", "Frontend Team", "Shared UI foundations", "Refine responsive layout, accessibility, role-aware navigation and states.", "Frontend/src/App.jsx; Frontend/src/components/Layout.jsx", "Frontend/src/components/", "Backend API contract", "Routes present correct empty, error and permission states.", "npm run build passed; per-page chunks emitted", "Medium", "3–5 days", "In Progress", "Preserve existing routes."],
    ["HUM-01", "Sprint 2–5", "Backend Team", "Human API lifecycle", "Complete request, accept/decline, active messaging, close/expire, outcome and audit behavior.", "Backend/apps/collaboration/", "Backend/apps/collaboration/", "Expert role and retention policy", "Server enforces all transitions, consent and participant isolation.", "114 backend tests pass; browser E2E pending", "High", "5–8 days", "In Progress", "No background worker found."],
    ["AI-01", "Sprint 3–5", "AI/ML Team", "Guided mentor evaluation", "Add evaluation cases for context gaps, unsafe requests, retries and escalation.", "Backend/ai/orchestrator/; Backend/ai/prompts/", "Backend/tests/evaluation/", "Local Ollama model", "Mentor responses use evidence/uncertainty and avoid direct fixes.", "Evaluation run pending", "High", "5–10 days", "In Progress", "Do not conflate generator features with mentor mode."],
    ["VE-01", "Sprint 3–4", "AI/ML Team", "Visual Expert knowledge", "Build optional, cited, authorized source retrieval and review workflow.", "No current implementation found", "Backend/apps/knowledge/ or existing source module", "Approved Git URL/repository/access", "Source authorization, citations, exclusion and deletion checks pass.", "Blocked", "High", "5–10 days", "Blocked", "Do not clone/index until authorization is supplied."],
    ["SQ-01", "Sprint 3–5", "Backend Team", "Learning catalogue", "Add source/review metadata and user usefulness/progress actions.", "Backend/apps/collaboration/models.py; Frontend/src/pages/Learning.jsx", "Learning catalog model/API", "Approved course references", "Recommendation rationale/evidence and review date visible.", "API/UI tests pending", "Medium", "3–6 days", "In Progress", "Internal links not provided."],
    ["EXT-01", "Sprint 4", "Frontend Team", "Permission-controlled Advanced Chat", "Preview exact files/scope; honor exclusions and support approve/reject/narrow/cancel.", "NEXUS Extension/extension.js", "NEXUS Extension/extension.js", "Workspace selection policy", "No read or transmit without consent; paths bounded to workspace.", "Node syntax check passes; interactive tests pending", "High", "4–6 days", "In Progress", "Do not read env/key files."],
    ["SSO-01", "Sprint 4", "Backend Team", "Dashboard session reuse", "Implement a one-time application code exchange; corporate IdP is a separate future integration.", "Backend/apps/users/; extension/dashboard login", "Existing auth modules", "Configured dashboard origin and callback allowlist", "Short-lived exchange; replay/expiry/origin tests; no JWT URL token.", "SSO API tests pass", "High", "4–8 days", "In Progress", "Corporate identity provider not identified."],
    ["EXT-02", "Sprint 4", "Frontend Team", "Local conversation history", "Add bounded thread history, switching, timestamps and clear-history controls while keeping source context out of persisted state.", "NEXUS Extension/extension.js", "NEXUS Extension/extension.js", "VS Code webview state and existing conversation_history API field", "Threads switch correctly; raw selected/approved files are not persisted; prior turns are sanitized server-side.", "Extension/webview syntax and VSIX packaging pass; Extension Host interaction test pending", "High", "2?4 days", "In Progress", "Visible text/results are local; extension-host code context is session-only."],
    ["ANA-01", "Sprint 5", "Frontend Team", "Analytics integrity", "Remove or label hard-coded fallback values and ensure metrics map to API evidence.", "Frontend/src/pages/Dashboard.jsx; Frontend/src/pages/Agents.jsx", "Same pages", "Analytics metric definitions", "Missing data appears unavailable/empty, never invented as live.", "No fallback metrics; npm run build passes", "High", "2–4 days", "In Progress", "Fallback metrics removed; npm build and dashboard HTTP smoke pass; browser interaction verification pending."],
    ["REL-01", "Sprint 5", "DevOps and Testing Team", "Release verification", "Run backend tests, frontend build, migration check and clean setup; document outcomes.", "Backend/tests; Frontend/package.json", "docs/DELIVERY_STATUS.md", "Runtime services", "Actual commands/results and blockers recorded.", "114 backend tests; Django/migration checks; npm build/dev HTTP smoke; PostgreSQL and Ollama checks; VSIX package passed", "High", "3–5 days", "In Progress", "Browser/Extension Host and external-service checks remain."],
]

team_headers = ["Team", "Ownership boundaries", "Primary responsibilities", "Interfaces", "Cross-team dependencies", "Owner (fill in)"]
teams = [
    ["Frontend Team", "User-facing extension/dashboard behavior; not the authorization source of truth.", "React/Vite dashboard, extension webview, navigation, consent UI, themes, accessibility, loading/error/empty states.", "Backend APIs, extension messaging, design system.", "Backend schemas/permissions; AI context scope; DevOps quality and accessibility criteria.", ""],
    ["Backend Team", "Server-side policy, persistence, APIs and lifecycle enforcement.", "Django models/migrations, auth/permissions, sessions, retention, admin/governance endpoints.", "Frontend contracts, AI orchestration, PostgreSQL, identity provider.", "Product role policy; DevOps migration/rollback; AI response metadata.", ""],
    ["DevOps and Testing Team", "Reproducibility and verification; does not own business policy.", "Environment setup, CI/build/test scripts, deployment/rollback guidance, regression/security checks.", "All runtime components and service owners.", "Access to supported toolchains/services; implementation teams provide acceptance criteria.", ""],
    ["AI/ML Team", "Model behavior, retrieval, source grounding and evaluations.", "Ollama/LangGraph/prompts, retrieval, response safety, Visual Expert and Skill Quest evidence logic.", "Backend APIs, approved sources, local/authorized model service.", "Backend privacy/access boundary; Frontend consent; DevOps evaluation execution.", ""],
]

evidence_headers = ["Sprint", "Feature", "Expected behavior", "Verification steps", "Test result", "Evidence location", "Verified by", "Verification date", "Remaining issues"]
evidence = [
    ["Sprint 0", "Architecture audit", "Existing stack and limitations cited to source paths.", "Inspect manifests, routes, models, client and Git status.", "Source inspection recorded; no runtime verification", "docs/CODEBASE_AUDIT.md", "Codex", "2026-10-19", "No tests/builds performed in audit."],
    ["Sprint 1", "Local backend setup", "New developer can start Django against PostgreSQL and Ollama.", "Follow README in clean supported Windows environment.", "PostgreSQL connection and Ollama client inference passed; Django admin HTTP 200", "README.md; docs/DELIVERY_STATUS.md", "Codex", "2026-10-19", "pgvector unavailable; Docker and clean-machine setup not checked."],
    ["Sprint 2", "Expert isolation", "Only developer/assigned expert can access a private session.", "Use two developers and two experts; try cross-session read/write.", "114 backend tests passed", "Backend/tests/test_collaboration.py", "Codex", "2026-10-19", "Browser E2E still pending."],
    ["Sprint 3", "ProblemDNA retrieval", "Current keyword retrieval returns scoped candidates and does not claim vector search.", "Create synthetic records and query similar endpoint.", "Backend suite passed; Ollama client inference passed", "Backend/ai/retrieval/semantic_search.py; docs/DELIVERY_STATUS.md", "Codex", "2026-10-19", "Embeddings disabled."],
    ["Sprint 4", "Advanced Chat consent", "Files are only read/transmitted after scope approval.", "Inspect scope controls; interactive rejection/exclusion testing requires VS Code host.", "Syntax passes; interactive verification pending", "NEXUS Extension/extension.js", "Codex", "2026-10-19", "Workspace Trust/host verification remains."],
    ["Sprint 4", "Local extension conversation history", "Up to 15 threads can be switched and cleared; source payloads are not persisted by the history feature.", "Inspect webview state handling; build/package extension and run Extension Host interaction checks.", "Extension/webview syntax and VSIX packaging passed; Extension Host interaction not run", "NEXUS Extension/extension.js; NEXUS Extension/README.md", "Codex", "2026-10-19", "Code context is session-only."],
    ["Sprint 5", "Release regression", "Tests/build/migration/setup results accurately recorded.", "Run commands in README and record logs/environment.", "114 tests; npm build/dev smoke; PostgreSQL connection and migration plan; local Ollama inference; extension VSIX all pass", "docs/DELIVERY_STATUS.md", "Codex", "2026-10-19", "Docker and interactive VS Code Extension Host checks remain unavailable."],
]

risk_headers = ["Risk or dependency", "Affected sprint", "Responsible team", "Likelihood", "Impact", "Mitigation", "Required decision or access", "Status"]
risks = [
    ["Core API authorization needs ongoing coverage as endpoints change.", "1–2", "Backend Team", "High", "Critical", "Require authentication and keep anonymous/owner tests in the suite.", "Review permissions for new routes.", "Mitigated; continue review"],
    ["No company Ollama endpoint/auth details are in the repository.", "1, 3–5", "DevOps and Testing Team", "Medium", "High", "Use local Ollama for development and server-side environment placeholders.", "Authorized endpoint, network access and credentials.", "Blocked"],
    ["Company Git Visual Expert integration lacks source/repository/access details.", "3–4", "AI/ML Team", "High", "High", "Defer ingestion; build only configuration contract after authorization.", "Git host, repository, service account scope, exclusions and deletion rules.", "Blocked"],
    ["Approved internal course catalog is not available.", "3–5", "Backend Team", "High", "Medium", "Keep recommendations generic and label sources; do not invent links.", "Reviewed course titles/URLs/catalog access.", "Blocked"],
    ["Embeddings disabled; ProblemDNA uses keyword scoring.", "3–5", "AI/ML Team", "Medium", "Medium", "Document honest current behavior; decide model/dimensions before migration.", "Model choice, supported pgvector install and privacy approval.", "Open"],
    ["No company identity provider is configured; current session handoff is application-level only.", "4", "Backend Team", "Medium", "High", "Use callback-bound one-time code exchange for application session reuse.", "Company identity-provider/SSO decision.", "In progress"],
    ["Dashboard KPI/agent fallback metrics could be mistaken for live telemetry.", "5", "Frontend Team", "High", "High", "Removed fabricated fallback values and removed inferred time-saved estimates; use only returned telemetry.", "Approved analytics definitions and API field semantics.", "Mitigated; browser verification pending"],
    ["Docker executable/runtime unavailable in current environment.", "1, 5", "DevOps and Testing Team", "Medium", "Medium", "Validate manual local setup; run Compose when Docker is available.", "Docker Desktop or authorized machine with Docker.", "Blocked"],
]

wb = Workbook()
wb.remove(wb.active)
specs = [
    ("Sprint Overview", overview_headers, overview),
    ("Task Breakdown", task_headers, tasks),
    ("Team Ownership", team_headers, teams),
    ("Verification and Demo", evidence_headers, evidence),
    ("Risks and Dependencies", risk_headers, risks),
]

header_fill = PatternFill("solid", fgColor="17365D")
header_font = Font(color="FFFFFF", bold=True)
thin_gray = Side(style="thin", color="D9E2F3")
status_fills = {
    "Verified Complete": "C6EFCE", "In Progress": "FFEB9C", "Blocked": "F4CCCC",
    "Not Started": "D9EAD3", "Open": "FCE4D6", "Not implemented": "F4CCCC",
}

for title, headers, rows in specs:
    ws = wb.create_sheet(title)
    ws.append(headers)
    for row in rows:
        ws.append(row)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    ws.sheet_view.showGridLines = False
    ws.row_dimensions[1].height = 32
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        cell.border = Border(bottom=thin_gray)
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(wrap_text=True, vertical="top")
            cell.border = Border(bottom=thin_gray)
        for cell in row:
            if isinstance(cell.value, str) and cell.value in status_fills:
                cell.fill = PatternFill("solid", fgColor=status_fills[cell.value])
    for col_idx, header in enumerate(headers, 1):
        width = min(max(len(header) + 2, 15), 38)
        for values in ws.iter_rows(min_col=col_idx, max_col=col_idx, min_row=2):
            for cell in values:
                text = str(cell.value or "")
                width = min(max(width, min(max((len(line) for line in text.splitlines()), default=0) + 2, 14)), 48)
        ws.column_dimensions[get_column_letter(col_idx)].width = width
    if rows:
        table = Table(displayName="T" + "".join(c for c in title.title() if c.isalnum()), ref=ws.dimensions)
        table.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showFirstColumn=False, showLastColumn=False, showRowStripes=True, showColumnStripes=False)
        ws.add_table(table)

wb.save(OUTPUT)
print(f"Created {OUTPUT}")
