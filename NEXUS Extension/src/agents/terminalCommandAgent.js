// WorkLens Terminal Command Orchestrator Agent (Human-in-the-Loop)
// Analyzes OS, shell environment, and file structure to synthesize safe terminal commands.
// CRITICAL: Strictly requires user confirmation via interactive Accept/Reject buttons before execution.
'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class TerminalCommandAgent {
    /**
     * @param {import('../ui/worklensPanel').WorklensPanelProvider} panelProvider
     * @param {import('../api/worklensApi').WorklensApi} api
     */
    constructor(panelProvider, api) {
        this.panelProvider = panelProvider;
        this.api = api;
        this.pendingCommands = new Map();
    }

    /**
     * Synthesize a terminal command for the given user prompt
     * @param {string} prompt Natural language instruction (e.g. "create a react app and install the node modules")
     */
    async planCommand(prompt = '') {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspaceRoot = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : process.cwd();

        try {
            // ── Step 1: Detect OS, Shell, and Workspace Environment ────────
            this.panelProvider.postMessage({
                type: 'terminal_agent_step',
                step: 1,
                totalSteps: 3,
                title: 'Detecting OS & Terminal Environment',
                message: 'Probing system architecture, active shell, and package managers...'
            });

            const env = this._inspectEnvironment(workspaceRoot);

            // ── Step 2: Synthesize platform-appropriate command ────────────
            this.panelProvider.postMessage({
                type: 'terminal_agent_step',
                step: 2,
                totalSteps: 3,
                title: 'Synthesizing Platform Command',
                message: `Synthesizing ${env.osName} (${env.shell}) command sequence with safety analysis...`
            });

            let commandPlan = null;
            try {
                if (this.api && typeof this.api.generateCommand === 'function') {
                    const apiRes = await this.api.generateCommand({
                        prompt: prompt,
                        envInfo: {
                            osName: env.osName,
                            shell: env.shell,
                            platform: env.platform,
                            workspaceSummary: `Workspace with ${env.hasPackageJson ? 'package.json, ' : ''}${env.hasRequirements ? 'requirements.txt' : ''}`
                        }
                    });
                    if (apiRes && apiRes.command) {
                        commandPlan = {
                            command: apiRes.command,
                            explanation: apiRes.explanation || 'Synthesized platform command sequence.',
                            riskLevel: apiRes.risk_level || 'medium',
                            riskReason: apiRes.risk_reason || 'Shell execution sequence.',
                            workingDir: apiRes.working_dir ? path.resolve(workspaceRoot, apiRes.working_dir) : workspaceRoot,
                            workingDirRel: apiRes.working_dir || '.'
                        };
                    }
                }
            } catch (apiErr) {
                console.warn('[TerminalCommandAgent] Backend API unavailable, falling back to local synthesizer:', apiErr.message);
            }

            if (!commandPlan) {
                commandPlan = this._synthesizeCommand(prompt, env, workspaceRoot);
            }

            // Store command with unique ID pending human confirmation
            const commandId = 'cmd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
            this.pendingCommands.set(commandId, {
                id: commandId,
                command: commandPlan.command,
                workingDir: commandPlan.workingDir,
                status: 'pending'
            });

            // ── Step 3: Present Command to User for Human-in-the-Loop Confirmation ─
            this.panelProvider.postMessage({
                type: 'terminal_agent_step',
                step: 3,
                totalSteps: 3,
                title: 'Awaiting User Confirmation',
                message: 'Command synthesized. Execution paused awaiting human review.'
            });

            this.panelProvider.postMessage({
                type: 'terminal_command_proposed',
                commandId: commandId,
                prompt: prompt,
                command: commandPlan.command,
                explanation: commandPlan.explanation,
                riskLevel: commandPlan.riskLevel,
                riskReason: commandPlan.riskReason,
                workingDir: commandPlan.workingDirRel,
                osInfo: `${env.osName} · ${env.shell}`,
                requiresPermission: true
            });

        } catch (err) {
            console.error('[TerminalCommandAgent] Error planning command:', err);
            this.panelProvider.postMessage({
                type: 'terminal_agent_error',
                message: `Command synthesis failed: ${err.message}`
            });
        }
    }

    /**
     * Execute command in VS Code Integrated Terminal ONLY after explicit human approval
     * @param {string} commandId ID of the proposed command
     */
    async acceptAndExecute(commandId) {
        const item = this.pendingCommands.get(commandId);
        if (!item) {
            this.panelProvider.postMessage({
                type: 'terminal_agent_error',
                message: 'Command expired or not found. Please regenerate.'
            });
            return;
        }

        try {
            item.status = 'executing';
            const terminalName = 'WorkLens Terminal';

            // Find existing or create dedicated WorkLens Terminal with correct CWD
            let terminal = vscode.window.terminals.find(t => t.name === terminalName);
            if (!terminal) {
                terminal = vscode.window.createTerminal({
                    name: terminalName,
                    cwd: item.workingDir
                });
            }

            // Bring terminal into focus and dispatch command
            terminal.show(true);
            terminal.sendText(item.command);

            item.status = 'executed';
            this.pendingCommands.delete(commandId);

            this.panelProvider.postMessage({
                type: 'terminal_command_status',
                commandId: commandId,
                status: 'accepted',
                message: `Command dispatched to WorkLens Terminal in ${item.workingDir}.`
            });

            vscode.window.showInformationMessage(`WorkLens: Executing command in terminal: "${item.command}"`);
        } catch (err) {
            console.error('[TerminalCommandAgent] Execution error:', err);
            this.panelProvider.postMessage({
                type: 'terminal_agent_error',
                message: `Failed to execute in terminal: ${err.message}`
            });
        }
    }

    /**
     * Reject and cancel command proposal
     * @param {string} commandId ID of the proposed command
     */
    reject(commandId) {
        if (this.pendingCommands.has(commandId)) {
            const item = this.pendingCommands.get(commandId);
            item.status = 'rejected';
            this.pendingCommands.delete(commandId);

            this.panelProvider.postMessage({
                type: 'terminal_command_status',
                commandId: commandId,
                status: 'rejected',
                message: 'Command execution was rejected by user. No action was taken.'
            });

            vscode.window.showWarningMessage('WorkLens: Command execution cancelled by developer.');
        }
    }

    /**
     * Inspect OS, Shell, Package Managers, and Active Directories
     */
    _inspectEnvironment(workspaceRoot) {
        const platform = process.platform;
        let osName = 'Linux';
        if (platform === 'darwin') osName = 'macOS';
        else if (platform === 'win32') osName = 'Windows';

        // Detect shell
        let shell = 'bash';
        if (platform === 'win32') {
            shell = 'powershell';
        } else if (platform === 'darwin') {
            shell = process.env.SHELL ? path.basename(process.env.SHELL) : 'zsh';
        } else {
            shell = process.env.SHELL ? path.basename(process.env.SHELL) : 'bash';
        }

        // Package managers detection
        const hasPackageJson = fs.existsSync(path.join(workspaceRoot, 'package.json'));
        const hasRequirements = fs.existsSync(path.join(workspaceRoot, 'requirements.txt'));
        const hasPomXml = fs.existsSync(path.join(workspaceRoot, 'pom.xml'));

        return {
            platform,
            osName,
            shell,
            hasPackageJson,
            hasRequirements,
            hasPomXml
        };
    }

    /**
     * Synthesize safe, context-aware command line string with risk classification
     */
    _synthesizeCommand(prompt, env, workspaceRoot) {
        const pLower = prompt.toLowerCase();
        let command = '';
        let explanation = '';
        let riskLevel = 'low';
        let riskReason = 'Standard non-destructive developer workflow command.';
        let targetDir = workspaceRoot;

        // Determine target directory if frontend or backend specified
        if (pLower.includes('frontend') && fs.existsSync(path.join(workspaceRoot, 'Frontend'))) {
            targetDir = path.join(workspaceRoot, 'Frontend');
        } else if (pLower.includes('backend') && fs.existsSync(path.join(workspaceRoot, 'Backend'))) {
            targetDir = path.join(workspaceRoot, 'Backend');
        } else if (pLower.includes('practice') && fs.existsSync(path.join(workspaceRoot, 'practice'))) {
            targetDir = path.join(workspaceRoot, 'practice');
        }

        // Pattern: Create Django app / Python virtual environment
        if ((pLower.includes('django') || pLower.includes('python')) && (pLower.includes('venv') || pLower.includes('virtual') || pLower.includes('env') || pLower.includes('app') || pLower.includes('project'))) {
            const envName = 'env';
            const appMatch = prompt.match(/(?:app|named|called|project)\s+([a-zA-Z0-9_\-]+)/i);
            const appName = appMatch ? appMatch[1] : 'myapp';
            const isWin = env.platform === 'win32';
            const activateCmd = isWin ? `.\\${envName}\\Scripts\\activate` : `source ${envName}/bin/activate`;
            const pyBin = isWin ? 'python' : 'python3';
            command = `${pyBin} -m venv ${envName} && ${activateCmd} && pip install --upgrade pip django && django-admin startproject ${appName} .`;
            explanation = `Initializes a Python virtual environment in './${envName}', activates it, upgrades pip, installs Django, and scaffolds the '${appName}' project.`;
            riskLevel = 'medium';
            riskReason = 'Initializes directory structure and installs Python dependencies in a virtual environment.';
        }
        // Pattern: Create React app and install node modules
        else if (pLower.includes('create') && (pLower.includes('react') || pLower.includes('vite'))) {
            const appNameMatch = prompt.match(/(?:app|named|called)\s+([a-zA-Z0-9_\-]+)/i);
            const appName = appNameMatch ? appNameMatch[1] : 'my-react-app';
            command = `npx create-vite@latest ${appName} --template react && cd ${appName} && npm install`;
            explanation = `Scaffolds a high-performance modern React application using Vite in './${appName}' and installs all essential node_modules.`;
            riskLevel = 'medium';
            riskReason = 'Initializes a new directory structure and downloads npm packages.';
        }
        // Pattern: Install node modules or packages
        else if (pLower.includes('install') && (pLower.includes('node') || pLower.includes('npm') || pLower.includes('packages'))) {
            const pkgMatch = prompt.match(/install\s+([a-zA-Z0-9_\-@\s\/]+?)(?:\s+in|\s+for|$)/i);
            const pkgs = pkgMatch && !pkgMatch[1].includes('node') ? pkgMatch[1].trim() : '';
            if (pkgs) {
                command = `npm install ${pkgs}`;
                explanation = `Installs the requested package(s): ${pkgs} into package.json.`;
            } else {
                command = `npm install`;
                explanation = `Installs all declared dependencies from package.json into node_modules.`;
            }
            riskLevel = 'low';
            riskReason = 'Installs npm dependencies to node_modules without modifying core logic.';
        }
        // Pattern: Run migrations (Django / Prisma / Sequelize)
        else if (pLower.includes('migrate') || pLower.includes('migration')) {
            if (fs.existsSync(path.join(workspaceRoot, 'Backend', 'manage.py')) || fs.existsSync(path.join(workspaceRoot, 'manage.py'))) {
                const manageDir = fs.existsSync(path.join(workspaceRoot, 'Backend', 'manage.py')) ? 'cd "Backend" && ' : '';
                command = `${manageDir}python3 manage.py makemigrations && python3 manage.py migrate`;
                explanation = `Inspects Django models, synthesizes pending schema migrations, and applies them to the database.`;
                riskLevel = 'high';
                riskReason = 'Modifies database schema and runs data migrations.';
            } else {
                command = `npx prisma migrate dev || npm run migrate`;
                explanation = `Executes database schema migration runner.`;
                riskLevel = 'high';
                riskReason = 'Applies database schema alterations.';
            }
        }
        // Pattern: Start dev server
        else if (pLower.includes('start') || pLower.includes('run') && (pLower.includes('dev') || pLower.includes('server'))) {
            if (fs.existsSync(path.join(workspaceRoot, 'Backend', 'manage.py'))) {
                command = `cd "Backend" && python3 manage.py runserver`;
                explanation = `Launches the Django development HTTP server at http://127.0.0.1:8000/`;
            } else {
                command = `npm run dev`;
                explanation = `Starts the frontend development server (Vite/Webpack).`;
            }
            riskLevel = 'low';
            riskReason = 'Starts a local development server process in integrated terminal.';
        }
        // Pattern: Docker build / run
        else if (pLower.includes('docker')) {
            if (pLower.includes('compose')) {
                command = `docker-compose up --build -d`;
                explanation = `Builds container images and starts multi-container orchestration in detached background mode.`;
            } else {
                command = `docker build -t app:latest . && docker run -p 3000:3000 app:latest`;
                explanation = `Builds standard Docker container and launches it locally on port 3000.`;
            }
            riskLevel = 'medium';
            riskReason = 'Spawns Docker daemon containers and binds local network ports.';
        }
        // Pattern: Git commands
        else if (pLower.includes('git')) {
            if (pLower.includes('status')) {
                command = `git status`;
                explanation = `Displays working tree status and pending modifications.`;
                riskLevel = 'low';
            } else if (pLower.includes('commit')) {
                command = `git add . && git commit -m "chore: update workspace assets"`;
                explanation = `Stages all modified files and creates a standard git commit.`;
                riskLevel = 'medium';
                riskReason = 'Creates a commit on the active git branch.';
            } else {
                command = `git status`;
                explanation = `Inspects git repository status.`;
                riskLevel = 'low';
            }
        }
        // Fallback: Safe Command Shell Synthesis
        else {
            const firstWord = prompt.trim().split(/\s+/)[0].toLowerCase();
            const knownBinaries = ['npm', 'npx', 'yarn', 'pnpm', 'node', 'python', 'python3', 'pip', 'pip3', 'git', 'docker', 'docker-compose', 'kubectl', 'curl', 'wget', 'cat', 'ls', 'cd', 'echo', 'make', 'cargo', 'go', 'brew', 'apt', 'sudo'];
            if (knownBinaries.includes(firstWord)) {
                command = prompt.trim();
                explanation = `Direct command execution requested: ${firstWord}`;
                riskLevel = ['sudo', 'rm', 'dd'].includes(firstWord) ? 'high' : 'medium';
                riskReason = 'Direct shell execution.';
            } else {
                command = `echo "Executing action for: ${prompt.trim().replace(/"/g, '\\"')}"`;
                explanation = `Interpreted instruction for workspace terminal execution.`;
                riskLevel = 'low';
                riskReason = 'Non-destructive notification.';
            }
        }

        const workingDirRel = path.relative(workspaceRoot, targetDir) || '.';

        return {
            command: command,
            explanation: explanation,
            riskLevel: riskLevel,
            riskReason: riskReason,
            workingDir: targetDir,
            workingDirRel: workingDirRel
        };
    }
}

module.exports = { TerminalCommandAgent };
