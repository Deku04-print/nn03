const vscode = require('vscode');
const crypto = require('crypto');
const path = require('path');

const TOKEN_KEY = 'nexus.accessToken';
const VIEW_ID = 'nexus.sidebar';
let sidebarProvider;

function activate(context) {
  const provider = new NexusSidebarProvider(context);
  sidebarProvider = provider;
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('nexus.login', () => login(context, provider)),
    vscode.commands.registerCommand('nexus.logout', async () => {
      await context.secrets.delete(TOKEN_KEY);
      provider.setAuthState(false);
      provider.setStatus('Signed out.');
      vscode.window.showInformationMessage('NEXUS: signed out.');
    }),
    vscode.commands.registerCommand('nexus.analyzeSelection', () => analyzeSelection(context, provider)),
    vscode.commands.registerCommand('nexus.followUp', () => followUp(context, provider)),
    vscode.commands.registerCommand('nexus.openDashboard', () => openDashboard(context)),
    vscode.commands.registerCommand('nexus.toggleChatMode', () => sidebarProvider?.toggleChatMode()),
    vscode.commands.registerCommand('nexus.setApiUrl', () => setApiUrl()),
  );
}

class NexusSidebarProvider {
  constructor(context) {
    this.context = context;
    this.view = undefined;
    this.lastRequest = undefined;
    this.lastResult = undefined;
    this.currentResponseId = undefined;
    this.currentSessionId = undefined;
    this.humanSessionPoll = undefined;
    this.chatMode = 'normal';
    this.approvedRelatedFiles = [];
    this.activeConversationId = crypto.randomUUID();
    this.conversationContexts = new Map();
    this.chatHistory = [];
    context.subscriptions.push({ dispose: () => {
      if (this.humanSessionPoll) clearInterval(this.humanSessionPoll);
    } });
  }

  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = getHtml(view.webview);
    view.onDidChangeVisibility(() => this.post({ type: 'visibility', visible: view.visible }));
    view.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'analyze') await analyzeSelection(this.context, this);
      if (message.command === 'followUp') await followUp(this.context, this, message.content);
      if (message.command === 'login') await login(this.context, this);
      if (message.command === 'logout') {
        await this.context.secrets.delete(TOKEN_KEY);
        this.setAuthState(false);
        this.setStatus('Signed out. Sign in again to use NEXUS.');
      }
      if (message.command === 'ready') {
        await this.syncAuthState();
        this.post({ type: 'chatMode', mode: this.chatMode, fileCount: this.approvedRelatedFiles.length, files: this.approvedRelatedFiles.map(file => file.path) });
        if (message.conversationId && message.conversationId !== this.activeConversationId) {
          this.switchConversation(message.conversationId, message.responseId);
        } else {
          this.post({ type: 'conversationReady', conversationId: this.activeConversationId });
        }
      }
      if (message.command === 'dashboard') await openDashboard(this.context);
      if (message.command === 'openHumanApi') await findExperts(this.context, this);
      if (message.command === 'openSkillQuest') await openDashboard(this.context, '/learning');
      if (message.command === 'visualExpert') await openDashboard(this.context, '/visual-expert');
      if (message.command === 'openContextualVisualExpert') await openContextualVisualExpert(this.context, this, message.expertId);
      if (message.command === 'newChat') this.resetConversation();
      if (message.command === 'switchConversation') this.switchConversation(message.conversationId, message.responseId);
      if (message.command === 'clearConversationHistory') {
        this.conversationContexts.clear();
        this.activeConversationId = crypto.randomUUID();
        this.resetConversation(false);
      }
      if (message.command === 'setChatMode') this.setChatMode(message.mode);
      if (message.command === 'reviewWorkspaceScope') await reviewWorkspaceScope(this.context, this);
      if (message.command === 'clearWorkspaceScope') {
        this.approvedRelatedFiles = [];
        this.post({ type: 'chatMode', mode: this.chatMode, fileCount: 0, files: [] });
        this.setStatus('Approved workspace context cleared.');
      }
      if (message.command === 'feedback') await submitAiFeedback(this.context, this, message);
      if (message.command === 'findExperts') await findExperts(this.context, this);
      if (message.command === 'requestHumanHelp') await requestHumanHelp(this.context, this, message);
      if (message.command === 'refreshHumanSession') await refreshHumanSession(this.context, this);
      if (message.command === 'sendHumanMessage') await sendHumanMessage(this.context, this, message.content);
      if (message.command === 'closeHumanSession') await closeHumanSession(this.context, this);
      if (message.command === 'cancelHumanSession') await cancelHumanSession(this.context, this);
      if (message.command === 'sessionFeedback') await submitSessionFeedback(this.context, this, message);
      if (message.command === 'requestReview') await requestAiReview(this.context, this, message);
    });
    this.setStatus('Ready. Select code in an editor to get started.');
  }

  setStatus(text) {
    this.post({ type: 'status', text });
  }

  setChatMode(mode) {
    this.chatMode = mode === 'advanced' ? 'advanced' : 'normal';
    if (this.chatMode === 'normal') this.approvedRelatedFiles = [];
    this.post({ type: 'chatMode', mode: this.chatMode, fileCount: this.approvedRelatedFiles.length, files: this.approvedRelatedFiles.map(file => file.path) });
    this.setStatus(this.chatMode === 'advanced'
      ? 'Advanced Chat is on. NEXUS will inspect no workspace file until you review and approve its scope.'
      : 'Normal Chat is on. NEXUS uses only the active selection and its nearby diagnostics.');
  }

  toggleChatMode() {
    this.setChatMode(this.chatMode === 'normal' ? 'advanced' : 'normal');
  }

  saveConversationContext() {
    if (!this.activeConversationId) return;
    this.conversationContexts.set(this.activeConversationId, {
      lastRequest: this.lastRequest,
      lastResult: this.lastResult,
      currentResponseId: this.currentResponseId,
      currentSessionId: this.currentSessionId,
      chatHistory: this.chatHistory.slice(-10),
    });
  }

  switchConversation(conversationId, responseId) {
    if (!conversationId || conversationId === this.activeConversationId) return;
    this.saveConversationContext();
    this.activeConversationId = conversationId;
    const saved = this.conversationContexts.get(conversationId) || {};
    this.lastRequest = saved.lastRequest;
    this.lastResult = saved.lastResult;
    this.currentResponseId = saved.currentResponseId || responseId;
    this.currentSessionId = saved.currentSessionId;
    this.chatHistory = saved.chatHistory || [];
    this.approvedRelatedFiles = [];
    this.setChatMode('normal');
    this.post({ type: 'switchConversation', conversationId });
    this.setStatus(saved.lastRequest
      ? 'Conversation restored. Its previous troubleshooting context is available in this VS Code session.'
      : 'Saved messages restored locally. Start a new analysis to provide fresh code context.');
  }

  resetConversation(createNew = true) {
    this.saveConversationContext();
    this.lastRequest = undefined;
    this.lastResult = undefined;
    this.currentResponseId = undefined;
    this.currentSessionId = undefined;
    this.chatHistory = [];
    this.approvedRelatedFiles = [];
    if (createNew) this.activeConversationId = crypto.randomUUID();
    this.setChatMode('normal');
    this.post({ type: 'newChat', conversationId: this.activeConversationId });
    this.setStatus('New conversation. Normal Chat is active.');
  }

  async syncAuthState() {
    this.setAuthState(!!(await this.context.secrets.get(TOKEN_KEY)));
  }

  setAuthState(signedIn) {
    this.post({ type: 'authState', signedIn });
  }

  showResult(result, responseId) {
    this.currentResponseId = responseId;
    this.post({ type: 'result', result, responseId });
    this.saveConversationContext();
  }

  setBusy(busy) {
    this.post({ type: 'busy', busy });
  }

  post(message) {
    this.view?.webview.postMessage(message);
  }
}

async function submitAiFeedback(context, provider, message) {
  if (!provider.currentResponseId) return;
  try {
    await apiRequest(context, '/api/collaboration/feedback/', {
      method: 'POST',
      body: JSON.stringify({ response_id: provider.currentResponseId, category: message.category, details: message.details || '' }),
    });
    provider.post({ type: 'feedbackSaved' });
    provider.setStatus('Thanks. Your feedback is saved.');
  } catch (error) {
    provider.setStatus(`Feedback could not be saved: ${error.message}`);
  }
}

async function findExperts(context, provider) {
  if (!provider.currentResponseId || !provider.lastResult) {
    provider.setStatus('Analyze a problem first so NEXUS can match experts to its language, framework, and category.');
    return;
  }
  try {
    if (provider.currentSessionId) {
      const current = await apiRequest(context, `/api/collaboration/sessions/${provider.currentSessionId}/`);
      if (['pending', 'accepted'].includes(current.session?.status)) {
        provider.post({ type: 'humanSession', session: current.session });
        provider.setStatus('Your Human API conversation is open.');
        return;
      }
    }
    provider.setStatus('Finding available experts…');
    const metadata = provider.lastResult.metadata || {};
    const query = new URLSearchParams({
      problem_id: provider.lastResult.problem_id || '',
      language: metadata.language || provider.lastRequest?.language || '',
      framework: metadata.framework || '',
      category: metadata.problem_category || '',
    });
    const data = await apiRequest(context, `/api/collaboration/experts/?${query}`);
    provider.post({ type: 'experts', experts: data.experts || [] });
    provider.setStatus(data.experts?.length ? 'Choose an expert. NEXUS will prepare the issue summary and context.' : 'No matching experts are available right now.');
  } catch (error) {
    provider.setStatus(`Could not load experts: ${error.message}`);
  }
}

async function requestHumanHelp(context, provider, message) {
  if (!provider.currentResponseId || !provider.lastResult) return;
  const choice = await vscode.window.showWarningMessage(
    'Share the sanitized code selection, diagnostics, NEXUS guidance, and problem summary with this expert?',
    { modal: true, detail: 'NEXUS will prepare the request summary automatically. You can review what was shared in the session.' },
    'Share and start request',
  );
  if (choice !== 'Share and start request') return;
  try {
    provider.setStatus('Sending your assistance request…');
    const latestQuestion = [...provider.chatHistory].reverse().find(item => item.role === 'user')?.content || '';
    const data = await apiRequest(context, '/api/collaboration/sessions/', {
      method: 'POST',
      body: JSON.stringify({
        expert_id: message.expertId,
        problem_id: provider.lastResult.problem_id || null,
        response_id: provider.currentResponseId,
        reason: latestQuestion ? `Recent developer question: ${latestQuestion.slice(0, 1500)}` : '',
        share_context: true,
      }),
    });
    provider.currentSessionId = data.session.id;
    startHumanSessionPolling(context, provider);
    provider.post({ type: 'humanSession', session: data.session });
    provider.setStatus('Request sent. Waiting for the expert to respond.');
  } catch (error) {
    provider.setStatus(`Could not request human help: ${error.message}`);
  }
}

async function openContextualVisualExpert(context, provider, expertId) {
  if (!provider.lastResult?.problem_id) {
    provider.setStatus('Analyze the current issue first so NEXUS can pass its saved context to Visual Expert.');
    return;
  }
  const choice = await vscode.window.showWarningMessage(
    'Send this problem’s saved snippet, diagnostics, and NEXUS guidance to the configured Ollama service for Visual Expert?',
    { modal: true, detail: 'Only this analyzed problem and the selected expert’s listed skills are included. No workspace scan is performed.' },
    'Open with this context',
  );
  if (choice !== 'Open with this context') return;
  const query = new URLSearchParams({ problem_id: provider.lastResult.problem_id });
  if (expertId) query.set('expert_id', expertId);
  await openDashboard(context, `/visual-expert?${query.toString()}`);
}

async function refreshHumanSession(context, provider) {
  if (!provider.currentSessionId) return;
  try {
    const data = await apiRequest(context, `/api/collaboration/sessions/${provider.currentSessionId}/`);
    provider.post({ type: 'humanSession', session: data.session });
    if (['declined', 'cancelled', 'closed', 'expired'].includes(data.session.status) && provider.humanSessionPoll) {
      clearInterval(provider.humanSessionPoll);
      provider.humanSessionPoll = undefined;
    }
  } catch (error) {
    provider.setStatus(`Session update failed: ${error.message}`);
  }
}

function startHumanSessionPolling(context, provider) {
  if (provider.humanSessionPoll) clearInterval(provider.humanSessionPoll);
  provider.humanSessionPoll = setInterval(() => refreshHumanSession(context, provider), 3000);
}

async function sendHumanMessage(context, provider, content) {
  if (!provider.currentSessionId || !content?.trim()) return;
  try {
    await apiRequest(context, `/api/collaboration/sessions/${provider.currentSessionId}/messages/`, {
      method: 'POST', body: JSON.stringify({ content }),
    });
    await refreshHumanSession(context, provider);
  } catch (error) {
    provider.setStatus(`Message could not be sent: ${error.message}`);
  }
}

async function closeHumanSession(context, provider) {
  if (!provider.currentSessionId) return;
  try {
    await apiRequest(context, `/api/collaboration/sessions/${provider.currentSessionId}/`, {
      method: 'POST', body: JSON.stringify({ action: 'close' }),
    });
    await refreshHumanSession(context, provider);
  } catch (error) {
    provider.setStatus(`Session could not be closed: ${error.message}`);
  }
}

async function cancelHumanSession(context, provider) {
  if (!provider.currentSessionId) return;
  try {
    await apiRequest(context, `/api/collaboration/sessions/${provider.currentSessionId}/`, {
      method: 'POST', body: JSON.stringify({ action: 'cancel' }),
    });
    await refreshHumanSession(context, provider);
  } catch (error) {
    provider.setStatus(`Request could not be cancelled: ${error.message}`);
  }
}

async function submitSessionFeedback(context, provider, message) {
  if (!provider.currentSessionId) return;
  try {
    await apiRequest(context, `/api/collaboration/sessions/${provider.currentSessionId}/feedback/`, {
      method: 'POST',
      body: JSON.stringify({
        rating: Number(message.rating),
        problem_resolved: message.resolved === '' ? null : message.resolved === 'yes',
        explanation_understandable: message.understandable === '' ? null : message.understandable === 'yes',
        expert_helpful: message.helpful === '' ? null : message.helpful === 'yes',
        comments: message.comments || '',
      }),
    });
    provider.post({ type: 'sessionFeedbackSaved' });
    provider.setStatus('Thanks. Your expert feedback is saved.');
  } catch (error) {
    provider.setStatus(`Expert feedback could not be saved: ${error.message}`);
  }
}

async function requestAiReview(context, provider, message) {
  if (!provider.currentResponseId) return;
  try {
    const data = await apiRequest(context, '/api/collaboration/reviews/', {
      method: 'POST',
      body: JSON.stringify({ response_id: provider.currentResponseId, reason: message.reason, notes: message.notes || '', share_context: !!message.shareContext }),
    });
    provider.post({ type: 'reviewRequested', review: data.review });
    provider.setStatus('Your answer review request is in the expert queue.');
  } catch (error) {
    provider.setStatus(`Could not request an expert review: ${error.message}`);
  }
}

const SENSITIVE_EXCLUDES = [
  '**/.git/**', '**/.hg/**', '**/.svn/**', '**/node_modules/**', '**/vendor/**',
  '**/dist/**', '**/build/**', '**/.venv/**', '**/venv/**', '**/__pycache__/**',
  '**/.ssh/**', '**/.aws/**', '**/.kube/**', '**/secrets/**', '**/.env', '**/.env.*',
  '**/.npmrc', '**/.pypirc', '**/.netrc', '**/*secret*', '**/*credential*', '**/credentials',
  '**/*.pem', '**/*.key', '**/*.p12', '**/*.pfx', '**/*.keystore', '**/*.crt', '**/*.cer', '**/*.asc',
  '**/*id_rsa*', '**/*id_ed25519*',
];

async function reviewWorkspaceScope(context, provider) {
  if (provider.chatMode !== 'advanced') {
    provider.setStatus('Switch to Advanced Chat before selecting workspace files.');
    return;
  }
  const folders = vscode.workspace.workspaceFolders || [];
  if (!folders.length) {
    provider.setStatus('Open a trusted workspace folder before requesting additional context.');
    return;
  }
  if (!vscode.workspace.isTrusted) {
    provider.setStatus('Workspace Trust is required before Advanced Chat can read workspace files.');
    return;
  }
  // Replacing a scope begins by revoking the old approval, including on cancel.
  provider.approvedRelatedFiles = [];
  provider.post({ type: 'chatMode', mode: provider.chatMode, fileCount: 0, files: [] });

  const exclusions = { ...vscode.workspace.getConfiguration('files').get('exclude', {}),
    ...vscode.workspace.getConfiguration('search').get('exclude', {}) };
  const excludePatterns = [...SENSITIVE_EXCLUDES, ...Object.keys(exclusions).filter(key => exclusions[key])];
  let candidates;
  try {
    // This enumerates names only. No file contents are opened before the user approves.
    candidates = await vscode.workspace.findFiles('**/*', `{${excludePatterns.join(',')}}`, 120);
  } catch (error) {
    provider.setStatus(`Could not list workspace file names: ${error.message}`);
    return;
  }

  const safeCandidates = candidates.filter(uri => {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) return false;
    const relative = path.relative(folder.uri.fsPath, uri.fsPath);
    return relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
  });
  if (!safeCandidates.length) {
    provider.setStatus('No eligible workspace files were found.');
    return;
  }

  const choices = safeCandidates.map(uri => ({
    label: path.basename(uri.fsPath),
    description: vscode.workspace.asRelativePath(uri, false),
    uri,
    picked: false,
  }));
  const selected = await vscode.window.showQuickPick(choices, {
    canPickMany: true,
    title: 'Advanced Chat: choose files to inspect',
    placeHolder: 'Names only are shown; contents are not read until you approve the next step (maximum 5 files).',
    ignoreFocusOut: true,
  });
  if (!selected?.length) {
    provider.setStatus('Workspace file selection cancelled. No file contents were read.');
    return;
  }
  const limited = selected.slice(0, 5);
  const pathList = limited.map(item => item.description).join('\n');
  const approval = await vscode.window.showWarningMessage(
    `NEXUS will read up to five selected workspace files locally, sanitize their contents, then include them with your next explicit chat request to the configured backend. Review scope:\n${pathList}`,
    { modal: true, detail: 'Excluded paths include .env files, keys, secrets, dependency folders, build outputs, and files excluded by VS Code search/files settings.' },
    'Approve and read files', 'Cancel',
  );
  if (approval !== 'Approve and read files') {
    provider.setStatus('Workspace scope rejected. No file contents were read.');
    return;
  }

  const files = [];
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'NEXUS is reading approved files', cancellable: true }, async (progress, token) => {
    for (const [index, item] of limited.entries()) {
      if (token.isCancellationRequested) break;
      try {
        const document = await vscode.workspace.openTextDocument(item.uri);
        files.push({
          path: item.description,
          language: document.languageId,
          content: document.getText().slice(0, 8000),
        });
      } catch (error) {
        provider.setStatus(`Skipped ${item.description}: ${error.message}`);
      }
      progress.report({ increment: 100 / limited.length, message: `${index + 1}/${limited.length}` });
    }
  });
  provider.approvedRelatedFiles = files;
  provider.post({ type: 'chatMode', mode: provider.chatMode, fileCount: files.length, files: files.map(file => file.path) });
  provider.setStatus(files.length
    ? `${files.length} approved file(s) are ready. They will be sanitized and sent with your next explicit message.`
    : 'No files were read. You can select a different scope.');
}

async function login(context, provider) {
  const email = await vscode.window.showInputBox({
    title: 'Sign in to NEXUS',
    prompt: 'Use your NEXUS account email',
    placeHolder: 'you@company.com',
    ignoreFocusOut: true,
  });
  if (!email) return;

  const password = await vscode.window.showInputBox({
    title: 'Sign in to NEXUS',
    prompt: 'Password (stored only for this request)',
    password: true,
    ignoreFocusOut: true,
  });
  if (!password) return;

  try {
    provider.setStatus('Signing in…');
    const data = await apiRequest(context, '/api/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, false);
    if (!data.access) throw new Error('The API did not return an access token.');
    await context.secrets.store(TOKEN_KEY, data.access);
    provider.setAuthState(true);
    provider.setStatus(`Signed in as ${email}.`);
    vscode.window.showInformationMessage('NEXUS: signed in.');
  } catch (error) {
    provider.setStatus(`Sign in failed: ${error.message}`);
    vscode.window.showErrorMessage(`NEXUS sign in failed: ${error.message}`);
  }
}

async function analyzeSelection(context, provider) {
  const token = await context.secrets.get(TOKEN_KEY);
  if (!token) {
    const signIn = 'Sign In';
    const action = await vscode.window.showWarningMessage('Sign in before sending code to NEXUS.', signIn);
    if (action === signIn) await login(context, provider);
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Open a source file and select code to analyze.');
    return;
  }
  const selection = editor.selection;
  const selectedText = editor.document.getText(selection).slice(0, 10000);
  if (!selectedText.trim()) {
    vscode.window.showWarningMessage('Select the code you want NEXUS to analyze first.');
    return;
  }
  if (provider.lastRequest || provider.chatHistory.length) provider.resetConversation();

  const diagnostics = vscode.languages.getDiagnostics(editor.document.uri)
    .filter((item) => item.range.intersection(selection) || selection.isEmpty)
    .slice(0, 50)
    .map((item) => ({
      message: item.message.slice(0, 2000),
      severity: item.severity,
      line: item.range.start.line,
      column: item.range.start.character,
    }));

  const start = Math.max(0, selection.start.line - 8);
  const end = Math.min(editor.document.lineCount - 1, selection.end.line + 8);
  const payload = {
    action: 'ask',
    language: editor.document.languageId,
    file_name: editor.document.uri.path.split('/').pop() || '',
    file_path: editor.document.uri.fsPath,
    selection: {
      text: selectedText,
      start_line: selection.start.line,
      end_line: selection.end.line,
      cursor: { line: editor.selection.active.line, column: editor.selection.active.character },
    },
    surrounding_code: editor.document.getText(new vscode.Range(start, 0, end, editor.document.lineAt(end).text.length)).slice(0, 20000),
    diagnostics,
    workspace: { project_name: vscode.workspace.name || '' },
    ...(provider.chatMode === 'advanced' && provider.approvedRelatedFiles.length
      ? { related_files: provider.approvedRelatedFiles, enhanced_mode: true }
      : {}),
  };
  provider.post({ type: 'conversationTitle', title: `Analysis: ${payload.file_name || 'selected code'}` });

  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'NEXUS is analyzing the selection…' }, async () => {
    try {
      provider.setStatus('Analyzing selection…');
      provider.setBusy(true);
      const result = await apiRequest(context, '/api/nexus/analyze/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      provider.lastRequest = payload;
      provider.lastResult = result;
      provider.showResult(result.response || result, result.response_id);
      const summary = result.response?.observation || result.response?.message || 'Analysis complete. See the guidance above.';
      provider.chatHistory = [{ role: 'assistant', content: summary }];
      provider.post({ type: 'chatMessage', role: 'assistant', content: summary, createdAt: new Date().toISOString() });
      provider.saveConversationContext();
      provider.setBusy(false);
      provider.setStatus('Analysis complete.');
    } catch (error) {
      provider.setBusy(false);
      provider.setStatus(`Analysis failed: ${error.message}`);
      vscode.window.showErrorMessage(`NEXUS analysis failed: ${error.message}`);
    }
  });
}

async function followUp(context, provider, content) {
  let userMessage = content?.trim();
  if (!userMessage) {
    userMessage = await vscode.window.showInputBox({
      title: 'Ask NEXUS',
      prompt: 'Describe what you tried or what you need help with',
      ignoreFocusOut: true,
    });
  }
  if (!userMessage) return;
  const metadata = provider.lastResult?.metadata || {};
  const previousConversation = provider.chatHistory.slice(-10);
  provider.chatHistory.push({ role: 'user', content: userMessage });
  provider.post({ type: 'chatMessage', role: 'user', content: userMessage, createdAt: new Date().toISOString() });
  provider.saveConversationContext();
  const payload = {
    ...(provider.lastRequest || {
      action: 'guide',
      language: vscode.window.activeTextEditor?.document.languageId || 'unknown',
      selection: { text: '' },
      surrounding_code: '',
      diagnostics: [],
      workspace: { project_name: vscode.workspace.name || '' },
    }),
    ...(provider.chatMode === 'advanced' && provider.approvedRelatedFiles.length
      ? { related_files: provider.approvedRelatedFiles, enhanced_mode: true }
      : { related_files: [], enhanced_mode: false }),
    action: 'guide',
    problem_id: provider.lastResult?.problem_id,
    session_id: provider.lastResult?.session_id,
    user_message: userMessage,
    conversation_history: previousConversation,
    guidance_level: metadata.guidance_level || 0,
    attempt_count: ((provider.lastRequest || {}).attempt_count || 0) + 1,
  };
  try {
    provider.setStatus('Getting another hint…');
    provider.setBusy(true);
    const result = await apiRequest(context, '/api/nexus/guide/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    provider.lastRequest = payload;
    provider.lastResult = result;
    provider.showResult(result.response || result, result.response_id);
    const reply = result.response?.message || result.response?.observation || 'NEXUS replied. See the guidance above.';
    provider.chatHistory.push({ role: 'assistant', content: reply });
    provider.chatHistory = provider.chatHistory.slice(-10);
    provider.post({ type: 'chatMessage', role: 'assistant', content: reply, createdAt: new Date().toISOString() });
    provider.saveConversationContext();
    provider.setBusy(false);
    provider.setStatus('Hint ready.');
  } catch (error) {
    provider.setBusy(false);
    provider.setStatus(`Could not get a hint: ${error.message}`);
    vscode.window.showErrorMessage(`NEXUS follow-up failed: ${error.message}`);
  }
}

async function apiRequest(context, path, options = {}, authenticated = true) {
  const config = vscode.workspace.getConfiguration('nexus');
  const baseUrl = (config.get('apiBaseUrl') || 'http://127.0.0.1:8999').replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = authenticated ? await context.secrets.get(TOKEN_KEY) : undefined;
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && authenticated) {
        await context.secrets.delete(TOKEN_KEY);
        sidebarProvider?.setAuthState(false);
        throw new Error('Your sign-in expired. Run NEXUS: Sign In and try again.');
      }
      const detail = data?.error?.message || data?.detail || `HTTP ${response.status}`;
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Request timed out. Check the backend and Ollama service.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function openDashboard(context, route = '') {
  const value = vscode.workspace.getConfiguration('nexus').get('dashboardUrl') || 'http://127.0.0.1:3456';
  const base = vscode.Uri.parse(value);
  const [routePath = '', routeQuery = ''] = route.split('?', 2);
  let url = route ? base.with({ path: `${base.path.replace(/\/$/, '')}${routePath}`, query: routeQuery }) : base;
  if (await context.secrets.get(TOKEN_KEY)) {
    const redirectUri = base.with({ path: '/auth/exchange', query: '', fragment: '' }).toString();
    try {
      const grant = await apiRequest(context, '/api/auth/dashboard-code/', {
        method: 'POST',
        body: JSON.stringify({ redirect_uri: redirectUri, next_path: route || '/' }),
      });
      url = vscode.Uri.parse(`${grant.redirect_uri}#${new URLSearchParams({ code: grant.code }).toString()}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Could not securely sign in to the dashboard: ${error.message}`);
      return;
    }
  }
  await vscode.env.openExternal(url);
}

async function setApiUrl() {
  const current = vscode.workspace.getConfiguration('nexus').get('apiBaseUrl') || 'http://127.0.0.1:8999';
  const value = await vscode.window.showInputBox({
    title: 'NEXUS Backend URL',
    value: current,
    prompt: 'Enter the Django base URL, for example http://127.0.0.1:8999',
    ignoreFocusOut: true,
  });
  if (!value) return;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    await vscode.workspace.getConfiguration('nexus').update('apiBaseUrl', url.toString().replace(/\/$/, ''), vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage('NEXUS backend URL updated.');
  } catch {
    vscode.window.showErrorMessage('Enter a valid http:// or https:// URL.');
  }
}

function getHtml(webview) {
  const nonce = crypto.randomBytes(16).toString('hex');
  return `<!DOCTYPE html>
  <html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      --wl-accent: #68d7c2;
      --wl-accent-2: #8ea9ff;
      --wl-panel: color-mix(in srgb, var(--vscode-sideBar-background) 82%, var(--vscode-editor-background));
      --wl-border: color-mix(in srgb, var(--vscode-foreground) 14%, transparent);
      --wl-muted: var(--vscode-descriptionForeground);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 14px 12px 22px; color: var(--vscode-foreground);
      background: radial-gradient(ellipse at 50% -18%, color-mix(in srgb, var(--wl-accent-2) 16%, transparent), transparent 62%);
      font-family: var(--vscode-font-family); font-size: 12px;
    }
    .shell { max-width: 520px; margin: 0 auto; }
    .topline { display:flex; align-items:center; justify-content:space-between; gap:10px; margin: 2px 2px 18px; }
    .brand { display:flex; align-items:center; gap:10px; min-width:0; }
    .brand-mark {
      position:relative; display:grid; place-items:center; width:35px; height:35px; flex:none;
      border:1px solid color-mix(in srgb, var(--wl-accent) 55%, transparent); border-radius:12px;
      color:#102a34; font-size:14px; font-weight:900; letter-spacing:-.08em;
      background:linear-gradient(145deg, #b2f4df, #9cb8ff); box-shadow:0 0 22px color-mix(in srgb, var(--wl-accent) 25%, transparent);
      animation:mark-breathe 4s ease-in-out infinite;
    }
    .brand-mark::after { content:""; position:absolute; inset:-4px; border:1px solid color-mix(in srgb, var(--wl-accent) 35%, transparent); border-radius:15px; animation:ring 4s ease-out infinite; }
    .brand-copy { min-width:0; }
    .brand-name { font-size:15px; font-weight:800; letter-spacing:-.035em; }
    .brand-sub { margin-top:2px; color:var(--wl-muted); font-size:10px; letter-spacing:.11em; text-transform:uppercase; }
    .live-pill { display:flex; align-items:center; gap:6px; border:1px solid var(--wl-border); border-radius:999px; padding:5px 8px; color:var(--wl-muted); font-size:10px; white-space:nowrap; }
    .live-dot { width:7px; height:7px; border-radius:50%; background:var(--wl-accent); box-shadow:0 0 9px color-mix(in srgb, var(--wl-accent) 75%, transparent); animation:dot-breathe 2.4s ease-in-out infinite; }
    .hero { position:relative; overflow:hidden; border:1px solid var(--wl-border); border-radius:16px; padding:16px 15px 15px; background:linear-gradient(145deg, color-mix(in srgb, var(--wl-panel) 94%, var(--wl-accent-2)), var(--wl-panel) 64%); box-shadow:0 10px 28px #0002; }
    .hero::after { content:""; position:absolute; width:100px; height:100px; right:-43px; top:-48px; border-radius:50%; background:color-mix(in srgb, var(--wl-accent) 22%, transparent); filter:blur(22px); pointer-events:none; }
    .eyebrow { margin:0 0 7px; color:var(--wl-accent); font-size:10px; font-weight:800; letter-spacing:.13em; text-transform:uppercase; }
    h1 { margin:0; font-size:19px; line-height:1.2; letter-spacing:-.045em; }
    .intro { margin:9px 0 0; color:var(--wl-muted); line-height:1.55; }
    .selection-note { display:flex; gap:8px; align-items:flex-start; margin-top:14px; padding:9px 10px; border-radius:10px; background:color-mix(in srgb, var(--vscode-editor-background) 70%, transparent); color:var(--wl-muted); line-height:1.45; }
    .selection-note svg { flex:none; margin-top:1px; color:var(--wl-accent); }
    .actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:12px 0; }
    button { min-height:35px; display:flex; justify-content:center; align-items:center; gap:7px; padding:8px 9px; border:1px solid var(--wl-border); border-radius:10px; color:var(--vscode-foreground); background:color-mix(in srgb, var(--wl-panel) 92%, transparent); font:inherit; font-weight:650; cursor:pointer; transition:transform .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease; }
    button:hover { transform:translateY(-1px); border-color:color-mix(in srgb, var(--wl-accent) 52%, var(--wl-border)); background:color-mix(in srgb, var(--wl-accent) 10%, var(--wl-panel)); box-shadow:0 5px 16px #0002; }
    button:active { transform:translateY(0) scale(.985); }
    button:focus-visible { outline:2px solid var(--wl-accent-2); outline-offset:2px; }
    button.primary { grid-column:1 / -1; min-height:41px; border-color:transparent; color:#102a34; background:linear-gradient(100deg, #a8f0d9, #a9c0ff); font-size:12px; font-weight:800; box-shadow:0 5px 18px color-mix(in srgb, var(--wl-accent-2) 20%, transparent); }
    button.primary:hover { background:linear-gradient(100deg, #c3f7e7, #c1ceff); box-shadow:0 8px 22px color-mix(in srgb, var(--wl-accent-2) 29%, transparent); }
    button svg { width:14px; height:14px; flex:none; }
    .status-card { display:flex; align-items:flex-start; gap:9px; margin:12px 1px 14px; padding:9px 10px; border:1px solid var(--wl-border); border-radius:10px; background:color-mix(in srgb, var(--wl-panel) 75%, transparent); }
    .status-light { width:8px; height:8px; flex:none; margin-top:3px; border-radius:50%; background:var(--wl-accent); box-shadow:0 0 10px color-mix(in srgb, var(--wl-accent) 65%, transparent); animation:dot-breathe 2.4s ease-in-out infinite; }
    #status { color:var(--wl-muted); line-height:1.45; overflow-wrap:anywhere; }
    .section-label { display:flex; align-items:center; gap:8px; margin:18px 2px 9px; color:var(--wl-muted); font-size:10px; font-weight:800; letter-spacing:.13em; text-transform:uppercase; }
    .section-label[hidden] { display:none; }
    .section-label::after { content:""; height:1px; flex:1; background:var(--wl-border); }
    #result:empty { display:none; }
    #result { display:grid; gap:8px; }
    .hint { padding:11px 11px 12px; border:1px solid var(--wl-border); border-radius:12px; background:var(--wl-panel); animation:rise-in .32s ease both; }
    .hint h3, #result > h3 { margin:0 0 6px; color:var(--wl-accent); font-size:10px; letter-spacing:.1em; text-transform:uppercase; }
    .hint div { line-height:1.55; white-space:pre-wrap; overflow-wrap:anywhere; }
    #result ul { margin:0; padding:0 0 0 18px; color:var(--vscode-foreground); line-height:1.65; }
    #result li { padding-left:2px; margin:3px 0; }
    .feature-panel { margin-top:12px; padding:12px; border:1px solid var(--wl-border); border-radius:12px; background:var(--wl-panel); }
    .feature-panel h2 { margin:0 0 8px; font-size:13px; }
    .feature-panel p { color:var(--wl-muted); line-height:1.5; }
    .feedback-options,.expert-actions { display:flex; flex-wrap:wrap; gap:6px; }
    .feedback-options button,.expert-actions button { min-height:30px; font-size:11px; }
    .feature-panel textarea,.feature-panel input { box-sizing:border-box; width:100%; margin:7px 0; padding:8px; border:1px solid var(--wl-border); border-radius:8px; color:var(--vscode-input-foreground); background:var(--vscode-input-background); font:inherit; }
    .feature-panel label { display:flex; gap:7px; align-items:flex-start; margin:8px 0; color:var(--wl-muted); line-height:1.4; }
    .expert-card,.session-message { margin:8px 0; padding:10px; border:1px solid var(--wl-border); border-radius:9px; }
    .expert-card strong { display:block; margin-bottom:4px; }
    .modal-backdrop { position:fixed; inset:0; z-index:5; display:grid; place-items:center; padding:16px; background:#0009; }
    .profile-modal { width:min(440px,100%); max-height:80vh; overflow:auto; padding:16px; border:1px solid var(--wl-border); border-radius:14px; background:var(--vscode-editor-background); box-shadow:0 18px 60px #0008; }
    .session-chat { max-height:240px; overflow:auto; }
    [hidden] { display:none !important; }
    .chat-panel { margin:12px 0; border:1px solid var(--wl-border); border-radius:13px; overflow:hidden; background:var(--wl-panel); }
    .chat-head { padding:10px 11px; border-bottom:1px solid var(--wl-border); font-weight:750; }
    .chat-head { display:flex; flex-wrap:wrap; gap:6px; justify-content:space-between; align-items:center; }
    .chat-head button { min-height:27px; padding:4px 8px; font-size:10px; }
    .chat-head select { flex:1 1 100%; min-width:0; min-height:28px; padding:4px 7px; border:1px solid var(--wl-border); border-radius:8px; color:var(--vscode-dropdown-foreground); background:var(--vscode-dropdown-background); }
    .chat-mode { display:grid; gap:7px; padding:9px; border-bottom:1px solid var(--wl-border); }
    .chat-mode p { margin:0; color:var(--wl-muted); line-height:1.45; }
    .mode-buttons { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
    .mode-buttons button[aria-pressed="true"] { border-color:var(--wl-accent); background:color-mix(in srgb, var(--wl-accent) 18%, var(--wl-panel)); }
    #review-scope { min-height:30px; }
    #scope-count { color:var(--wl-muted); font-size:10px; }
    .chat-log { display:grid; gap:7px; max-height:220px; overflow:auto; padding:9px; }
    .chat-bubble { max-width:92%; padding:8px 10px; border-radius:10px; line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere; background:color-mix(in srgb, var(--vscode-editor-background) 80%, transparent); }
    .chat-bubble.user { justify-self:end; background:color-mix(in srgb, var(--wl-accent-2) 22%, var(--wl-panel)); }
    .message-time { display:block; margin-top:4px; color:var(--wl-muted); font-size:9px; text-align:right; }
    .chat-compose { display:flex; gap:6px; padding:8px; border-top:1px solid var(--wl-border); }
    .chat-compose textarea { flex:1; min-width:0; resize:vertical; min-height:38px; max-height:100px; padding:8px; border:1px solid var(--wl-border); border-radius:8px; color:var(--vscode-input-foreground); background:var(--vscode-input-background); font:inherit; }
    .chat-compose button { flex:none; }
    .session-message small { color:var(--wl-muted); }
    .delayed-prompt { margin-top:8px; padding:10px; border:1px solid var(--wl-accent); border-radius:9px; background:color-mix(in srgb, var(--wl-accent) 10%, var(--wl-panel)); }
    @keyframes mark-breathe { 0%,100% { transform:translateY(0) scale(1); box-shadow:0 0 18px color-mix(in srgb, var(--wl-accent) 18%, transparent); } 50% { transform:translateY(-1px) scale(1.035); box-shadow:0 0 25px color-mix(in srgb, var(--wl-accent) 38%, transparent); } }
    @keyframes ring { 0% { opacity:.6; transform:scale(.94); } 75%,100% { opacity:0; transform:scale(1.35); } }
    @keyframes dot-breathe { 0%,100% { opacity:.62; transform:scale(.86); } 50% { opacity:1; transform:scale(1.14); } }
    @keyframes rise-in { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration:.01ms !important; animation-iteration-count:1 !important; scroll-behavior:auto !important; transition-duration:.01ms !important; } }
  </style></head><body>
    <main class="shell">
      <header class="topline">
        <div class="brand"><div class="brand-mark" aria-hidden="true">N</div><div class="brand-copy"><div class="brand-name">NEXUS</div><div class="brand-sub">Developer mentor</div></div></div>
        <div class="live-pill"><span class="live-dot"></span>READY TO HELP</div>
      </header>
      <section class="hero">
        <p class="eyebrow">Your coding companion</p>
        <h1>Let’s work through it together.</h1>
        <p class="intro">Get thoughtful debugging guidance that helps you find the answer, one step at a time.</p>
        <div class="selection-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15" aria-hidden="true"><path d="M8 4H5a1 1 0 0 0-1 1v3m12-4h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m12-4v3a1 1 0 0 1-1 1h-3"/><path d="M8 12h8M12 8v8"/></svg>
          <span>Select a snippet in your editor first. Only when you analyze, your selection and nearby diagnostics are sent to NEXUS.</span>
        </div>
      </section>
      <section class="actions" aria-label="NEXUS actions">
        <button class="primary signed-in" id="analyze" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.64 5.64l2.12 2.12m8.48 8.48 2.12 2.12m0-12.72-2.12 2.12m-8.48 8.48-2.12 2.12"/><circle cx="12" cy="12" r="4"/></svg>Analyze selection</button>
        <button class="signed-in" id="follow" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20a8 8 0 1 0-8-8"/><path d="M4 4v5h5m3-1v4l3 2"/></svg>Another hint</button>
        <button id="login"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5m5 5H3"/></svg>Sign in</button>
        <button class="signed-in" id="logout" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5m5 5H9"/></svg>Sign out</button>
        <button id="dashboard"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18m-12 5 2 2 4-4"/></svg>Open dashboard</button>
        <button class="signed-in" id="human-api" hidden>Human API</button>
        <button class="signed-in" id="skill-quest" hidden>Skill Quest</button>
        <button class="signed-in" id="visual-expert" hidden>Visual Expert</button>
      </section>
      <div class="status-card" role="status" aria-live="polite"><span class="status-light"></span><div id="status">Ready. Select code to get started.</div></div>
      <section class="chat-panel signed-in" id="chat-panel" hidden aria-label="NEXUS chat">
        <div class="chat-head">
          <strong>NEXUS conversations</strong>
          <button id="new-chat" title="Start a new conversation">New chat</button>
          <button id="clear-history" title="Delete locally saved conversation history">Clear history</button>
          <select id="conversation-switch" aria-label="Conversation history"></select>
        </div>
        <div class="chat-mode" aria-label="Chat mode">
          <div class="mode-buttons"><button id="normal-mode" aria-pressed="true">Normal Chat</button><button id="advanced-mode" aria-pressed="false">Advanced Chat</button></div>
          <p id="mode-description">Uses the active selection and nearby diagnostics when you ask NEXUS to analyze.</p>
          <button id="review-scope" hidden>Review workspace file scope</button>
          <button id="clear-scope" hidden>Clear approved files</button>
          <span id="scope-count" aria-live="polite">No additional files selected</span>
        </div>
        <div class="chat-log" id="chat-log" aria-live="polite"><div class="chat-bubble">Ask a question, or analyze selected code for context.</div></div>
        <div class="chat-compose"><textarea id="chat-input" rows="2" placeholder="Ask NEXUS a question…"></textarea><button id="chat-send" class="primary">Send</button></div>
      </section>
      <div id="result-heading" class="section-label" hidden>Guidance</div>
      <section id="result" aria-live="polite"></section>
      <section id="delayed-prompt" class="delayed-prompt" hidden role="status" aria-live="polite">
        <span>Still thinking about this answer? Share quick feedback below.</span>
        <button id="dismiss-prompt" type="button" aria-label="Dismiss feedback reminder">Dismiss</button>
      </section>
      <section id="experts-panel" class="feature-panel" hidden></section>
      <section id="human-session" class="feature-panel" hidden></section>
    </main>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const savedWebviewState = vscode.getState() || {};
      let conversations = Array.isArray(savedWebviewState.conversations) ? savedWebviewState.conversations.slice(0, 15) : [];
      let activeConversationId = savedWebviewState.activeConversationId || null;
      let responseId = null;
      let selectedFeedback = '';
      let feedbackSubmitted = false;
      let busy = false;
      let currentSession = null;
      let selectedExpert = null;
      let promptTimer = null;
      let sessionPoll = null;
      document.getElementById('analyze').addEventListener('click', () => vscode.postMessage({ command: 'analyze' }));
      document.getElementById('follow').addEventListener('click', () => vscode.postMessage({ command: 'followUp' }));
      document.getElementById('login').addEventListener('click', () => vscode.postMessage({ command: 'login' }));
      document.getElementById('logout').addEventListener('click', () => vscode.postMessage({ command: 'logout' }));
      document.getElementById('dashboard').addEventListener('click', () => vscode.postMessage({ command: 'dashboard' }));
      document.getElementById('human-api').addEventListener('click', () => vscode.postMessage({ command: 'openHumanApi' }));
      document.getElementById('skill-quest').addEventListener('click', () => vscode.postMessage({ command: 'openSkillQuest' }));
      document.getElementById('visual-expert').addEventListener('click', () => vscode.postMessage({ command: 'visualExpert' }));
      document.getElementById('new-chat').addEventListener('click', () => vscode.postMessage({ command: 'newChat' }));
      document.getElementById('clear-history').addEventListener('click', () => {
        if (confirm('Delete all locally saved NEXUS conversation messages? This does not delete server-side cases or feedback.')) {
          conversations = []; activeConversationId = null; vscode.setState({ conversations, activeConversationId });
          vscode.postMessage({ command: 'clearConversationHistory' });
        }
      });
      document.getElementById('conversation-switch').addEventListener('change', event => {
        if (event.target.value && event.target.value !== activeConversationId) {
          const conversation = conversations.find(item => item.id === event.target.value);
          vscode.postMessage({ command: 'switchConversation', conversationId: event.target.value, responseId: conversation?.responseId });
        }
      });
      document.getElementById('normal-mode').addEventListener('click', () => vscode.postMessage({ command: 'setChatMode', mode: 'normal' }));
      document.getElementById('advanced-mode').addEventListener('click', () => vscode.postMessage({ command: 'setChatMode', mode: 'advanced' }));
      document.getElementById('review-scope').addEventListener('click', () => vscode.postMessage({ command: 'reviewWorkspaceScope' }));
      document.getElementById('clear-scope').addEventListener('click', () => vscode.postMessage({ command: 'clearWorkspaceScope' }));
      document.getElementById('chat-send').addEventListener('click', sendChat);
      document.getElementById('chat-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChat(); } });
      document.getElementById('dismiss-prompt').addEventListener('click', clearPrompt);
      function sendChat() {
        const input = document.getElementById('chat-input');
        const content = input.value.trim();
        if (!content || busy) return;
        input.value = '';
        vscode.postMessage({ command: 'followUp', content });
      }
      function setSignedIn(signedIn) {
        document.querySelectorAll('.signed-in').forEach(node => { node.hidden = !signedIn; });
        document.getElementById('login').hidden = signedIn;
      }
      renderConversationList();
      const activeConversation = conversations.find(item => item.id === activeConversationId);
      vscode.postMessage({ command: 'ready', conversationId: activeConversationId, responseId: activeConversation?.responseId });
      document.addEventListener('click', event => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const action = button.dataset.action;
        if (action === 'feedback-category') {
          selectedFeedback = button.dataset.category;
          document.querySelectorAll('[data-action="feedback-category"]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        } else if (action === 'submit-feedback') {
          if (!selectedFeedback || !responseId) return;
          vscode.postMessage({ command: 'feedback', category: selectedFeedback, details: document.getElementById('feedback-details')?.value || '' });
        } else if (action === 'suggestion') {
          vscode.postMessage({ command: 'followUp', content: button.dataset.prompt || '' });
        } else if (action === 'find-experts') {
          vscode.postMessage({ command: 'findExperts' });
        } else if (action === 'expert-profile') {
          const expert = window.nexusExperts?.find(item => item.user_id === button.dataset.id);
          if (expert) showExpertProfile(expert);
        } else if (action === 'request-human') {
          vscode.postMessage({ command: 'requestHumanHelp', expertId: button.dataset.id });
          closeProfile();
        } else if (action === 'visual-expert-for-human') {
          vscode.postMessage({ command: 'openContextualVisualExpert', expertId: button.dataset.id });
          closeProfile();
        } else if (action === 'close-profile') {
          closeProfile();
        } else if (action === 'request-review') {
          vscode.postMessage({ command: 'requestReview', reason: document.getElementById('review-reason')?.value || 'incorrect', notes: document.getElementById('feedback-details')?.value || '', shareContext: !!document.getElementById('review-share-context')?.checked });
        } else if (action === 'send-human-message') {
          const input = document.getElementById('human-message');
          if (input?.value.trim()) vscode.postMessage({ command: 'sendHumanMessage', content: input.value.trim() });
          if (input) input.value = '';
        } else if (action === 'close-human-session') {
          vscode.postMessage({ command: 'closeHumanSession' });
        } else if (action === 'cancel-human-session') {
          vscode.postMessage({ command: 'cancelHumanSession' });
        } else if (action === 'submit-session-feedback') {
          vscode.postMessage({
            command: 'sessionFeedback',
            rating: document.getElementById('session-rating')?.value,
            resolved: document.getElementById('session-resolved')?.value || '',
            understandable: document.getElementById('session-understood')?.value || '',
            helpful: document.getElementById('session-helpful')?.value || '',
            comments: document.getElementById('session-comments')?.value || '',
          });
        }
      });
      document.addEventListener('input', event => {
        if (event.target.closest('#chat-panel,#result,#experts-panel,#human-session')) resetPrompt();
      });
      document.addEventListener('click', event => {
        if (event.target.closest('#chat-panel,#result,#experts-panel,#human-session')) resetPrompt();
      });
      window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'status') document.getElementById('status').textContent = message.text;
        if (message.type === 'visibility') {
          if (message.visible) resetPrompt(); else clearPrompt();
        }
        if (message.type === 'authState') setSignedIn(!!message.signedIn);
        if (message.type === 'chatMode') {
          const advanced = message.mode === 'advanced';
          document.getElementById('normal-mode').setAttribute('aria-pressed', String(!advanced));
          document.getElementById('advanced-mode').setAttribute('aria-pressed', String(advanced));
          document.getElementById('mode-description').textContent = advanced
            ? 'Can inspect up to five workspace files only after you choose the names and approve the exact scope. Files are sent with your next explicit message.'
            : 'Uses the active selection and nearby diagnostics when you ask NEXUS to analyze.';
          document.getElementById('review-scope').hidden = !advanced;
          document.getElementById('clear-scope').hidden = !advanced || !message.fileCount;
          document.getElementById('scope-count').textContent = message.fileCount ? 'Approved context: ' + (message.files || []).join(', ') : 'No additional files selected';
        }
        if (message.type === 'newChat') {
          clearPrompt(); responseId = null; selectedFeedback = ''; feedbackSubmitted = false;
          document.getElementById('chat-log').replaceChildren();
          document.getElementById('result').replaceChildren();
          document.getElementById('result-heading').hidden = true;
          document.getElementById('experts-panel').replaceChildren(); document.getElementById('experts-panel').hidden = true;
          activeConversationId = message.conversationId;
          ensureConversation(activeConversationId);
          renderConversationList();
          persistConversationState();
        }
        if (message.type === 'conversationReady') {
          activeConversationId = message.conversationId;
          ensureConversation(activeConversationId);
          renderConversationList();
          persistConversationState();
        }
        if (message.type === 'conversationTitle') {
          const conversation = ensureConversation(activeConversationId);
          if (conversation) {
            conversation.title = String(message.title || 'Conversation').slice(0, 64);
            renderConversationList();
            persistConversationState();
          }
        }
        if (message.type === 'switchConversation') {
          activeConversationId = message.conversationId;
          restoreConversation(activeConversationId);
        }
        if (message.type === 'chatMessage') {
          appendChatMessage(message.role, message.content, message.createdAt);
        }
        if (message.type === 'busy') { busy = message.busy; if (busy) clearPrompt(); else resetPrompt(); }
        if (message.type === 'result') render(message.result, message.responseId);
        if (message.type === 'feedbackSaved') {
          feedbackSubmitted = true; clearPrompt();
          const note = document.getElementById('feedback-saved'); if (note) note.textContent = 'Feedback saved. You can update it by submitting again.';
        }
        if (message.type === 'experts') renderExperts(message.experts || []);
        if (message.type === 'humanSession') renderHumanSession(message.session);
        if (message.type === 'sessionFeedbackSaved') {
          const note = document.getElementById('session-feedback-saved'); if (note) note.textContent = 'Your session feedback is saved.';
        }
        if (message.type === 'reviewRequested') {
          const note = document.getElementById('review-saved'); if (note) note.textContent = 'Your response is in the expert review queue.';
        }
      });
      function ensureConversation(id) {
        if (!id) return null;
        let conversation = conversations.find(item => item.id === id);
        if (!conversation) {
          conversation = { id, title: 'New conversation', messages: [], result: null, responseId: null, updatedAt: new Date().toISOString() };
          conversations.unshift(conversation);
        }
        return conversation;
      }
      function persistConversationState() {
        conversations = conversations.slice(0, 15);
        vscode.setState({ activeConversationId, conversations });
      }
      function renderConversationList() {
        const select = document.getElementById('conversation-switch');
        if (!select) return;
        select.replaceChildren();
        conversations.forEach(item => {
          const option = document.createElement('option');
          option.value = item.id;
          option.textContent = item.title || 'Conversation';
          option.selected = item.id === activeConversationId;
          select.append(option);
        });
        select.hidden = conversations.length < 2;
      }
      function appendChatMessage(role, content, createdAt) {
        const text = String(content || '').slice(0, 3000);
        const timestamp = createdAt || new Date().toISOString();
        paintChatMessage(role, text, timestamp);
        const conversation = ensureConversation(activeConversationId);
        if (conversation) {
          conversation.messages.push({ role, content: text, createdAt: timestamp });
          conversation.messages = conversation.messages.slice(-40);
          if (role === 'user' && conversation.title === 'New conversation') conversation.title = text.slice(0, 48) || 'Conversation';
          conversation.updatedAt = timestamp;
          renderConversationList();
          persistConversationState();
        }
      }
      function paintChatMessage(role, text, timestamp) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble ' + (role === 'user' ? 'user' : 'assistant');
        const body = document.createElement('span'); body.textContent = text; bubble.append(body);
        const time = document.createElement('small'); time.className = 'message-time';
        time.textContent = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); bubble.append(time);
        document.getElementById('chat-log').append(bubble);
        const log = document.getElementById('chat-log'); log.scrollTop = log.scrollHeight;
      }
      function restoreConversation(id) {
        clearPrompt(); responseId = null; selectedFeedback = ''; feedbackSubmitted = false;
        const conversation = ensureConversation(id);
        const log = document.getElementById('chat-log'); log.replaceChildren();
        (conversation?.messages || []).forEach(item => paintChatMessage(item.role, item.content, item.createdAt));
        if (conversation?.result) render(conversation.result, conversation.responseId);
        else {
          document.getElementById('result').replaceChildren();
          document.getElementById('result-heading').hidden = true;
        }
        document.getElementById('experts-panel').replaceChildren(); document.getElementById('experts-panel').hidden = true;
        renderConversationList();
        persistConversationState();
      }
      function clearPrompt() {
        clearTimeout(promptTimer); promptTimer = null;
        document.getElementById('delayed-prompt').hidden = true;
      }
      function resetPrompt() {
        clearPrompt();
        if (!responseId || feedbackSubmitted || busy || ['pending','accepted'].includes(currentSession?.status)) return;
        promptTimer = setTimeout(() => {
          const active = document.activeElement;
          if (busy || feedbackSubmitted || ['pending','accepted'].includes(currentSession?.status) || active?.matches('textarea,input,select')) {
            resetPrompt(); return;
          }
          document.getElementById('delayed-prompt').hidden = false;
        }, 270000);
      }
      window.addEventListener('unload', () => { clearPrompt(); clearInterval(sessionPoll); });
      function make(tag, text, className) {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
      }
      function actionButton(label, action, data = {}) {
        const button = make('button', label); button.dataset.action = action;
        Object.entries(data).forEach(([key, value]) => button.dataset[key] = value);
        return button;
      }
      function addFeedbackControls(root) {
        const box = make('section', undefined, 'feature-panel'); box.id = 'response-feedback';
        box.append(make('h2', 'Was this answer useful?'));
        const choices = [
          ['helpful','Helpful'], ['partially_helpful','Partly helpful'], ['not_helpful','Not helpful'],
          ['incorrect','Incorrect / misleading'], ['more_explanation','Need more explanation'], ['human_help','Want human help'],
        ];
        const options = make('div', undefined, 'feedback-options');
        choices.forEach(([key,label]) => options.append(actionButton(label, 'feedback-category', { category:key })));
        box.append(options);
        const details = make('textarea'); details.id = 'feedback-details'; details.rows = 2; details.placeholder = 'Optional details'; box.append(details);
        const submit = actionButton('Submit feedback', 'submit-feedback'); submit.classList.add('primary'); box.append(submit);
        const note = make('p', ''); note.id = 'feedback-saved'; box.append(note);
        const review = make('div', undefined, 'expert-actions');
        const reason = document.createElement('select'); reason.id = 'review-reason';
        [['incorrect','Incorrect or misleading'],['not_helpful','Insufficient'],['partially_helpful','Partially correct']].forEach(([v,label]) => { const option=make('option',label); option.value=v; reason.append(option); });
        const consentLabel = make('label', 'Share problem summary with the reviewing expert');
        const consent = document.createElement('input'); consent.type = 'checkbox'; consent.id = 'review-share-context'; consentLabel.prepend(consent);
        review.append(reason, consentLabel, actionButton('Request expert review', 'request-review'));
        box.append(review, actionButton('Get Human Help', 'find-experts'));
        root.append(box);
      }
      function render(result, id) {
        responseId = id || null; selectedFeedback = ''; feedbackSubmitted = false;
        clearPrompt();
        const root = document.getElementById('result'); root.replaceChildren();
        document.getElementById('result-heading').hidden = false;
        for (const field of ['message', 'observation', 'insight', 'question', 'confidence_signal', 'uncertainty']) {
          if (!result || !result[field]) continue;
          const block = document.createElement('div'); block.className = 'hint';
          const heading = document.createElement('h3'); heading.textContent = field === 'message' ? 'NEXUS response' : field.replaceAll('_', ' ');
          const value = document.createElement('div'); value.textContent = result[field];
          block.append(heading, value); root.append(block);
        }
        if (Array.isArray(result?.next_steps) && result.next_steps.length) {
          const heading = document.createElement('h3'); heading.textContent = 'Next steps'; root.append(heading);
          const list = document.createElement('ul');
          for (const step of result.next_steps) { const item = document.createElement('li'); item.textContent = step; list.append(item); }
          root.append(list);
        }
        if (Array.isArray(result?.suggestions) && result.suggestions.length) {
          const heading = document.createElement('h3'); heading.textContent = 'Continue the conversation'; root.append(heading);
          for (const suggestion of result.suggestions.slice(0, 2)) {
            root.append(actionButton(suggestion, 'suggestion', { prompt: suggestion }));
          }
        }
        if (!root.childNodes.length) root.textContent = JSON.stringify(result, null, 2);
        if (responseId) addFeedbackControls(root);
        const conversation = ensureConversation(activeConversationId);
        if (conversation) {
          conversation.result = result;
          conversation.responseId = responseId || null;
          conversation.updatedAt = new Date().toISOString();
          persistConversationState();
        }
        resetPrompt();
      }
      function renderExperts(experts) {
        const panel = document.getElementById('experts-panel'); panel.replaceChildren(); panel.hidden = false;
        panel.append(make('h2', 'Available NEXUS experts'));
        window.nexusExperts = experts;
        if (!experts.length) {
          panel.append(make('p', 'No available expert matches were found. An administrator must add verified expert profiles and set them available in Django Admin.'));
          return;
        }
        experts.forEach(expert => {
          const card = make('article', undefined, 'expert-card');
          card.append(make('strong', expert.name));
          card.append(make('div', [...(expert.languages || []), ...(expert.frameworks || [])].join(' · ') || 'No skills listed'));
          card.append(make('small', 'Matched: ' + ((expert.match_criteria || []).join(', ') || 'available expert')));
          card.append(make('div', 'Availability: available · Active sessions: ' + expert.active_sessions + '/' + expert.max_active_sessions));
          card.append(actionButton('Start Human API chat', 'request-human', { id: expert.user_id }));
          card.append(actionButton('Ask this expert’s AI Visual Expert', 'visual-expert-for-human', { id: expert.user_id }));
          card.append(actionButton('View profile', 'expert-profile', { id: expert.user_id })); panel.append(card);
        });
      }
      function showExpertProfile(expert) {
        selectedExpert = expert;
        const modal = make('div', undefined, 'modal-backdrop'); modal.id = 'expert-modal';
        const card = make('div', undefined, 'profile-modal'); card.setAttribute('role','dialog'); card.setAttribute('aria-modal','true');
        card.append(make('h2', expert.name));
        card.append(make('p', expert.bio || 'No profile description has been provided.'));
        card.append(make('p', 'Languages: ' + ((expert.languages || []).join(', ') || 'Not listed')));
        card.append(make('p', 'Frameworks: ' + ((expert.frameworks || []).join(', ') || 'Not listed')));
        card.append(make('p', 'Problem categories: ' + ((expert.categories || []).join(', ') || 'Not listed')));
        card.append(make('p', 'Experience: ' + (expert.years_experience == null ? 'Not provided' : expert.years_experience + ' years')));
        card.append(make('p', 'Verified session records: ' + expert.completed_sessions + '; resolved: ' + expert.resolved_sessions + '; completed reviews: ' + expert.completed_reviews));
      card.append(make('p', 'NEXUS will prepare the issue summary automatically. Starting a request asks you to confirm sharing the sanitized analyzed context.'));
      card.append(actionButton('Start Human API chat', 'request-human', { id: expert.user_id }));
      card.append(actionButton('Ask this expert’s AI Visual Expert', 'visual-expert-for-human', { id: expert.user_id }));
      card.append(actionButton('Close', 'close-profile'));
        modal.append(card); document.body.append(modal);
      }
      function closeProfile() { document.getElementById('expert-modal')?.remove(); selectedExpert = null; }
      function renderHumanSession(session) {
        currentSession = session;
        const panel = document.getElementById('human-session'); panel.replaceChildren(); panel.hidden = false;
        panel.append(make('h2', 'Human assistance · ' + session.status));
        panel.append(make('p', 'Expert: ' + (session.expert?.name || 'Assigned expert') + ' · Request: ' + session.id));
        if (session.context_shared) panel.append(make('p', 'You approved sharing sanitized problem context with the expert.'));
        if (session.status === 'pending') {
          panel.append(make('p', 'Waiting for the expert to accept. Requests expire if unanswered.'));
          panel.append(actionButton('Cancel request', 'cancel-human-session'));
        }
        if (session.status === 'declined') panel.append(make('p', 'The expert declined this request. You can choose another available expert.'));
        if (session.status === 'expired') panel.append(make('p', 'This assistance session expired after a response or inactivity timeout.'));
        if (session.status === 'cancelled') panel.append(make('p', 'You cancelled this request before the expert accepted it.'));
        if (session.resolution_outcome) panel.append(make('p', 'Expert outcome: ' + session.resolution_outcome + '. ' + (session.resolution_summary || '')));
        if (session.messages?.length) {
          const chat=make('div',undefined,'session-chat');
          session.messages.forEach(item => { const row=make('div',undefined,'session-message'); row.append(make('strong',item.sender_name),make('small',new Date(item.created_at).toLocaleString()),make('div',item.content)); chat.append(row); });
          panel.append(chat);
        }
        if (session.status === 'accepted') {
          const input=make('textarea'); input.id='human-message'; input.rows=2; input.placeholder='Message your expert'; panel.append(input, actionButton('Send message','send-human-message'), actionButton('Close session','close-human-session'));
        }
        if (['closed','expired','cancelled'].includes(session.status)) {
          panel.append(make('h3','Rate the human assistance'));
          const rating=make('select'); rating.id='session-rating';
          for(let i=1;i<=5;i++){const option=make('option',i + ' / 5');option.value=i;rating.append(option);} panel.append(rating);
          const select=(id,label)=>{const wrap=make('label',label);const el=make('select');el.id=id;[['','Choose'],['yes','Yes'],['no','No']].forEach(([v,t])=>{const o=make('option',t);o.value=v;el.append(o);});wrap.append(el);return wrap;};
          panel.append(select('session-resolved','Was the problem resolved?'),select('session-understood','Was the explanation understandable?'),select('session-helpful','Was the expert helpful?'));
          const comments=make('textarea'); comments.id='session-comments'; comments.placeholder='Optional feedback'; panel.append(comments,actionButton('Submit expert feedback','submit-session-feedback'));
          const saved=make('p',''); saved.id='session-feedback-saved'; panel.append(saved);
        }
        clearInterval(sessionPoll); sessionPoll=null;
        if (['pending','accepted'].includes(session.status)) sessionPoll=setInterval(()=>vscode.postMessage({command:'refreshHumanSession'}),8000);
        if (!['pending','accepted'].includes(session.status)) resetPrompt(); else clearPrompt();
      }
    </script>
  </body></html>`;
}

function deactivate() {}

module.exports = { activate, deactivate };
