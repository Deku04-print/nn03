// WorkLens Webview Client JS
// Runs inside the VS Code webview — communicates with extension host via postMessage

(function () {
    'use strict';

    const vscode = acquireVsCodeApi();
    const assistanceUI = window.createAssistanceUI(vscode);
    window.addEventListener('nexus-feedback-saved', () => _saveCurrentConversation());
    window.addEventListener('message', event => {
        if (event.data.type === 'assistance_context') assistanceUI.showCTA(event.data.data, '');
    });

    // ── State ──────────────────────────────────────────────────────────
    let guidanceLevel = 0;
    let conversationHistory = [];
    let lastContext = {};
    let userPromptCount = 0;
    let newChatNotificationShown = false;
    let analysisMode = 'simple'; // 'simple' | 'enhanced'
    let isGenerating = false;
    let activeTypewriterCancel = null;

    // ── Local chat history state ───────────────────────────────────────
    let currentConversationId = _generateConvId();
    let currentConversationMessages = [];
    let currentConversationContext = {};

    function _generateConvId() {
        return 'conv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    }

    /**
     * Persist the current conversation to the local history file via extension host.
     */
    function _saveCurrentConversation() {
        if (currentConversationMessages.length === 0) return;
        const title = currentConversationMessages[0]?.content || 'Untitled';
        const now = new Date().toISOString();
        vscode.postMessage({
            type: 'save_conversation',
            conversation: {
                id: currentConversationId,
                title: title.slice(0, 80),
                createdAt: currentConversationMessages[0]?.timestamp || now,
                updatedAt: now,
                messages: currentConversationMessages,
                context: currentConversationContext,
            },
        });
    }

    // ── DOM refs ───────────────────────────────────────────────────────
    const stateIdle = document.getElementById('wl-state-idle');
    const stateLoading = document.getElementById('wl-state-loading');
    const stateError = document.getElementById('wl-state-error');
    const stateMentor = document.getElementById('wl-state-mentor');

    const loadingText = document.getElementById('wl-loading-text');
    const errorMessage = document.getElementById('wl-error-message');
    const conversation = document.getElementById('wl-conversation');
    const userInput = document.getElementById('wl-user-input');
    const submitBtn = document.getElementById('wl-submit-btn');
    const retryBtn = document.getElementById('wl-retry-btn');
    const refreshBtn = document.getElementById('wl-refresh-btn');
    const newChatBtn = document.getElementById('wl-new-chat-btn');
    const clearChatBtn = document.getElementById('wl-clear-chat-btn');
    const clearAllHistoryBtn = document.getElementById('wl-clear-all-history-btn');
    const voiceStatus = document.getElementById('wl-voice-status');
    const voiceStatusText = document.getElementById('wl-voice-status-text');
    const voiceStatusClose = document.getElementById('wl-voice-status-close');
    const searchBtn = document.getElementById('wl-search-btn');
    const settingsBtn = document.getElementById('wl-settings-btn');
    const settingsMenu = document.getElementById('wl-settings-menu');
    const logoutBtn = document.getElementById('wl-logout-btn');
    const themeBtn = document.getElementById('wl-theme-btn');
    const themeSubmenu = document.getElementById('wl-theme-submenu');
    const themeLightBtn = document.getElementById('wl-theme-light');
    const themeDarkBtn = document.getElementById('wl-theme-dark');

    // Mode toggle
    const modeSimpleBtn = document.getElementById('wl-mode-simple');
    const modeEnhancedBtn = document.getElementById('wl-mode-enhanced');

    // Login form
    const loginForm = document.getElementById('wl-login-form');
    const loginEmail = document.getElementById('wl-login-email');
    const loginPassword = document.getElementById('wl-login-password');
    const signInBtn = document.getElementById('wl-signin-btn');
    const loginError = document.getElementById('wl-login-error');


    // Project-scoped history panel
    const projectHistory = document.getElementById('wl-project-history');
    const projectHistoryList = document.getElementById('wl-project-history-list');
    const projectHistoryEmpty = document.getElementById('wl-project-history-empty');
    const projectHistoryHeading = document.getElementById('wl-project-history-heading');
    const projectHistoryEmptyText = document.getElementById('wl-project-history-empty-text');

    // Search / history panel
    const searchPanel = document.getElementById('wl-search-panel');
    const searchInput = document.getElementById('wl-search-input');
    const searchResults = document.getElementById('wl-search-results');
    const searchEmpty = document.getElementById('wl-search-empty');
    const searchCloseBtn = document.getElementById('wl-search-close-btn');

    // Context card
    const contextCard = document.getElementById('wl-context-card');
    const ctxFile = document.getElementById('wl-ctx-file');
    const ctxLang = document.getElementById('wl-ctx-lang');
    const ctxLines = document.getElementById('wl-ctx-lines');
    const ctxCode = document.getElementById('wl-ctx-code');
    const ctxDiagnostics = document.getElementById('wl-ctx-diagnostics');
    const ctxDiagList = document.getElementById('wl-ctx-diag-list');
    const ctxDiagSource = document.getElementById('wl-ctx-diag-source');
    const copyContextBtn = document.getElementById('wl-copy-context-btn');

    // Details panel
    const detProblemType = document.getElementById('wl-det-problem-type');
    const detCategory = document.getElementById('wl-det-category');
    const detSpecialist = document.getElementById('wl-det-specialist');
    const detConfidence = document.getElementById('wl-det-confidence');
    const guidanceDots = document.querySelectorAll('.wl-dot');

    // Tabs
    const tabChat = document.getElementById('wl-tab-chat');
    const tabAgents = document.getElementById('wl-tab-agents');
    const panelChat = document.getElementById('wl-panel-chat');
    const panelAgents = document.getElementById('wl-panel-agents');
    const headerAgentsBtn = document.getElementById('wl-header-agents-btn');

    // ── Tab switching (Chat & Agents Hub) ─────────────────
    function activateTab(tabName) {
        const isChat = tabName === 'chat';
        const isAgents = tabName === 'agents';

        if (tabChat) {
            tabChat.classList.toggle('wl-tab-active', isChat);
            tabChat.setAttribute('aria-selected', String(isChat));
        }
        if (tabAgents) {
            tabAgents.classList.toggle('wl-tab-active', isAgents);
            tabAgents.setAttribute('aria-selected', String(isAgents));
        }
        if (panelChat) panelChat.classList.toggle('wl-hidden', !isChat);
        if (panelAgents) panelAgents.classList.toggle('wl-hidden', !isAgents);
    }

    if (tabChat) tabChat.addEventListener('click', () => activateTab('chat'));
    if (tabAgents) tabAgents.addEventListener('click', () => activateTab('agents'));
    if (headerAgentsBtn) headerAgentsBtn.addEventListener('click', () => activateTab('agents'));

    // ── State helpers ──────────────────────────────────────────────────
    function showState(name) {
        if (name === 'idle') {
            document.body.classList.add('wl-not-signed-in');
        } else if (name === 'mentor') {
            document.body.classList.remove('wl-not-signed-in');
        }
        [stateIdle, stateLoading, stateError, stateMentor].forEach(el => el.classList.add('wl-hidden'));
        const el = document.getElementById(`wl-state-${name}`);
        if (el) el.classList.remove('wl-hidden');
    }

    function updateGuidanceDots(level) {
        guidanceLevel = level;
        guidanceDots.forEach((dot, i) => {
            dot.classList.remove('past', 'active', 'danger');
            if (i < level) dot.classList.add('past');
            if (i === level) dot.classList.add(level >= 4 ? 'danger' : 'active');
        });
        const meter = document.getElementById('wl-guidance-dots');
        if (meter) meter.setAttribute('aria-valuenow', String(level));
    }

    // ── Generation State & Dynamic Send / Stop Button ──────────────────
    function setGeneratingState(generating) {
        isGenerating = Boolean(generating);
        if (!submitBtn) return;

        if (isGenerating) {
            submitBtn.classList.add('wl-generating');
            submitBtn.setAttribute('aria-label', 'Stop generating');
            submitBtn.setAttribute('title', 'Stop generating (Click to stop)');
            submitBtn.innerHTML = `
                <span class="wl-stop-inner">
                    <svg class="wl-spinner-ring" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" stroke-opacity="0.3"/>
                        <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                    </svg>
                    <svg class="wl-stop-square" width="8" height="8" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                        <rect width="10" height="10" rx="2"/>
                    </svg>
                </span>
            `;
        } else {
            submitBtn.classList.remove('wl-generating');
            submitBtn.setAttribute('aria-label', 'Send message');
            submitBtn.setAttribute('title', 'Send message (Enter)');
            submitBtn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
            `;
            activeTypewriterCancel = null;
        }
    }

    function stopGeneration() {
        if (activeTypewriterCancel) {
            activeTypewriterCancel();
            activeTypewriterCancel = null;
        }
        _removeThinkingBubble();
        setGeneratingState(false);
    }

    // ── Login form ─────────────────────────────────────────────────────
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = loginEmail.value.trim();
            const password = loginPassword.value;
            if (!email || !password) return;

            // Disable form while signing in
            signInBtn.disabled = true;
            signInBtn.textContent = 'Signing in…';
            if (loginError) loginError.classList.add('wl-hidden');

            vscode.postMessage({ type: 'sign_in_credentials', email, password });
        });
    }

    function handleAuthError(message) {
        if (signInBtn) {
            signInBtn.disabled = false;
            signInBtn.textContent = 'Sign In';
        }
        if (loginError) {
            loginError.textContent = message || 'Sign-in failed. Please try again.';
            loginError.classList.remove('wl-hidden');
        }
    }


    // ── Project-scoped chat history rendering ─────────────────────────
    /**
     * Render the project history panel.
     * Shows an empty-state message when there are no conversations,
     * or a list of clickable conversation cards.
     *
     * @param {Array}  conversations  Conversations from the current project's JSON file
     * @param {string} projectName    Display name of the current project folder
     */
    function renderProjectHistory(conversations, projectName) {
        if (!projectHistory) return;

        // Update heading
        const name = projectName || 'this project';
        if (projectHistoryHeading) {
            projectHistoryHeading.textContent = `${name} — Previous Chats`;
        }

        if (!conversations || conversations.length === 0) {
            // Show empty state
            if (projectHistoryList) projectHistoryList.innerHTML = '';
            if (projectHistoryEmpty) projectHistoryEmpty.classList.remove('wl-hidden');
            if (projectHistoryEmptyText) {
                projectHistoryEmptyText.textContent = `No previous conversations for ${name}.`;
            }
            projectHistory.classList.remove('wl-hidden');
            return;
        }

        // Populate conversation cards
        if (projectHistoryEmpty) projectHistoryEmpty.classList.add('wl-hidden');
        if (projectHistoryList) {
            projectHistoryList.innerHTML = '';
            conversations.forEach(conv => {
                const card = document.createElement('div');
                card.className = 'wl-history-item';
                card.setAttribute('role', 'listitem');
                card.setAttribute('tabindex', '0');

                const title = document.createElement('div');
                title.className = 'wl-history-desc';
                title.textContent = conv.title || 'Untitled conversation';

                const meta = document.createElement('div');
                meta.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:3px;';

                if (conv.context?.language) {
                    const lang = document.createElement('span');
                    lang.className = 'wl-history-lang';
                    lang.textContent = conv.context.language;
                    meta.appendChild(lang);
                }

                const time = document.createElement('span');
                time.className = 'wl-history-time';
                time.textContent = _relativeTime(conv.updatedAt || conv.createdAt);
                meta.appendChild(time);

                // Delete conversation button
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'wl-history-delete';
                deleteBtn.type = 'button';
                deleteBtn.title = 'Delete this conversation';
                deleteBtn.setAttribute('aria-label', 'Delete conversation');
                deleteBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (currentConversationId === conv.id) {
                        _resetCurrentConversation();
                    }
                    vscode.postMessage({ type: 'delete_conversation', id: conv.id });
                    card.style.transition = 'all 0.2s';
                    card.style.opacity = '0';
                    card.style.transform = 'translateX(15px)';
                    setTimeout(() => {
                        card.remove();
                        if (projectHistoryList && projectHistoryList.childElementCount === 0) {
                            if (projectHistoryEmpty) projectHistoryEmpty.classList.remove('wl-hidden');
                        }
                    }, 200);
                });

                card.appendChild(title);
                card.appendChild(meta);
                card.appendChild(deleteBtn);

                // Click: restore this conversation into the chat view
                const restoreConv = conv; // closure capture
                function doRestore() {
                    // Hide history panel
                    if (projectHistory) projectHistory.classList.add('wl-hidden');
                    // Clear current conversation
                    if (conversation) conversation.innerHTML = '';
                    conversationHistory = [];
                    guidanceLevel = 0;
                    currentConversationId = restoreConv.id;
                    currentConversationMessages = Array.isArray(restoreConv.messages) ? restoreConv.messages : [];
                    assistanceUI.reset();
                    currentConversationContext = restoreConv.context || {};
                    vscode.postMessage({ type: 'resume_backend_session', problem_id: currentConversationContext.problem_id });

                    // ── Restored conversation banner ──
                    const banner = document.createElement('div');
                    banner.className = 'wl-restore-banner';
                    banner.textContent = `↩ Restored: ${restoreConv.title || 'Previous conversation'}`;
                    if (conversation) conversation.appendChild(banner);

                    let renderedCount = 0;
                    (restoreConv.messages || []).forEach(m => {
                        if (m.role === 'user') {
                            // Skip displaying synthetic auto-analysis labels as bubbles
                            if (!m.isAuto) {
                                appendUserMessage(m.content || '', m.codeContext || '');
                                renderedCount++;
                            }
                            conversationHistory.push({ role: 'user', text: m.content || '' });
                        } else if (m.role === 'assistant') {
                            const savedCtx = m.context || {};
                            appendMentorCard(m.rawResponse || { message: m.content }, savedCtx, null);
                            conversationHistory.push({ role: 'mentor', response: m.rawResponse || { message: m.content } });
                            renderedCount++;
                        }
                    });

                    // If nothing rendered (legacy broken history), show a notice
                    if (renderedCount === 0 && conversation) {
                        const notice = document.createElement('div');
                        notice.className = 'wl-restore-banner';
                        notice.textContent = '⚠️ This conversation was saved in an older format and cannot be fully displayed. Start a new chat to create a properly saved conversation.';
                        conversation.appendChild(notice);
                    }

                    showState('mentor');
                    activateTab('chat');
                }
                card.addEventListener('click', doRestore);
                card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') doRestore(); });

                projectHistoryList.appendChild(card);
            });
        }

        projectHistory.classList.remove('wl-hidden');
    }


    function _relativeTime(isoString) {
        if (!isoString) return '';
        try {
            const diff = Date.now() - new Date(isoString).getTime();
            const mins = Math.floor(diff / 60000);
            if (mins < 1) return 'just now';
            if (mins < 60) return `${mins}m ago`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs}h ago`;
            const days = Math.floor(hrs / 24);
            return `${days}d ago`;
        } catch (_) { return ''; }
    }

    // ── Captured Context card ──────────────────────────────────────────
    function updateContextCard(ctx, diagnostics) {
        const file = ctx.file_name || ctx.fileName || '';
        const lang = ctx.language || '';

        // Only show File and Language — Selected Lines, Code, and Diagnostics are hidden
        if (ctxFile) ctxFile.textContent = file || '—';
        if (ctxLang) ctxLang.textContent = lang || '—';

        // Selected Lines, Code, and Diagnostics sections are intentionally not rendered
        if (ctxLines) ctxLines.textContent = '';
        if (ctxCode) ctxCode.textContent = '';
        if (ctxDiagnostics) ctxDiagnostics.classList.add('wl-hidden');

        contextCard.classList.remove('wl-hidden');
    }

    // ── Details panel ──────────────────────────────────────────────────
    function updateDetails(meta) {
        const cat = (meta.problem_category || meta.category || '').replace(/_/g, ' ');
        const type = (meta.problem_type || '').replace(/_/g, ' ');
        const spec = meta.specialist || '—';
        const conf = meta.confidence ? Math.round(meta.confidence * 100) + '%' : '—';

        if (detProblemType) detProblemType.textContent = cat || '—';
        if (detCategory) detCategory.textContent = type || '—';
        if (detSpecialist) detSpecialist.textContent = spec;
        if (detConfidence) detConfidence.textContent = conf;
    }

    // ── Markdown-lite text renderer ─────────────────────────────────────────
    /**
     * Render basic markdown: **bold**, `code`, newlines as <br>.
     * Returns a <span> element with formatted children.
     * @param {string} text
     * @returns {HTMLSpanElement}
     */
    function renderMarkdownText(text) {
        const container = document.createElement('span');
        if (!text) return container;

        // Split on fenced code blocks first: ```lang\ncode\n```
        const codeBlockParts = text.split(/(```[\s\S]*?```)/g);
        codeBlockParts.forEach(blockPart => {
            if (blockPart.startsWith('```') && blockPart.endsWith('```')) {
                const inner = blockPart.slice(3, -3);
                const newlineIdx = inner.indexOf('\n');
                const codeContent = newlineIdx !== -1 ? inner.slice(newlineIdx + 1) : inner;
                const pre = document.createElement('pre');
                pre.className = 'wl-selected-code';
                pre.style.margin = '6px 0';
                pre.style.fontSize = '12px';
                const code = document.createElement('code');
                code.textContent = codeContent.replace(/\r\n/g, '\n');
                pre.appendChild(code);
                container.appendChild(pre);
            } else {
                // Split on bold (**text**) and inline code (`code`)
                const parts = blockPart.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
                parts.forEach(part => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        const strong = document.createElement('strong');
                        strong.textContent = part.slice(2, -2);
                        container.appendChild(strong);
                    } else if (part.startsWith('`') && part.endsWith('`')) {
                        const code = document.createElement('code');
                        code.className = 'wl-inline-code';
                        code.textContent = part.slice(1, -1);
                        container.appendChild(code);
                    } else {
                        // Preserve newlines
                        part.split('\n').forEach((line, i) => {
                            if (i > 0) container.appendChild(document.createElement('br'));
                            container.appendChild(document.createTextNode(line));
                        });
                    }
                });
            }
        });
        return container;
    }

    // ── Progressive Typewriter Streaming Engine ────────────────────────
    /**
     * Incrementally types out text into a target DOM element with a blinking cursor,
     * auto-scrolling the conversation smoothly as lines and letters appear.
     *
     * @param {HTMLElement} targetElement   Container where text will be streamed
     * @param {string} fullText             Complete text to type
     * @param {Function} [onFinished]       Callback when finished (receives stoppedEarly boolean)
     */
    function _typewriterStream(targetElement, fullText, onFinished) {
        if (!fullText) {
            if (onFinished) onFinished(false);
            return;
        }

        const cursor = document.createElement('span');
        cursor.className = 'wl-typing-cursor';
        cursor.setAttribute('aria-hidden', 'true');

        let currentIndex = 0;
        const len = fullText.length;
        let timer = null;
        let isStopped = false;

        // Snappy streaming speed tuned to feel natural and rapid
        const stepSize = len > 1000 ? 8 : (len > 400 ? 4 : (len > 160 ? 2 : 1));
        const tickInterval = 16;
        const isList = targetElement.tagName === 'LI';

        function updateDOM(slice, showCursor) {
            targetElement.replaceChildren();
            if (isList || !slice.includes('\n\n')) {
                targetElement.appendChild(renderMarkdownText(slice));
                if (showCursor) {
                    targetElement.appendChild(cursor);
                }
            } else {
                const paragraphs = slice.split(/\n\n+/);
                paragraphs.forEach((para, idx) => {
                    const p = document.createElement('p');
                    p.style.margin = '0 0 0.5em 0';
                    p.appendChild(renderMarkdownText(para));
                    if (showCursor && idx === paragraphs.length - 1) {
                        p.appendChild(cursor);
                    }
                    targetElement.appendChild(p);
                });
            }
            if (conversation) {
                conversation.scrollTop = conversation.scrollHeight;
            }
        }

        function finish(stopped) {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            cursor.remove();
            activeTypewriterCancel = null;
            if (onFinished) onFinished(stopped);
        }

        function tick() {
            if (isStopped) return;

            currentIndex = Math.min(len, currentIndex + stepSize);
            const slice = fullText.slice(0, currentIndex);
            const atEnd = currentIndex >= len;

            updateDOM(slice, !atEnd);

            if (atEnd) {
                finish(false);
                return;
            }

            // Natural micro-pause at sentence and line boundaries
            const lastChar = slice[slice.length - 1];
            if (['.', '!', '?', '\n'].includes(lastChar) && stepSize <= 4) {
                clearInterval(timer);
                setTimeout(() => {
                    if (!isStopped) {
                        timer = setInterval(tick, tickInterval);
                    }
                }, 40);
            }
        }

        activeTypewriterCancel = function cancel() {
            isStopped = true;
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            cursor.remove();
            updateDOM(fullText.slice(0, currentIndex), false);
            finish(true);
        };

        timer = setInterval(tick, tickInterval);
        tick();
    }

    /**
     * Executes an array of { el: HTMLElement, text: string } stream tasks sequentially.
     */
    function _runStreamQueue(tasks, onAllDone) {
        if (!tasks || tasks.length === 0) {
            if (onAllDone) onAllDone(false);
            return;
        }
        let idx = 0;
        function next() {
            if (idx >= tasks.length) {
                if (onAllDone) onAllDone(false);
                return;
            }
            const task = tasks[idx++];
            _typewriterStream(task.el, task.text, (stopped) => {
                if (stopped) {
                    if (onAllDone) onAllDone(true);
                } else {
                    next();
                }
            });
        }
        next();
    }

    /**
     * Unwraps any raw JSON strings (e.g. {"message": "..."}) into clean markdown text.
     */
    function _unwrapMessageText(msg) {
        if (!msg || typeof msg !== 'string') return '';
        let text = msg.trim();
        if (text.startsWith('{') || text.startsWith('`{')) {
            try {
                const parsed = JSON.parse(text);
                if (parsed && parsed.message) return parsed.message;
            } catch (e) {
                // If invalid JSON or truncated, extract message via regex
                const match = text.match(/["']message["']\s*:\s*["']([\s\S]*?)(?:["'],\s*["'](?:guidance_level|suggestions|file_errors)["']|["']\s*\}|["']?$)/);
                if (match && match[1]) {
                    return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                }
                // Strip leading {"message": " or {"observation": "
                text = text.replace(/^\s*\{?\s*["'](?:message|observation)["']\s*:\s*["']?/, '');
                text = text.replace(/["']?\s*\}?\s*$/, '');
            }
        }
        return text;
    }

    /**
     * Appends a WorkLens mentor card to the conversation.
     * Supports progressive typewriter streaming or instant rendering.
     *
     * @param {object} response        The AI response object
     * @param {object} context         The captured code context (for selected code display)
     * @param {object} vdbMatch        Vector DB match info (optional)
     * @param {boolean} [stream=false] Whether to type out letter-by-letter
     * @param {Function} [onComplete]  Callback when streaming/rendering completes
     */
    function appendMentorCard(response, context, vdbMatch, stream = false, onComplete = null) {
        const r = response || {};
        if (r.message && typeof r.message === 'string') {
            r.message = _unwrapMessageText(r.message);
        }
        const ctx = context || {};

        const wrapper = document.createElement('div');
        wrapper.className = 'wl-message wl-message-mentor';

        // Avatar
        const avatar = document.createElement('div');
        avatar.className = 'wl-msg-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        if (window.WL_LOGO_URI) {
            const img = document.createElement('img');
            img.src = window.WL_LOGO_URI;
            img.alt = 'WorkLens';
            img.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:4px;';
            avatar.appendChild(img);
        } else {
            avatar.textContent = 'W';
        }
        wrapper.appendChild(avatar);

        // Body
        const body = document.createElement('div');
        body.className = 'wl-msg-body';

        // Sender row
        const sender = document.createElement('div');
        sender.className = 'wl-msg-sender';
        sender.textContent = 'WorkLens';
        body.appendChild(sender);

        // Content box
        const box = document.createElement('div');
        box.className = 'wl-msg-content-box';

        function _finishCard(stoppedEarly) {
            assistanceUI.feedback(body, r);
            // ── File Errors section (Enhanced mode only) ───────────────
            if (Array.isArray(r.file_errors) && r.file_errors.length > 0) {
                const errDiv = document.createElement('div');
                errDiv.className = 'wl-card-section wl-file-errors-section';
                const errHdr = document.createElement('div');
                errHdr.className = 'wl-section-header';
                errHdr.innerHTML = '<span class="wl-section-icon">🚨</span><span class="wl-section-label">File Errors Detected</span>';
                errDiv.appendChild(errHdr);
                const errList = document.createElement('ul');
                errList.className = 'wl-file-errors-list';
                r.file_errors.forEach(fe => {
                    const li = document.createElement('li');
                    li.className = 'wl-file-error-item';
                    const fileSpan = document.createElement('span');
                    fileSpan.className = 'wl-file-error-name';
                    fileSpan.textContent = fe.file || 'Unknown file';
                    const typeSpan = document.createElement('span');
                    typeSpan.className = 'wl-file-error-type';
                    typeSpan.textContent = fe.error_type || 'Error';
                    const descSpan = document.createElement('span');
                    descSpan.className = 'wl-file-error-desc';
                    descSpan.textContent = fe.description || '';
                    li.appendChild(fileSpan);
                    li.appendChild(typeSpan);
                    if (fe.description) li.appendChild(descSpan);
                    errList.appendChild(li);
                });
                errDiv.appendChild(errList);
                box.appendChild(errDiv);
            }

            // ── Analyzed files section (Enhanced mode only) ────────────
            if (Array.isArray(r.analyzed_files) && r.analyzed_files.length > 0) {
                const filesDiv = document.createElement('div');
                filesDiv.className = 'wl-analyzed-files';
                const filesHdr = document.createElement('div');
                filesHdr.className = 'wl-analyzed-files-title';
                filesHdr.textContent = '🗒 Files Analyzed';
                filesDiv.appendChild(filesHdr);
                const chipWrap = document.createElement('div');
                chipWrap.className = 'wl-analyzed-chips';
                r.analyzed_files.forEach(f => {
                    const chip = document.createElement('span');
                    chip.className = 'wl-file-chip';
                    chip.textContent = typeof f === 'string' ? f : f.path;
                    if (f.why) chip.title = f.why;
                    chipWrap.appendChild(chip);
                });
                filesDiv.appendChild(chipWrap);
                box.appendChild(filesDiv);
            }

            if (conversation) {
                conversation.scrollTop = conversation.scrollHeight;
            }
            if (onComplete) onComplete(stoppedEarly);
        }

        // Attach elements to conversation immediately
        body.appendChild(box);
        wrapper.appendChild(body);
        if (conversation) {
            conversation.appendChild(wrapper);
            wrapper.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }

        // ── Priority 1: Free-form conversational message ───────────────
        if (r.message && typeof r.message === 'string') {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'wl-msg-content';
            box.appendChild(msgDiv);

            if (stream) {
                _typewriterStream(msgDiv, r.message, (stopped) => {
                    _finishCard(stopped);
                });
            } else {
                const paragraphs = r.message.split(/\n\n+/);
                paragraphs.forEach((para, i) => {
                    if (i > 0) msgDiv.appendChild(document.createElement('br'));
                    const p = document.createElement('p');
                    p.style.margin = '0 0 0.5em 0';
                    p.appendChild(renderMarkdownText(para.trim()));
                    msgDiv.appendChild(p);
                });
                _finishCard(false);
            }

        // ── Priority 2: TODO / action steps ─────────────────────────
        } else if (Array.isArray(r.steps) && r.steps.length > 0) {
            const sec = document.createElement('div');
            sec.className = 'wl-card-section';
            const hdr = document.createElement('div');
            hdr.className = 'wl-section-header';
            hdr.innerHTML = '<span class="wl-section-icon">🛠️</span><span class="wl-section-label">Implementation Steps</span>';
            sec.appendChild(hdr);
            const ol = document.createElement('ol');
            ol.className = 'wl-steps-list';
            sec.appendChild(ol);
            box.appendChild(sec);

            if (stream) {
                const tasks = [];
                r.steps.forEach(step => {
                    const li = document.createElement('li');
                    ol.appendChild(li);
                    tasks.push({ el: li, text: step });
                });
                _runStreamQueue(tasks, (stopped) => {
                    _finishCard(stopped);
                });
            } else {
                r.steps.forEach(step => {
                    const li = document.createElement('li');
                    li.appendChild(renderMarkdownText(step));
                    ol.appendChild(li);
                });
                _finishCard(false);
            }

        // ── Priority 3 / fallback: Legacy structured template ──────
        } else {
            _renderStructuredResponse(box, r, ctx, stream, (stopped) => {
                _finishCard(stopped);
            });
        }

        return wrapper;
    }

    /** Helper — labelled section block */
    function _section(label, text) {
        const sec = document.createElement('div');
        sec.className = 'wl-card-section';
        const hdr = document.createElement('div');
        hdr.className = 'wl-section-header';
        hdr.innerHTML = `<span class="wl-section-label">${label}</span>`;
        sec.appendChild(hdr);
        const b = document.createElement('div');
        b.className = 'wl-section-body';
        b.textContent = text;
        sec.appendChild(b);
        return sec;
    }

    /**
     * Internal — renders the legacy structured response when no message/steps are present.
     */
    function _renderStructuredResponse(box, r, ctx, stream = false, onComplete = null) {
        // Selected Code (shown above explanation)
        const selectedText = ctx.selection?.text || ctx.selected_code || '';
        if (selectedText) {
            const codeSec = document.createElement('div');
            codeSec.className = 'wl-card-section wl-selected-code-section';
            const codeHeader = document.createElement('div');
            codeHeader.className = 'wl-section-header';
            codeHeader.innerHTML = '<span class="wl-section-icon">📝</span><span class="wl-section-label">Selected Code</span>';
            codeSec.appendChild(codeHeader);
            const pre = document.createElement('pre');
            pre.className = 'wl-selected-code';
            const code = document.createElement('code');
            code.textContent = selectedText;
            pre.appendChild(code);
            codeSec.appendChild(pre);
            box.appendChild(codeSec);
        }

        const diags = ctx.diagnostics || [];
        const hasErrors = Array.isArray(diags) && diags.length > 0;

        if (!hasErrors) {
            const noIssueWrap = document.createElement('div');
            noIssueWrap.className = 'wl-card-section';
            const noIssueHeader = document.createElement('div');
            noIssueHeader.className = 'wl-section-header';
            noIssueHeader.innerHTML = '<span class="wl-section-icon">✅</span><span class="wl-section-label">No syntax errors found</span>';
            noIssueWrap.appendChild(noIssueHeader);
            const noIssueBody = document.createElement('div');
            noIssueBody.className = 'wl-section-body';
            const textToStream = r.observation || r.text ||
                'Your code looks clean — no syntax errors or diagnostics were detected in the current file.';
            noIssueWrap.appendChild(noIssueBody);
            box.appendChild(noIssueWrap);

            if (stream) {
                _typewriterStream(noIssueBody, textToStream, onComplete);
            } else {
                noIssueBody.textContent = textToStream;
                if (onComplete) onComplete(false);
            }
        } else {
            const tasks = [];
            if (r.observation) {
                const sec = _section('Observation', stream ? '' : r.observation);
                box.appendChild(sec);
                if (stream) tasks.push({ el: sec.querySelector('.wl-section-body'), text: r.observation });
            }
            if (r.insight) {
                const sec = _section('Why this happens', stream ? '' : r.insight);
                box.appendChild(sec);
                if (stream) tasks.push({ el: sec.querySelector('.wl-section-body'), text: r.insight });
            }
            if (r.question) {
                const qs = _section('Guiding question', stream ? '' : r.question);
                qs.querySelector('.wl-section-body').classList.add('wl-question-body');
                box.appendChild(qs);
                if (stream) tasks.push({ el: qs.querySelector('.wl-section-body'), text: r.question });
            }
            const steps = Array.isArray(r.next_steps) ? r.next_steps.filter(Boolean) : [];
            if (steps.length > 0) {
                const sec = document.createElement('div');
                sec.className = 'wl-card-section';
                const hdr = document.createElement('div');
                hdr.className = 'wl-section-header';
                hdr.innerHTML = '<span class="wl-section-label">Next steps</span>';
                sec.appendChild(hdr);
                const ol = document.createElement('ol');
                ol.className = 'wl-steps-list';
                sec.appendChild(ol);
                box.appendChild(sec);
                steps.forEach(step => {
                    const li = document.createElement('li');
                    ol.appendChild(li);
                    if (stream) {
                        tasks.push({ el: li, text: step });
                    } else {
                        li.textContent = step;
                    }
                });
            }
            if (r.confidence_signal) {
                const sig = document.createElement('div');
                sig.className = 'wl-confidence-signal';
                sig.textContent = '✅ ' + r.confidence_signal;
                box.appendChild(sig);
            }
            if (!r.observation && !r.insight && !r.question && !r.next_steps) {
                const plain = document.createElement('div');
                plain.className = 'wl-msg-content';
                const plainText = r.text || JSON.stringify(r);
                box.appendChild(plain);
                if (stream) {
                    tasks.push({ el: plain, text: plainText });
                } else {
                    plain.textContent = plainText;
                }
            }

            if (stream) {
                _runStreamQueue(tasks, onComplete);
            } else {
                if (onComplete) onComplete(false);
            }
        }
    }

    /**
     * Append a user message bubble.
     * @param {string} text         The typed message text.
     * @param {string} [codeContext] Optional selected code attached to this message.
     * @param {boolean} [isEnhanced] Whether Enhanced mode was active when message was sent.
     */
    function appendUserMessage(text, codeContext, isEnhanced) {
        const wrapper = document.createElement('div');
        wrapper.className = 'wl-message wl-message-user';

        const avatar = document.createElement('div');
        avatar.className = 'wl-msg-avatar user-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = 'You';
        wrapper.appendChild(avatar);

        const body = document.createElement('div');
        body.className = 'wl-msg-body';

        const sender = document.createElement('div');
        sender.className = 'wl-msg-sender';
        sender.textContent = 'You';
        // Enhanced mode badge
        if (isEnhanced) {
            const badge = document.createElement('span');
            badge.className = 'wl-enhanced-badge';
            badge.textContent = '🔍 Enhanced';
            sender.appendChild(badge);
        }
        body.appendChild(sender);

        const box = document.createElement('div');
        box.className = 'wl-msg-content-box';

        // ── Attached code block (selected from editor) ──
        if (codeContext && codeContext.trim()) {
            const codeWrap = document.createElement('div');
            codeWrap.className = 'wl-card-section wl-selected-code-section';
            codeWrap.style.cssText = 'margin-bottom:8px;';
            const codeHeader = document.createElement('div');
            codeHeader.className = 'wl-section-header';
            codeHeader.innerHTML = '<span class="wl-section-icon">📎</span><span class="wl-section-label">Attached Code</span>';
            codeWrap.appendChild(codeHeader);
            const pre = document.createElement('pre');
            pre.className = 'wl-selected-code';
            pre.style.cssText = 'max-height:200px;overflow-y:auto;';
            const code = document.createElement('code');
            code.textContent = codeContext;
            pre.appendChild(code);
            codeWrap.appendChild(pre);
            box.appendChild(codeWrap);
        }

        const content = document.createElement('div');
        content.className = 'wl-msg-content';
        content.style.whiteSpace = 'pre-wrap';   // preserve newlines & code formatting
        content.textContent = text;
        box.appendChild(content);
        body.appendChild(box);

        wrapper.appendChild(body);
        conversation.appendChild(wrapper);
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    /**
     * Append a specialized user message for terminal output selection
     * @param {object} data
     */
    function appendTerminalMessage(data) {
        activateTab('chat');
        hideWelcome();

        const wrapper = document.createElement('div');
        wrapper.className = 'wl-message wl-message-user';

        const avatar = document.createElement('div');
        avatar.className = 'wl-msg-avatar user-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = 'You';
        wrapper.appendChild(avatar);

        const body = document.createElement('div');
        body.className = 'wl-msg-body';

        const sender = document.createElement('div');
        sender.className = 'wl-msg-sender';
        sender.textContent = 'You';
        
        const badge = document.createElement('span');
        badge.className = 'wl-terminal-badge';
        badge.textContent = `🖥️ ${data.terminalName || 'Terminal'} · ${data.errorType || 'Error'}`;
        sender.appendChild(badge);
        body.appendChild(sender);

        const box = document.createElement('div');
        box.className = 'wl-msg-content-box';

        // Terminal code snippet block
        const termWrap = document.createElement('div');
        termWrap.className = 'wl-card-section wl-selected-code-section';
        termWrap.style.cssText = 'margin-bottom:8px; border-left: 3px solid #f87171; background: rgba(239, 68, 68, 0.05);';
        
        const termHeader = document.createElement('div');
        termHeader.className = 'wl-section-header';
        termHeader.innerHTML = `
            <span class="wl-section-icon" style="color:#f87171;">⚡</span>
            <span class="wl-section-label" style="color:#f87171; font-weight:600;">Selected Terminal Log</span>
            ${data.primaryFile ? `<span style="margin-left:auto; font-size:10px; opacity:0.75;">📍 ${data.primaryFile}${data.primaryLine ? ':' + data.primaryLine : ''}</span>` : ''}
        `;
        termWrap.appendChild(termHeader);

        const pre = document.createElement('pre');
        pre.className = 'wl-selected-code';
        pre.style.cssText = 'max-height:160px; overflow-y:auto; font-size:11px; background:rgba(0,0,0,0.35); border-radius:4px; padding:6px;';
        const code = document.createElement('code');
        code.textContent = data.terminalOutput || '';
        pre.appendChild(code);
        termWrap.appendChild(pre);
        box.appendChild(termWrap);

        const content = document.createElement('div');
        content.className = 'wl-msg-content';
        content.textContent = data.query || 'Analyze this terminal error in the context of the workspace, explain why it occurred, and outline the fix.';
        box.appendChild(content);

        body.appendChild(box);
        wrapper.appendChild(body);
        conversation.appendChild(wrapper);
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }



    // ── Repeated Mistake Popup ─────────────────────────────────────────
    /**
     * Show a red floating popup when the user encounters a repeated error.
     * @param {number} count      Total occurrence count including this one.
     * @param {string} errorType  Human-readable error type (e.g. "syntax error").
     * @param {string} [category] Human-readable category label.
     * @param {string} [matchType] 'code' | 'diagnostic' | 'category'
     */
    function _showRepeatedMistakePopup(count, errorType, category, matchType) {
        // Remove any existing popup first
        const existing = document.getElementById('wl-repeat-popup');
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.id = 'wl-repeat-popup';
        popup.className = 'wl-repeat-popup';
        popup.setAttribute('role', 'alert');

        const typeLabel = errorType || category || '';
        const timesText = count === 1 ? 'once' : `${count} times`;
        const isCodeMatch = matchType === 'code' || matchType === 'diagnostic';

        // Header: icon + title changes based on match type
        const titleText = isCodeMatch
            ? '🔁 Same Code Pattern Detected'
            : '⚠️ Repeated Error Detected';

        // Header row
        const header = document.createElement('div');
        header.className = 'wl-repeat-popup-header';
        header.innerHTML =
            `<span class="wl-repeat-popup-title">${titleText}</span>` +
            `<span class="wl-repeat-popup-count">#${count}</span>`;

        // Message body — context-aware wording
        const msg = document.createElement('div');
        msg.className = 'wl-repeat-popup-msg';

        if (isCodeMatch) {
            // Code or diagnostic match — very specific
            const matchKind = matchType === 'code' ? 'exact code snippet' : 'error message';
            msg.innerHTML =
                `This <strong>${matchKind}</strong> has been seen in your history ` +
                `<strong>${timesText}</strong>. ` +
                `<em>You may already have a solution for this!</em>`;
        } else {
            // Category / error-type match
            msg.innerHTML =
                `You've encountered ` +
                (typeLabel ? `<strong>${typeLabel}</strong> ` : `this error type `) +
                `<strong>${timesText}</strong>.` +
                (category && errorType && category !== errorType
                    ? ` <span class="wl-repeat-popup-cat">(${category})</span>` : '') +
                ` <em>Review similar past solutions to break the pattern!</em>`;
        }

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'wl-repeat-popup-close';
        closeBtn.setAttribute('aria-label', 'Close notification');
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', () => popup.remove());

        // Progress bar (shrinks over 10 s)
        const barTrack = document.createElement('div');
        barTrack.className = 'wl-repeat-popup-bar-track';
        const barFill = document.createElement('div');
        barFill.className = 'wl-repeat-popup-bar-fill';
        barTrack.appendChild(barFill);

        popup.appendChild(header);
        popup.appendChild(msg);
        popup.appendChild(closeBtn);
        popup.appendChild(barTrack);

        document.body.appendChild(popup);

        // Auto-dismiss after 10 seconds
        const timer = setTimeout(() => {
            popup.classList.add('wl-repeat-popup-out');
            popup.addEventListener('animationend', () => popup.remove(), { once: true });
        }, 10000);

        closeBtn.addEventListener('click', () => clearTimeout(timer), { once: true });
    }

    // ── Messages from extension host ───────────────────────────────────
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.type) {

            case 'loading': {
                setGeneratingState(true);
                const hint = message.hint || 'Analyzing…';
                const inMentorNow = stateMentor && !stateMentor.classList.contains('wl-hidden');
                if (inMentorNow) {
                    // Update the inline thinking bubble text
                    const tb = conversation && conversation.querySelector('.wl-thinking-bubble .wl-thinking-text');
                    if (tb) tb.textContent = hint;
                } else {
                    if (loadingText) loadingText.textContent = hint;
                    showState('loading');
                }
                break;
            }

            case 'response': {
                const ctx = message.context || {};
                const data = message.data || {};
                const meta = data.metadata || {};
                const resp = data.response || {};
                resp._nexusResponseId = data.response_id;
                const vdbMatch = data.vector_db_match || null;

                // Remove the inline thinking bubble (if present)
                _removeThinkingBubble();

                lastContext = ctx;

                // Populate captured context card
                updateContextCard(ctx, meta.diagnostics);
                // Populate details tab
                updateDetails(meta);
                // Update guidance dots
                updateGuidanceDots(resp.guidance_level ?? 0);

                conversationHistory.push({ role: 'mentor', response: resp });

                // ── Auto-save to local history ──
                currentConversationContext = {
                    problem_id: data.problem_id,
                    session_id: data.session_id,
                    problem_context_id: data.problem_context_id,
                    file_name: ctx.file_name || ctx.fileName || '',
                    language: ctx.language || '',
                };

                // If no user message exists yet (command-triggered auto-analysis),
                // insert a synthetic user message so the restored conversation is complete.
                if (currentConversationMessages.length === 0 || currentConversationMessages[currentConversationMessages.length - 1].role === 'assistant') {
                    const autoLabel = currentConversationContext.file_name
                        ? `[Auto-analyzed: ${currentConversationContext.file_name}]`
                        : '[Auto-analyzed file]';
                    currentConversationMessages.push({
                        role: 'user',
                        content: autoLabel,
                        timestamp: new Date().toISOString(),
                        isAuto: true,
                    });
                }

                // Retroactively attach the selected code to the last user message
                // (the webview only learns about the selected code once the response arrives)
                const selectedCode = ctx.selection?.text || ctx.selected_code || '';
                if (selectedCode && currentConversationMessages.length > 0) {
                    const lastMsg = currentConversationMessages[currentConversationMessages.length - 1];
                    if (lastMsg.role === 'user' && !lastMsg.codeContext) {
                        lastMsg.codeContext = selectedCode;
                    }
                }

                if (resp.message && typeof resp.message === 'string') {
                    resp.message = _unwrapMessageText(resp.message);
                }
                const assistantContent = resp.message || resp.observation || resp.text ||
                    (Array.isArray(resp.steps) ? resp.steps.join('\n') : '') || '';
                currentConversationMessages.push({
                    role: 'assistant',
                    content: assistantContent,
                    timestamp: new Date().toISOString(),
                    rawResponse: resp,
                    context: currentConversationContext,
                });

                if (projectHistory) projectHistory.classList.add('wl-hidden');
                showState('mentor');
                activateTab('chat');

                // Append mentor bubble with progressive typewriter streaming
                appendMentorCard(resp, ctx, vdbMatch, true, (stoppedEarly) => {
                    setGeneratingState(false);
                    // Render suggestion chips (if backend returned suggestions and not stopped early)
                    if (!stoppedEarly) {
                        appendSuggestions(resp.suggestions || []);
                    }
                    _saveCurrentConversation();
                    assistanceUI.showCTA(data, currentConversationMessages.filter(m => m.role === 'user').at(-1)?.content || '');
                });

                // ── Repeated mistake popup ──────────────────────────────
                if (data.repeated_mistake === true) {
                    const occurrenceCount = data.occurrence_count || 2;
                    const matchType = data.match_type || 'category';
                    const errorTypeLabel = (meta.problem_type)
                        ? String(meta.problem_type).replace(/_/g, ' ')
                        : '';
                    const categoryLabel = (meta.problem_category)
                        ? String(meta.problem_category).replace(/_/g, ' ')
                        : '';
                    _showRepeatedMistakePopup(occurrenceCount, errorTypeLabel, categoryLabel, matchType);
                }

                showState('mentor');
                activateTab('chat');
                break;
            }

            case 'human_help_ready': {
                _removeThinkingBubble(); setGeneratingState(false);
                const data = message.data;
                currentConversationContext = { ...currentConversationContext, problem_id: data.problem_id,
                    session_id: data.session_id, problem_context_id: data.problem_context_id };
                assistanceUI.showCTA(data, 'human help');
                _saveCurrentConversation(); showState('mentor'); activateTab('chat'); break;
            }


            case 'auth_status':
                if (message.signedIn) {
                    // ── Feature 2: redirect to chat on successful login ──
                    showState('mentor');
                    activateTab('chat');
                } else if (message.error) {
                    // Login failed — show error on the form
                    handleAuthError(message.error);
                } else {
                    assistanceUI.reset();
                    currentConversationMessages = [];
                    currentConversationContext = {};
                    conversationHistory = [];
                    if (conversation) conversation.innerHTML = '';
                    showState('idle');
                }
                break;

            case 'project_history': {
                // Project-scoped history — rendered on the mentor screen
                const convs = message.conversations || [];
                const pName = message.projectName || 'this project';
                renderProjectHistory(convs, pName);
                if (!document.body.classList.contains('wl-not-signed-in')) {
                    showState('mentor');
                    activateTab('chat');
                }
                break;
            }

            case 'conversation_deleted': {
                if (currentConversationId === message.id) {
                    _resetCurrentConversation();
                }
                break;
            }

            case 'all_conversations_cleared': {
                _resetCurrentConversation();
                break;
            }

            case 'voice_transcript': {
                if (message.text && userInput) {
                    const cur = userInput.value;
                    userInput.value = cur ? (cur.trimEnd() + ' ' + message.text) : message.text;
                    userInput.focus();
                    if (voiceStatusText) {
                        voiceStatusText.textContent = 'Voice input inserted!';
                        setTimeout(stopVoiceInput, 1500);
                    } else {
                        stopVoiceInput();
                    }
                }
                break;
            }

            case 'restore_chat': {
                const detail = message.detail || {};
                const prob = detail.problem || {};
                const ctx = detail.context || {};
                const attempts = detail.attempts || [];

                assistanceUI.reset();
                currentConversationContext = { problem_id: prob.id, session_id: prob.session_id, problem_context_id: detail.problem_context_id };
                currentConversationMessages = [];
                if (detail.messages?.length) {
                    conversation.innerHTML = ''; conversationHistory = [];
                    detail.messages.forEach(turn => {
                        if (turn.question) { appendUserMessage(turn.question); conversationHistory.push({ role: 'user', text: turn.question }); }
                        const response = { ...turn.response, _nexusResponseId: turn.id, _nexusFeedback: turn.feedback };
                        appendMentorCard(response, {}, null);
                        conversationHistory.push({ role: 'mentor', response });
                        currentConversationMessages.push({ role: 'user', content: turn.question, timestamp: turn.created_at }, { role: 'assistant', content: response.message || response.observation || '', rawResponse: response, timestamp: turn.created_at });
                    });
                    assistanceUI.showCTA({ ...detail, problem_id: prob.id }, '');
                    showState('mentor'); activateTab('chat'); break;
                }

                // Clear any existing conversation
                if (conversation) conversation.innerHTML = '';
                conversationHistory = [];
                guidanceLevel = 0;

                // Populate context card with restored data
                updateContextCard({
                    file_name: ctx.file_name || '',
                    language: prob.language || '',
                    selected_code: ctx.selected_code || '',
                    diagnostics: ctx.diagnostics || [],
                }, ctx.diagnostics);

                // Populate details panel
                updateDetails({
                    problem_category: prob.category,
                    problem_type: prob.problem_type,
                    specialist: '—',
                    confidence: prob.confidence,
                });

                if (attempts.length === 0) {
                    // No attempts stored — just show a banner
                    const banner = document.createElement('div');
                    banner.className = 'wl-restore-banner';
                    banner.textContent = '↩ Resumed: ' + (prob.description || 'Previous session');
                    if (conversation) conversation.appendChild(banner);
                } else {
                    // Replay each recorded AI turn as a mentor bubble
                    attempts.forEach((attempt, idx) => {
                        const resp = {
                            observation: attempt.description,
                            guidance_level: attempt.guidance_level,
                        };
                        const card = appendMentorCard(resp, ctx, null);
                        // Mark first card as the session resume anchor
                        if (idx === 0 && card) {
                            const badge = document.createElement('div');
                            badge.className = 'wl-restore-banner';
                            badge.textContent = '↩ Resumed from previous session';
                            card.parentNode && card.parentNode.insertBefore(badge, card);
                        }
                        conversationHistory.push({ role: 'mentor', response: resp });
                    });
                    // Restore guidance dots to the last known level
                    const lastLevel = attempts[attempts.length - 1]?.guidance_level ?? 0;
                    updateGuidanceDots(lastLevel);
                }

                if (projectHistory) projectHistory.classList.add('wl-hidden');
                showState('mentor');
                activateTab('chat');
                break;
            }

            case 'no_errors': {
                // Extension host confirmed zero error-level diagnostics via live
                // VS Code API — show a guaranteed-accurate "no syntax errors" card.
                _removeThinkingBubble();
                const ctx = message.context || {};
                lastContext = ctx;
                updateContextCard(ctx, []);
                const noErrResp = {
                    observation: 'Your code looks clean — no syntax errors or diagnostics were detected in the current file.',
                };
                conversationHistory.push({ role: 'mentor', response: noErrResp });

                // ── Auto-save no_errors response to local history ──
                currentConversationContext = {
                    file_name: ctx.file_name || ctx.fileName || '',
                    language: ctx.language || '',
                };

                // If no user message exists yet (or the last message is already assistant),
                // insert a synthetic user message so the restored conversation is complete.
                if (currentConversationMessages.length === 0 || currentConversationMessages[currentConversationMessages.length - 1].role === 'assistant') {
                    const autoLabel = currentConversationContext.file_name
                        ? `[Auto-analyzed: ${currentConversationContext.file_name}]`
                        : '[Auto-analyzed file]';
                    currentConversationMessages.push({
                        role: 'user',
                        content: autoLabel,
                        timestamp: new Date().toISOString(),
                        isAuto: true,
                    });
                }

                currentConversationMessages.push({
                    role: 'assistant',
                    content: noErrResp.observation,
                    timestamp: new Date().toISOString(),
                    rawResponse: noErrResp,
                    context: currentConversationContext,
                });

                if (projectHistory) projectHistory.classList.add('wl-hidden');
                showState('mentor');
                activateTab('chat');

                appendMentorCard(noErrResp, ctx, null, true, () => {
                    setGeneratingState(false);
                    _saveCurrentConversation();
                });
                break;
            }

            case 'error': {
                stopGeneration();
                let errText = 'WorkLens could not reach its AI service.';
                if (typeof message.message === 'string') {
                    errText = message.message;
                } else if (typeof message.message === 'object' && message.message !== null) {
                    errText = JSON.stringify(message.message);
                }
                if (errorMessage) errorMessage.textContent = errText;
                showState('error');
                break;
            }

            default:
                console.warn('[WorkLens] Unknown message type:', message.type);
        }
    });

    // Show a neutral loading state while we wait for the host to report
    // auth status. The auth_status handler below will transition to either
    // 'mentor' (already logged in) or 'idle' (login page).
    showState('loading');
    activateTab('chat');

    // ── User actions ───────────────────────────────────────────────────
    function _buildConversationHistoryForBackend() {
        // Build the last 10 entries (up to 5 user + 5 assistant turns)
        // in the {role, content} format expected by the LLM
        const recent = conversationHistory.slice(-10);
        return recent.map(entry => {
            if (entry.role === 'user') {
                return { role: 'user', content: entry.text || '' };
            } else {
                // Mentor responses — use 'message' if conversational, else 'observation'
                const resp = entry.response || {};
                const content = resp.message || resp.observation || resp.text || '';
                return { role: 'assistant', content };
            }
        }).filter(e => e.content);
    }

    function _showNewChatNotification() {
        if (newChatNotificationShown) return;
        newChatNotificationShown = true;

        const notice = document.createElement('div');
        notice.className = 'wl-message wl-new-chat-notice';
        notice.innerHTML = `
            <div class="wl-notice-content">
                <span class="wl-notice-icon">💬</span>
                <span class="wl-notice-text">You've sent 5 messages in this chat. Consider starting a <strong>new chat</strong> for a fresh context.</span>
                <button class="wl-notice-dismiss" title="Dismiss">✕</button>
            </div>
        `;
        const dismissBtn = notice.querySelector('.wl-notice-dismiss');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                notice.remove();
            });
        }
        if (conversation) {
            conversation.appendChild(notice);
            notice.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }

    // ── Inline "thinking" bubble (shown during follow-up requests) ──────
    function _showThinkingBubble(hint) {
        _removeThinkingBubble(); // ensure only one at a time
        const wrapper = document.createElement('div');
        wrapper.className = 'wl-message wl-message-mentor wl-thinking-bubble';

        const avatar = document.createElement('div');
        avatar.className = 'wl-msg-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        if (window.WL_LOGO_URI) {
            const img = document.createElement('img');
            img.src = window.WL_LOGO_URI;
            img.alt = 'WorkLens';
            img.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:4px;';
            avatar.appendChild(img);
        } else { avatar.textContent = 'W'; }
        wrapper.appendChild(avatar);

        const body = document.createElement('div');
        body.className = 'wl-msg-body';

        const box = document.createElement('div');
        box.className = 'wl-msg-content-box wl-thinking-box';

        const dots = document.createElement('span');
        dots.className = 'wl-thinking-dots';
        dots.innerHTML = '<span></span><span></span><span></span>';
        box.appendChild(dots);

        const txt = document.createElement('span');
        txt.className = 'wl-thinking-text';
        txt.textContent = hint || 'Analyzing…';
        box.appendChild(txt);

        body.appendChild(box);
        wrapper.appendChild(body);
        if (conversation) {
            conversation.appendChild(wrapper);
            wrapper.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }

    function _removeThinkingBubble() {
        if (!conversation) return;
        conversation.querySelectorAll('.wl-thinking-bubble').forEach(el => el.remove());
    }

    function sendMessage(overrideText) {
        const text = (typeof overrideText === 'string' ? overrideText : userInput.value).trim();
        if (!text) return;

        // Remove any stale suggestion chip rows before sending
        conversation && conversation.querySelectorAll('.wl-suggestions').forEach(el => el.remove());

        // Ensure we are in mentor state so messages are visible
        const inMentor = stateMentor && !stateMentor.classList.contains('wl-hidden');
        if (!inMentor) {
            showState('mentor');
            activateTab('chat');
        }

        appendUserMessage(text, undefined, analysisMode === 'enhanced');
        conversationHistory.push({ role: 'user', text });
        userPromptCount++;

        // ── Record user message for local history ──
        currentConversationMessages.push({
            role: 'user',
            content: text,
            timestamp: new Date().toISOString(),
        });

        // Build conversation history for the backend
        const convHistory = _buildConversationHistoryForBackend();
        assistanceUI.explicit(text);

        // Extract any @mentions typed in the text + files explicitly tagged
        const taggedSet = new Set(activeTaggedFiles);
        const atMatches = text.match(/@([a-zA-Z0-9_\-./]+)/g) || [];
        atMatches.forEach(m => taggedSet.add(m.slice(1)));

        vscode.postMessage({
            type: 'user_reply',
            text,
            tagged_files: Array.from(taggedSet),
            conversation_history: convHistory,
            enhanced_mode: analysisMode === 'enhanced',
        });
        userInput.value = '';
        activeTaggedFiles.clear();
        _renderTaggedFilesBar();

        // Trigger generating state & stop button immediately
        setGeneratingState(true);

        // Show 5-prompt notification
        if (userPromptCount === 5) {
            _showNewChatNotification();
        }

        // Always show a loading indicator.
        // If we're in mentor state (ongoing conversation), add an inline
        // "thinking" bubble so the user sees progress without losing chat.
        const nowInMentor = stateMentor && !stateMentor.classList.contains('wl-hidden');
        if (nowInMentor) {
            _showThinkingBubble();
        } else {
            showState('loading');
        }
    }

    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            if (isGenerating) {
                stopGeneration();
            } else {
                sendMessage();
            }
        });
    }

    userInput.addEventListener('keydown', e => {
        if (e.key === 'Escape' && isGenerating) {
            stopGeneration();
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            if (isGenerating) {
                return;
            }
            // Let the capture-phase autocomplete handler intercept first;
            // if it called preventDefault() this bubble-phase listener is still
            // invoked but the default was already stopped, so we only act when
            // the dropdown is closed OR nothing is highlighted.
            if (!e.defaultPrevented) {
                e.preventDefault();
                // Dismiss any open autocomplete before sending
                const acDrop = document.getElementById('wl-autocomplete-dropdown');
                if (acDrop) acDrop.classList.add('wl-hidden');
                sendMessage();
            }
        }
    });

    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            if (document.body.classList.contains('wl-not-signed-in')) {
                showState('idle');
            } else {
                showState('loading');
                vscode.postMessage({ type: 'refresh' });
            }
        });
    }

    const backChatBtn = document.getElementById('wl-back-chat-btn');
    if (backChatBtn) {
        backChatBtn.addEventListener('click', () => {
            if (document.body.classList.contains('wl-not-signed-in')) {
                showState('idle');
            } else {
                showState('mentor');
                activateTab('chat');
            }
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'refresh' });
        });
    }

    // ── Mode toggle ────────────────────────────────────────────────────
    function setAnalysisMode(mode) {
        analysisMode = mode;
        if (modeSimpleBtn) modeSimpleBtn.classList.toggle('wl-mode-active', mode === 'simple');
        if (modeEnhancedBtn) modeEnhancedBtn.classList.toggle('wl-mode-active', mode === 'enhanced');
        // Update placeholder hint
        if (userInput) {
            userInput.placeholder = mode === 'enhanced'
                ? 'Enhanced: dependency analysis enabled…'
                : 'Ask WorkLens anything…';
        }
        // Persist
        try { const s = vscode.getState() || {}; vscode.setState({ ...s, analysisMode: mode }); } catch (_) { }
    }

    // Restore saved mode
    (function initMode() {
        try {
            const saved = (vscode.getState() || {}).analysisMode;
            if (saved === 'simple' || saved === 'enhanced') setAnalysisMode(saved);
        } catch (_) { }
    })();

    if (modeSimpleBtn) modeSimpleBtn.addEventListener('click', () => setAnalysisMode('simple'));
    if (modeEnhancedBtn) modeEnhancedBtn.addEventListener('click', () => setAnalysisMode('enhanced'));

    // ── Search Modal Overlay ───────────────────────────────────────────
    const searchOverlay = document.getElementById('wl-search-overlay');

    /**
     * Convert an ISO date string into a human-readable group label.
     * Returns "just now"/"Past week"/"Past month"/"Past year"/"Older".
     */
    function _groupLabel(isoString) {
        if (!isoString) return 'Older';
        try {
            const diff = Date.now() - new Date(isoString).getTime();
            const days = diff / 86400000;
            if (days < 1) return 'Today';
            if (days < 7) return 'Past week';
            if (days < 30) return 'Past month';
            if (days < 365) return 'Past year';
            return 'Older';
        } catch (_) { return 'Older'; }
    }

    /** Open the search modal overlay. */
    function openSearchModal() {
        if (!searchPanel || !searchOverlay) return;
        searchOverlay.classList.remove('wl-hidden');
        searchOverlay.setAttribute('aria-hidden', 'false');
        searchPanel.classList.remove('wl-hidden');
        if (searchInput) { searchInput.value = ''; searchInput.focus(); }
        // Request full conversation list from extension host
        vscode.postMessage({ type: 'load_all_conversations' });
    }

    /** Close the search modal overlay. */
    function closeSearchModal() {
        if (searchPanel) searchPanel.classList.add('wl-hidden');
        if (searchOverlay) {
            searchOverlay.classList.add('wl-hidden');
            searchOverlay.setAttribute('aria-hidden', 'true');
        }
        if (searchResults) searchResults.innerHTML = '';
        if (searchEmpty) searchEmpty.classList.add('wl-hidden');
        if (searchInput) searchInput.value = '';
    }

    /** Render conversation rows inside the search results list. */
    function _renderSearchRows(convs) {
        if (!searchResults) return;
        searchResults.innerHTML = '';

        if (!convs || convs.length === 0) {
            if (searchEmpty) searchEmpty.classList.remove('wl-hidden');
            return;
        }
        if (searchEmpty) searchEmpty.classList.add('wl-hidden');

        const chatIconSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
        const enterSVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>`;

        convs.forEach((conv, idx) => {
            const item = document.createElement('div');
            item.className = 'wl-search-result-item' + (idx === 0 ? ' active' : '');
            item.setAttribute('role', 'option');
            item.setAttribute('tabindex', '0');
            item.dataset.title = (conv.title || '').toLowerCase();

            // Chat bubble icon
            const iconWrap = document.createElement('span');
            iconWrap.className = 'wl-search-result-icon';
            iconWrap.innerHTML = chatIconSVG;

            // Title
            const titleEl = document.createElement('span');
            titleEl.className = 'wl-search-result-title';
            titleEl.textContent = conv.title || 'Untitled';

            // Meta (time + return indicator)
            const metaEl = document.createElement('span');
            metaEl.className = 'wl-search-result-meta';

            const timeEl = document.createElement('span');
            timeEl.className = 'wl-search-result-time';
            timeEl.textContent = _relativeTime(conv.updatedAt || conv.createdAt);

            // Delete button for this conversation
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'wl-search-result-delete';
            deleteBtn.type = 'button';
            deleteBtn.title = 'Delete conversation';
            deleteBtn.setAttribute('aria-label', 'Delete conversation');
            deleteBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (currentConversationId === conv.id) {
                    _resetCurrentConversation();
                }
                vscode.postMessage({ type: 'delete_conversation', id: conv.id });
                item.style.transition = 'all 0.2s';
                item.style.opacity = '0';
                item.style.transform = 'translateX(20px)';
                setTimeout(() => {
                    item.remove();
                    if (searchResults && searchResults.childElementCount === 0) {
                        if (searchEmpty) searchEmpty.classList.remove('wl-hidden');
                    }
                }, 200);
            });

            const enterEl = document.createElement('span');
            enterEl.className = 'wl-search-result-enter';
            enterEl.innerHTML = enterSVG;

            metaEl.appendChild(timeEl);
            metaEl.appendChild(deleteBtn);
            metaEl.appendChild(enterEl);

            item.appendChild(iconWrap);
            item.appendChild(titleEl);
            item.appendChild(metaEl);

            // Click / keyboard: restore conversation
            function doRestoreFromSearch() {
                closeSearchModal();
                if (conversation) conversation.innerHTML = '';
                conversationHistory = [];
                guidanceLevel = 0;
                currentConversationId = conv.id;
                currentConversationMessages = Array.isArray(conv.messages) ? conv.messages : [];
                assistanceUI.reset();
                currentConversationContext = conv.context || {};
                vscode.postMessage({ type: 'resume_backend_session', problem_id: currentConversationContext.problem_id });

                const banner = document.createElement('div');
                banner.className = 'wl-restore-banner';
                banner.textContent = `↩ Restored: ${conv.title || 'Previous conversation'}`;
                if (conversation) conversation.appendChild(banner);

                let rendered = 0;
                (conv.messages || []).forEach(m => {
                    if (m.role === 'user') {
                        if (!m.isAuto) { appendUserMessage(m.content || '', m.codeContext || ''); rendered++; }
                        conversationHistory.push({ role: 'user', text: m.content || '' });
                    } else if (m.role === 'assistant') {
                        const savedCtx = m.context || {};
                        appendMentorCard(m.rawResponse || { message: m.content }, savedCtx, null);
                        conversationHistory.push({ role: 'mentor', response: m.rawResponse || { message: m.content } });
                        rendered++;
                    }
                });

                if (rendered === 0 && conversation) {
                    const notice = document.createElement('div');
                    notice.className = 'wl-restore-banner';
                    notice.textContent = '⚠️ This conversation was saved in an older format and cannot be fully displayed.';
                    conversation.appendChild(notice);
                }
                showState('mentor');
                activateTab('chat');
            }

            item.addEventListener('click', doRestoreFromSearch);
            item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doRestoreFromSearch(); } });

            searchResults.appendChild(item);
        });
    }

    // Search button: toggle modal
    if (searchBtn) {
        searchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = searchPanel && !searchPanel.classList.contains('wl-hidden');
            isOpen ? closeSearchModal() : openSearchModal();
        });
    }

    // Close button (✕) inside modal
    if (searchCloseBtn) {
        searchCloseBtn.addEventListener('click', () => closeSearchModal());
    }

    // Backdrop click closes modal
    if (searchOverlay) {
        searchOverlay.addEventListener('click', () => closeSearchModal());
    }

    // Escape key closes modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && searchPanel && !searchPanel.classList.contains('wl-hidden')) {
            closeSearchModal();
        }
    });

    // Live filter as the user types
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const q = searchInput.value.trim().toLowerCase();
            if (!searchResults) return;
            const items = searchResults.querySelectorAll('.wl-search-result-item');
            let visible = 0;
            items.forEach((item, idx) => {
                const matches = !q || item.dataset.title.includes(q);
                item.style.display = matches ? '' : 'none';
                if (matches) { item.classList.toggle('active', visible === 0); visible++; }
            });
            if (searchEmpty) searchEmpty.classList.toggle('wl-hidden', visible > 0 || items.length === 0);
        });
    }

    // Handle conversation list from extension host
    window.addEventListener('message', event => {
        const msg = event.data;
        if (msg && msg.type === 'all_conversations') {
            _renderSearchRows(msg.conversations || []);
            if (searchInput && searchInput.value.trim()) {
                searchInput.dispatchEvent(new Event('input'));
            }
        }
    });


    // ── Conversation Reset & Clear Actions ─────────────────────────────
    function _resetCurrentConversation() {
        assistanceUI.reset();
        vscode.postMessage({ type: 'reset_backend_session' });
        stopGeneration();
        stopVoiceInput();
        closeSearchModal();
        currentConversationId = _generateConvId();
        currentConversationMessages = [];
        currentConversationContext = {};
        conversationHistory = [];
        guidanceLevel = 0;
        userPromptCount = 0;
        newChatNotificationShown = false;
        if (conversation) conversation.innerHTML = '';
        if (userInput) {
            userInput.value = '';
            userInput.focus();
        }
        if (contextCard) contextCard.classList.add('wl-hidden');
        showState('mentor');
        activateTab('chat');
        // Re-load project history so it appears above the new empty thread
        vscode.postMessage({ type: 'load_project_history' });
    }

    if (newChatBtn) {
        newChatBtn.addEventListener('click', _resetCurrentConversation);
    }

    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', () => {
            if (currentConversationId) {
                vscode.postMessage({ type: 'delete_conversation', id: currentConversationId });
            }
            _resetCurrentConversation();
        });
    }

    if (clearAllHistoryBtn) {
        clearAllHistoryBtn.addEventListener('click', () => {
            closeSettingsMenu();
            vscode.postMessage({ type: 'clear_all_history' });
            _resetCurrentConversation();
        });
    }

    // ── Settings dropdown ──────────────────────────────────────────────
    function closeSettingsMenu() {
        if (settingsMenu) settingsMenu.classList.add('wl-hidden');
        if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'false');
        if (themeSubmenu) themeSubmenu.classList.add('wl-hidden');
        if (themeBtn) themeBtn.setAttribute('aria-expanded', 'false');
    }

    if (settingsBtn && settingsMenu) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !settingsMenu.classList.contains('wl-hidden');
            if (isOpen) {
                closeSettingsMenu();
            } else {
                settingsMenu.classList.remove('wl-hidden');
                settingsBtn.setAttribute('aria-expanded', 'true');
            }
        });
    }

    // Close dropdown when clicking anywhere outside
    document.addEventListener('click', () => closeSettingsMenu());

    // ── Theme ───────────────────────────────────────────────────────────
    function applyTheme(theme) {
        document.body.dataset.wlTheme = theme;
        // Update aria-checked and active class on the two radio buttons
        if (themeLightBtn) {
            const isLight = theme === 'light';
            themeLightBtn.setAttribute('aria-checked', String(isLight));
            themeLightBtn.classList.toggle('wl-settings-item--active', isLight);
        }
        if (themeDarkBtn) {
            const isDark = theme === 'dark';
            themeDarkBtn.setAttribute('aria-checked', String(isDark));
            themeDarkBtn.classList.toggle('wl-settings-item--active', isDark);
        }
        // Persist via VS Code state so it survives panel reloads
        try {
            const state = vscode.getState() || {};
            vscode.setState({ ...state, theme });
        } catch (_) { }
    }

    // Restore saved theme on initial load
    (function initTheme() {
        try {
            const saved = (vscode.getState() || {}).theme;
            if (saved === 'light' || saved === 'dark') {
                applyTheme(saved);
            }
        } catch (_) { }
    })();

    // Theme toggle button (opens/closes submenu)
    if (themeBtn && themeSubmenu) {
        themeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !themeSubmenu.classList.contains('wl-hidden');
            if (isOpen) {
                themeSubmenu.classList.add('wl-hidden');
                themeBtn.setAttribute('aria-expanded', 'false');
            } else {
                themeSubmenu.classList.remove('wl-hidden');
                themeBtn.setAttribute('aria-expanded', 'true');
            }
        });
    }

    if (themeLightBtn) {
        themeLightBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            applyTheme('light');
            closeSettingsMenu();
        });
    }

    if (themeDarkBtn) {
        themeDarkBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            applyTheme('dark');
            closeSettingsMenu();
        });
    }

    // ── Logout ─────────────────────────────────────────────────────────
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            closeSettingsMenu();
            // Clear local state
            conversationHistory = [];
            guidanceLevel = 0;
            lastContext = {};
            if (conversation) conversation.innerHTML = '';
            if (userInput) userInput.value = '';
            if (contextCard) contextCard.classList.add('wl-hidden');
            // Reset login form to a clean state
            if (signInBtn) {
                signInBtn.disabled = false;
                signInBtn.textContent = 'Sign In';
            }
            if (loginEmail) loginEmail.value = '';
            if (loginPassword) loginPassword.value = '';
            if (loginError) loginError.classList.add('wl-hidden');
            // Notify host to clear tokens / session
            vscode.postMessage({ type: 'sign_out' });
            // Go back to login page
            showState('idle');
        });
    }

    // Copy context (only File and Language are shown)
    if (copyContextBtn) {
        copyContextBtn.addEventListener('click', () => {
            const text = [
                `File: ${ctxFile ? ctxFile.textContent : ''}`,
                `Language: ${ctxLang ? ctxLang.textContent : ''}`,
            ].join('\n');
            navigator.clipboard && navigator.clipboard.writeText(text).catch(() => { });
        });
    }

    // ── Suggestion chips ───────────────────────────────────────────────
    /**
     * Render clickable follow-up prompt chips below the latest AI bubble.
     * Clicking a chip auto-sends the suggestion text to the LLM.
     * Any existing chip row is removed by sendMessage() before the next request.
     *
     * @param {string[]} suggestions  Array of short follow-up prompt strings
     */
    function appendSuggestions(suggestions) {
        if (!Array.isArray(suggestions) || suggestions.length === 0) return;
        if (!conversation) return;

        const row = document.createElement('div');
        row.className = 'wl-suggestions';
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', 'Suggested follow-up prompts');

        suggestions.forEach(text => {
            if (!text || typeof text !== 'string') return;
            const chip = document.createElement('button');
            chip.className = 'wl-suggestion-chip';
            chip.type = 'button';
            chip.setAttribute('aria-label', `Send: ${text}`);
            chip.textContent = text;
            chip.addEventListener('click', () => sendMessage(text));
            row.appendChild(chip);
        });

        if (row.childElementCount === 0) return;
        conversation.appendChild(row);
        row.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    // ── File Tagging & @ Mention Module ───────────────────────────────
    const activeTaggedFiles = new Set();
    const taggedFilesBar = document.getElementById('wl-tagged-files-bar');
    const mentionBtn = document.getElementById('wl-mention-btn');

    function _renderTaggedFilesBar() {
        if (!taggedFilesBar) return;
        taggedFilesBar.innerHTML = '';
        if (activeTaggedFiles.size === 0) {
            taggedFilesBar.classList.add('wl-hidden');
            return;
        }
        taggedFilesBar.classList.remove('wl-hidden');
        activeTaggedFiles.forEach(f => {
            const pill = document.createElement('span');
            pill.className = 'wl-file-tag-pill';
            const base = f.split(/[\\/]/).pop();
            pill.innerHTML = `<span>📄 @${base}</span><button class="wl-file-tag-close" title="Remove tag" aria-label="Remove tag">✕</button>`;
            pill.querySelector('.wl-file-tag-close').addEventListener('click', () => {
                activeTaggedFiles.delete(f);
                _renderTaggedFilesBar();
            });
            taggedFilesBar.appendChild(pill);
        });
    }

    if (mentionBtn) {
        mentionBtn.addEventListener('click', () => {
            if (!userInput) return;
            const cur = userInput.value;
            if (!cur.endsWith('@') && !cur.endsWith('@ ')) {
                userInput.value = cur ? (cur.trimEnd() + ' @') : '@';
            }
            userInput.focus();
            userInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    // ── Voice Enablement (Web Speech API) ──────────────────────────────
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let isVoiceListening = false;
    let voiceBaseText = '';

    function toggleVoiceInput() {
        if (isVoiceListening) {
            stopVoiceInput();
        } else {
            startVoiceInput();
        }
    }

    function startVoiceInput() {
        isVoiceListening = true;
        _updateVoiceUI(true);

        if (userInput) {
            userInput.focus();
            const len = userInput.value.length;
            userInput.setSelectionRange(len, len);
        }

        // Show floating voice banner
        if (voiceStatus) {
            voiceStatus.classList.remove('wl-hidden');
            if (voiceStatusText) {
                const isMac = (navigator.platform || '').toUpperCase().indexOf('MAC') >= 0;
                voiceStatusText.textContent = isMac
                    ? 'Listening… Speak now! (Or double-press Fn on Mac)'
                    : 'Listening… Speak now! (Or press Win+H on Windows)';
            }
        }

        // 1. If Web Speech API is supported in this browser/webview
        if (SpeechRecognition) {
            try {
                recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = navigator.language || 'en-US';

                voiceBaseText = userInput ? userInput.value : '';
                if (voiceBaseText && !voiceBaseText.endsWith(' ')) {
                    voiceBaseText += ' ';
                }

                recognition.onresult = (event) => {
                    let interimTranscript = '';
                    let finalTranscript = '';
                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            finalTranscript += event.results[i][0].transcript;
                        } else {
                            interimTranscript += event.results[i][0].transcript;
                        }
                    }
                    const spoken = (finalTranscript + interimTranscript).trim();
                    if (spoken && userInput) {
                        userInput.value = voiceBaseText + spoken;
                        userInput.focus();
                        if (voiceStatusText) {
                            voiceStatusText.textContent = 'Transcribing voice…';
                        }
                    }
                };

                recognition.onerror = (err) => {
                    console.warn('[WorkLens Voice] Speech recognition warning:', err);
                };

                recognition.onend = () => {
                    // Keep listening UI active if still listening
                };

                recognition.start();
            } catch (e) {
                console.warn('[WorkLens Voice] Could not start speech recognition:', e);
            }
        }

        // 2. Also inform extension host to invoke native VS Code speech or macOS dictation
        try {
            vscode.postMessage({ type: 'start_voice_input' });
        } catch (_) {}
    }

    if (userInput) {
        userInput.addEventListener('input', () => {
            if (isVoiceListening && voiceStatusText) {
                voiceStatusText.textContent = 'Speech detected! Transcribing…';
            }
        });
    }

    function stopVoiceInput() {
        isVoiceListening = false;
        _updateVoiceUI(false);
        if (voiceStatus) {
            voiceStatus.classList.add('wl-hidden');
        }
        if (recognition) {
            try {
                recognition.stop();
            } catch (_) {}
            recognition = null;
        }
    }

    function _updateVoiceUI(listening) {
        const voiceBtns = document.querySelectorAll('.wl-voice-btn, #wl-voice-btn, #wl-inline-voice-btn');
        voiceBtns.forEach(btn => {
            btn.classList.toggle('wl-voice-active', listening);
            btn.setAttribute('title', listening ? 'Listening... (Click to stop)' : 'Voice dictation (Speak to type)');
        });
        const voiceLabel = document.getElementById('wl-voice-label');
        if (voiceLabel) {
            voiceLabel.textContent = listening ? 'Listening…' : 'Voice';
        }
    }

    const voiceBtn = document.getElementById('wl-voice-btn');
    if (voiceBtn) voiceBtn.addEventListener('click', toggleVoiceInput);
    const inlineVoiceBtn = document.getElementById('wl-inline-voice-btn');
    if (inlineVoiceBtn) inlineVoiceBtn.addEventListener('click', toggleVoiceInput);
    if (voiceStatusClose) voiceStatusClose.addEventListener('click', stopVoiceInput);

    // ── Autocomplete / word-suggestion engine ──────────────────────
    /**
     * Context-aware autocomplete for the Ask input.
     * Supports regular keywords and @file tagging across workspace files.
     */
    (function initAutocomplete() {
        // ── DOM refs ────────────────────────────────────────────────
        const acDropdown = document.getElementById('wl-autocomplete-dropdown');
        if (!userInput || !acDropdown) return;

        // ── State ───────────────────────────────────────────────────
        let workspaceFiles = [];   // populated once via 'workspace_files' message
        let acItems = [];          // current rendered suggestion strings
        let acIndex = -1;          // highlighted item index (-1 = none)
        let debounceTimer = null;

        // ── Static word corpus ──────────────────────────────────────
        const STATIC_WORDS = [
            // Question starters
            'what', 'why', 'when', 'where', 'which', 'who', 'how',
            'what is', 'what are', 'what does', 'what should',
            'why is', 'why does', 'why am', 'why are',
            'how do', 'how does', 'how can', 'how to', 'how should',
            'where is', 'where are', 'where do', 'where can',
            'which file', 'which function', 'which class', 'which method',
            // Dev nouns
            'function', 'folder', 'file', 'class', 'method', 'variable',
            'import', 'export', 'module', 'component', 'service', 'model',
            'error', 'bug', 'fix', 'issue', 'problem', 'exception',
            'refactor', 'improve', 'optimize', 'explain', 'describe',
            'test', 'lint', 'build', 'deploy', 'run', 'debug',
            'dependency', 'interface', 'type', 'constant', 'enum',
            'async', 'await', 'promise', 'callback', 'event',
            'database', 'query', 'schema', 'migration', 'endpoint',
            'api', 'request', 'response', 'status', 'route', 'handler',
            'config', 'settings', 'environment', 'variable', 'secret',
            'install', 'package', 'version', 'update', 'upgrade',
            // Common helpers
            'please', 'can you', 'could you', 'help me', 'show me',
            'list', 'summarize', 'generate', 'create', 'add', 'remove',
            'delete', 'rename', 'move', 'copy', 'find', 'search',
        ];

        // ── Helpers ─────────────────────────────────────────────────
        function getMatchToken(value) {
            const trimmed = value;
            const lastSpaceIdx = trimmed.lastIndexOf(' ');
            return lastSpaceIdx === -1 ? trimmed : trimmed.slice(lastSpaceIdx + 1);
        }

        /** Return up to `limit` suggestions matching `token` (case-insensitive). */
        function computeSuggestions(token, limit = 10) {
            if (!token || token.length < 1) return [];
            const isAtMention = token.startsWith('@');
            const cleanToken = isAtMention ? token.slice(1) : token;
            const lower = cleanToken.toLowerCase();

            if (isAtMention) {
                // Return matching workspace files
                return workspaceFiles
                    .filter(p => {
                        const base = p.split(/[\\/]/).pop() || '';
                        return !lower || base.toLowerCase().includes(lower) || p.toLowerCase().includes(lower);
                    })
                    .slice(0, 12);
            }

            // Workspace paths — basename or full relative match
            const fileSuggestions = workspaceFiles
                .filter(p => {
                    const base = p.split(/[\\/]/).pop() || '';
                    return base.toLowerCase().startsWith(lower) ||
                        p.toLowerCase().includes(lower);
                })
                .map(p => p.split(/[\\/]/).pop())
                .filter((v, i, a) => a.indexOf(v) === i)
                .slice(0, Math.ceil(limit / 2));

            const remaining = limit - fileSuggestions.length;
            const staticSuggestions = STATIC_WORDS
                .filter(w => w.toLowerCase().startsWith(lower) && !fileSuggestions.includes(w))
                .slice(0, remaining);

            return [...fileSuggestions, ...staticSuggestions];
        }

        // ── Dropdown render ──────────────────────────────────────────
        function renderDropdown(suggestions) {
            acDropdown.innerHTML = '';
            acItems = suggestions;
            acIndex = -1;

            if (suggestions.length === 0) {
                acDropdown.classList.add('wl-hidden');
                userInput.removeAttribute('aria-activedescendant');
                return;
            }

            suggestions.forEach((text, idx) => {
                const item = document.createElement('div');
                item.className = 'wl-ac-item';
                item.id = `wl-ac-item-${idx}`;
                item.setAttribute('role', 'option');
                item.setAttribute('aria-selected', 'false');

                const isFile = workspaceFiles.includes(text) || text.includes('/') || text.includes('\\') || text.includes('.');
                if (isFile) {
                    const base = text.split(/[\\/]/).pop();
                    const dir = (text.includes('/') || text.includes('\\')) ? text.slice(0, Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'))) : '';
                    item.innerHTML = `<span style="opacity:0.8;margin-right:6px;">📄</span><strong>${base}</strong> ${dir ? `<span style="opacity:0.5;font-size:10.5px;margin-left:5px;">${dir}</span>` : ''}`;
                } else {
                    item.textContent = text;
                }

                // mousedown fires before blur; prevents dropdown hiding on click
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    confirmSuggestion(text);
                });

                acDropdown.appendChild(item);
            });

            acDropdown.classList.remove('wl-hidden');
        }

        function hideDropdown() {
            acDropdown.classList.add('wl-hidden');
            acDropdown.innerHTML = '';
            acItems = [];
            acIndex = -1;
            userInput.removeAttribute('aria-activedescendant');
        }

        /** Apply / remove the highlight class to the item at `acIndex`. */
        function applyHighlight(nextIndex) {
            const items = acDropdown.querySelectorAll('.wl-ac-item');
            // Remove old highlight
            items.forEach(el => {
                el.classList.remove('wl-ac-item--active');
                el.setAttribute('aria-selected', 'false');
            });
            acIndex = nextIndex;
            if (acIndex >= 0 && acIndex < items.length) {
                const active = items[acIndex];
                active.classList.add('wl-ac-item--active');
                active.setAttribute('aria-selected', 'true');
                active.scrollIntoView({ block: 'nearest' });
                userInput.setAttribute('aria-activedescendant', active.id);
            } else {
                userInput.removeAttribute('aria-activedescendant');
            }
        }

        // ── Confirm a suggestion ─────────────────────────────────────
        function confirmSuggestion(text) {
            const current = userInput.value;
            const lastSpaceIdx = current.lastIndexOf(' ');
            const prefix = lastSpaceIdx === -1 ? '' : current.slice(0, lastSpaceIdx + 1);
            const token = getMatchToken(current);
            const isAtMention = token.startsWith('@');

            if (isAtMention) {
                activeTaggedFiles.add(text);
                _renderTaggedFilesBar();
                userInput.value = prefix + '@' + text + ' ';
            } else {
                userInput.value = prefix + text + ' ';
            }
            hideDropdown();
            userInput.focus();
        }

        // ── Input event (debounced) ───────────────────────────────────
        userInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const token = getMatchToken(userInput.value);
                const suggestions = computeSuggestions(token);
                renderDropdown(suggestions);
            }, 120);
        });

        // ── Keyboard navigation ──────────────────────────────────────
        userInput.addEventListener('keydown', (e) => {
            const isOpen = !acDropdown.classList.contains('wl-hidden') && acItems.length > 0;

            if (e.key === 'ArrowDown') {
                if (!isOpen) return;
                e.preventDefault();
                applyHighlight(Math.min(acIndex + 1, acItems.length - 1));
                return;
            }

            if (e.key === 'ArrowUp') {
                if (!isOpen) return;
                e.preventDefault();
                applyHighlight(Math.max(acIndex - 1, -1));
                return;
            }

            if (e.key === 'Tab') {
                if (!isOpen) return;
                e.preventDefault();
                const target = acIndex >= 0 ? acItems[acIndex] : acItems[0];
                if (target) confirmSuggestion(target);
                return;
            }

            if (e.key === 'Escape') {
                if (isOpen) {
                    e.preventDefault();
                    hideDropdown();
                }
                return;
            }

            if (e.key === 'Enter') {
                if (isOpen && acIndex >= 0) {
                    // User confirmed a highlighted item with Enter
                    e.preventDefault();
                    confirmSuggestion(acItems[acIndex]);
                }
                // Otherwise fall through — existing keydown handler will sendMessage()
            }
        }, true); // capture phase so we intercept before the existing Enter handler

        // ── Hide on outside click ────────────────────────────────────
        document.addEventListener('click', (e) => {
            if (!acDropdown.contains(e.target) && e.target !== userInput && e.target !== mentionBtn) {
                hideDropdown();
            }
        });

        // ── Hide dropdown when message is sent ───────────────────────
        submitBtn && submitBtn.addEventListener('click', hideDropdown, true);

        // ── Receive workspace files from extension host ──────────────
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'workspace_files') {
                workspaceFiles = Array.isArray(event.data.files) ? event.data.files : [];
            }
        });

        // Request workspace files from extension host on init
        vscode.postMessage({ type: 'request_workspace_files' });

    })(); // end initAutocomplete

    // ─────────────────────────────────────────────────────────────────
    // Multi-Agent Controller (Document Generator & Test Suite Generator)
    // ─────────────────────────────────────────────────────────────────
    (function initAgentChatplace() {
        function _escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // Views
        const hubView = document.getElementById('wl-agents-hub-view');
        const docView = document.getElementById('wl-agent-chatplace-view');
        const testView = document.getElementById('wl-test-agent-chatplace-view');
        const infraView = document.getElementById('wl-infra-agent-chatplace-view');
        const termView = document.getElementById('wl-terminal-agent-chatplace-view');

        // Hub Navigation Buttons
        const openDocAgentBtn = document.getElementById('wl-open-doc-agent-btn');
        const openTestAgentBtn = document.getElementById('wl-open-test-agent-btn');
        const openInfraAgentBtn = document.getElementById('wl-open-infra-agent-btn');
        const openTermAgentBtn = document.getElementById('wl-open-terminal-agent-btn');
        const docBackBtn = document.getElementById('wl-agent-back-btn');
        const testBackBtn = document.getElementById('wl-test-agent-back-btn');
        const infraBackBtn = document.getElementById('wl-infra-agent-back-btn');
        const termBackBtn = document.getElementById('wl-terminal-agent-back-btn');

        // Document Generator Elements
        const docStream = document.getElementById('wl-agent-stream');
        const docInput = document.getElementById('wl-agent-user-input');
        const docSubmitBtn = document.getElementById('wl-agent-submit-btn');
        const chipFull = document.getElementById('wl-agent-chip-full');
        const chipDiagram = document.getElementById('wl-agent-chip-diagram');
        const chipSpecs = document.getElementById('wl-agent-chip-specs');

        // Test Generator Elements
        const testStream = document.getElementById('wl-test-agent-stream');
        const testInput = document.getElementById('wl-test-agent-user-input');
        const testSubmitBtn = document.getElementById('wl-test-agent-submit-btn');
        const testChipActive = document.getElementById('wl-test-chip-active');
        const testChipFrontend = document.getElementById('wl-test-chip-frontend');
        const testChipBackend = document.getElementById('wl-test-chip-backend');

        // Infrastructure Generator Elements
        const infraStream = document.getElementById('wl-infra-agent-stream');
        const infraInput = document.getElementById('wl-infra-agent-user-input');
        const infraSubmitBtn = document.getElementById('wl-infra-agent-submit-btn');
        const infraChipFull = document.getElementById('wl-infra-chip-full');
        const infraChipCompose = document.getElementById('wl-infra-chip-compose');
        const infraChipK8s = document.getElementById('wl-infra-chip-k8s');

        // Terminal Orchestrator Elements
        const termStream = document.getElementById('wl-terminal-agent-stream');
        const termInput = document.getElementById('wl-terminal-agent-user-input');
        const termSubmitBtn = document.getElementById('wl-terminal-agent-submit-btn');
        const termChipReact = document.getElementById('wl-term-chip-react');
        const termChipMigrate = document.getElementById('wl-term-chip-migrate');
        const termChipDev = document.getElementById('wl-term-chip-dev');

        let isGeneratingDocs = false;
        let isGeneratingTests = false;
        let isGeneratingInfra = false;
        let isPlanningTerm = false;
        let currentDocStepCard = null;
        let currentTestStepCard = null;
        let currentInfraStepCard = null;
        let currentTermStepCard = null;

        // ── View Switching ───────────────────────────────────────────
        function showDocChatplace() {
            if (hubView) hubView.classList.add('wl-hidden');
            if (testView) testView.classList.add('wl-hidden');
            if (infraView) infraView.classList.add('wl-hidden');
            if (termView) termView.classList.add('wl-hidden');
            if (docView) docView.classList.remove('wl-hidden');
            if (docStream) docStream.scrollTop = docStream.scrollHeight;
        }

        function showTestChatplace() {
            if (hubView) hubView.classList.add('wl-hidden');
            if (docView) docView.classList.add('wl-hidden');
            if (infraView) infraView.classList.add('wl-hidden');
            if (termView) termView.classList.add('wl-hidden');
            if (testView) testView.classList.remove('wl-hidden');
            if (testStream) testStream.scrollTop = testStream.scrollHeight;
        }

        function showInfraChatplace() {
            if (hubView) hubView.classList.add('wl-hidden');
            if (docView) docView.classList.add('wl-hidden');
            if (testView) testView.classList.add('wl-hidden');
            if (termView) termView.classList.add('wl-hidden');
            if (infraView) infraView.classList.remove('wl-hidden');
            if (infraStream) infraStream.scrollTop = infraStream.scrollHeight;
        }

        function showTermChatplace() {
            if (hubView) hubView.classList.add('wl-hidden');
            if (docView) docView.classList.add('wl-hidden');
            if (testView) testView.classList.add('wl-hidden');
            if (infraView) infraView.classList.add('wl-hidden');
            if (termView) termView.classList.remove('wl-hidden');
            if (termStream) termStream.scrollTop = termStream.scrollHeight;
        }

        function showHub() {
            if (docView) docView.classList.add('wl-hidden');
            if (testView) testView.classList.add('wl-hidden');
            if (infraView) infraView.classList.add('wl-hidden');
            if (termView) termView.classList.add('wl-hidden');
            if (hubView) hubView.classList.remove('wl-hidden');
        }

        if (openDocAgentBtn) openDocAgentBtn.addEventListener('click', showDocChatplace);
        if (openTestAgentBtn) openTestAgentBtn.addEventListener('click', showTestChatplace);
        if (openInfraAgentBtn) openInfraAgentBtn.addEventListener('click', showInfraChatplace);
        if (openTermAgentBtn) openTermAgentBtn.addEventListener('click', showTermChatplace);
        if (docBackBtn) docBackBtn.addEventListener('click', showHub);
        if (testBackBtn) testBackBtn.addEventListener('click', showHub);
        if (infraBackBtn) infraBackBtn.addEventListener('click', showHub);
        if (termBackBtn) termBackBtn.addEventListener('click', showHub);

        // Auto-expand textareas
        function setupTextarea(el) {
            if (!el) return;
            el.addEventListener('input', () => {
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 80) + 'px';
            });
        }
        setupTextarea(docInput);
        setupTextarea(testInput);
        setupTextarea(infraInput);
        setupTextarea(termInput);

        function appendUserMessage(stream, text) {
            if (!stream) return;
            const msg = document.createElement('div');
            msg.className = 'wl-agent-msg wl-agent-msg-user';
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            msg.innerHTML = `
                <div class="wl-agent-msg-header">
                    <span class="wl-agent-msg-author">You</span>
                    <span class="wl-agent-msg-time">${time}</span>
                </div>
                <div class="wl-agent-msg-body">${_escapeHtml(text)}</div>
            `;
            stream.appendChild(msg);
            stream.scrollTop = stream.scrollHeight;
        }

        // ═════════════════════════════════════════════════════════════
        // 1. DOCUMENT GENERATOR AGENT WORKFLOW
        // ═════════════════════════════════════════════════════════════
        function runDocAgent(promptText) {
            if (isGeneratingDocs) return;
            isGeneratingDocs = true;

            showDocChatplace();

            if (docSubmitBtn) {
                docSubmitBtn.disabled = true;
                docSubmitBtn.innerHTML = '<div class="wl-step-spinner" style="width:14px;height:14px;border-width:2px;margin:auto;"></div>';
            }
            if (docInput) {
                docInput.disabled = true;
                docInput.placeholder = "Generating documentation... please wait...";
            }

            if (promptText) {
                appendUserMessage(docStream, promptText);
            }

            createDocStepCard();

            vscode.postMessage({
                type: 'generate_docs',
                prompt: promptText || '',
            });
        }

        function createDocStepCard() {
            if (!docStream) return;
            if (currentDocStepCard) currentDocStepCard.remove();

            const card = document.createElement('div');
            card.className = 'wl-agent-step-card';
            card.innerHTML = `
                <div class="wl-step-header">
                    <div class="wl-step-title">
                        <div class="wl-step-spinner"></div>
                        <span id="wl-doc-step-title-text">Initiating Workspace Analysis</span>
                    </div>
                    <span class="wl-step-count" id="wl-doc-step-counter">Step 1 of 5</span>
                </div>
                <div class="wl-step-progress-bar">
                    <div class="wl-step-progress-fill" id="wl-doc-step-fill" style="width: 20%;"></div>
                </div>
                <div class="wl-step-message" id="wl-doc-step-message-text">Scanning project files and tree structure...</div>
            `;
            docStream.appendChild(card);
            docStream.scrollTop = docStream.scrollHeight;
            currentDocStepCard = card;
        }

        function updateDocStepCard(step, totalSteps, title, message) {
            if (!currentDocStepCard) createDocStepCard();
            const titleEl = document.getElementById('wl-doc-step-title-text');
            const counterEl = document.getElementById('wl-doc-step-counter');
            const fillEl = document.getElementById('wl-doc-step-fill');
            const msgEl = document.getElementById('wl-doc-step-message-text');

            if (titleEl) titleEl.textContent = title || 'Generating Documents';
            if (counterEl) counterEl.textContent = `Step ${step} of ${totalSteps}`;
            if (fillEl) fillEl.style.width = `${Math.min(100, Math.round((step / totalSteps) * 100))}%`;
            if (msgEl) msgEl.textContent = message;

            if (docStream) docStream.scrollTop = docStream.scrollHeight;
        }

        function renderDocCompletionCard(data) {
            if (currentDocStepCard) {
                currentDocStepCard.remove();
                currentDocStepCard = null;
            }

            const files = data.files || [];
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const msg = document.createElement('div');
            msg.className = 'wl-agent-msg wl-agent-msg-bot';

            let filesHtml = files.map(f => {
                const ext = f.ext || 'file';
                const badgeClass = ext === 'md' ? 'wl-ext-md' : (ext === 'mmd' ? 'wl-ext-mmd' : 'wl-ext-pdf');
                return `
                    <div class="wl-file-item">
                        <div class="wl-file-info">
                            <span class="wl-badge-ext ${badgeClass}">.${ext}</span>
                            <span class="wl-file-name" title="${_escapeHtml(f.path)}">${_escapeHtml(f.name)}</span>
                        </div>
                        <div class="wl-file-actions">
                            <button class="wl-file-open-btn" data-filepath="${_escapeHtml(f.path)}" type="button">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                Open
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            msg.innerHTML = `
                <div class="wl-agent-msg-header">
                    <span class="wl-agent-msg-author">Document Generator Agent</span>
                    <span class="wl-agent-msg-time">${time}</span>
                </div>
                <div class="wl-agent-msg-body">
                    <div class="wl-result-card">
                        <div class="wl-result-title">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                            <span>Documentation Successfully Generated</span>
                        </div>
                        <p style="font-size:11.5px;margin:0;color:var(--vscode-descriptionForeground);">
                            Saved directly to <code>docs/</code> in your workspace:
                        </p>
                        <div class="wl-files-list">
                            ${filesHtml}
                        </div>
                        
                        <div class="wl-preview-accordion">
                            <button class="wl-preview-toggle-btn" id="wl-toggle-mermaid-btn" type="button">
                                <span>▶ Preview Architecture Diagram (.mmd)</span>
                            </button>
                            <pre class="wl-code-preview wl-hidden" id="wl-mermaid-preview-box">${_escapeHtml(data.mermaid || '')}</pre>
                            
                            <button class="wl-preview-toggle-btn" id="wl-toggle-md-btn" type="button">
                                <span>▶ Preview Technical Documentation (.md)</span>
                            </button>
                            <pre class="wl-code-preview wl-hidden" id="wl-md-preview-box">${_escapeHtml(data.markdown || '')}</pre>
                        </div>
                    </div>
                </div>
            `;

            docStream.appendChild(msg);

            msg.querySelectorAll('.wl-file-open-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const filePath = btn.getAttribute('data-filepath');
                    if (filePath) vscode.postMessage({ type: 'open_workspace_file', path: filePath });
                });
            });

            const mermaidToggle = msg.querySelector('#wl-toggle-mermaid-btn');
            const mermaidBox = msg.querySelector('#wl-mermaid-preview-box');
            if (mermaidToggle && mermaidBox) {
                mermaidToggle.addEventListener('click', () => {
                    const isHidden = mermaidBox.classList.toggle('wl-hidden');
                    mermaidToggle.firstElementChild.textContent = isHidden ? '▶ Preview Architecture Diagram (.mmd)' : '▼ Hide Architecture Diagram (.mmd)';
                });
            }

            const mdToggle = msg.querySelector('#wl-toggle-md-btn');
            const mdBox = msg.querySelector('#wl-md-preview-box');
            if (mdToggle && mdBox) {
                mdToggle.addEventListener('click', () => {
                    const isHidden = mdBox.classList.toggle('wl-hidden');
                    mdToggle.firstElementChild.textContent = isHidden ? '▶ Preview Technical Documentation (.md)' : '▼ Hide Technical Documentation (.md)';
                });
            }

            docStream.scrollTop = docStream.scrollHeight;
            isGeneratingDocs = false;
            resetDocInput();
        }

        function renderDocError(message) {
            if (currentDocStepCard) {
                currentDocStepCard.remove();
                currentDocStepCard = null;
            }
            const msg = document.createElement('div');
            msg.className = 'wl-agent-msg wl-agent-msg-bot';
            msg.innerHTML = `
                <div class="wl-agent-msg-body" style="border-color: rgba(239, 68, 68, 0.4);">
                    <div style="color: #f87171; font-weight:600; display:flex; align-items:center; gap:6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span>Documentation Generation Error</span>
                    </div>
                    <p style="margin:4px 0 0 0; font-size:11.5px;">${_escapeHtml(message)}</p>
                </div>
            `;
            docStream.appendChild(msg);
            docStream.scrollTop = docStream.scrollHeight;
            isGeneratingDocs = false;
            resetDocInput();
        }

        function resetDocInput() {
            if (docSubmitBtn) {
                docSubmitBtn.disabled = false;
                docSubmitBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
            }
            if (docInput) {
                docInput.disabled = false;
                docInput.placeholder = "Instruct Document Generator Agent (e.g. Focus on API architecture)...";
            }
        }

        if (chipFull) chipFull.addEventListener('click', () => runDocAgent('Generate full workspace documentation including technical markdown specifications, Mermaid architecture diagram, and executive PDF report.'));
        if (chipDiagram) chipDiagram.addEventListener('click', () => runDocAgent('Focus on generating a comprehensive architectural flowchart and topology diagram in Mermaid (.mmd).'));
        if (chipSpecs) chipSpecs.addEventListener('click', () => runDocAgent('Focus on component architecture, data models, API interfaces, and system setup in Markdown (.md).'));

        if (docSubmitBtn) {
            docSubmitBtn.addEventListener('click', () => {
                const text = (docInput?.value || '').trim();
                if (docInput) { docInput.value = ''; docInput.style.height = 'auto'; }
                runDocAgent(text || 'Generate comprehensive project documentation.');
            });
        }
        if (docInput) {
            docInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    docSubmitBtn && docSubmitBtn.click();
                }
            });
        }

        // ═════════════════════════════════════════════════════════════
        // 2. TEST SUITE GENERATOR AGENT WORKFLOW
        // ═════════════════════════════════════════════════════════════
        function runTestAgent(promptText) {
            if (isGeneratingTests) return;
            isGeneratingTests = true;

            showTestChatplace();

            if (testSubmitBtn) {
                testSubmitBtn.disabled = true;
                testSubmitBtn.innerHTML = '<div class="wl-step-spinner" style="width:14px;height:14px;border-width:2px;margin:auto;"></div>';
            }
            if (testInput) {
                testInput.disabled = true;
                testInput.placeholder = "Generating test suite... please wait...";
            }

            if (promptText) {
                appendUserMessage(testStream, promptText);
            }

            createTestStepCard();

            vscode.postMessage({
                type: 'generate_tests',
                prompt: promptText || '',
            });
        }

        function createTestStepCard() {
            if (!testStream) return;
            if (currentTestStepCard) currentTestStepCard.remove();

            const card = document.createElement('div');
            card.className = 'wl-agent-step-card';
            card.innerHTML = `
                <div class="wl-step-header">
                    <div class="wl-step-title">
                        <div class="wl-step-spinner"></div>
                        <span id="wl-test-step-title-text">Scanning Target Files</span>
                    </div>
                    <span class="wl-step-count" id="wl-test-step-counter">Step 1 of 5</span>
                </div>
                <div class="wl-step-progress-bar">
                    <div class="wl-step-progress-fill" id="wl-test-step-fill" style="width: 20%; background: linear-gradient(90deg, #a855f7, #c084fc);"></div>
                </div>
                <div class="wl-step-message" id="wl-test-step-message-text">Analyzing source modules and target directory...</div>
            `;
            testStream.appendChild(card);
            testStream.scrollTop = testStream.scrollHeight;
            currentTestStepCard = card;
        }

        function updateTestStepCard(step, totalSteps, title, message) {
            if (!currentTestStepCard) createTestStepCard();
            const titleEl = document.getElementById('wl-test-step-title-text');
            const counterEl = document.getElementById('wl-test-step-counter');
            const fillEl = document.getElementById('wl-test-step-fill');
            const msgEl = document.getElementById('wl-test-step-message-text');

            if (titleEl) titleEl.textContent = title || 'Generating Test Suite';
            if (counterEl) counterEl.textContent = `Step ${step} of ${totalSteps}`;
            if (fillEl) fillEl.style.width = `${Math.min(100, Math.round((step / totalSteps) * 100))}%`;
            if (msgEl) msgEl.textContent = message;

            if (testStream) testStream.scrollTop = testStream.scrollHeight;
        }

        function renderTestCompletionCard(data) {
            if (currentTestStepCard) {
                currentTestStepCard.remove();
                currentTestStepCard = null;
            }

            const files = data.files || [];
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const framework = (data.framework || 'jest').toUpperCase();
            const testsDirRel = data.testsDirRel || 'tests';
            const runCommand = data.runCommand || `npm test -- ${testsDirRel}/`;

            const msg = document.createElement('div');
            msg.className = 'wl-agent-msg wl-agent-msg-bot';

            let filesHtml = files.map((f, idx) => {
                const ext = f.ext || 'js';
                const badgeClass = ext === 'py' ? 'wl-ext-py' : (ext === 'java' ? 'wl-ext-junit' : 'wl-ext-jest');
                return `
                    <div class="wl-file-item" style="border-left: 3px solid #c084fc;">
                        <div class="wl-file-info">
                            <span class="wl-badge-ext ${badgeClass}">.${ext}</span>
                            <span class="wl-file-name" title="${_escapeHtml(f.path)}">${_escapeHtml(f.name)}</span>
                            <span class="wl-cases-pill">${f.casesCount || 4} tests</span>
                        </div>
                        <div class="wl-file-actions">
                            <button class="wl-file-open-btn wl-test-file-open" data-filepath="${_escapeHtml(f.path)}" type="button">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                Open
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            // Preview blocks for files
            let previewsHtml = files.slice(0, 3).map((f, idx) => {
                return `
                    <button class="wl-preview-toggle-btn wl-test-preview-toggle" data-target="wl-test-prev-${idx}" type="button">
                        <span>▶ Preview ${_escapeHtml(f.name)} (${f.lines || 30} lines)</span>
                    </button>
                    <pre class="wl-code-preview wl-hidden" id="wl-test-prev-${idx}">${_escapeHtml(f.code || '')}</pre>
                `;
            }).join('');

            msg.innerHTML = `
                <div class="wl-agent-msg-header">
                    <span class="wl-agent-msg-author">Test Suite Generator Agent</span>
                    <span class="wl-agent-msg-time">${time}</span>
                </div>
                <div class="wl-agent-msg-body">
                    <div class="wl-result-card" style="border-color: rgba(168, 85, 247, 0.35);">
                        <div class="wl-result-title" style="color: #c084fc;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                            <span>Test Suite Successfully Created</span>
                        </div>
                        <p style="font-size:11.5px;margin:0;color:var(--vscode-descriptionForeground);">
                            Target: <strong>${_escapeHtml(data.targetName || 'Workspace')}</strong> · Framework: <span class="wl-badge-ext wl-ext-py" style="text-transform:uppercase;">${framework}</span><br>
                            Created in respective directory: <code>${_escapeHtml(testsDirRel)}/</code>
                        </p>
                        
                        <div class="wl-files-list">
                            ${filesHtml}
                        </div>

                        <!-- Run Tests CTA -->
                        <button class="wl-run-tests-btn" id="wl-run-tests-action" data-command="${_escapeHtml(runCommand)}" type="button">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            <span>Run Suite in Terminal: <code>${_escapeHtml(runCommand)}</code></span>
                        </button>
                        
                        <div class="wl-preview-accordion">
                            ${previewsHtml}
                        </div>
                    </div>
                </div>
            `;

            testStream.appendChild(msg);

            // Wire open buttons
            msg.querySelectorAll('.wl-test-file-open').forEach(btn => {
                btn.addEventListener('click', () => {
                    const filePath = btn.getAttribute('data-filepath');
                    if (filePath) vscode.postMessage({ type: 'open_workspace_file', path: filePath });
                });
            });

            // Wire Run tests CTA
            const runBtn = msg.querySelector('#wl-run-tests-action');
            if (runBtn) {
                runBtn.addEventListener('click', () => {
                    const cmd = runBtn.getAttribute('data-command');
                    if (cmd) vscode.postMessage({ type: 'run_test_command', command: cmd });
                });
            }

            // Wire Preview toggles
            msg.querySelectorAll('.wl-test-preview-toggle').forEach(tBtn => {
                tBtn.addEventListener('click', () => {
                    const targetId = tBtn.getAttribute('data-target');
                    const targetPre = document.getElementById(targetId);
                    if (targetPre) {
                        const isHidden = targetPre.classList.toggle('wl-hidden');
                        const label = tBtn.firstElementChild.textContent.replace(/^[▶▼]\s*/, '');
                        tBtn.firstElementChild.textContent = (isHidden ? '▶ ' : '▼ ') + label;
                    }
                });
            });

            testStream.scrollTop = testStream.scrollHeight;
            isGeneratingTests = false;
            resetTestInput();
        }

        function renderTestError(message) {
            if (currentTestStepCard) {
                currentTestStepCard.remove();
                currentTestStepCard = null;
            }
            const msg = document.createElement('div');
            msg.className = 'wl-agent-msg wl-agent-msg-bot';
            msg.innerHTML = `
                <div class="wl-agent-msg-body" style="border-color: rgba(239, 68, 68, 0.4);">
                    <div style="color: #f87171; font-weight:600; display:flex; align-items:center; gap:6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span>Test Suite Generation Error</span>
                    </div>
                    <p style="margin:4px 0 0 0; font-size:11.5px;">${_escapeHtml(message)}</p>
                </div>
            `;
            testStream.appendChild(msg);
            testStream.scrollTop = testStream.scrollHeight;
            isGeneratingTests = false;
            resetTestInput();
        }

        function resetTestInput() {
            if (testSubmitBtn) {
                testSubmitBtn.disabled = false;
                testSubmitBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
            }
            if (testInput) {
                testInput.disabled = false;
                testInput.placeholder = "Instruct Test Suite Generator (e.g. generate unit testcase for the whole frontend folder)...";
            }
        }

        // Test Chip Listeners
        if (testChipActive) {
            testChipActive.addEventListener('click', () => {
                runTestAgent('Generate unit testcase for the active file');
            });
        }
        if (testChipFrontend) {
            testChipFrontend.addEventListener('click', () => {
                runTestAgent('generate unit testcase for the whole frontend folder');
            });
        }
        if (testChipBackend) {
            testChipBackend.addEventListener('click', () => {
                runTestAgent('generate unit testcase for the whole backend folder');
            });
        }

        if (testSubmitBtn) {
            testSubmitBtn.addEventListener('click', () => {
                const text = (testInput?.value || '').trim();
                if (testInput) { testInput.value = ''; testInput.style.height = 'auto'; }
                runTestAgent(text || 'generate unit testcase for the whole frontend folder');
            });
        }
        if (testInput) {
            testInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    testSubmitBtn && testSubmitBtn.click();
                }
            });
        }

        // ═════════════════════════════════════════════════════════════
        // 3. INFRASTRUCTURE & DEVOPS GENERATOR AGENT WORKFLOW
        // ═════════════════════════════════════════════════════════════
        function runInfraAgent(promptText) {
            if (isGeneratingInfra) return;
            isGeneratingInfra = true;

            showInfraChatplace();

            if (infraSubmitBtn) {
                infraSubmitBtn.disabled = true;
                infraSubmitBtn.innerHTML = '<div class="wl-step-spinner" style="width:14px;height:14px;border-width:2px;margin:auto;"></div>';
            }
            if (infraInput) {
                infraInput.disabled = true;
                infraInput.placeholder = "Synthesizing DevOps & Infrastructure files... please wait...";
            }

            if (promptText) {
                appendUserMessage(infraStream, promptText);
            }

            createInfraStepCard();

            vscode.postMessage({
                type: 'generate_infra',
                prompt: promptText || '',
            });
        }

        function createInfraStepCard() {
            if (currentInfraStepCard) {
                currentInfraStepCard.remove();
            }
            const card = document.createElement('div');
            card.className = 'wl-agent-msg wl-agent-msg-bot wl-step-card-active';
            card.innerHTML = `
                <div class="wl-agent-msg-body">
                    <div class="wl-step-card-header">
                        <div class="wl-step-spinner"></div>
                        <div class="wl-step-header-text">
                            <div class="wl-step-counter" id="wl-infra-step-counter">Step 1 of 5</div>
                            <div class="wl-step-title" id="wl-infra-step-title">Analyzing Workspace & .env</div>
                        </div>
                    </div>
                    <div class="wl-step-desc" id="wl-infra-step-desc">Scanning service directories, detecting frameworks, reading .env keys...</div>
                    <div class="wl-step-bar-wrap">
                        <div class="wl-step-bar-fill" id="wl-infra-step-bar" style="width: 20%;"></div>
                    </div>
                </div>
            `;
            infraStream.appendChild(card);
            infraStream.scrollTop = infraStream.scrollHeight;
            currentInfraStepCard = card;
        }

        function updateInfraStepCard(step, totalSteps, title, desc) {
            const counter = document.getElementById('wl-infra-step-counter');
            const titleEl = document.getElementById('wl-infra-step-title');
            const descEl = document.getElementById('wl-infra-step-desc');
            const bar = document.getElementById('wl-infra-step-bar');

            if (counter) counter.textContent = `Step ${step} of ${totalSteps}`;
            if (titleEl) titleEl.textContent = title;
            if (descEl) descEl.textContent = desc;
            if (bar) bar.style.width = `${Math.min(100, Math.round((step / totalSteps) * 100))}%`;

            if (infraStream) infraStream.scrollTop = infraStream.scrollHeight;
        }

        function renderInfraCompletionCard(data) {
            if (currentInfraStepCard) {
                currentInfraStepCard.remove();
                currentInfraStepCard = null;
            }

            const msg = document.createElement('div');
            msg.className = 'wl-agent-msg wl-agent-msg-bot';

            const filesListHtml = (data.files || []).map(f => {
                return `
                    <div class="wl-file-item">
                        <div class="wl-file-info">
                            <span class="wl-tag-pill" style="font-size:10px;">${_escapeHtml(f.category)}</span>
                            <span class="wl-file-name" title="${_escapeHtml(f.relPath)}">${_escapeHtml(f.relPath)}</span>
                            <span class="wl-badge-label" style="font-size:10.5px; opacity:0.8;">(${f.lines || 20} lines)</span>
                        </div>
                        <div class="wl-file-actions">
                            <button class="wl-file-open-btn" data-path="${_escapeHtml(f.absPath)}" type="button" title="Open file">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                <span>Open</span>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            // Determine relevant launch command based on generated files
            const files = data.files || [];
            const hasCompose = files.some(f => f.name === 'docker-compose.yml' || (f.relPath && f.relPath.includes('docker-compose')));
            const hasK8s = files.some(f => f.category === 'Kubernetes' || (f.relPath && f.relPath.startsWith('k8s')));
            const hasDockerfile = files.some(f => f.category === 'Docker' || f.name === 'Dockerfile');

            let launchActionHtml = '';
            if (hasCompose) {
                launchActionHtml = `
                    <div style="margin-top:10px; display:flex; flex-direction:column; gap:6px;">
                        <button class="wl-infra-launch-btn" data-command="docker-compose up --build -d" type="button">
                            <span class="wl-infra-launch-left">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                <span class="wl-infra-launch-label">Launch with Docker Compose:</span>
                            </span>
                            <code class="wl-infra-launch-cmd">docker-compose up --build -d</code>
                        </button>
                    </div>
                `;
            } else if (hasK8s) {
                launchActionHtml = `
                    <div style="margin-top:10px; display:flex; flex-direction:column; gap:6px;">
                        <button class="wl-infra-launch-btn" data-command="kubectl apply -f k8s/" type="button">
                            <span class="wl-infra-launch-left">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                <span class="wl-infra-launch-label">Deploy to Kubernetes:</span>
                            </span>
                            <code class="wl-infra-launch-cmd">kubectl apply -f k8s/</code>
                        </button>
                    </div>
                `;
            } else if (hasDockerfile) {
                launchActionHtml = `
                    <div style="margin-top:10px; display:flex; flex-direction:column; gap:6px;">
                        <button class="wl-infra-launch-btn" data-command="docker build -t app:latest ." type="button">
                            <span class="wl-infra-launch-left">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                <span class="wl-infra-launch-label">Build Docker Container:</span>
                            </span>
                            <code class="wl-infra-launch-cmd">docker build -t app:latest .</code>
                        </button>
                    </div>
                `;
            }

            msg.innerHTML = `
                <div class="wl-agent-msg-body wl-complete-card">
                    <div class="wl-complete-header">
                        <div class="wl-complete-icon-wrap" style="color:#0ea5e9;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                        <div class="wl-complete-meta">
                            <div class="wl-complete-title">Infrastructure Suite Created</div>
                            <div class="wl-complete-subtitle">Generated ${data.files ? data.files.length : 0} production-ready manifests across workspace</div>
                        </div>
                    </div>

                    <div class="wl-files-list">
                        ${filesListHtml}
                    </div>

                    ${launchActionHtml}
                </div>
            `;

            infraStream.appendChild(msg);

            // Wire open buttons
            msg.querySelectorAll('.wl-file-open-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const filePath = btn.getAttribute('data-path');
                    if (filePath) vscode.postMessage({ type: 'open_workspace_file', path: filePath });
                });
            });

            const runBtn = msg.querySelector('.wl-infra-launch-btn, .wl-test-run-btn');
            if (runBtn) {
                runBtn.addEventListener('click', () => {
                    const cmd = runBtn.getAttribute('data-command');
                    if (cmd) vscode.postMessage({ type: 'run_test_command', command: cmd });
                });
            }

            infraStream.scrollTop = infraStream.scrollHeight;
            isGeneratingInfra = false;
            resetInfraInput();
        }

        function renderInfraError(message) {
            if (currentInfraStepCard) {
                currentInfraStepCard.remove();
                currentInfraStepCard = null;
            }
            const msg = document.createElement('div');
            msg.className = 'wl-agent-msg wl-agent-msg-bot';
            msg.innerHTML = `
                <div class="wl-agent-msg-body" style="border-color: rgba(239, 68, 68, 0.4);">
                    <div style="color: #f87171; font-weight:600; display:flex; align-items:center; gap:6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span>Infrastructure Generation Error</span>
                    </div>
                    <p style="margin:4px 0 0 0; font-size:11.5px;">${_escapeHtml(message)}</p>
                </div>
            `;
            infraStream.appendChild(msg);
            infraStream.scrollTop = infraStream.scrollHeight;
            isGeneratingInfra = false;
            resetInfraInput();
        }

        function resetInfraInput() {
            if (infraSubmitBtn) {
                infraSubmitBtn.disabled = false;
                infraSubmitBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
            }
            if (infraInput) {
                infraInput.disabled = false;
                infraInput.placeholder = "Instruct Infrastructure Agent (e.g. Include Redis cache and production Nginx)...";
            }
        }

        // Infra Chip Listeners
        if (infraChipFull) {
            infraChipFull.addEventListener('click', () => {
                runInfraAgent('Generate full stack devops suite with docker, docker-compose, nginx, and kubernetes');
            });
        }
        if (infraChipCompose) {
            infraChipCompose.addEventListener('click', () => {
                runInfraAgent('Generate docker-compose.yml and nginx reverse proxy only');
            });
        }
        if (infraChipK8s) {
            infraChipK8s.addEventListener('click', () => {
                runInfraAgent('Generate kubernetes manifests for cluster deployment');
            });
        }

        if (infraSubmitBtn) {
            infraSubmitBtn.addEventListener('click', () => {
                const text = (infraInput?.value || '').trim();
                if (infraInput) { infraInput.value = ''; infraInput.style.height = 'auto'; }
                runInfraAgent(text || 'Generate full stack devops suite');
            });
        }
        if (infraInput) {
            infraInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    infraSubmitBtn && infraSubmitBtn.click();
                }
            });
        }


        // ═════════════════════════════════════════════════════════════
        // 4. TERMINAL COMMAND ORCHESTRATOR AGENT (HUMAN IN THE LOOP)
        // ═════════════════════════════════════════════════════════════
        function planTerminalCommand(promptText) {
            if (isPlanningTerm) return;
            isPlanningTerm = true;

            showTermChatplace();

            if (termSubmitBtn) {
                termSubmitBtn.disabled = true;
                termSubmitBtn.innerHTML = '<div class="wl-step-spinner" style="width:14px;height:14px;border-width:2px;margin:auto;"></div>';
            }
            if (termInput) {
                termInput.disabled = true;
                termInput.placeholder = "Synthesizing terminal command sequence... please wait...";
            }

            if (promptText) {
                appendUserMessage(termStream, promptText);
            }

            createTerminalStepCard();

            vscode.postMessage({
                type: 'plan_terminal_command',
                prompt: promptText || '',
            });
        }

        function createTerminalStepCard() {
            if (currentTermStepCard) {
                currentTermStepCard.remove();
            }
            const card = document.createElement('div');
            card.className = 'wl-agent-msg wl-agent-msg-bot wl-step-card-active';
            card.innerHTML = `
                <div class="wl-agent-msg-body">
                    <div class="wl-step-card-header">
                        <div class="wl-step-spinner"></div>
                        <div class="wl-step-header-text">
                            <div class="wl-step-counter" id="wl-term-step-counter">Step 1 of 3</div>
                            <div class="wl-step-title" id="wl-term-step-title">Inspecting OS & Environment</div>
                        </div>
                    </div>
                    <div class="wl-step-desc" id="wl-term-step-desc">Checking operating system, shell, and package managers...</div>
                    <div class="wl-step-bar-wrap">
                        <div class="wl-step-bar-fill" id="wl-term-step-bar" style="width: 33%;"></div>
                    </div>
                </div>
            `;
            termStream.appendChild(card);
            termStream.scrollTop = termStream.scrollHeight;
            currentTermStepCard = card;
        }

        function updateTerminalStepCard(step, totalSteps, title, desc) {
            const counter = document.getElementById('wl-term-step-counter');
            const titleEl = document.getElementById('wl-term-step-title');
            const descEl = document.getElementById('wl-term-step-desc');
            const bar = document.getElementById('wl-term-step-bar');

            if (counter) counter.textContent = `Step ${step} of ${totalSteps}`;
            if (titleEl) titleEl.textContent = title;
            if (descEl) descEl.textContent = desc;
            if (bar) bar.style.width = `${Math.min(100, Math.round((step / totalSteps) * 100))}%`;

            if (termStream) termStream.scrollTop = termStream.scrollHeight;
        }

        function renderTerminalProposedCard(data) {
            if (currentTermStepCard) {
                currentTermStepCard.remove();
                currentTermStepCard = null;
            }

            const riskClass = data.riskLevel === 'high'
                ? 'wl-term-risk-high'
                : (data.riskLevel === 'medium' ? 'wl-term-risk-medium' : 'wl-term-risk-low');

            const msg = document.createElement('div');
            msg.className = 'wl-agent-msg wl-agent-msg-bot';
            msg.setAttribute('id', `card-${data.commandId}`);

            msg.innerHTML = `
                <div class="wl-agent-msg-body">
                    <div class="wl-term-card">
                        <div class="wl-term-card-header">
                            <span class="wl-term-os-pill">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                                <span>${_escapeHtml(data.osInfo)}</span>
                                <span style="opacity:0.6;">·</span>
                                <span style="color:var(--vscode-foreground);">${_escapeHtml(data.workingDir)}</span>
                            </span>
                            <span class="wl-term-risk-pill ${riskClass}">
                                ${data.riskLevel} risk
                            </span>
                        </div>

                        <div class="wl-term-code-box">
                            <span class="wl-term-prompt-char">$</span>
                            <span style="flex:1;">${_escapeHtml(data.command)}</span>
                        </div>

                        <div class="wl-term-explanation">
                            ${_escapeHtml(data.explanation)}
                        </div>

                        <!-- STRICT HUMAN-IN-THE-LOOP ACTION BUTTONS -->
                        <div class="wl-term-actions" id="actions-${data.commandId}">
                            <button class="wl-term-btn-accept" data-id="${data.commandId}" type="button">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                <span>Accept & Run in Terminal</span>
                            </button>
                            <button class="wl-term-btn-reject" data-id="${data.commandId}" type="button">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                <span>Reject</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;

            termStream.appendChild(msg);

            // Wire Accept & Reject buttons
            const acceptBtn = msg.querySelector('.wl-term-btn-accept');
            const rejectBtn = msg.querySelector('.wl-term-btn-reject');
            const actionsContainer = msg.querySelector(`#actions-${data.commandId}`);

            if (acceptBtn) {
                acceptBtn.addEventListener('click', () => {
                    acceptBtn.disabled = true;
                    rejectBtn.disabled = true;
                    actionsContainer.innerHTML = `
                        <div class="wl-term-status-badge wl-term-status-accepted">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                            <span>Accepted by Developer — Dispatched to WorkLens Terminal</span>
                        </div>
                    `;
                    vscode.postMessage({
                        type: 'execute_terminal_command',
                        commandId: data.commandId
                    });
                });
            }

            if (rejectBtn) {
                rejectBtn.addEventListener('click', () => {
                    acceptBtn.disabled = true;
                    rejectBtn.disabled = true;
                    actionsContainer.innerHTML = `
                        <div class="wl-term-status-badge wl-term-status-rejected">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            <span>Rejected by Developer — Execution Aborted</span>
                        </div>
                    `;
                    vscode.postMessage({
                        type: 'reject_terminal_command',
                        commandId: data.commandId
                    });
                });
            }

            termStream.scrollTop = termStream.scrollHeight;
            isPlanningTerm = false;
            resetTermInput();
        }

        function renderTerminalError(message) {
            if (currentTermStepCard) {
                currentTermStepCard.remove();
                currentTermStepCard = null;
            }
            const msg = document.createElement('div');
            msg.className = 'wl-agent-msg wl-agent-msg-bot';
            msg.innerHTML = `
                <div class="wl-agent-msg-body" style="border-color: rgba(239, 68, 68, 0.4);">
                    <div style="color: #f87171; font-weight:600; display:flex; align-items:center; gap:6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span>Terminal Synthesis Error</span>
                    </div>
                    <p style="margin:4px 0 0 0; font-size:11.5px;">${_escapeHtml(message)}</p>
                </div>
            `;
            termStream.appendChild(msg);
            termStream.scrollTop = termStream.scrollHeight;
            isPlanningTerm = false;
            resetTermInput();
        }

        function resetTermInput() {
            if (termSubmitBtn) {
                termSubmitBtn.disabled = false;
                termSubmitBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
            }
            if (termInput) {
                termInput.disabled = false;
                termInput.placeholder = "Instruct Terminal Orchestrator (e.g. create a react app and install the node modules)...";
            }
        }

        // Terminal Chip Listeners
        if (termChipReact) {
            termChipReact.addEventListener('click', () => {
                planTerminalCommand('create a react app and install the node modules');
            });
        }
        if (termChipMigrate) {
            termChipMigrate.addEventListener('click', () => {
                planTerminalCommand('run database migrations');
            });
        }
        if (termChipDev) {
            termChipDev.addEventListener('click', () => {
                planTerminalCommand('start development server and background services');
            });
        }

        if (termSubmitBtn) {
            termSubmitBtn.addEventListener('click', () => {
                const text = (termInput?.value || '').trim();
                if (termInput) { termInput.value = ''; termInput.style.height = 'auto'; }
                planTerminalCommand(text || 'create a react app and install the node modules');
            });
        }
        if (termInput) {
            termInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    termSubmitBtn && termSubmitBtn.click();
                }
            });
        }

        // ═════════════════════════════════════════════════════════════
        // MESSAGE ROUTER (Listening for Extension Events)
        // ═════════════════════════════════════════════════════════════
        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (!msg) return;

            // Document Generator Events
            if (msg.type === 'doc_agent_step') {
                updateDocStepCard(msg.step, msg.totalSteps, msg.title, msg.message);
            } else if (msg.type === 'doc_agent_complete') {
                renderDocCompletionCard(msg);
            } else if (msg.type === 'doc_agent_error') {
                renderDocError(msg.message);
            }

            // Test Suite Generator Events
            else if (msg.type === 'test_agent_step') {
                updateTestStepCard(msg.step, msg.totalSteps, msg.title, msg.message);
            } else if (msg.type === 'test_agent_complete') {
                renderTestCompletionCard(msg);
            } else if (msg.type === 'test_agent_error') {
                renderTestError(msg.message);
            }

            // Infrastructure & DevOps Generator Events
            else if (msg.type === 'infra_agent_step') {
                updateInfraStepCard(msg.step, msg.totalSteps, msg.title, msg.message);
            } else if (msg.type === 'infra_agent_complete') {
                renderInfraCompletionCard(msg);
            } else if (msg.type === 'infra_agent_error') {
                renderInfraError(msg.message);
            }

            // Terminal Command Orchestrator Events
            else if (msg.type === 'terminal_agent_step') {
                updateTerminalStepCard(msg.step, msg.totalSteps, msg.title, msg.message);
            } else if (msg.type === 'terminal_command_proposed') {
                renderTerminalProposedCard(msg);
            } else if (msg.type === 'terminal_agent_error') {
                renderTerminalError(msg.message);
            }

            // Terminal Error Selection Injected
            else if (msg.type === 'terminal_message_injected') {
                appendTerminalMessage(msg);
            }
        });

    })(); // end initAgentChatplace

})();


