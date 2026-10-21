// Selection Context — captures selected code or falls back to current line/function
const vscode = require('vscode');

/**
 * Collect code selection context from the active editor.
 * @param {vscode.TextEditor} editor
 */
function collectContext(editor) {
    const selection = editor.selection;
    const document = editor.document;

    let selectedText = document.getText(selection);
    let startLine = selection.start.line;
    let endLine = selection.end.line;

    // Fallback: if nothing selected, use the current line
    if (!selectedText.trim()) {
        const currentLine = document.lineAt(selection.active.line);
        selectedText = currentLine.text;
        startLine = currentLine.lineNumber;
        endLine = currentLine.lineNumber;
    }

    return {
        text: selectedText,
        start_line: startLine + 1, // 1-indexed
        end_line: endLine + 1,
        cursor: {
            line: selection.active.line + 1,
            column: selection.active.character,
        },
    };
}

module.exports = { collectContext };
