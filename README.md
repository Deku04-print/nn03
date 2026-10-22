# NEXUS / WorkLens

This is the existing Django backend, React dashboard, and VS Code extension. Human API adds database-backed expert discovery and shared human chat; Visual Expert provides explicitly labelled AI guidance from approved former-employee technical knowledge. Existing Ollama/Qwen orchestration remains in place.

See [feature audit](docs/NEXUS_FEATURE_AUDIT.md), [company-laptop handover](docs/COMPANY_LAPTOP_HANDOVER.md), [changed-file manifest](docs/NEXUS_CHANGED_FILES.md), and [implementation/check results](docs/NEXUS_IMPLEMENTATION_STATUS.md).

## Local setup (PowerShell)

Run backend commands from `Backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env with machine-specific secrets, database, and authorized Ollama address.
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_demo_experts
# Only if an administrator account does not already exist:
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Run the frontend from a second terminal in `Frontend`:

```powershell
npm.cmd ci
npm.cmd run dev
```

Browse `http://localhost:3456`. Existing accounts authenticate through Django. Ordinary users see their personal dashboard; staff retain the existing administration pages. The existing `seed_admin` command resets a fixed account's password; use existing credentials or interactive `createsuperuser` instead.

Open the `NEXUS Extension` folder in VS Code and press F5 using **Run NEXUS Extension**. Its JavaScript runs directly; there is no extension compilation step. Set `worklens.backendUrl` to `http://127.0.0.1:8000` and `worklens.dashboardUrl` to `http://localhost:3456`, then sign in in the extension. No JWT belongs in a URL or workspace setting.

## Assistance workflow

The extension suggests Human API after four successful AI responses to the same unresolved problem (`HUMAN_API_RESPONSE_THRESHOLD` in the backend environment). An explicit request such as “I need human help with React state” opens the entry point immediately, without calling Ollama. New chat resets backend context, and restored conversations reuse their original IDs.

Click Human API, authorize a question-only or reviewed-transcript snapshot, and choose whether to share stored selected code. A reused case retains its original disclosure. The browser shows a code; approve the matching code in VS Code. This reuses your existing identity without another password. The public handoff ID cannot authenticate another browser; the proof is sent in POST bodies, expires after two minutes, and can be exchanged only once.

The discovery page reads actual expert competencies from Django. Admins edit eligibility, status, availability, approved skills, and technical knowledge in **User Management → Edit → Expert eligibility & approved knowledge**. Organizational status is separate from account activation and availability. Active-but-offline users are never Visual Experts.

Real human chat uses **automatic 2-second polling**, with persisted messages, participant checks, retry IDs, and reconnect backoff. Notification polling is every ten seconds. This is working polling transport, not WebSockets or instant push. The expert opens a request from their extension bell, accepts it, and both participants use the same server session. End Session records an outcome; requesting users can submit or explicitly skip feedback. Visual Expert feedback is kept separate from human-expert ratings.

Five seed profiles are fictional, have unusable login passwords, and contain labelled synthetic notes/statistics. Remove unused demos with `python manage.py seed_demo_experts --remove`; used demos are retired while their history is preserved.

**Retrieval reality:** this checkout disables embeddings and uses keyword retrieval. It does not contain a working EmbeddingGemma integration. Visual Expert reuses that scorer and the existing Ollama client with only the selected profile's approved knowledge. No private repository or conversation ingestion was added. Lack of relevant approved evidence produces a limitation message without calling the model.

## Checks

```powershell
# Backend
$env:PYTHONDONTWRITEBYTECODE='1'
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
.\.venv\Scripts\python.exe manage.py test tests --noinput
.\.venv\Scripts\python.exe tests/check_migration_copy.py

# Frontend (in Frontend)
npm.cmd run build

# Extension (in NEXUS Extension)
npm.cmd test
npm.cmd run check
```

Local verification: 105 Django tests, eight extension tests, syntax checks, production build, and database-copy migration/rollback checks passed. The Django suite includes a real loopback HTTP two-user polling test. Live company Ollama responses and an interactive two-machine VS Code/browser walkthrough still require the authorized company environment; see the handover checklist.
