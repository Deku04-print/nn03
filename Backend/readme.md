# NEXUS backend

The backend is the Django REST API. For the complete local setup, follow the root [README](../README.md), which includes PostgreSQL, Ollama, dashboard, and extension steps.

For a direct Windows setup, create/configure `Backend/.env` from `.env.example`, then run these commands from this folder (no PowerShell activation is required):

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8999
```

The default database is PostgreSQL and the default local Ollama endpoint is `http://127.0.0.1:11434`. pgvector is not required by the current keyword retrieval path; embeddings are disabled. The API routes are listed in `config/urls.py`; mentoring endpoints are under `/api/nexus/`. See [`../docs/DATABASE_SCHEMA.md`](../docs/DATABASE_SCHEMA.md) for the model diagram.
