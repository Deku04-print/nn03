// ─────────────────────────────────────────────────────────────────────
// WorkLens Panel Provider — VS Code WebviewViewProvider
//
// Best practices applied:
//   • Static viewType constant for registration
//   • Proper disposal of event subscriptions
//   • Webview state persistence via retainContextWhenHidden
//   • Guard against posting to a disposed view
//   • Session ID reset on visibility change
//   • Crypto-safe nonce delegated to webview module
//   • JSDoc on all public methods
//   • Credential-forwarding for sign_in_credentials message type
// ─────────────────────────────────────────────────────────────────────
'use strict';

const vscode = require('vscode');
const { getWebviewContent } = require('./webview');

/** @type {string} Unique identifier registered in package.json `views`. */
const VIEW_TYPE = 'worklens.mentorPanel';

/**
 * Maps webview message types → VS Code command IDs.
 * Commands that need payload data are listed in PAYLOAD_COMMANDS.
 * @type {Record<string, string>}
 */
const MESSAGE_COMMAND_MAP = {
    open_human_api: 'worklens.openHumanAPI',
    ai_feedback: 'worklens.aiFeedback',
    load_notifications: 'worklens.loadNotifications',
    read_notification: 'worklens.readNotification',
    reset_backend_session: 'worklens.resetBackendSession',
    resume_backend_session: 'worklens.resumeBackendSession',
    user_reply: 'worklens.hint',
    request_hint: 'worklens.hint',
    verify: 'worklens.verify',
    sign_in: 'worklens.signIn',
    sign_in_credentials: 'worklens.signInWithCreds',
    sign_out: 'worklens.signOut',
    refresh: 'worklens.refresh',
    request_history: 'worklens.loadHistory',
    load_chat: 'worklens.loadChat',
    check_auth: 'worklens.checkAuth',
    request_workspace_files: 'worklens.getWorkspaceFiles',
    // ── Project-scoped chat history ──
    load_project_history: 'worklens.loadProjectHistory',
    // ── Local chat history (search panel) ──
    open_search_panel: 'worklens.loadLocalHistory',
    load_all_conversations: 'worklens.loadAllConversations',
    search_conversations: 'worklens.searchLocalHistory',
    open_local_conversation: 'worklens.openLocalConversation',
    save_conversation: 'worklens.saveConversation',
    delete_conversation: 'worklens.deleteConversation',
    clear_all_history: 'worklens.clearAllHistory',
    start_voice_input: 'worklens.startVoiceInput',
    // ── Agent Hub / Autonomous Agents ──
    generate_docs: 'worklens.generateDocs',
    generate_tests: 'worklens.generateTests',
    generate_infra: 'worklens.generateInfra',
    plan_terminal_command: 'worklens.generateTerminalCommand',
    execute_terminal_command: 'worklens.executeTerminalCommand',
    reject_terminal_command: 'worklens.rejectTerminalCommand',
    run_test_command: 'worklens.runTestCommand',
    open_workspace_file: 'worklens.openFile',
};

/** Messages that need their full payload forwarded to the command. */
const PAYLOAD_COMMANDS = new Set([
    'open_human_api', 'ai_feedback', 'read_notification', 'resume_backend_session',
    'sign_in_credentials', 'load_chat', 'user_reply',
    'search_conversations', 'open_local_conversation', 'save_conversation',
    'delete_conversation', 'generate_docs', 'generate_tests',
    'generate_infra', 'plan_terminal_command', 'execute_terminal_command', 'reject_terminal_command',
    'run_test_command', 'open_workspace_file',
]);

class WorklensPanelProvider {

    /** Static view type — matches the `id` in `contributes.views`. */
    static viewType = VIEW_TYPE;

    /**
     * @param {vscode.Uri}              extensionUri  Root URI of the extension
     * @param {vscode.ExtensionContext} context       Extension context for disposables
     */
    constructor(extensionUri, context) {
        /** @private @readonly */ this._extensionUri = extensionUri;
        /** @private @readonly */ this._context = context;
        /** @private @type {vscode.WebviewView | null} */  this._view = null;
        /** @private @type {string | null} */              this._sessionId = null;
        /** @private @type {vscode.Disposable[]} */        this._disposables = [];
    }

    // ── WebviewViewProvider interface ────────────────────────────────

    /**
     * Called by VS Code when the sidebar view becomes visible for the
     * first time (or when restored after serialisation).
     *
     * @param {vscode.WebviewView}                webviewView
     * @param {vscode.WebviewViewResolveContext}   _resolveContext
     * @param {vscode.CancellationToken}           _token
     */
    resolveWebviewView(webviewView, _resolveContext, _token) {
        this._view = webviewView;

        // ── Webview options ──────────────────────────────────────────
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media'),
            ],
        };

        // Keep the webview alive when the sidebar tab is hidden so
        // conversation state is not lost between tab switches.
        webviewView.options = { retainContextWhenHidden: true };

        // ── Render HTML ──────────────────────────────────────────────
        this._updateHtml(webviewView.webview);

        // ── Event subscriptions (tracked for disposal) ───────────────
        const messageDisposable = webviewView.webview.onDidReceiveMessage(
            (msg) => this._handleWebviewMessage(msg),
            undefined,
            this._disposables,
        );

        // Clean up when the view is disposed (user closes sidebar)
        webviewView.onDidDispose(() => this._onViewDisposed(), undefined, this._disposables);

        // When the panel becomes visible (re-opened), check stored tokens so
        // the webview can skip the login page if the user is already authenticated.
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._sessionId = this._generateSessionId();
                vscode.commands.executeCommand('worklens.checkAuth');
            }
        }, undefined, this._disposables);

        // Initial session + immediate auth check on first resolve
        this._sessionId = this._generateSessionId();
        // Small delay so the webview has time to mount before receiving the message
        setTimeout(() => vscode.commands.executeCommand('worklens.checkAuth'), 200);
    }

    // ── Public API ──────────────────────────────────────────────────

    /**
     * Post a message to the webview.
     * Safely no-ops if the view has been disposed or is not yet created.
     * @param {object} message
     * @returns {Thenable<boolean> | undefined}
     */
    postMessage(message) {
        return this._view?.webview?.postMessage(message);
    }

    /** @returns {string | null} Current session identifier. */
    get sessionId() {
        return this._sessionId;
    }

    /** Force-reveal the sidebar panel. */
    reveal() {
        this._view?.show?.(true);
    }

    // ── Private helpers ─────────────────────────────────────────────

    /**
     * Render (or re-render) the webview HTML.
     * @param {vscode.Webview} webview
     * @private
     */
    _updateHtml(webview) {
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'worklens.css'),
        );
        const jsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'worklens.js'),
        );
        const logo1Uri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'nexus-placeholder.svg'),
        );
        const nameTagUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'nexus-placeholder.svg'),
        );
        const assistanceUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'assistance.js'));
        webview.html = getWebviewContent(cssUri, jsUri, webview, logo1Uri, nameTagUri, assistanceUri);
    }

    /**
     * Route incoming webview messages to the corresponding VS Code command.
     * Messages in PAYLOAD_COMMANDS get their full payload forwarded.
     * @param {{ type: string, [key: string]: unknown }} message
     * @private
     */
    _handleWebviewMessage(message) {
        const commandId = MESSAGE_COMMAND_MAP[message.type];
        if (commandId) {
            if (PAYLOAD_COMMANDS.has(message.type)) {
                // Forward full message payload for commands that need data
                vscode.commands.executeCommand(commandId, message);
            } else {
                vscode.commands.executeCommand(commandId);
            }
        } else {
            console.warn(`[WorkLens] Unhandled webview message: "${message.type}"`);
        }
    }

    /**
     * Called when the webview view is disposed (sidebar closed).
     * Releases all tracked disposables to prevent memory leaks.
     * @private
     */
    _onViewDisposed() {
        this._view = null;
        this._sessionId = null;
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }

    /**
     * Generate a unique session identifier.
     * @returns {string}
     * @private
     */
    _generateSessionId() {
        return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
}

module.exports = { WorklensPanelProvider, VIEW_TYPE };
