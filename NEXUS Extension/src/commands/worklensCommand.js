// WorkLens Command Handler
const vscode = require('vscode');
const path = require('path');
const { collectContext } = require('../context/selectionContext');
const { collectFileContext } = require('../context/fileContext');
const { collectDiagnostics } = require('../context/diagnosticsContext');
const { collectWorkspaceContext } = require('../context/workspaceContext');
const { collectRelatedFilesContext, collectRelatedFilesBatched } = require('../context/relatedFilesContext');
const { sanitizeContext } = require('../context/sanitizer');
const { WorklensApi } = require('../api/worklensApi');

/**
 * Regex to detect user messages that are asking to debug / check for errors.
 */
const DEBUG_INTENT_RE = /\b(debug|check\s+error|check\s+for\s+error|find\s+error|syntax\s+error|look\s+for\s+error|any\s+error|errors?\s+in\s+(my\s+)?code|diagnos|lint)\b/i;

/**
 * Regex to detect TODO / task-oriented messages.
 * Matches patterns like:
 *   "TODO: implement auth"
 *   "how do I add user authentication"
 *   "implement login functionality"
 *   "create a service for payments"
 *   "add dark mode support"
 */
const TODO_INTENT_RE = /\b(TODO|FIXME|implement|create|add|build|write|set\s+up|integrate|how\s+(do\s+I|to|can\s+I)|need\s+to|want\s+to)\b/i;

class WorklensCommand {
    /**
     * @param {import('../ui/worklensPanel').WorklensPanelProvider} panelProvider
     * @param {import('vscode').ExtensionContext} context
     */
    constructor(panelProvider, context) {
        this.panelProvider = panelProvider;
        this.context = context;
        this.api = new WorklensApi(context);
    }

    /**
     * Execute a WorkLens command action.
     * @param {'ask'|'guide'|'hint'|'explain'|'verify'} action
     * @param {string} [userText]  The raw user message text (forwarded from user_reply)
     * @param {Array}  [conversationHistory]  Recent conversation history from webview
     * @param {boolean} [enhancedMode=false]  Whether Enhanced mode is active (enables dep analysis)
     * @param {string[]} [taggedFiles=[]]     Files explicitly tagged by user via @mention
     */
    async execute(action, userText, conversationHistory, enhancedMode = false, taggedFiles = []) {
        const editor = vscode.window.activeTextEditor;

        // For 'hint' (user-typed chat follow-ups), allow proceeding without an active editor.
        // For analysis actions (ask/guide/explain/verify) that need file context, block without one.
        if (!editor && action !== 'hint' && (!taggedFiles || taggedFiles.length === 0)) {
            this.panelProvider.postMessage({
                type: 'error',
                message: 'WorkLens: Please open a file in the editor first or @tag a file.',
            });
            return;
        }

        // Reveal the sidebar panel
        await vscode.commands.executeCommand('worklens.mentorPanel.focus');

        // Show loading state in panel with a helpful hint
        this.panelProvider.postMessage({
            type: 'loading',
            action,
            hint: enhancedMode ? 'Scanning dependencies…' : 'Analyzing…',
        });

        // Progress callback — sends live hints to the webview
        const onProgress = (msg) => {
            this.panelProvider.postMessage({ type: 'loading', action, hint: msg });
        };

        try {
            // ── 1. Tagged files resolution & intelligent context windowing ─────────
            const allFilesToResolve = new Set(Array.isArray(taggedFiles) ? taggedFiles : []);

            // Also auto-detect mentioned file paths or names in userText (e.g. "check app.jsx", "app.JS", "app.js x")
            if (userText) {
                // Normalize spacing typos like "app.js x" -> "app.jsx" or "app . js" -> "app.js"
                const normalizedText = userText.replace(/([a-zA-Z0-9_\-]+)\s*\.\s*(js|jsx|ts|tsx|py|html|css|json)\s*(x)?/gi, (m, name, ext, x) => {
                    if (x && ext.toLowerCase() === 'js') return `${name}.jsx`;
                    return `${name}.${ext}`;
                });

                const fileMatches = normalizedText.match(/\b([a-zA-Z0-9_\-./]+\.(?:jsx?|tsx?|py|html|css|json|vue|rs|go|java|c|cpp|rb))\b/gi);
                if (fileMatches) {
                    fileMatches.forEach(f => allFilesToResolve.add(f));
                }
            }

            let taggedFileContexts = [];
            if (allFilesToResolve.size > 0) {
                onProgress('Resolving workspace files…');
                for (const tf of allFilesToResolve) {
                    try {
                        const cleanPath = tf.replace(/^@/, '').trim();
                        const baseName = path.basename(cleanPath);
                        const nameWithoutExt = baseName.replace(/\.[^/.]+$/, '');

                        // 1. Direct workspace search
                        let matches = await vscode.workspace.findFiles(
                            `**/${baseName}`,
                            '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**}',
                            5
                        );

                        // 2. Case-insensitive & cross-extension search (.js <-> .jsx, App <-> app)
                        if (!matches || matches.length === 0) {
                            const allUris = await vscode.workspace.findFiles(
                                '**/*',
                                '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**}',
                                300
                            );
                            const lowerBase = baseName.toLowerCase();
                            const lowerNameOnly = nameWithoutExt.toLowerCase();

                            // Match case-insensitively (e.g. app.jsx -> App.jsx)
                            matches = allUris.filter(u => path.basename(u.fsPath).toLowerCase() === lowerBase);

                            // Match name without extension (e.g. user typed app.js but workspace has App.jsx)
                            if (matches.length === 0) {
                                matches = allUris.filter(u => {
                                    const b = path.basename(u.fsPath).toLowerCase();
                                    const n = b.replace(/\.[^/.]+$/, '');
                                    return n === lowerNameOnly && /\.(jsx?|tsx?)$/i.test(b);
                                });
                            }
                        }

                        if (matches && matches.length > 0) {
                            const doc = await vscode.workspace.openTextDocument(matches[0]);
                            const diags = collectDiagnostics(doc);
                            const lineCount = doc.lineCount;

                            // Context control for large files (e.g. 500 lines):
                            let codeSnippet = '';
                            if (diags.length > 0) {
                                // Extract focused window around each diagnostic error (±15 lines)
                                const errorLines = new Set();
                                diags.forEach(d => {
                                    const start = Math.max(0, d.line - 15);
                                    const end = Math.min(lineCount - 1, d.line + 15);
                                    for (let l = start; l <= end; l++) errorLines.add(l);
                                });
                                const sorted = Array.from(errorLines).sort((a, b) => a - b);
                                codeSnippet = sorted.map(l => `${l + 1}: ${doc.lineAt(l).text}`).join('\n');
                            } else if (lineCount > 150) {
                                // Extract first 150 lines with clear truncation note
                                codeSnippet = doc.getText(new vscode.Range(0, 0, 150, 0)) +
                                    `\n// ... [Context windowed: file has ${lineCount} lines total. Focused on top declarations]`;
                            } else {
                                codeSnippet = doc.getText();
                            }

                            taggedFileContexts.push({
                                fileName: path.basename(doc.fileName),
                                filePath: vscode.workspace.asRelativePath(doc.uri),
                                language: doc.languageId || 'javascript',
                                lineCount,
                                diagnostics: diags,
                                code: codeSnippet,
                                rawDoc: doc,
                            });
                        }
                    } catch (err) {
                        console.warn('[WorkLens] Error resolving file:', tf, err);
                    }
                }
            }

            // ── 2. Primary Context Resolution ──────────────
            let selectionCtx = editor
                ? collectContext(editor)
                : { text: '', start_line: 0, end_line: 0, cursor: { line: 0, column: 0 } };
            let fileCtx = editor
                ? collectFileContext(editor)
                : { language: 'unknown', fileName: '', filePath: '', surroundingCode: '' };
            let diagnosticsCtx = editor ? collectDiagnostics(editor.document) : [];

            // If user mentioned or tagged a specific file, ALWAYS promote that file as primary context!
            if (taggedFileContexts.length > 0) {
                const primaryTagged = taggedFileContexts[0];
                fileCtx = {
                    language: primaryTagged.language || 'javascript',
                    fileName: primaryTagged.fileName,
                    filePath: primaryTagged.filePath,
                    surroundingCode: primaryTagged.code,
                };
                diagnosticsCtx = primaryTagged.diagnostics;
                // If this file happens to be active in the editor, capture cursor/selection too
                if (editor && editor.document.uri.toString() === primaryTagged.rawDoc?.uri?.toString()) {
                    selectionCtx = collectContext(editor);
                } else {
                    selectionCtx = { text: '', start_line: 0, end_line: 0, cursor: { line: 0, column: 0 } };
                }
            }

            fileCtx.language = fileCtx.language || 'unknown';
            if (!selectionCtx.cursor) {
                selectionCtx.cursor = { line: 0, column: 0 };
            }

            const workspaceCtx = collectWorkspaceContext();

            // ── Level 4: Related imported files ───────────────────────
            const isTodoRequest = userText ? TODO_INTENT_RE.test(userText) : false;
            const relatedFiles = editor ? await collectRelatedFilesContext(editor, false, onProgress) : [];

            // Enhanced mode: also collect as batched pairs (2 files per batch)
            const relatedFileBatches = (enhancedMode && editor)
                ? await collectRelatedFilesBatched(editor, onProgress)
                : [];

            // Back to generic hint while waiting for the backend
            this.panelProvider.postMessage({ type: 'loading', action, hint: 'Sending to AI…' });

            // ── Build raw payload ─────────────────────────────────────
            const raw = {
                action,
                language: fileCtx.language,
                file_name: fileCtx.fileName,
                file_path: fileCtx.filePath,
                selection: selectionCtx,
                surrounding_code: fileCtx.surroundingCode,
                diagnostics: diagnosticsCtx,
                cursor: selectionCtx.cursor,
                workspace: workspaceCtx,
                // Level 4 context — flat list (simple mode / fallback)
                related_files: relatedFiles,
                // Level 4 context — paired batches (enhanced mode only)
                related_file_batches: relatedFileBatches,
                // Explicitly tagged files
                tagged_files: taggedFileContexts,
                // Mode flags for the backend
                enhanced_mode: enhancedMode,
                is_todo_request: isTodoRequest,
            };

            // ── Conversational context ────────────────────────────────
            if (userText) {
                raw.user_message = userText;
            }
            // Always attach conversation history when provided (from webview)
            if (conversationHistory && conversationHistory.length > 0) {
                raw.conversation_history = conversationHistory;
            }

            // ── Verify: snapshot & compare diagnostics ────────────────
            if (action === 'verify') {
                raw.new_diagnostics = diagnosticsCtx;
                if (this._originalDiagnostics) {
                    raw.diagnostics = this._originalDiagnostics;
                }
            } else if (action === 'ask') {
                this._originalDiagnostics = diagnosticsCtx;
            }

            // ── Sanitize (strip secrets) ──────────────────────────────
            const payload = sanitizeContext(raw);

            // ── Send to backend ───────────────────────────────────────
            const response = await this.api.send(action, payload);

            // ── Render in panel ───────────────────────────────────────
            this.panelProvider.postMessage({
                type: 'response',
                action,
                data: response,
                context: payload,
                contextLevel: relatedFileBatches.length > 0 ? 4 : relatedFiles.length > 0 ? 4 : 3,
                enhanced_mode: enhancedMode,
            });

        } catch (err) {
            console.error('[WorkLens] Command error:', err);
            this.panelProvider.postMessage({
                type: 'error',
                message: err.message || 'WorkLens could not reach its AI service. Please try again.'
            });
        }
    }

    /**
     * Execute terminal error / server log analysis with deep workspace knowledge
     * @param {object} terminalAnalysis Output from TerminalErrorAnalyzer.analyze()
     * @param {'explain'|'fix'|'ask'} [userIntent='explain']
     */
    async executeTerminalAnalysis(terminalAnalysis, userIntent = 'explain') {
        // Reveal the sidebar panel
        await vscode.commands.executeCommand('worklens.mentorPanel.focus');

        const primary = terminalAnalysis.primaryFile;
        const promptIntro = userIntent === 'fix'
            ? 'Identify the exact root cause of this terminal/server error and provide the concrete command or code fix to resolve it.'
            : 'Analyze this terminal/server error output in the context of the workspace, explain why it occurred, and outline the fix.';

        // Switch panel to chat tab and render user message with terminal badge
        this.panelProvider.postMessage({
            type: 'terminal_message_injected',
            terminalName: terminalAnalysis.terminalName,
            terminalOutput: terminalAnalysis.rawText,
            errorType: terminalAnalysis.errorType,
            primaryFile: primary ? primary.relPath : null,
            primaryLine: primary ? primary.lineNumber : null,
            query: promptIntro
        });

        // Show loading state
        this.panelProvider.postMessage({
            type: 'loading',
            action: 'ask',
            hint: `Diagnosing ${terminalAnalysis.errorType} across workspace…`
        });

        try {
            const workspaceCtx = collectWorkspaceContext();

            // Prepare tagged files context from the stack trace
            const taggedFileContexts = [];
            for (const ref of terminalAnalysis.referencedFiles || []) {
                taggedFileContexts.push({
                    path: ref.relPath,
                    content: ref.codeSnippet,
                    language: ref.language,
                    why: `Referenced in traceback line ${ref.lineNumber}`
                });
            }

            const raw = {
                action: 'ask',
                language: primary ? primary.language : 'shell',
                file_name: primary ? primary.fileName : 'terminal_log',
                file_path: primary ? primary.relPath : 'terminal_log',
                selection: {
                    text: primary ? primary.codeSnippet : terminalAnalysis.rawText.slice(0, 1500),
                    start_line: primary ? primary.lineNumber : 0,
                    end_line: primary ? primary.lineNumber : 0,
                    cursor: { line: primary ? primary.lineNumber : 0, column: 0 }
                },
                surrounding_code: primary ? primary.codeSnippet : '',
                diagnostics: [{
                    message: `${terminalAnalysis.errorType}: ${terminalAnalysis.rawText.split('\n').slice(-3).join(' ')}`,
                    severity: 'error',
                    line: primary ? primary.lineNumber : 0,
                    column: 0
                }],
                cursor: { line: 0, column: 0 },
                workspace: workspaceCtx,
                tagged_files: taggedFileContexts,
                terminal_output: terminalAnalysis.rawText,
                terminal_name: terminalAnalysis.terminalName,
                user_message: `${promptIntro}\n\nTerminal Output (${terminalAnalysis.terminalName}):\n${terminalAnalysis.rawText}`,
                enhanced_mode: true
            };

            const payload = sanitizeContext(raw);
            const response = await this.api.send('ask', payload);

            this.panelProvider.postMessage({
                type: 'response',
                action: 'ask',
                data: response,
                context: payload,
                contextLevel: taggedFileContexts.length > 0 ? 4 : 3,
                enhanced_mode: true
            });

        } catch (err) {
            console.error('[WorkLens] Terminal analysis error:', err);
            this.panelProvider.postMessage({
                type: 'error',
                message: err.message || 'WorkLens could not diagnose terminal output.'
            });
        }
    }
}

module.exports = { WorklensCommand };