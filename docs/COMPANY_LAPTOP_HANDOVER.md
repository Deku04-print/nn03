# Company-laptop handover

Prepared 22 October 2026. Apply these changes to the existing authorized application. Keep its users, database, model provider, and existing configuration. Use [NEXUS_CHANGED_FILES.md](NEXUS_CHANGED_FILES.md) to copy individual updates; the original architecture is in [ARCHITECTURE.mmd](ARCHITECTURE.mmd).

## Copy source, not machine state

Copy `Backend` source (including the entire new `apps/assistance` package and its migration/management command), `Frontend` source/assets, `NEXUS Extension` source/media/test files and `.vscode/launch.json`, root README/ignore rules, and `docs`. Include `Backend/requirements.txt`, `Frontend/package.json` and `package-lock.json`, and `NEXUS Extension/package.json` and `package-lock.json`. JavaScript/Python dependency versions were not changed by this feature.

Include both `.env.example` files, the new extension `media/nexus-placeholder.svg` and `media/icon.png`, and the existing `media/worklens-icon.svg`. The SVG replaces missing logo/name-tag image references; the PNG satisfies the extension manifest icon path. The frontend uses existing inline SVG logos.

Do not copy `node_modules`, Python virtual environments, `dist`, caches, `.early.coverage`, `.verification`, local `.env` files, `.worklens-history.json`, local development databases, or `.git`. Keep the company machine's database and histories. Existing repositories may already track generated files; the new ignore file does not untrack them. Stage/copy only the reviewed source manifest, not all dirty dependency/database files.

The local development database was backed up to `Backend/.verification/before-assistance-20261022-3bb8ba09.db`, migrated additively, and seeded. Its one original user record remained byte-for-byte equivalent at the SQL row level. Do not transfer that private backup to replace company data.

## Configure the backend

PowerShell, from the copied `Backend` directory:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Skip `Copy-Item` when an existing machine-specific `.env` is already present; merge only the new settings. Set:

| Setting | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY`, `JWT_SECRET` | Machine/organization-managed secrets; preserve existing values to avoid invalidating sessions unexpectedly. |
| `DATABASE_URL` | Existing database, never a replacement empty database. SQLite default is `sqlite:///./worklens_dev.db`, relative to `Backend`; retain the actual company PostgreSQL URL if used. |
| `DEBUG` | `True` for the approved local demo; follow company deployment policy elsewhere. |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` plus the approved development NIC address/hostname. No scheme or port. |
| `CORS_ALLOWED_ORIGINS` | Exact frontend origins, including scheme and port; local default is `http://localhost:3456`. |
| `OLLAMA_BASE_URL` | Authorized company-hosted Ollama address, used by `ai/llm/client.py` and existing settings. |
| `OLLAMA_MODEL` | Existing Qwen model name (`qwen3:8b` by default); do not switch providers. |
| `OLLAMA_NUM_PREDICT`, `OLLAMA_NUM_CTX`, `OLLAMA_TEMPERATURE` | Existing response tuning; preserve company values. |
| `HUMAN_API_RESPONSE_THRESHOLD` | Successful AI responses per unresolved problem before the subtle extension suggestion; default 4. Explicit human requests bypass this. |
| `COMPANY_GIT_BASE_URL`, `COMPANY_GIT_ORGANIZATION`, `COMPANY_GIT_TOKEN` | Reserved server-only integration settings, blank until approved Git configuration is supplied. |

`ai/embeddings/__init__.py` currently returns `None`; this source branch has no active EmbeddingGemma URL/model setting. Existing retrieval is keyword fallback. Do not assume vector ingestion or EmbeddingGemma is working from architecture descriptions alone. If the company checkout contains an additional approved embedding integration, reconcile that source separately rather than replacing it with this development configuration.

Never commit `.env`, access/refresh tokens, Git access tokens, passwords, company database backups, private transcripts, or internal machine-specific host configuration. Frontend `VITE_*` values are public build configuration and must not contain secrets.

## Migrate existing data safely

Take a normal approved database backup first. From `Backend`:

```powershell
.\.venv\Scripts\python.exe manage.py showmigrations
.\.venv\Scripts\python.exe manage.py migrate --plan
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py seed_demo_experts
```

Include all original migrations plus `apps/assistance/migrations/0001_initial.py`. It adds related tables without resetting existing tables or changing the user schema. It depends on worklens 0002 and knowledge 0004. Run from `Backend` so the default SQLite relative path remains correct. Do not use `flush`, delete the database, or fake migrations.

The reversible migration was applied/rolled back on a temporary SQLite copy with existing-row fingerprints verified before/after. `python tests/check_migration_copy.py` repeats this against a local SQLite copy. It does not validate a company PostgreSQL server; run the regular test suite on an authorized PostgreSQL development database before a production rollout.

The idempotent seed creates exactly five fictional former employees at `@demo.nexus.invalid`, with unusable passwords, `Exited Organization` status, and synthetic knowledge/contribution labels. It refuses to overwrite an existing non-demo identity. Cleanup:

```powershell
.\.venv\Scripts\python.exe manage.py seed_demo_experts --remove
```

Unused demo users/profiles are removed. Used demo profiles are made ineligible while sessions and historical evidence remain. No real employee is removed. Running the seed again does not reactivate intentionally retired existing demo profiles.

## Start the local application

Backend terminal, in `Backend`:

```powershell
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Frontend terminal, in `Frontend`:

```powershell
npm.cmd ci
npm.cmd run dev
```

Vite listens on port **3456**. Leave `VITE_API_URL` empty for the existing `/api` proxy to localhost:8000. When using a separate backend origin, create `Frontend/.env` from `.env.example`, set `VITE_API_URL` to the approved backend URL, and restart/rebuild Vite. Configure Django CORS for the exact browser origin.

Open `NEXUS Extension` as a VS Code folder and press F5 → **Run NEXUS Extension**. The previously empty `.vscode/launch.json` is now populated. In the Extension Development Host, open a real workspace and set:

```json
{
  "worklens.backendUrl": "http://127.0.0.1:8000",
  "worklens.dashboardUrl": "http://localhost:3456"
}
```

Sign in through the existing extension login. JWTs stay in VS Code SecretStorage. Existing docs/test/infra/terminal generators now also attach the authenticated identity required by the hardened backend. No extra extension runtime dependencies or compilation step are needed. Extension development dependencies can be installed with `npm.cmd ci` where allowed; the Node unit tests use built-in APIs only.

Use an existing admin account. If none exists, run `python manage.py createsuperuser` interactively with an approved email/password. Do not run the old `seed_admin` command as setup: it overwrites a fixed user's password. Create two distinct approved development accounts using existing User Management and choose explicit demo passwords.

## Two-user demo on an approved development network

Use the development machine's **specific private NIC address**, for example `<DEV_LAN_IP>` below; replace placeholders with actual approved values. Configure the backend and both clients to the same backend/database. No cloud deployment, Redis, ASGI server, or WebSocket port is required.

1. Backend `.env`: include `<DEV_LAN_IP>` in `ALLOWED_HOSTS`; include `http://<DEV_LAN_IP>:3456` in `CORS_ALLOWED_ORIGINS`. Keep the existing database and company Ollama address.
2. Backend, from `Backend`: `python manage.py runserver <DEV_LAN_IP>:8000` using the activated environment, or the full `.venv` Python path.
3. Frontend, from `Frontend`: set `$env:VITE_API_URL='http://<DEV_LAN_IP>:8000'` in that terminal, then `npm.cmd run dev -- --host <DEV_LAN_IP> --port 3456 --strictPort`.
4. Both extensions: `worklens.backendUrl=http://<DEV_LAN_IP>:8000` and `worklens.dashboardUrl=http://<DEV_LAN_IP>:3456`.
5. Permit TCP **8000** and **3456** only from the two approved client addresses using company firewall/network controls. Bind to the approved NIC, do not expose the development server through internet forwarding. Use the organization's HTTPS proxy when required; no proxy infrastructure was added here.
6. Sign in as User A in one extension and Expert B in the other. For one-machine rehearsal, use separate VS Code profiles and browser profiles. Both identities use the same Django backend; browser-local histories are not the chat source of truth.
7. An admin opens User Management, edits B, opens **Expert eligibility & approved knowledge**, enables eligibility, adds approved competencies (e.g. React, JavaScript), sets organizational status **Active** and availability **Available**, and saves. B can remain a trainee/normal user; no staff privilege is necessary.
8. A asks an unresolved troubleshooting question and receives four successful AI responses, or types “I need human help with React state” for immediate escalation without Ollama. Click Human API; authorize only the context you intend to share.
9. The browser shows an eight-character code. Match/approve that code in VS Code. No password is requested again. The URL has only a public one-time handoff identifier; browser proof/JWT exchange happens in POST bodies. A mismatch/expiry requires opening Human API again.
10. A selects B and requests assistance. Within ten seconds B's extension bell shows a request. B opens it, matches the new browser handoff code, and clicks Accept in the isolated chat. A sees acceptance automatically.
11. A sends a message. B sees it on the next automatic poll (normally within two seconds); B replies and A sees the reply. Reload either page to confirm messages persist in the same session. An unrelated third account must receive 404 when fetching that session or its messages.
12. End Session, record a resolution summary and outcome, then submit the resolved/helpful/understandable feedback or explicitly skip. The server rejects further messages to the ended session. Human-reported outcomes stay separate from verified ProblemDNA; no unverified summary is automatically promoted to shared knowledge.
13. To demonstrate Visual Expert, return to discovery and choose a labelled former-employee demo matching the topic. Ask “React state snapshots” or “Python import troubleshooting”. Approved source references appear under AI answers. A question with no overlapping approved knowledge produces a limitation message without fabricated history. The mode toggle appears only when both modes are eligible for the requesting user; switching from active human assistance first ends that session and presents feedback. Each mode retains its own messages, with no copying of human-session transcripts into AI context.

This is **automatic polling**, not instant server push: chat 2 seconds, notifications 10 seconds, reconnect backoff up to 30 seconds. Browser data and notification endpoints have an assistance-specific throttle compatible with these intervals. The extension suggestion is not a server-side restriction on access.

## Git integration later

One configuration location is `Backend/config/settings.py`, backed by the three `COMPANY_GIT_*` environment variables above. The boundary is `apps/assistance/services.py::CompanyGitIntegration`. `ExpertProfile.git_identity` maps the approved Git identity to the existing application user. `git_contributions` plus `git_verified_at` distinguish verified information from unverified data; ordinary profile settings cannot manufacture a verified timestamp or contribution record.

**No Git fetch adapter existed, and none is claimed to be implemented.** Once the organization supplies its Git platform, URL, repository/org identifier, token scope and identity rules, implement the authorized server-side fetch in this boundary. Test configuration presence, a read-only allowed profile/contribution fetch, identity matching, rejected unauthorized repositories, and verified timestamps. Do not invent company URLs, import private conversations, or label demo statistics as verified. Database-backed skill matching works without Git.

## Verification and remaining environment checks

From the appropriate folders, run the commands in the root README. Current results: **105 Django tests passed**, including JWT API tests and a real HTTP loopback two-user exchange; **eight extension tests passed**; extension syntax/import/asset checks passed; frontend production build passed; Django check and migration-drift check passed. The frontend has a >500 kB bundle warning; no bundle rewrite was undertaken.

Not run here: actual company Ollama generation/model-quality checks, a company PostgreSQL migration, interactive VS Code Webview rendering, or a two-machine browser/extension walkthrough. Prerequisites are the authorized company network/Ollama service, an approved PostgreSQL development database if applicable, and two real test identities/clients. Run steps 7–13 above and inspect actual troubleshooting answers for the no-corrected-code policy. Automated model tests mock the company LLM call; they do not prove live Qwen output quality.
