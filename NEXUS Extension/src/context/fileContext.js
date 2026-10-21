// File Context — captures current file content, language, and surrounding code window
const vscode = require('vscode');
const path = require('path');

const SURROUNDING_LINES = 30; // lines above/below selection

/**
 * Collect file-level context.
 * @param {vscode.TextEditor} editor
 */
function collectFileContext(editor) {
    const document = editor.document;
    const selection = editor.selection;
    const lineCount = document.lineCount;

    // Surrounding code window (context level 2)
    const startSurround = Math.max(0, selection.start.line - SURROUNDING_LINES);
    const endSurround = Math.min(lineCount - 1, selection.end.line + SURROUNDING_LINES);
    const surroundRange = new vscode.Range(startSurround, 0, endSurround, document.lineAt(endSurround).text.length);
    const surroundingCode = document.getText(surroundRange);

    return {
        language: document.languageId,
        fileName: path.basename(document.fileName),
        filePath: vscode.workspace.asRelativePath(document.fileName),
        surroundingCode,
    };
}

module.exports = { collectFileContext };
