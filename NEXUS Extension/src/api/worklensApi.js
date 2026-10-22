// WorkLens API Client — communicates with Django backend via JWT auth
const vscode = require('vscode');

const ACTION_ENDPOINTS = {
    ask: '/api/worklens/analyze/',
    guide: '/api/worklens/guide/',
    hint: '/api/worklens/hint/',
    explain: '/api/worklens/explain/',
    verify: '/api/worklens/verify/',
};

const TOKEN_KEY = 'worklens.jwt.access';
const REFRESH_TOKEN_KEY = 'worklens.jwt.refresh';

class WorklensApi {
    /**
     * @param {import('vscode').ExtensionContext} context
     */
    constructor(context) {
        this.context = context;
        // In-memory session state — reset on each new analyze call
        this._sessionId = null;
        this._problemId = null;
        this._guidanceLevel = 0;
        this._epoch = 0;
        this.authVersion = 0;
    }

    get baseUrl() {
        const config = vscode.workspace.getConfiguration('worklens');
        return (config.get('backendUrl') || 'http://127.0.0.1:8000/').replace(/\/$/, '');
    }

    // ── Token storage (VS Code SecretStorage) ──────────────────────

    async _getAccessToken() { return this.context.secrets.get(TOKEN_KEY); }
    async _getRefreshToken() { return this.context.secrets.get(REFRESH_TOKEN_KEY); }

    async _saveTokens(access, refresh) {
        await this.context.secrets.store(TOKEN_KEY, access);
        if (refresh) await this.context.secrets.store(REFRESH_TOKEN_KEY, refresh);
    }

    async _clearTokens() {
        await this.context.secrets.delete(TOKEN_KEY);
        await this.context.secrets.delete(REFRESH_TOKEN_KEY);
    }

    // ── Sign in / out ──────────────────────────────────────────────

    /**
     * Prompt for email + password via VS Code input boxes.
     * Fallback method used when signing in from the command palette.
     */
    async signIn() {
        const email = await vscode.window.showInputBox({
            prompt: 'WorkLens — enter your email',
            placeHolder: 'empid@tcs.com',
            ignoreFocusOut: true,
        });
        if (!email) throw new Error('Sign-in cancelled.');

        const password = await vscode.window.showInputBox({
            prompt: 'WorkLens — enter your password',
            password: true,
            ignoreFocusOut: true,
        });
        if (!password) throw new Error('Sign-in cancelled.');

        return this.signInWithCredentials(email, password);
    }

    /**
     * Sign in with credentials directly (called from the webview login form).
     * @param {string} email
     * @param {string} password
     */
    async signInWithCredentials(email, password) {
        const res = await this._rawPost(`${this.baseUrl}/api/auth/login/`, { email, password });
        if (!res.access) throw new Error(res.detail || 'Login failed — check your credentials.');

        await this._saveTokens(res.access, res.refresh);
        this.authVersion++;
        this.resetSession();
        return { email };
    }

    async signOut() {
        await this._clearTokens();
        this.authVersion++;
        this.resetSession();
    }

    /**
     * Silently check whether a valid session exists (access token stored, or
     * refresh token can be exchanged) WITHOUT prompting the user for credentials.
     * @returns {Promise<boolean>}
     */
    async checkAuthSilent() {
        const token = await this._getAccessToken();
        if (token) return true;

        const refresh = await this._getRefreshToken();
        if (refresh) {
            try {
                const res = await this._rawPost(`${this.baseUrl}/api/auth/refresh/`, { refresh });
                if (res.access) {
                    await this._saveTokens(res.access, refresh);
                    return true;
                }
            } catch (_) { /* refresh failed — not authenticated */ }
        }
        return false;
    }

    // ── Chat history ────────────────────────────────────────────────

    /**
     * Fetch the current user's last 4 chat sessions.
     * @returns {Promise<Array>} Array of chat history items
     */
    async getChatHistory() {
        let token = await this.ensureAuthenticated();
        const url = `${this.baseUrl}/api/worklens/history/`;

        const response = await this._authenticatedFetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        }, 10000);

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Could not load chat history.');
        return data.history || [];
    }

    /**
     * Fetch full details for a single problem (context, attempts) to restore a chat.
     * @param {string} problemId  UUID of the Problem to load
     * @returns {Promise<object>} Full problem detail object
     */
    async getProblemDetail(problemId) {
        let token = await this.ensureAuthenticated();
        const url = `${this.baseUrl}/api/worklens/problem/${problemId}/`;

        const response = await this._authenticatedFetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        }, 10000);

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error?.message || 'Failed to load problem details.');
        }
        return data;
    }

    /**
     * Restore in-memory session state so follow-up sends attach to the correct session.
     * @param {string} sessionId
     * @param {string} problemId
     */
    resumeSession(sessionId, problemId) {
        this._epoch++;
        this._sessionId = sessionId;
        this._problemId = problemId;
        this._guidanceLevel = 0;
    }

    /**
     * Call Document Generator Agent endpoint to analyze workspace and synthesize docs
     * @param {object} payload { workspace_name, file_tree, dependencies, prompt }
     * @returns {Promise<object>} { success, workspace_name, markdown, mermaid, pdf_base64, stats }
     */
    async generateDocs(payload) {
        const url = `${this.baseUrl}/api/worklens/generate-docs/`;
        const response = await this._authenticatedFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }, 60000);

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error?.message || 'Failed to generate documentation.');
        }
        return data;
    }

    /**
     * Call Test Suite Generator Agent endpoint to analyze files/folder and synthesize unit tests
     * @param {object} payload { target_name, files, framework, prompt }
     * @returns {Promise<object>} { success, target_name, framework, run_command, files, stats }
     */
    async generateTests(payload) {
        const url = `${this.baseUrl}/api/worklens/generate-tests/`;
        const response = await this._authenticatedFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }, 60000);

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error?.message || 'Failed to generate test suite.');
        }
        return data;
    }

    async generateInfra(payload) {
        const url = `${this.baseUrl}/api/worklens/generate-infra/`;
        const response = await this._authenticatedFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }, 60000);

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error?.message || 'Failed to generate infrastructure manifests.');
        }
        return data;
    }

    /**
     * Synthesize safe, platform-appropriate terminal commands from natural language.
     * @param {{ prompt: string, envInfo: object }} payload
     * @returns {Promise<object>} Command plan { command, explanation, risk_level, risk_reason }
     */
    async generateCommand(payload) {
        const url = `${this.baseUrl}/api/worklens/generate-command/`;
        const response = await this._authenticatedFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }, 35000);

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error?.message || 'Failed to synthesize terminal command.');
        }
        return data;
    }


    // ── Auth helpers ───────────────────────────────────────────────

    /**
     * Return a valid access token, refreshing if needed, prompting login if not.
     */
    async ensureAuthenticated() {
        let token = await this._getAccessToken();
        if (token) return token;

        // Try refresh
        const refresh = await this._getRefreshToken();
        if (refresh) {
            try {
                const res = await this._rawPost(`${this.baseUrl}/api/auth/refresh/`, { refresh });
                if (res.access) {
                    await this._saveTokens(res.access, refresh);
                    return res.access;
                }
            } catch (_) { /* fall through to login prompt */ }
        }

        // No token — prompt login
        const session = await this.signIn();
        if (!session) throw new Error('Authentication required. Please sign in.');
        return this._getAccessToken();
    }

    /**
     * Send a payload to the backend for a given action.
     * Automatically injects problem_id and session_id for conversation continuity.
     * @param {'ask'|'guide'|'hint'|'explain'|'verify'} action
     * @param {object} payload
     */
    async send(action, payload) {
        const endpoint = ACTION_ENDPOINTS[action];
        if (!endpoint) throw new Error(`Unknown action: ${action}`);
        let token = await this.ensureAuthenticated();
        const epoch = this._epoch;

        // Inject session state into every call after the first
        const enrichedPayload = {
            ...payload,
            client_turn_id: require('crypto').randomUUID(),
            ...(this._sessionId ? { session_id: this._sessionId } : {}),
            ...(this._problemId ? { problem_id: this._problemId } : {}),
        };

        const url = `${this.baseUrl}${endpoint}`;

        let response = await this._fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(enrichedPayload),
        }, 120000);

        // Token expired mid-session — try refresh once
        if (response.status === 401) {
            await this.context.secrets.delete(TOKEN_KEY);
            token = await this.ensureAuthenticated();
            response = await this._fetchWithTimeout(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(enrichedPayload),
            }, 120000);
        }

        const data = await response.json();
        if (epoch !== this._epoch) {
            const error = new Error('The active conversation changed.');
            error.staleConversation = true;
            throw error;
        }

        if (!response.ok || !data.success) {
            let msg = `Backend returned ${response.status}`;
            if (data?.error?.message) {
                if (typeof data.error.message === 'string') {
                    msg = data.error.message;
                } else if (typeof data.error.message === 'object') {
                    msg = Object.entries(data.error.message)
                        .map(([k, v]) => {
                            if (Array.isArray(v)) {
                                return `${k}: ${v.map(item => (typeof item === 'object' ? JSON.stringify(item) : item)).join(', ')}`;
                            }
                            return `${k}: ${JSON.stringify(v)}`;
                        })
                        .join('; ');
                }
            } else if (data?.detail) {
                msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
            }
            throw new Error(msg);
        }

        // Persist session state for subsequent calls
        if (data.session_id) { this._sessionId = data.session_id; }
        if (data.problem_id) {
            // New analyze call — reset guidance level
            if (action === 'ask') { this._guidanceLevel = 0; }
            this._problemId = data.problem_id;
        }
        if (data.response && data.response.guidance_level !== undefined) {
            this._guidanceLevel = data.response.guidance_level;
        }

        return data;
    }

    /** Reset session state (e.g. on new file / new error) */
    async prepareHumanContext(payload) {
        const epoch = this._epoch;
        const response = await this._authenticatedFetch(`${this.baseUrl}/api/assistance/explicit-help-context/`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, ...(this._problemId ? { problem_id: this._problemId } : {}),
                ...(this._sessionId ? { session_id: this._sessionId } : {}) }),
        }, 15000);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Could not prepare the problem context.');
        if (epoch !== this._epoch) { const error = new Error('Conversation changed.'); error.staleConversation = true; throw error; }
        this._sessionId = data.session_id; this._problemId = data.problem_id;
        return data;
    }

    resetSession() {
        this._epoch++;
        this._sessionId = null;
        this._problemId = null;
        this._guidanceLevel = 0;
    }

    // ── HTTP helpers ───────────────────────────────────────────────

    async _rawPost(url, body) {
        const res = await this._fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }, 10000);
        return await res.json();
    }

    async _authenticatedFetch(url, options, timeoutMs) {
        let token = await this.ensureAuthenticated();
        const send = () => this._fetchWithTimeout(url, { ...options,
            headers: { ...options.headers, Authorization: `Bearer ${token}` } }, timeoutMs);
        let response = await send();
        if (response.status === 401) {
            await this.context.secrets.delete(TOKEN_KEY);
            token = await this.ensureAuthenticated(); response = await send();
        }
        return response;
    }

    /**
     * Fetch with timeout using native http/https (no extra deps).
     */
    async _fetchWithTimeout(url, options, timeoutMs) {
        const https = require('https');
        const http = require('http');
        const { URL } = require('url');

        return new Promise((resolve, reject) => {
            const parsed = new URL(url);
            const lib = parsed.protocol === 'https:' ? https : http;
            const bodyBuf = options.body ? Buffer.from(options.body, 'utf8') : null;

            const reqOptions = {
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method: options.method || 'GET',
                headers: {
                    ...(options.headers || {}),
                    ...(bodyBuf ? { 'Content-Length': bodyBuf.length } : {}),
                },
            };

            const req = lib.request(reqOptions, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk; });
                res.on('end', () => {
                    try {
                        resolve({
                            ok: res.statusCode >= 200 && res.statusCode < 300,
                            status: res.statusCode,
                            json: async () => JSON.parse(body),
                        });
                    } catch (e) {
                        reject(new Error(`WorkLens: Failed to parse response — ${e.message}`));
                    }
                });
            });

            req.on('error', reject);

            const timer = setTimeout(() => {
                req.destroy();
                reject(new Error('WorkLens: Request timed out. Backend may not be running.'));
            }, timeoutMs);

            req.on('close', () => clearTimeout(timer));

            if (bodyBuf) req.write(bodyBuf);
            req.end();
        });
    }
}

module.exports = { WorklensApi };
