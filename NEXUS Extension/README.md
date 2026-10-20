# NEXUS VS Code extension

This folder is a standalone VS Code extension. It connects to the Django API and opens the existing React dashboard in your browser.

## Run it locally

1. Start PostgreSQL and Ollama, then start the backend and dashboard using either the local PowerShell steps or the Docker Compose steps in the root project README.
2. Open this `NEXUS Extension` folder in VS Code.
3. Open **Run and Debug**, select **Run Extension**, and press F5. VS Code opens an Extension Development Host window.
4. Click the NEXUS icon in the Activity Bar. Select code in an editor and click **Analyze Selection**.
5. Click **Sign In** to use your NEXUS account. The access token is kept in VS Code SecretStorage. The password is not stored.
6. After sign-in, the sidebar shows chat, logout, dashboard, Human API and Skill Quest navigation. Dashboard opening uses a short-lived, single-use server code exchange; configure the browser origin in the backend CORS allowlist. This is session reuse, not corporate identity-provider SSO.

## Chat context and privacy

- **Normal Chat** uses the selected code, nearby lines and diagnostics only when you explicitly request analysis.
- **Advanced Chat** starts with no extra workspace content. Click **Review workspace file scope** to list eligible file names, choose up to five, inspect the exact paths in the approval dialog, then approve or cancel. NEXUS reads only approved files. You can replace/clear the selection or switch to Normal Chat; the approved paths remain visible until cleared. File content is sent only with your next explicit analysis/chat request, after server-side sanitization.
- Workspace Trust must be enabled. `.env` files, keys, secrets, dependency/build folders and VS Code excluded paths are filtered. This is a best-effort exclusion and sanitizer, not a guarantee of secret detection; inspect files before approving and follow company policy.
- The sidebar keeps up to 15 conversation threads, each with up to 40 visible messages, in VS Code webview state on this machine. Use **Clear history** to erase that local display history. User-entered text and AI replies are stored; active selections and approved workspace file contents are not automatically stored by the history feature. Extension-host troubleshooting context is kept only in memory, so after a VS Code restart, select/analyze code again before continuing a code-specific diagnosis.
- The **Human API** button uses the last analyzed issue to rank available experts. Starting a request asks for explicit confirmation before sharing its sanitized saved snippet, diagnostics, and NEXUS answer. NEXUS prepares the issue summary and opens the chat in the extension without a second problem form. The expert dashboard polls for requests and shows an incoming-request dialog while open.
- The **Visual Expert** button opens the dashboard AI page. From a matched expert profile, its AI Visual Expert action starts a separate contextual conversation after consent, using the analyzed issue and the expert's listed skills. It uses approved sources, labels responses as AI-generated, and cites references. Automatic company Git ingestion awaits authorized repository and policy details.
- The Dashboard button opens the browser app through the one-time code exchange when the extension is signed in. The Human API dashboard preselects the latest analyzed issue; experts see their incoming requests and flagged AI response reviews. Skill Quest opens the dashboard learning page.

The backend URL defaults to `http://127.0.0.1:8999`; the dashboard defaults to `http://127.0.0.1:3456`. Change either under **Settings → Extensions → NEXUS**, or run **NEXUS: Set Backend URL** for the backend URL.

## Build an installable VSIX

From this folder, run `npm.cmd install`, then `npm.cmd run package` in PowerShell. Install the generated `.vsix` using VS Code's **Extensions: Install from VSIX...** command.

The extension sends selected code, nearby lines, file path/name, language ID, workspace name, and diagnostics to the configured NEXUS backend when Analyze is run. Review the selection before sending. Dashboard session reuse exchanges a short-lived code; it never transfers the extension JWT in the URL.
