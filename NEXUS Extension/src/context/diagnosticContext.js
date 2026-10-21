// Diagnostics Context — reads VS Code errors/warnings for the current file
const vscode = require('vscode');

/**
 * Collect diagnostics (errors, warnings) for the current document.
 * @param {vscode.TextDocument} document
 * @returns {Array<{message: string, severity: string, line: number, column: number, source: string}>}
 */
function collectDiagnostics(document) {
    const allDiagnostics = vscode.languages.getDiagnostics(document.uri);

    const severityMap = {
        [vscode.DiagnosticSeverity.Error]: 'error',
        [vscode.DiagnosticSeverity.Warning]: 'warning',
        [vscode.DiagnosticSeverity.Information]: 'information',
        [vscode.DiagnosticSeverity.Hint]: 'hint',
    };

    return allDiagnostics.map(d => ({
        message: d.message,
        severity: severityMap[d.severity] || 'unknown',
        line: d.range.start.line + 1,
        column: d.range.start.character,
        source: d.source || '',
        code: d.code ? String(d.code) : '',
    }));
}

module.exports = { collectDiagnostics };
