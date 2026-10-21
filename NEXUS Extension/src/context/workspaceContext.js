// Workspace Context — project name and folder info
const vscode = require('vscode');

/**
 * Collect workspace-level context.
 * @returns {{ project_name: string, workspace_path: string }}
 */
function collectWorkspaceContext() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return { project_name: 'unknown', workspace_path: '' };
    }
    const folder = folders[0];
    return {
        project_name: folder.name,
        workspace_path: folder.uri.fsPath,
    };
}

module.exports = { collectWorkspaceContext };
