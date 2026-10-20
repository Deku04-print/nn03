# NEXUS

NEXUS is a developer support application made up of a Django REST API, a React/Vite dashboard, and a VS Code extension. It includes guided AI troubleshooting through Ollama, ProblemDNA history, Human API expert support, and Skill Quest recommendations. The current source audit and delivery limitations are recorded in [`docs/CODEBASE_AUDIT.md`](docs/CODEBASE_AUDIT.md) and [`docs/DELIVERY_STATUS.md`](docs/DELIVERY_STATUS.md).

## Current stack

- Backend: Python 3.10 (the current local test environment) or 3.11 (the Docker image), Django 4.2, Django REST Framework, SimpleJWT.
- Database: PostgreSQL. Semantic embeddings are stored as JSON arrays, so local semantic retrieval does not require the pgvector server extension.
- AI: configured Ollama `/api/chat` endpoint, lower-memory default `qwen3:4b`; no cloud AI fallback. Model and generation limits are configurable.
- Dashboard: React 18 and Vite 5.
- Extension: VS Code Extension API, manifest requires VS Code 1.85 or newer.

## Requirements

For the local Windows workflow, install Python 3.10 or 3.11, Node.js/npm supported by the frontend, PostgreSQL, Ollama with the selected chat and embedding models, and VS Code 1.85+. Git is needed to clone the repository. Administrator privileges may be needed to install software. For Docker setup, install Docker Desktop instead of separately installing PostgreSQL and Ollama.

The backend and frontend dependencies are not vendored: `pip install` downloads from the configured Python package index, and `npm.cmd install` downloads from the configured npm registry. If your office network blocks those services, use only the package mirrors or pre-approved offline packages provided by your IT team. The repository does not include an offline dependency bundle.

Company-hosted Ollama, company Git repositories, internal training links, and other internal services require network access and credentials from the relevant company administrators. No company URL or credentials are included in this repository. The app can run locally with an authorized local Ollama model; private company-only knowledge sources will not be available offline.

## Local setup on Windows (without Docker)

Use three PowerShell terminals from the repository folder.

### 1. Configure PostgreSQL and Ollama

Create a PostgreSQL login role and database, or use the ones you already created in pgAdmin. For a new database, an administrator can run the following in pgAdmin's Query Tool (replace the example password with a local-only password):

```sql
CREATE ROLE nexus LOGIN PASSWORD 'replace-with-a-local-password';
CREATE DATABASE nexus OWNER nexus;
```

If the database already exists, do not run `CREATE DATABASE` again. Set the database path, username and password in `Backend/.env` to match pgAdmin. PostgreSQL treats quoted mixed-case names as case-sensitive: if you created `Nexus` in pgAdmin, use `/Nexus` in `DATABASE_URL` rather than `/nexus`. Ensure PostgreSQL is running. Semantic retrieval stores local Ollama embedding arrays in PostgreSQL JSON fields, so it does not require the pgvector server extension. Keyword matching remains available if the embedding model is not installed or reachable.

Install/start Ollama using the approved local installation method, then download the configured model in a terminal where the `ollama` command is available:

```powershell
ollama pull qwen3:4b
ollama pull embeddinggemma
ollama list
```

The chat default is `qwen3:4b` with a 1024-token context and 256-token output cap to reduce memory pressure. If `qwen3:8b` is already set in your private `Backend/.env`, change it there too; changing the example file does not overwrite your local settings. A smaller model can trade some answer quality for lower resource use. For a very constrained laptop, `qwen3:1.7b` is another Ollama option; set the same model name in the environment and pull that exact tag. `embeddinggemma` is Google's separate local embedding model used for semantic retrieval. If you change the embedding model on an existing database, restart Django and run `manage.py rebuild_embeddings` to regenerate stored vectors for that model.

Ollama runs as a separate machine service; installing the Python virtual environment does not install Ollama.

### 2. Configure and start the backend

```powershell
cd Backend
Copy-Item .env.example .env
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Edit `Backend/.env`: replace `DJANGO_SECRET_KEY`, set the PostgreSQL username/password in `DATABASE_URL`, and keep `OLLAMA_BASE_URL=http://127.0.0.1:11434` for local Ollama. Use a real secret generated locally, not the example value. The commands below invoke the virtual-environment Python directly, so you do not need to activate it or change PowerShell's execution policy.

Then, in the same terminal (using the virtual-environment Python directly avoids PowerShell script-policy issues):

```powershell
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py rebuild_embeddings
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8999
```

The API is available at `http://127.0.0.1:8999`. Keep the backend running. Django reads `Backend/.env`. `rebuild_embeddings` backfills semantic vectors for verified ProblemDNA and approved Visual Expert sources; rerun it after approving new knowledge. If the embedding model is unavailable, the app continues with keyword retrieval.

### 3. Start the dashboard

In a second PowerShell terminal:

```powershell
cd Frontend
npm.cmd install
npm.cmd run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:3456`). In development, Vite proxies `/api` to `http://127.0.0.1:8999`; configure `VITE_API_URL` only if your backend uses another address. If extension and dashboard origins are allowed by `CORS_ALLOWED_ORIGINS`, the extension exchanges its authenticated session for a short-lived, single-use dashboard code. No JWT or password is put in the URL. This is application session reuse, not corporate identity-provider SSO.

### 4. Launch the VS Code extension

In a third terminal:

```powershell
cd "NEXUS Extension"
npm.cmd install
```

Open the `NEXUS Extension` directory in VS Code, select **Run and Debug → Run Extension** (or press F5), and use the Extension Development Host window that opens. In that host, open the NEXUS Activity Bar view and sign in with an account created in the backend. The extension settings `nexus.apiBaseUrl` and `nexus.dashboardUrl` default to local ports 8999 and 3456. Normal Chat sends selected code and a bounded nearby excerpt after you explicitly request analysis. Advanced Chat requires Workspace Trust, previews eligible names and selected paths, and reads/transmits approved content only with a subsequent explicit request.

The extension's Dashboard button exchanges its authenticated session for a short-lived, single-use code carried in the URL fragment (not sent to the web server). `nexus.dashboardUrl`, `FRONTEND_ORIGIN`, and `CORS_ALLOWED_ORIGINS` must use matching browser origins. Corporate identity-provider SSO is not integrated. The extension stores up to 15 visible conversation threads locally in VS Code webview state; extension-host code context is not persisted across VS Code restarts.

### Human API and contextual Visual Expert

After analyzing a problem, click **Human API** in the extension to see available experts ranked by matching language, framework, and problem category. The dashboard Human API page also preselects your latest analyzed issue. Starting a chat asks you to confirm sharing the saved, sanitized snippet, diagnostics, and NEXUS answer. NEXUS prepares the issue summary, sends the request, and opens the chat in the extension or dashboard; the expert dashboard polls for new requests and displays an incoming-request dialog. No large issue form is required.

Use **Ask this expert's AI Visual Expert** on a listed profile to open a contextual dashboard conversation. After a separate confirmation, the linked ProblemDNA context is sent to the configured Ollama service and the selected expert's listed skills guide routing. The AI is not the human expert and uses only approved knowledge sources. Human resolution/review notes are stored as private, pending ProblemDNA evidence until governance review validates wider reuse. Experts can review flagged AI responses while unavailable for new Human API requests.

### 5. Create extension package (optional)

The extension has a `package` script using `@vscode/vsce`; if that dependency is installed, run `npm.cmd run package` from `NEXUS Extension` in PowerShell. This creates a VSIX that can be installed with VS Code's **Install from VSIX** command. Packaging is separate from running the development host.

## Docker Compose setup

Docker Compose starts PostgreSQL with the pgvector image, Ollama, a model-pull helper, Django, and the dashboard. Docker must be installed and running. Initial image downloads and the configured model pull need internet access unless your organization has an approved mirror/cache.

From the repository root:

```powershell
Copy-Item .env.example .env
```

Edit the root `.env` and replace `DJANGO_SECRET_KEY` and `POSTGRES_PASSWORD`. The Compose backend uses `OLLAMA_BASE_URL=http://ollama:11434` inside the Compose network. Do not change it to `127.0.0.1` for the Compose Ollama service. Then run:

```powershell
docker compose up --build
```

After the services start, open `http://localhost:3456`. The backend is at `http://localhost:8999`. Create an admin in another terminal:

```powershell
docker compose exec backend python manage.py createsuperuser
```

Stop the stack with `Ctrl+C`, or run `docker compose down`. `docker compose down -v` deletes database and Ollama volumes; do not use it unless you intend to erase that local data. Compose currently runs migrations at backend container startup.

The root `.env.example` is for Compose interpolation. `Backend/.env.example` is for direct local backend runs. Keep the two files' Ollama URL values appropriate for their network contexts.

## Tests and checks

Backend tests use pytest/pytest-django and are located under `Backend`. From the repository root or the backend folder, run:

```powershell
.\.venv\Scripts\python.exe -m pytest --ds=config.settings
.\.venv\Scripts\python.exe manage.py check
```

Frontend production build:

```powershell
cd Frontend
npm.cmd run build
```

Run extension checks using the scripts/dependencies actually present in `NEXUS Extension/package.json`; the extension currently defines packaging but no dedicated test or lint script. Do not treat a successful frontend build as verification of backend services, PostgreSQL, Ollama, or authentication flows.

## Configuration reference

| Variable | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | Django signing secret; server-side only. |
| `DEBUG` | Django debug mode; keep false in deployment. |
| `ALLOWED_HOSTS` | Comma-separated Django host names. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `CORS_ALLOWED_ORIGINS` | Browser origins allowed to call the API. |
| `FRONTEND_ORIGIN` | Exact dashboard origin used to validate the extension sign-in callback. |
| `DASHBOARD_LOGIN_CODE_TTL_SECONDS` | One-time dashboard handoff lifetime, bounded by the backend to 15–120 seconds. |
| `OLLAMA_BASE_URL` | Authorized Ollama-compatible server base URL, without `/api/chat`. |
| `OLLAMA_MODEL` | Model installed on that Ollama service. |
| `OLLAMA_TIMEOUT_SECONDS` | Default upstream request timeout; selected callers may set their own timeout. |
| `OLLAMA_NUM_CTX`, `OLLAMA_NUM_PREDICT` | Ollama generation context and output limits. Lower values reduce memory/response length; defaults are 1024 and 256. |
| `EMBEDDING_MODEL`, `EMBEDDING_TIMEOUT_SECONDS` | Local Ollama embedding model and timeout; defaults to `embeddinggemma` and 15 seconds. |
| `OLLAMA_API_KEY` | Optional server-side bearer token for an authorized gateway. |
| `VISUAL_EXPERT_ENABLED` | Compatibility setting, now defaulting to `True`; it does not bypass authentication or source approval. Visual Expert needs at least one administrator-approved source to answer. |
| `EXPERT_GIT_BASE_URL`, `EXPERT_GIT_REPOSITORY`, `EXPERT_GIT_ACCESS_TOKEN` | Reserved placeholders; there is not yet an integrated Git knowledge ingestion implementation. Keep tokens server-side. |

For local direct runs, put backend variables in `Backend/.env`. For Compose, put Compose variables in the repository root `.env`. Never commit either `.env` file or embed secrets in the extension/frontend.

## Troubleshooting

- **Database does not exist / connection refused:** confirm PostgreSQL is running, the database and role exist, and `DATABASE_URL` has the correct database name, credentials, host, and port.
- **`extension "vector" is not available`:** current local semantic retrieval uses JSON embeddings and does not require pgvector. If you are manually enabling a separate pgvector database feature, its server files must match the PostgreSQL installation; the Python package does not install them.
- **Ollama connection or timeout error:** confirm Ollama is running, the base URL is reachable from the backend process/container, and its model is installed (`ollama list`). In Compose, use the `ollama` service hostname from the backend container.
- **Ollama memory/CPU allocation error:** check `Backend/.env` (local run) or root `.env` (Compose); use `OLLAMA_MODEL=qwen3:4b`, `OLLAMA_NUM_CTX=1024`, and `OLLAMA_NUM_PREDICT=256`, then restart the backend. Run `ollama ps` to inspect loaded models and `ollama stop qwen3:8b` to unload an idle 8B model. Ollama's `OLLAMA_KEEP_ALIVE` server setting can also unload models sooner; configure it on the machine running Ollama.
- **Model not found:** pull the exact model named in `OLLAMA_MODEL` on the selected Ollama service.
- **Frontend API error:** ensure the backend is running on port 8999 and that dashboard URL/proxy and CORS settings match the browser origin.
- **Extension cannot sign in:** verify `nexus.apiBaseUrl`, backend availability, and that the account exists.
- **Dashboard asks for sign-in from the extension:** confirm `nexus.dashboardUrl`, `FRONTEND_ORIGIN`, and `CORS_ALLOWED_ORIGINS` use the same browser origin, then retry before the one-time code expires.
- **Extension opens another VS Code window:** F5 intentionally launches an Extension Development Host window; use that host to test the extension. It is separate from the original editor window.

## Privacy and known boundaries

The extension sends only user-requested context: the selection and bounded nearby excerpt in Normal Chat, or selected and approved files in Advanced Chat. Sanitization is best-effort. Visual Expert works with manually curated, admin-approved knowledge entries and cites their references; automatic company Git ingestion awaits the authorized host, repository and policy. Human API has request, expert session, polling chat, feedback and review workflows. Skill Quest uses case categories as tentative evidence; administrators must add approved learning resources before course links appear. Semantic retrieval uses local Ollama embeddings stored in PostgreSQL JSON fields and falls back to keyword matching when vectors are missing or the embedding model is unavailable.

Do not use production credentials or real sensitive code in local development unless permitted by company policy. Configure an authorized Ollama endpoint and repository access only after receiving the relevant service details from your organization.

## Project documentation

- [`docs/CODEBASE_AUDIT.md`](docs/CODEBASE_AUDIT.md): verified current-state inventory.
- [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md): current database model notes.
- [`NEXUS Extension/README.md`](NEXUS%20Extension/README.md): extension-specific notes.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DATA_FLOW.md`](docs/DATA_FLOW.md), [`docs/API_DESIGN.md`](docs/API_DESIGN.md), and [`docs/SECURITY_AND_PRIVACY.md`](docs/SECURITY_AND_PRIVACY.md): current design and boundaries.
- [`docs/SPRINT_PLAN_6_WEEKS.md`](docs/SPRINT_PLAN_6_WEEKS.md), [`docs/TEAM_RESPONSIBILITIES.md`](docs/TEAM_RESPONSIBILITIES.md), [`docs/DELIVERY_STATUS.md`](docs/DELIVERY_STATUS.md), and [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md): planning and verification status.
- [`docs/NEXUS_SPRINT_AND_TEAM_PLAN.xlsx`](docs/NEXUS_SPRINT_AND_TEAM_PLAN.xlsx): sprint allocation and evidence workbook.
- [`docs/SHARING_AND_NEW_LAPTOP_SETUP.md`](docs/SHARING_AND_NEW_LAPTOP_SETUP.md): safe project handoff, excluded files, and receiving-laptop checklist.
