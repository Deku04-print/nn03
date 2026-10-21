// Terminal Error Analyzer — Extracts stack traces, referenced files, and error lines from terminal output
let vscode;
try { vscode = require('vscode'); } catch (_) {}
const path = require('path');
const fs = require('fs');

/**
 * Parses selected terminal text, extracts stack traces and file paths,
 * and retrieves the workspace code context around the failing lines.
 */
class TerminalErrorAnalyzer {

    /**
     * Analyze selected terminal output
     * @param {string} text Selected terminal output/error log
     * @param {vscode.Terminal} [terminal] Active terminal instance
     * @returns {Promise<object>} Enriched terminal context
     */
    static async analyze(text, terminal) {
        if (!text || !text.trim()) {
            return {
                hasContent: false,
                terminalName: terminal?.name || 'Terminal',
                rawText: '',
                referencedFiles: [],
                primaryFile: null,
                errorType: 'Unknown'
            };
        }

        const terminalName = terminal?.name || 'Terminal';
        const workspaceFolders = (vscode && vscode.workspace && vscode.workspace.workspaceFolders) || [];
        const workspaceRoot = workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : process.cwd();

        // 1. Detect common error patterns
        const errorType = this._detectErrorType(text);

        // 2. Extract referenced files and line numbers from stack traces
        const fileHits = this._extractFileHits(text);

        // 3. Resolve files against workspace and read surrounding code
        const referencedFiles = [];
        let primaryFile = null;

        for (const hit of fileHits) {
            const resolved = await this._resolveWorkspaceFile(hit.filePath, workspaceRoot);
            if (resolved) {
                const codeSnippet = this._extractCodeAroundLine(resolved.absPath, hit.lineNumber, 12);
                const fileContext = {
                    absPath: resolved.absPath,
                    relPath: resolved.relPath,
                    fileName: path.basename(resolved.absPath),
                    lineNumber: hit.lineNumber,
                    columnNumber: hit.columnNumber,
                    language: resolved.language,
                    codeSnippet: codeSnippet,
                    stackFrame: hit.rawFrame
                };

                referencedFiles.push(fileContext);

                // The first workspace file in the traceback is usually the primary user code that failed
                if (!primaryFile && !resolved.absPath.includes('site-packages') && !resolved.absPath.includes('node_modules')) {
                    primaryFile = fileContext;
                }
            }
        }

        // Fallback primary file if all were in node_modules/site-packages
        if (!primaryFile && referencedFiles.length > 0) {
            primaryFile = referencedFiles[0];
        }

        return {
            hasContent: true,
            terminalName: terminalName,
            rawText: text.trim(),
            errorType: errorType,
            referencedFiles: referencedFiles,
            primaryFile: primaryFile,
            workspaceRoot: workspaceRoot
        };
    }

    /**
     * Detect high-level error classification
     */
    static _detectErrorType(text) {
        // Python
        const pyMatch = text.match(/\b([A-Za-z]+Error|Exception|KeyboardInterrupt):\s*(.*)/);
        if (pyMatch) return pyMatch[1];

        // Node / JavaScript / TypeScript
        const jsMatch = text.match(/\b([A-Za-z]+Error):\s*(.*)/);
        if (jsMatch) return jsMatch[1];

        // Django / HTTP
        if (text.includes('Internal Server Error:')) return 'Django 500 Server Error';
        if (text.includes('Unauthorized:') || text.includes('HTTP/1.1" 401')) return 'HTTP 401 Unauthorized';
        if (text.includes('HTTP/1.1" 404')) return 'HTTP 404 Not Found';
        if (text.includes('HTTP/1.1" 500')) return 'HTTP 500 Internal Error';

        // NPM / Build
        if (text.includes('npm error')) return 'NPM Execution Error';
        if (text.includes('Missing script:')) return 'NPM Missing Script';
        if (text.includes('vite') && text.includes('error')) return 'Vite Build Error';

        // Shell
        if (text.includes('command not found')) return 'Command Not Found';
        if (text.includes('Permission denied')) return 'Permission Denied';

        return 'Terminal Error / Log';
    }

    /**
     * Extract file paths and line numbers from Python, Node, Vite, etc. stack traces
     */
    static _extractFileHits(text) {
        const hits = [];
        const seen = new Set();

        // Pattern 1: Python traceback -> File "/path/to/file.py", line 123, in foo
        const pyRe = /File\s+["']([^"']+\.py)["'],\s+line\s+(\d+)(?:,\s+in\s+([^\n]+))?/gi;
        let m;
        while ((m = pyRe.exec(text)) !== null) {
            const filePath = m[1];
            const line = parseInt(m[2], 10);
            const key = `${filePath}:${line}`;
            if (!seen.has(key)) {
                seen.add(key);
                hits.push({ filePath, lineNumber: line, columnNumber: 0, rawFrame: m[0] });
            }
        }

        // Pattern 2: Node / JS stack trace -> at foo (/path/to/file.js:12:34) or at /path/to/file.js:12:34
        const nodeRe = /(?:at\s+(?:[^\n(]+\s+)?\((?:[A-Za-z]:)?([^()\n]+):(\d+):(\d+)\)|at\s+([^:\s\n]+):(\d+):(\d+))/gi;
        while ((m = nodeRe.exec(text)) !== null) {
            const filePath = m[1] || m[4];
            const line = parseInt(m[2] || m[5], 10);
            const col = parseInt(m[3] || m[6], 10);
            const key = `${filePath}:${line}`;
            if (!seen.has(key) && !filePath.startsWith('internal/')) {
                seen.add(key);
                hits.push({ filePath, lineNumber: line, columnNumber: col, rawFrame: m[0] });
            }
        }

        // Pattern 3: Vite / Webpack / General -> path/to/file.jsx:12:34 or path/to/file.py:12
        const genRe = /(?:^|\s|\/)([a-zA-Z0-9_\-./]+\.(?:jsx?|tsx?|py|html|css|json|vue)):(\d+)(?::(\d+))?/gm;
        while ((m = genRe.exec(text)) !== null) {
            const filePath = m[1];
            const line = parseInt(m[2], 10);
            const col = m[3] ? parseInt(m[3], 10) : 0;
            const key = `${filePath}:${line}`;
            if (!seen.has(key)) {
                seen.add(key);
                hits.push({ filePath, lineNumber: line, columnNumber: col, rawFrame: m[0] });
            }
        }

        return hits;
    }

    /**
     * Resolve a path from a stack trace to a real workspace file
     */
    static async _resolveWorkspaceFile(targetPath, workspaceRoot) {
        // If absolute and exists
        if (path.isAbsolute(targetPath) && fs.existsSync(targetPath)) {
            const relPath = path.relative(workspaceRoot, targetPath);
            return {
                absPath: targetPath,
                relPath: relPath.startsWith('..') ? path.basename(targetPath) : relPath,
                language: this._detectLanguage(targetPath)
            };
        }

        // If relative to workspaceRoot
        const directAbs = path.join(workspaceRoot, targetPath);
        if (fs.existsSync(directAbs)) {
            return {
                absPath: directAbs,
                relPath: targetPath,
                language: this._detectLanguage(directAbs)
            };
        }

        // Search workspace for basename
        const base = path.basename(targetPath);
        if (vscode && vscode.workspace && typeof vscode.workspace.findFiles === 'function') {
            const matches = await vscode.workspace.findFiles(`**/${base}`, '**/node_modules/**', 2);
            if (matches && matches.length > 0) {
                const foundAbs = matches[0].fsPath;
                return {
                    absPath: foundAbs,
                    relPath: path.relative(workspaceRoot, foundAbs),
                    language: this._detectLanguage(foundAbs)
                };
            }
        }

        return null;
    }

    /**
     * Read file content and extract snippet around line number
     */
    static _extractCodeAroundLine(filePath, targetLine, radius = 10) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split(/\r?\n/);
            const start = Math.max(0, targetLine - radius - 1);
            const end = Math.min(lines.length, targetLine + radius);

            return lines.slice(start, end).map((l, i) => {
                const lineNum = start + i + 1;
                const marker = lineNum === targetLine ? ' >> ' : '    ';
                return `${marker}${lineNum.toString().padStart(4, ' ')} | ${l}`;
            }).join('\n');
        } catch {
            return '';
        }
    }

    static _detectLanguage(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const map = {
            '.py': 'python',
            '.js': 'javascript',
            '.jsx': 'javascriptreact',
            '.ts': 'typescript',
            '.tsx': 'typescriptreact',
            '.html': 'html',
            '.css': 'css',
            '.json': 'json',
            '.vue': 'vue',
            '.go': 'go',
            '.rs': 'rust',
            '.java': 'java'
        };
        return map[ext] || 'plaintext';
    }
}

module.exports = { TerminalErrorAnalyzer };
