# Sharing NEXUS and setting up another laptop

## Where the run instructions are

The root [`README.md`](../README.md) is the main step-by-step guide. Its **Local setup on Windows (without Docker)** section gives the PostgreSQL/Ollama, Django, dashboard, and VS Code extension steps. It also has a separate Docker Compose setup. This file covers the handoff and laptop-specific preparation.

## Recommended way to share it

Use a company-approved private Git repository, SharePoint/OneDrive location, or internal file transfer. Do not upload company code to a public GitHub repository or personal cloud storage unless company policy explicitly permits it. If the project contains code from another team's repository, check that team's sharing and licensing rules too.

For a source handoff, include the project source and dependency manifests. Do not include your machine's installed dependencies, local database, credentials, or generated build output. If making a ZIP, create it from a reviewed copy of the project and omit `.git` unless the recipient needs repository history and that history has been checked for secrets. `.gitignore` does not remove files that are already tracked or present in a copied folder.

### Include

- `Backend/` source, migrations, `requirements.txt`, and `Backend/.env.example`.
- `Frontend/` source, `package.json`, `package-lock.json`, and its build/config files.
- `NEXUS Extension/` source, `package.json`, and lockfile if present.
- Root `docker-compose.yml`, `.env.example`, `.gitignore`, and `README.md`.
- `docs/` documentation and other project-owned configuration needed to understand or run the code.

Before sharing, inspect the included files and the complete Git history if included. In particular, don't share copied terminal transcripts or scratch files such as `tax.txt` or `react.txt` without reviewing their contents; they may contain pasted credentials or unrelated material.

### Do not include

- Root `.env`, `Backend/.env`, or any other real `.env` file. Share only the example templates.
- Passwords, Django/JWT signing keys, database URLs with passwords, Ollama gateway tokens, Git access tokens, private keys, certificates, or exported browser/session data.
- `.venv/`, `venv/`, `node_modules/`, Python caches, Vite/build output such as `dist/`, coverage output, logs, temporary files, local SQLite databases, database dumps/backups, or Ollama model files.
- `.git/` for an ordinary ZIP handoff. If history is needed, use an approved private repository and check committed history for secrets first.
- A `.vsix` unless the recipient specifically needs an installable extension package and it has been reviewed and approved for transfer. For development, share the extension source instead.
- Personal VS Code settings or workspace-specific secrets. Share only project settings that are safe and useful for everyone.

These are practical exclusions even if `.gitignore` lists them: an ignore rule does not protect a secret already tracked by Git or manually added to an archive.

## What to change on the receiving laptop

1. Copy the repository into a normal writable folder and open the repository root in VS Code.
2. Copy `Backend/.env.example` to `Backend/.env`. Set a new, machine-specific Django secret, the local PostgreSQL connection string, and the Ollama address. Never reuse your own machine's secret or database password.
3. Create or select a local PostgreSQL database and role. Set the exact database name and credentials in that laptop's `DATABASE_URL`. Existing app features use PostgreSQL; pgvector is optional for the current keyword-based ProblemDNA fallback because embeddings are disabled. If vector search is later enabled, install the PostgreSQL server extension that matches that PostgreSQL installation.
4. Install Ollama on the receiving laptop, start its service, and pull the configured model. The default is `qwen3:4b`; make sure the `OLLAMA_MODEL` in `Backend/.env` matches a model installed on that laptop or the authorized Ollama server. If using a local Ollama service, use `http://127.0.0.1:11434`.
5. Install Python dependencies, npm dependencies, run Django migrations, then start the backend and dashboard using the exact commands in the root README. Open `NEXUS Extension/` in VS Code and press F5 to launch its Extension Development Host.
6. Create an account in that laptop's local database. Do not send a production password or token in the project ZIP; provision accounts through the organization's approved process.

The receiving laptop's `.env` files are local configuration and are not part of the shared source. The root `.env.example` is for Docker Compose; `Backend/.env.example` is for running Django directly on Windows.

## Receiving-laptop prerequisites

- Windows and VS Code 1.85 or newer (this project is a VS Code extension; Visual Studio is not required).
- Python 3.10 or 3.11 and `pip`.
- Node.js 20 and npm for the current frontend setup.
- PostgreSQL and a local database/role, unless using the documented Docker Compose path.
- Ollama installed and running, plus enough available memory and disk for the selected model. Alternatively, an authorized Ollama endpoint reachable from the backend.
- Network access to the approved Python package index and npm registry to install dependencies. If office policy blocks these, request the approved internal mirrors or offline packages from IT.
- VS Code extension development support. The normal workflow is to open `NEXUS Extension/` in VS Code and use F5; no Visual Studio 2022 is required.

Docker Desktop is an alternative to separately installing the database and configuring services, but it requires Docker access and image downloads. The README documents that route separately.

## Lowering Ollama memory use

The backend passes `OLLAMA_NUM_CTX` and `OLLAMA_NUM_PREDICT` to Ollama. The current example defaults are 1024 context tokens and 256 output tokens, and `qwen3:4b`. If an existing private `Backend/.env` still says `qwen3:8b`, change it there; editing `.env.example` does not update it. Restart Django after changing these settings.

If the laptop still runs out of memory, try an even smaller Ollama model such as `qwen3:1.7b`, setting and pulling the exact same tag. Smaller models may give less capable answers. `ollama ps` shows loaded models; `ollama stop <model-tag>` unloads the named model. Ollama also has server-side keep-alive and parallelism settings; those must be configured on the machine running Ollama, not inside the Django virtual environment.

If local inference remains too heavy, ask IT whether an authorized company Ollama service is available and obtain its approved URL, model name, and any required access method. Put those settings only in the backend's private `.env`; never place gateway credentials in the extension or frontend.

## Office network limits

The source tree does not bundle Python or npm packages, PostgreSQL, Ollama, or model weights. A fresh laptop must install/download those from approved sources or internal mirrors. The application cannot use a company-only model, repository, or course catalogue until the laptop has the required network access and permissions. Ask IT for internal package mirrors or approved installation media rather than copying secrets or software from an unapproved source.
