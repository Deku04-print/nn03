'use strict';
const vscode = require('vscode');

class AssistanceController {
    constructor(api, panel) { this.api = api; this.panel = panel; this.running = false; this.disposed = false; }
    async request(path, body, method = 'POST', interactive = true) {
        let token = interactive ? await this.api.ensureAuthenticated() : await this.api._getAccessToken();
        if (!token) throw new Error('Session expired. Sign in again.');
        const send = () => this.api._fetchWithTimeout(`${this.api.baseUrl}/api/assistance/${path}`, {
            method: body === undefined ? 'GET' : method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }, 15000);
        let response = await send();
        if (response.status === 401) {
            await this.api.context.secrets.delete('worklens.jwt.access');
            if (interactive) token = await this.api.ensureAuthenticated();
            else {
                const refresh = await this.api._getRefreshToken();
                const renewed = refresh ? await this.api._rawPost(`${this.api.baseUrl}/api/auth/refresh/`, { refresh }) : {};
                if (!renewed.access) {
                    await this.api._clearTokens(); this.api.authVersion++;
                    this.panel.postMessage({ type: 'auth_status', signedIn: false });
                    throw new Error('Session expired. Sign in again.');
                }
                await this.api._saveTokens(renewed.access, refresh); token = renewed.access;
            }
            response = await send();
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || data.error?.message || `Request failed (${response.status})`);
        return data;
    }
    async notifications() {
        if (this.disposed || this.running) return;
        this.running = true;
        const identityVersion = this.api.authVersion;
        try {
            if (!(await this.api.checkAuthSilent())) return;
            const data = await this.request('notifications/', undefined, 'GET', false);
            if (identityVersion !== this.api.authVersion) return;
            this.panel.postMessage({ type: 'assistance_notifications', ...data });
        } catch (e) { this.panel.postMessage({ type: 'assistance_notifications_error', message: e.message }); }
        finally { this.running = false; }
    }
    async feedback(payload) {
        try {
            const result = await this.request(`turns/${payload.response_id}/feedback/`, { value: payload.value });
            this.panel.postMessage({ type: 'ai_feedback_result', response_id: payload.response_id, ...result });
        } catch (e) { this.panel.postMessage({ type: 'ai_feedback_result', response_id: payload.response_id, error: e.message }); }
    }
    async open(payload) {
        try {
            if (payload.notification_id) {
                // Resolve the session from the recipient's own notification, not an arbitrary webview URL.
                const data = await this.request('notifications/');
                const notification = data.notifications.find(n => n.id === payload.notification_id);
                if (!notification) throw new Error('Notification is no longer available.');
                await this.request('notifications/', { id: notification.id });
                await this.handoff(`/human-api/chat/${notification.session_id}`);
                this.notifications(); return;
            }
            const problemId = this.api._problemId;
            if (!problemId) throw new Error('Start or restore a troubleshooting problem first.');
            if (payload.problem_id && payload.problem_id !== problemId) throw new Error('The active problem changed. Reopen Human API from the current conversation.');
            const detail = await this.api.getProblemDetail(problemId);
            const summary = detail.messages?.find(m => m.question)?.question || detail.problem.description || 'Troubleshooting assistance';
            const history = (detail.messages || []).map(m => `User: ${m.question || 'Code analysis'}\nNEXUS: ${JSON.stringify(m.response)}`).join('\n\n');
            const choice = await vscode.window.showInformationMessage(
                `Share this problem with an expert?\n\n${summary.slice(0, 800)}\n\nOnly the shared snapshot is visible. Original source context stays private unless separately authorized.`,
                { modal: true }, 'Share question only', 'Review troubleshooting history');
            if (!choice) return;
            let sharedHistory = '';
            if (choice === 'Review troubleshooting history') {
                const document = await vscode.workspace.openTextDocument({ content: `${summary}\n\n${history}`, language: 'plaintext' });
                await vscode.window.showTextDocument(document, { preview: true });
                const consent = await vscode.window.showInformationMessage('Share the reviewed question and troubleshooting transcript? The transcript can contain code quoted in prior AI responses.', { modal: true }, 'Share reviewed transcript');
                if (!consent) return;
                sharedHistory = history;
            }
            const shareCode = await vscode.window.showQuickPick([
                { label: 'Keep selected source code private', value: false },
                { label: 'Authorize sharing the stored selected code', value: true },
            ], { title: 'Human API context permissions', ignoreFocusOut: true });
            if (!shareCode) return;
            const result = await this.request('cases/', { problem_id: problemId, conversation_id: detail.problem.session_id,
                problem_context_id: detail.problem_context_id, consent: true, summary: summary.slice(0, 10000),
                history: sharedHistory.slice(0, 40000), share_code: shareCode.value });
            await this.handoff(`/human-api/${result.id}`);
        } catch (e) { vscode.window.showErrorMessage(`NEXUS: ${e.message}`); }
    }
    async handoff(destination) {
        const base = vscode.workspace.getConfiguration('worklens').get('dashboardUrl') || 'http://localhost:3456';
        const url = new URL(base);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Configure a valid dashboard URL.');
        const handoff = await this.request('handoffs/', { destination });
        url.pathname = '/handoff'; url.search = ''; url.hash = handoff.id;
        await vscode.env.openExternal(vscode.Uri.parse(url.toString()));
        const deadline = Date.now() + 115000;
        while (!this.disposed && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            const state = await this.request(`handoffs/${handoff.id}/`);
            if (state.claimed) {
                const approved = await vscode.window.showInformationMessage(`Approve the browser showing NEXUS code ${state.verification_code}? Only approve if this matches the browser you just opened.`, { modal: true }, 'Approve browser');
                if (approved) await this.request(`handoffs/${handoff.id}/`, { verification_code: state.verification_code });
                return;
            }
        }
        if (!this.disposed) throw new Error('Browser handoff expired. Open Human API again.');
    }
    dispose() { this.disposed = true; }
}
module.exports = { AssistanceController };
