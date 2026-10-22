// WorkLens Extension — Main Entry Point
const vscode = require('vscode');
const { WorklensPanelProvider } = require('./src/ui/worklensPanel');
const { WorklensCommand } = require('./src/commands/worklensCommand');
const { ChatHistoryManager } = require('./src/storage/chatHistoryManager');
const { DocGeneratorAgent } = require('./src/agents/docGeneratorAgent');
const { TestGeneratorAgent } = require('./src/agents/testGeneratorAgent');
const { InfraGeneratorAgent } = require('./src/agents/infraGeneratorAgent');
const { TerminalCommandAgent } = require('./src/agents/terminalCommandAgent');
const { TerminalErrorAnalyzer } = require('./src/context/terminalErrorAnalyzer');
const { exec } = require('child_process');
const { AssistanceController } = require('./src/assistance/controller');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('[WorkLens] Extension activating...');

  // ── Local chat history manager (workspace-scoped JSON file) ──
  const historyManager = new ChatHistoryManager();

  // Register the sidebar WebviewView provider
  const panelProvider = new WorklensPanelProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('worklens.mentorPanel', panelProvider)
  );

  const cmd = new WorklensCommand(panelProvider, context);
  const assistance = new AssistanceController(cmd.api, panelProvider);
  const notificationTimer = setInterval(() => assistance.notifications(), 10000);
  context.subscriptions.push({ dispose: () => { clearInterval(notificationTimer); assistance.dispose(); } });
  const docAgent = new DocGeneratorAgent(panelProvider, cmd.api);
  const testAgent = new TestGeneratorAgent(panelProvider, cmd.api);
  const infraAgent = new InfraGeneratorAgent(panelProvider, cmd.api);
  const terminalAgent = new TerminalCommandAgent(panelProvider, cmd.api);


  // ── Helper: push the current project's history to the webview ──
  function _pushProjectHistory() {
    try {
      historyManager.invalidateCache(); // re-read from disk for the current folder
      const conversations = historyManager.getAllConversations();
      const projectName = historyManager.getProjectName();
      panelProvider.postMessage({ type: 'project_history', conversations, projectName });
    } catch (err) {
      console.warn('[WorkLens] Failed to push project history:', err.message);
      panelProvider.postMessage({ type: 'project_history', conversations: [], projectName: 'this project' });
    }
  }

  // ── Listen for workspace folder changes ──────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      console.log('[WorkLens] Workspace folders changed — reloading project history.');
      _pushProjectHistory();
    })
  );

  // Register all commands
  const commands = [
    vscode.commands.registerCommand('worklens.openHumanAPI', payload => assistance.open(payload || {})),
    vscode.commands.registerCommand('worklens.aiFeedback', payload => assistance.feedback(payload)),
    vscode.commands.registerCommand('worklens.loadNotifications', () => assistance.notifications()),
    vscode.commands.registerCommand('worklens.readNotification', async payload => {
      try { await assistance.request('notifications/', { id: payload.id }); assistance.notifications(); }
      catch (e) { panelProvider.postMessage({ type: 'assistance_notifications_error', message: e.message }); }
    }),
    vscode.commands.registerCommand('worklens.resetBackendSession', () => cmd.api.resetSession()),
    vscode.commands.registerCommand('worklens.resumeBackendSession', async payload => {
      cmd.api.resetSession();
      if (!payload?.problem_id) return;
      try {
        const detail = await cmd.api.getProblemDetail(payload.problem_id);
        cmd.api.resumeSession(detail.problem.session_id, detail.problem.id);
        panelProvider.postMessage({ type: 'assistance_context', data: { problem_id: detail.problem.id,
          problem_context_id: detail.problem_context_id, conversation_id: detail.problem.session_id,
          human_api_suggested: detail.human_api_suggested, ai_response_count: detail.ai_response_count } });
      } catch (e) { panelProvider.postMessage({ type: 'assistance_notifications_error', message: e.message }); }
    }),
    vscode.commands.registerCommand('worklens.ask', () => cmd.execute('ask')),
    vscode.commands.registerCommand('worklens.guide', () => cmd.execute('guide')),
    vscode.commands.registerCommand('worklens.hint', (payload) => {
      cmd.execute(
        'hint',
        payload?.text,
        payload?.conversation_history || [],
        payload?.enhanced_mode === true,
        payload?.tagged_files || [],
      );
    }),
    vscode.commands.registerCommand('worklens.explain', () => cmd.execute('explain')),
    vscode.commands.registerCommand('worklens.verify', () => cmd.execute('verify')),

    // ── Sign-in via command palette (uses VS Code input boxes) ──
    vscode.commands.registerCommand('worklens.signIn', async () => {
      try {
        const session = await cmd.api.signIn();
        panelProvider.postMessage({ type: 'auth_status', signedIn: true });
        vscode.window.showInformationMessage(`WorkLens: Signed in as ${session.email}.`);
        // Push project history for the current folder
        _pushProjectHistory();
        // Also fetch remote history (non-critical)
        try {
          const history = await cmd.api.getChatHistory();
          panelProvider.postMessage({ type: 'chat_history', history });
        } catch (_) { /* history fetch failure is non-critical */ }
      } catch (error) {
        panelProvider.postMessage({ type: 'auth_status', signedIn: false, error: error.message });
        vscode.window.showErrorMessage(`WorkLens: Sign-in failed — ${error.message || 'Please try again.'}`);
      }
    }),

    // ── Sign-in from webview login form (credentials passed via message) ──
    vscode.commands.registerCommand('worklens.signInWithCreds', async (payload) => {
      try {
        const { email, password } = payload || {};
        if (!email || !password) {
          panelProvider.postMessage({ type: 'auth_status', signedIn: false, error: 'Email and password are required.' });
          return;
        }
        const session = await cmd.api.signInWithCredentials(email, password);
        panelProvider.postMessage({ type: 'auth_status', signedIn: true });
        vscode.window.showInformationMessage(`WorkLens: Signed in as ${session.email}.`);
        // Push project history for the current folder
        _pushProjectHistory();
        // Also fetch remote history (non-critical)
        try {
          const history = await cmd.api.getChatHistory();
          panelProvider.postMessage({ type: 'chat_history', history });
        } catch (_) { /* history fetch failure is non-critical */ }
      } catch (error) {
        panelProvider.postMessage({ type: 'auth_status', signedIn: false, error: error.message || 'Sign-in failed.' });
      }
    }),

    // ── Sign-out ──
    vscode.commands.registerCommand('worklens.signOut', async () => {
      await cmd.api.signOut();
      panelProvider.postMessage({ type: 'auth_status', signedIn: false });
      vscode.window.showInformationMessage('WorkLens: Signed out.');
    }),

    // ── Silent auth check — called on panel resolve / visibility change ──
    // Probes stored tokens without prompting the user for credentials.
    vscode.commands.registerCommand('worklens.checkAuth', async () => {
      try {
        const isAuth = await cmd.api.checkAuthSilent();
        panelProvider.postMessage({ type: 'auth_status', signedIn: isAuth });
        if (isAuth) {
          // Push the project-scoped local history first (fast, from disk)
          _pushProjectHistory();
          // Then optionally fetch remote history (non-critical)
          try {
            const history = await cmd.api.getChatHistory();
            panelProvider.postMessage({ type: 'chat_history', history });
          } catch (_) { /* history fetch failure is non-critical */ }
        }
      } catch (error) {
        // Any unexpected error — treat as unauthenticated
        panelProvider.postMessage({ type: 'auth_status', signedIn: false });
      }
    }),

    // ── Load chat history (remote) ──
    vscode.commands.registerCommand('worklens.loadHistory', async () => {
      try {
        const history = await cmd.api.getChatHistory();
        panelProvider.postMessage({ type: 'chat_history', history });
      } catch (error) {
        console.warn('[WorkLens] Failed to load chat history:', error.message);
      }
    }),

    // ── Continue a previous chat ──
    vscode.commands.registerCommand('worklens.loadChat', async (payload) => {
      const problemId = payload?.problem_id;
      if (!problemId) {
        console.warn('[WorkLens] loadChat called without problem_id');
        return;
      }
      try {
        panelProvider.postMessage({ type: 'loading', hint: 'Loading previous chat…' });
        const detail = await cmd.api.getProblemDetail(problemId);
        // Restore in-memory session so follow-up sends attach to the right session
        cmd.api.resumeSession(detail.problem.session_id, detail.problem.id);
        // Tell the webview to rebuild the conversation thread
        panelProvider.postMessage({ type: 'restore_chat', detail });
      } catch (error) {
        console.error('[WorkLens] loadChat error:', error);
        panelProvider.postMessage({
          type: 'error',
          message: error.message || 'Could not load the previous chat. Please try again.',
        });
      }
    }),

    // ── Refresh — re-analyze active editor context or refresh history ──
    vscode.commands.registerCommand('worklens.refresh', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document && editor.document.uri.scheme === 'file') {
        cmd.execute('ask');
      } else {
        // No code file active in editor: reload history gracefully without error screen
        _pushProjectHistory();
        vscode.window.showInformationMessage('WorkLens: Project history refreshed. Open a code file in the editor to analyze code.');
      }
    }),

    // ── Open / focus the WorkLens sidebar panel (bound to F9) ──
    vscode.commands.registerCommand('worklens.openPanel', () => {
      vscode.commands.executeCommand('worklens.mentorPanel.focus');
    }),

    // ── Project history — load for the current workspace folder ──
    vscode.commands.registerCommand('worklens.loadProjectHistory', () => {
      _pushProjectHistory();
    }),

    // ── Local chat history — load all ──
    vscode.commands.registerCommand('worklens.loadLocalHistory', () => {
      try {
        const conversations = historyManager.getAllConversations();
        panelProvider.postMessage({ type: 'local_history', conversations });
      } catch (err) {
        console.warn('[WorkLens] loadLocalHistory error:', err.message);
        panelProvider.postMessage({ type: 'local_history', conversations: [] });
      }
    }),

    // ── Local chat history — load all (for search panel) ──
    vscode.commands.registerCommand('worklens.loadAllConversations', () => {
      try {
        const conversations = historyManager.getAllConversations();
        panelProvider.postMessage({ type: 'all_conversations', conversations });
      } catch (err) {
        console.warn('[WorkLens] loadAllConversations error:', err.message);
        panelProvider.postMessage({ type: 'all_conversations', conversations: [] });
      }
    }),

    // ── Local chat history — search ──
    vscode.commands.registerCommand('worklens.searchLocalHistory', (payload) => {
      try {
        const query = payload?.query || '';
        const results = historyManager.searchConversations(query);
        panelProvider.postMessage({ type: 'search_results', conversations: results });
      } catch (err) {
        console.warn('[WorkLens] searchLocalHistory error:', err.message);
        panelProvider.postMessage({ type: 'search_results', conversations: [] });
      }
    }),

    // ── Local chat history — open a specific conversation ──
    vscode.commands.registerCommand('worklens.openLocalConversation', (payload) => {
      try {
        const id = payload?.id;
        if (!id) return;
        const conversation = historyManager.getConversation(id);
        if (!conversation) {
          panelProvider.postMessage({ type: 'error', message: 'Conversation not found.' });
          return;
        }
        panelProvider.postMessage({ type: 'restore_local_chat', conversation });
      } catch (err) {
        console.warn('[WorkLens] openLocalConversation error:', err.message);
      }
    }),

    // ── Local chat history — save / update a conversation ──
    vscode.commands.registerCommand('worklens.saveConversation', (payload) => {
      try {
        if (payload?.conversation) {
          historyManager.saveConversation(payload.conversation);
        }
      } catch (err) {
        console.warn('[WorkLens] saveConversation error:', err.message);
      }
    }),

    // ── Local chat history — delete a conversation ──
    vscode.commands.registerCommand('worklens.deleteConversation', (payload) => {
      try {
        const id = payload?.id;
        if (id) {
          const removed = historyManager.deleteConversation(id);
          if (removed) {
            panelProvider.postMessage({ type: 'conversation_deleted', id });
            _pushProjectHistory();
          }
        }
      } catch (err) {
        console.warn('[WorkLens] deleteConversation error:', err.message);
      }
    }),

    // ── Local chat history — clear all history for workspace ──
    vscode.commands.registerCommand('worklens.clearAllHistory', async () => {
      try {
        const confirm = await vscode.window.showWarningMessage(
          'Delete all saved WorkLens conversations for this workspace?',
          { modal: true },
          'Delete All'
        );
        if (confirm === 'Delete All') {
          historyManager.clearAllHistory();
          panelProvider.postMessage({ type: 'all_conversations_cleared' });
          _pushProjectHistory();
          vscode.window.showInformationMessage('WorkLens: All saved conversations deleted.');
        }
      } catch (err) {
        console.warn('[WorkLens] clearAllHistory error:', err.message);
      }
    }),

    // ── Voice Input — trigger native dictation on active input ──
    vscode.commands.registerCommand('worklens.startVoiceInput', async () => {
      try {
        // 1. Try VS Code's native speech-to-text action if installed
        try {
          const executed = await vscode.commands.executeCommand('workbench.action.speech.speechToText');
          if (executed) return;
        } catch (_) {}

        // 2. On macOS, trigger system dictation directly into the focused webview input
        if (process.platform === 'darwin') {
          exec(`osascript -e 'tell application "System Events" to tell process "Code" to click (first menu item of menu "Edit" of menu bar 1 whose name starts with "Start Dictation")'`, (err) => {
            if (err) {
              console.warn('[WorkLens] macOS dictation trigger info:', err.message);
            }
          });
        }
      } catch (err) {
        console.warn('[WorkLens] startVoiceInput error:', err.message);
      }
    }),

    // ── Provide workspace file list for autocomplete ──
    vscode.commands.registerCommand('worklens.getWorkspaceFiles', async () => {
      try {
        // Exclude common noise directories
        const uris = await vscode.workspace.findFiles(
          '**/*',
          '{**/node_modules/**,**/.venv/**,**/venv/**,**/.git/**,**/dist/**,**/build/**,**/__pycache__/**}',
          500,
        );
        const paths = uris.map(u => {
          // Return workspace-relative path when possible
          const rel = vscode.workspace.asRelativePath(u, false);
          return rel;
        });
        panelProvider.postMessage({ type: 'workspace_files', files: paths });
      } catch (err) {
        console.warn('[WorkLens] getWorkspaceFiles error:', err.message);
        panelProvider.postMessage({ type: 'workspace_files', files: [] });
      }
    }),

    // ── Document Generator Agent ──
    vscode.commands.registerCommand('worklens.generateDocs', async (payload) => {
      try {
        await docAgent.run(payload?.prompt || '');
      } catch (err) {
        console.error('[WorkLens] generateDocs error:', err.message);
        panelProvider.postMessage({
          type: 'doc_agent_error',
          message: `Generation error: ${err.message}`
        });
      }
    }),

    // ── Test Suite Generator Agent ──
    vscode.commands.registerCommand('worklens.generateTests', async (payload) => {
      try {
        await testAgent.run(payload?.prompt || '');
      } catch (err) {
        console.error('[WorkLens] generateTests error:', err.message);
        panelProvider.postMessage({
          type: 'test_agent_error',
          message: `Test generation error: ${err.message}`
        });
      }
    }),

    // ── Infrastructure & DevOps Generator Agent ──
    vscode.commands.registerCommand('worklens.generateInfra', async (payload) => {
      try {
        await infraAgent.run(payload?.prompt || '');
      } catch (err) {
        console.error('[WorkLens] generateInfra error:', err.message);
        panelProvider.postMessage({
          type: 'infra_agent_error',
          message: `Infrastructure generation error: ${err.message}`
        });
      }
    }),

    // ── Terminal Command Orchestrator Agent (Human-in-the-Loop) ──
    vscode.commands.registerCommand('worklens.generateTerminalCommand', async (payload) => {
      try {
        await terminalAgent.planCommand(payload?.prompt || '');
      } catch (err) {
        console.error('[WorkLens] generateTerminalCommand error:', err.message);
        panelProvider.postMessage({
          type: 'terminal_agent_error',
          message: `Command synthesis error: ${err.message}`
        });
      }
    }),

    vscode.commands.registerCommand('worklens.executeTerminalCommand', async (payload) => {
      try {
        await terminalAgent.acceptAndExecute(payload?.commandId);
      } catch (err) {
        console.error('[WorkLens] executeTerminalCommand error:', err.message);
      }
    }),

    vscode.commands.registerCommand('worklens.rejectTerminalCommand', (payload) => {
      try {
        terminalAgent.reject(payload?.commandId);
      } catch (err) {
        console.error('[WorkLens] rejectTerminalCommand error:', err.message);
      }
    }),

    // ── Run Test Command in Integrated Terminal ──
    vscode.commands.registerCommand('worklens.runTestCommand', async (payload) => {
      try {
        const cmdString = payload?.command;
        if (!cmdString) return;
        const terminalName = 'WorkLens Tests';
        let term = vscode.window.terminals.find(t => t.name === terminalName);
        if (!term) {
          term = vscode.window.createTerminal(terminalName);
        }
        term.show();
        term.sendText(cmdString);
      } catch (err) {
        console.warn('[WorkLens] runTestCommand error:', err.message);
        vscode.window.showErrorMessage(`Unable to run test command: ${err.message}`);
      }
    }),


    // ── Open workspace file (.md, .mmd, .pdf) ──
    vscode.commands.registerCommand('worklens.openFile', async (payload) => {
      try {
        const filePath = payload?.path;
        if (!filePath) return;
        const uri = vscode.Uri.file(filePath);
        if (filePath.endsWith('.pdf')) {
          try {
            await vscode.commands.executeCommand('vscode.open', uri);
          } catch (_) {
            vscode.env.openExternal(uri);
          }
        } else {
          const doc = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(doc);
        }
      } catch (err) {
        console.warn('[WorkLens] openFile error:', err.message);
        vscode.window.showErrorMessage(`Unable to open file: ${err.message}`);
      }
    }),

    // ── Analyze Terminal Output / Error (Terminal Context Menu) ──
    vscode.commands.registerCommand('worklens.sendTerminalToWorklens', async () => {
      await _handleTerminalSend('ask');
    }),

    vscode.commands.registerCommand('worklens.explainTerminalError', async () => {
      await _handleTerminalSend('explain');
    }),

    vscode.commands.registerCommand('worklens.fixTerminalError', async () => {
      await _handleTerminalSend('fix');
    }),
  ];

  async function _handleTerminalSend(intent = 'ask') {
    try {
      const activeTerminal = vscode.window.activeTerminal;
      // Copy selected text from integrated terminal to clipboard
      await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
      const text = await vscode.env.clipboard.readText();

      if (!text || !text.trim()) {
        vscode.window.showInformationMessage(
          'WorkLens: Please highlight/select the error or output in your terminal, then right-click and choose "Send to WorkLens".'
        );
        return;
      }

      const terminalAnalysis = await TerminalErrorAnalyzer.analyze(text, activeTerminal);
      await cmd.executeTerminalAnalysis(terminalAnalysis, intent);

    } catch (err) {
      console.error('[WorkLens] Terminal analysis failed:', err);
      vscode.window.showErrorMessage(`WorkLens Terminal Error Analysis: ${err.message}`);
    }
  }

  context.subscriptions.push(...commands);
  console.log('[WorkLens] Extension activated.');
}

function deactivate() {
  console.log('[WorkLens] Extension deactivated.');
}

module.exports = { activate, deactivate };
