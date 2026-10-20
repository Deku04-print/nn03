# NEXUS dashboard

The React/Vite dashboard is part of the full NEXUS stack. For the backend, database, Ollama, extension, and dashboard setup, follow the root [README](../README.md).

From this folder, install dependencies and start the local dev server in PowerShell:

```powershell
npm.cmd install
npm.cmd run dev
```

Vite proxies `/api` to `http://127.0.0.1:8999`; set `VITE_API_URL` only when the API is hosted at a different origin. The production build command is `npm.cmd run build`.
