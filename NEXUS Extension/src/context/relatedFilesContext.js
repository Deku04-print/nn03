// Related Files Context — Context Level 4 (Enhanced Mode)
// Scans imports/requires in the active document and reads related files.
// Supports recursive (1-level-deep) transitive dependency resolution.
// Includes circular dependency loop protection via a visited Set.
const vscode = require('vscode');
const path = require('path');

const MAX_FILES = 5;            // max related files to include
const MAX_LINES_PER_FILE = 300; // max lines read per related file
const MAX_TRANSITIVE = 2;       // max transitive (2nd-degree) files to add
const FILE_TIMEOUT_MS = 2000;   // per-file read timeout (ms)

/**
 * Extract imported file paths from source code using simple regex patterns.
 * Supports: Python (import/from), JS/TS (require/import).
 * @param {string} text  - full source of active document
 * @param {string} language - VS Code languageId
 * @returns {string[]} raw import specifiers (relative paths only)
 */
function extractImportPaths(text, language) {
    const paths = [];
    const lang = language.toLowerCase();

    if (lang === 'python') {
        const relFrom = /^\s*from\s+(\.[\w./]*)\s+import/gm;
        let m;
        while ((m = relFrom.exec(text)) !== null) {
            paths.push(m[1]);
        }
    } else {
        const req = /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
        let m;
        while ((m = req.exec(text)) !== null) {
            paths.push(m[1]);
        }
        const imp = /import\s+[^'"]*from\s+['"](\.[^'"]+)['"]/g;
        while ((m = imp.exec(text)) !== null) {
            paths.push(m[1]);
        }
    }
    return [...new Set(paths)];
}

/**
 * Resolve an import specifier to an absolute filesystem path.
 * Tries several extensions if needed. Races against FILE_TIMEOUT_MS.
 * @param {string} specifier
 * @param {string} activeFilePath
 * @param {string} language
 * @returns {Promise<string|null>}
 */
async function resolveSpecifier(specifier, activeFilePath, language) {
    const dir = path.dirname(activeFilePath);
    const lang = language.toLowerCase();

    let normalized = specifier;
    if (lang === 'python' && normalized.startsWith('.')) {
        const dots = normalized.match(/^(\.+)/)[1].length;
        const rest = normalized.slice(dots).replace(/\./g, '/');
        const up = '../'.repeat(dots - 1);
        normalized = up + rest;
        if (!normalized.startsWith('.') && !normalized.startsWith('/')) {
            normalized = './' + normalized;
        }
    }

    const base = path.resolve(dir, normalized);

    const extensions = lang === 'python'
        ? ['.py', '/__init__.py']
        : ['.js', '.ts', '.jsx', '.tsx', '/index.js', '/index.ts'];

    for (const ext of extensions) {
        const candidate = base + ext;
        try {
            const uri = vscode.Uri.file(candidate);
            await vscode.workspace.fs.stat(uri);
            return candidate;
        } catch {
            // not found — try next
        }
    }
    return null;
}

/**
 * Read up to MAX_LINES_PER_FILE lines from a file, with a timeout guard.
 * @param {string} absPath
 * @returns {Promise<string>}
 */
async function readFileCapped(absPath) {
    const uri = vscode.Uri.file(absPath);

    const timeoutP = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), FILE_TIMEOUT_MS)
    );
    const readP = vscode.workspace.fs.readFile(uri).then(bytes => {
        const text = Buffer.from(bytes).toString('utf8');
        const lines = text.split('\n');
        const capped = lines.slice(0, MAX_LINES_PER_FILE);
        const truncated = lines.length > MAX_LINES_PER_FILE;
        return capped.join('\n') + (truncated ? `\n// [truncated — ${lines.length} total lines]` : '');
    });

    return Promise.race([readP, timeoutP]);
}

/**
 * Collect Level 4 context: files imported by the active document.
 * In Enhanced mode (force=true), always collects dependency files with:
 *  - Circular dependency loop protection (visited Set)
 *  - 1-level transitive dependency resolution
 *  - A `why` field explaining why each file was included
 *  - Parallel I/O for all direct imports (faster)
 *  - Per-file timeout to avoid hanging on large/slow files
 *
 * @param {vscode.TextEditor} editor
 * @param {boolean} [force=false] - set true (Enhanced mode) to always collect
 * @param {(msg: string) => void} [onProgress] - optional progress callback
 * @returns {Promise<Array<{path:string, language:string, content:string, why:string}>>}
 */
async function collectRelatedFilesContext(editor, force = false, onProgress) {
    if (!editor) return [];

    const document = editor.document;
    const text = document.getText();
    const language = document.languageId;
    const activeFilePath = document.fileName;

    // Simple mode: only escalate when diagnostics are present AND selection is small
    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const selectionText = document.getText(editor.selection).trim();
    if (!force && diagnostics.length === 0 && selectionText.length > 200) {
        return [];
    }

    const visited = new Set([path.normalize(activeFilePath)]);
    const results = [];

    const directSpecifiers = extractImportPaths(text, language);
    if (directSpecifiers.length === 0) return [];

    // ── Resolve all direct imports in parallel ──────────────────────
    if (onProgress) onProgress('Resolving imports…');

    const resolvedDirect = await Promise.all(
        directSpecifiers.map(spec => resolveSpecifier(spec, activeFilePath, language))
    );

    // Filter valid, non-circular, up to MAX_FILES
    const validDirect = resolvedDirect
        .filter(p => p !== null)
        .filter(p => {
            const n = path.normalize(p);
            if (visited.has(n)) return false;
            visited.add(n);
            return true;
        })
        .slice(0, MAX_FILES);

    if (validDirect.length === 0) return [];

    // ── Read all direct imports in parallel ─────────────────────────
    if (onProgress) onProgress(`Reading ${validDirect.length} file(s)…`);

    const directContents = await Promise.allSettled(
        validDirect.map(absPath => readFileCapped(absPath))
    );

    // Collect successful reads
    const directItems = [];
    for (let i = 0; i < validDirect.length; i++) {
        const res = directContents[i];
        if (results.length >= MAX_FILES) break;
        if (res.status === 'fulfilled') {
            const absPath = validDirect[i];
            const relPath = vscode.workspace.asRelativePath(absPath);
            const item = { path: relPath, language, content: res.value, why: 'directly imported', _absPath: absPath };
            results.push(item);
            directItems.push(item);
        }
    }

    // ── Transitive imports (1 level deep) — parallel per parent ────
    if (force && results.length < MAX_FILES) {
        if (onProgress) onProgress('Scanning transitive dependencies…');

        for (const parentItem of directItems) {
            if (results.length >= MAX_FILES) break;

            const transitiveSpecifiers = extractImportPaths(parentItem.content, language);
            if (transitiveSpecifiers.length === 0) continue;

            // Resolve all transitive specifiers in parallel
            const resolvedTransitive = await Promise.all(
                transitiveSpecifiers.map(s => resolveSpecifier(s, parentItem._absPath, language))
            );

            const validTransitive = resolvedTransitive
                .filter(p => p !== null)
                .filter(p => {
                    const n = path.normalize(p);
                    if (visited.has(n)) return false;
                    visited.add(n);
                    return true;
                })
                .slice(0, MAX_TRANSITIVE);

            // Read them in parallel
            const tContents = await Promise.allSettled(
                validTransitive.map(p => readFileCapped(p))
            );

            for (let i = 0; i < validTransitive.length; i++) {
                if (results.length >= MAX_FILES) break;
                const res = tContents[i];
                if (res.status === 'fulfilled') {
                    const absPath = validTransitive[i];
                    const relPath = vscode.workspace.asRelativePath(absPath);
                    results.push({
                        path: relPath,
                        language,
                        content: res.value,
                        why: `transitive dependency of ${path.basename(parentItem._absPath)}`,
                    });
                }
            }
        }
    }

    // Strip internal _absPath helper before returning
    results.forEach(r => delete r._absPath);

    return results;
}

/**
 * Enhanced mode helper — same as collectRelatedFilesContext(force=true),
 * but returns results grouped as pairs: [[file1, file2], [file3, file4], …]
 * Each pair is sent as a separate context block so the LLM can process
 * linked files 2-at-a-time without blowing the context window.
 *
 * @param {vscode.TextEditor} editor
 * @param {(msg: string) => void} [onProgress]
 * @returns {Promise<Array<Array<{path:string,language:string,content:string,why:string}>>>}
 */
async function collectRelatedFilesBatched(editor, onProgress) {
    const all = await collectRelatedFilesContext(editor, true, onProgress);
    const batches = [];
    for (let i = 0; i < all.length; i += 2) {
        batches.push(all.slice(i, i + 2));
    }
    return batches;
}

module.exports = { collectRelatedFilesContext, collectRelatedFilesBatched };