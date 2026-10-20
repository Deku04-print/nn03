
"""
NEXUS Terminal Command Orchestrator Agent (Human-in-the-Loop)
Synthesizes safe, platform-appropriate terminal commands from natural language developer prompts.
Leverages Ollama LLM for intelligent contextual understanding and multi-step command chaining.
"""

import os
import re
import json
import logging
from ai.llm.client import call_llm

logger = logging.getLogger('nexus.ai.command_generator')


class CommandGeneratorAgent:
    """Agent dedicated strictly to understanding natural language developer intent
    and synthesizing exact, executable, safe shell commands with risk analysis."""

    def plan_command(self, prompt: str, env_info: dict = None) -> dict:
        env_info = env_info or {}
        os_name = env_info.get('osName', 'macOS')
        shell = env_info.get('shell', 'zsh')
        workspace_summary = env_info.get('workspaceSummary', '')

        logger.info(f"CommandGeneratorAgent planning command for prompt: '{prompt}' on {os_name} ({shell})")

        # 1. Try LLM synthesis first for flexible, high-accuracy multi-step commands
        try:
            llm_plan = self._call_llm_command_planner(prompt, os_name, shell, workspace_summary)
            if llm_plan and llm_plan.get('command'):
                return {
                    "success": True,
                    "command": llm_plan['command'].strip(),
                    "explanation": llm_plan.get('explanation', 'Synthesized platform command sequence.').strip(),
                    "risk_level": llm_plan.get('risk_level', 'medium').lower(),
                    "risk_reason": llm_plan.get('risk_reason', 'Shell command sequence.').strip(),
                    "working_dir": llm_plan.get('working_dir', '.').strip()
                }
        except Exception as e:
            logger.warning(f"LLM command synthesis failed, falling back to heuristic planner: {e}")

        # 2. Heuristic fallback planner
        return self._heuristic_command_planner(prompt, os_name, shell)

    def _call_llm_command_planner(self, prompt: str, os_name: str, shell: str, workspace_summary: str) -> dict:
        system_prompt = f"""You are the NEXUS Terminal Command Orchestrator Agent.
Your SOLE purpose is to convert natural language developer directives into precise, safe, executable shell commands.
Target Environment:
- OS: {os_name}
- Active Shell: {shell}
- Workspace Context: {workspace_summary or 'Fullstack workspace with frontend and backend'}

CRITICAL RULES:
1. PRODUCE ONLY VALID EXECUTABLE SHELL COMMANDS. Never return conversational chatter or pseudo-code.
   - For virtual environments on macOS/Linux: `python3 -m venv env && source env/bin/activate && pip install ...`
   - For virtual environments on Windows: `python -m venv env && .\\env\\Scripts\\activate && pip install ...`
   - For Django project initialization: `django-admin startproject <name> .` or `python3 manage.py startapp <name>`
   - For React/Vite scaffolding: `npx create-vite@latest <name> --template react && cd <name> && npm install`
   - Chain sequential actions using `&&` so failure stops subsequent steps safely.
2. SAFETY & RISK EVALUATION:
   - "low": Non-destructive read or installation (e.g. `npm install`, `git status`, `python3 --version`).
   - "medium": File or app scaffolding, branch modifications, build generation (e.g. `npx create-vite`, `git commit`, `python3 -m venv`).
   - "high": Destructive or mutating operations (e.g. database migrations `python3 manage.py migrate`, container teardown, git reset/force, system changes).
3. OUTPUT FORMAT:
   Return ONLY a valid JSON object. No explanations outside the JSON markdown block:
   ```json
   {{
     "command": "python3 -m venv env && source env/bin/activate && pip install --upgrade pip django && django-admin startproject myapp .",
     "explanation": "Initializes a Python virtual environment in 'env/', activates it, installs Django, and scaffolds a new Django project 'myapp'.",
     "risk_level": "medium",
     "risk_reason": "Creates local directories and downloads Python dependencies into a virtual environment.",
     "working_dir": "."
   }}
   ```"""

        user_prompt = f"""Developer Directive: "{prompt}"
Convert this directive into an executable {shell} command sequence."""

        response = call_llm(system=system_prompt, user=user_prompt, temperature=0.1, timeout=25)

        match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response, re.DOTALL)
        raw_json = match.group(1) if match else response.strip()

        return json.loads(raw_json)

    def _heuristic_command_planner(self, prompt: str, os_name: str, shell: str) -> dict:
        """Deterministic heuristic fallback when LLM is offline."""
        p_lower = prompt.lower()
        is_windows = os_name.lower() == 'windows'

        # 1. Virtual Environment & Django
        if ('django' in p_lower or 'python' in p_lower) and ('venv' in p_lower or 'virtual' in p_lower or 'env' in p_lower or 'app' in p_lower or 'project' in p_lower):
            env_name = 'env'
            app_match = re.search(r'(?:app|named|called|project)\s+([a-zA-Z0-9_\-]+)', prompt, re.IGNORECASE)
            app_name = app_match.group(1) if app_match else 'core_app'

            if is_windows:
                activate_cmd = f".\\{env_name}\\Scripts\\activate"
                cmd = f"python -m venv {env_name} && {activate_cmd} && pip install --upgrade pip django && django-admin startproject {app_name} ."
            else:
                activate_cmd = f"source {env_name}/bin/activate"
                cmd = f"python3 -m venv {env_name} && {activate_cmd} && pip install --upgrade pip django && django-admin startproject {app_name} ."

            return {
                "success": True,
                "command": cmd,
                "explanation": f"Creates a clean Python virtual environment '{env_name}', activates it in the active shell, installs Django, and scaffolds the '{app_name}' application.",
                "risk_level": "medium",
                "risk_reason": "Initializes a virtual environment directory and installs Python packages.",
                "working_dir": "."
            }

        # 2. React / Vite Scaffolding
        if 'create' in p_lower and ('react' in p_lower or 'vite' in p_lower):
            app_match = re.search(r'(?:app|named|called)\s+([a-zA-Z0-9_\-]+)', prompt, re.IGNORECASE)
            app_name = app_match.group(1) if app_match else 'my-react-app'
            return {
                "success": True,
                "command": f"npx create-vite@latest {app_name} --template react && cd {app_name} && npm install",
                "explanation": f"Scaffolds a modern React Vite application in './{app_name}' and installs dependencies.",
                "risk_level": "medium",
                "risk_reason": "Scaffolds a new project directory and installs node packages.",
                "working_dir": "."
            }

        # 3. Pip install / Requirements
        if 'pip' in p_lower or ('install' in p_lower and ('python' in p_lower or 'requirements' in p_lower)):
            is_req = 'requirements' in p_lower
            cmd = "pip install -r requirements.txt" if is_req else "pip install django djangorestframework"
            return {
                "success": True,
                "command": cmd,
                "explanation": "Installs designated Python dependencies using pip.",
                "risk_level": "low",
                "risk_reason": "Downloads and installs Python libraries.",
                "working_dir": "."
            }

        # 4. NPM / Node install
        if 'install' in p_lower and ('node' in p_lower or 'npm' in p_lower or 'package' in p_lower):
            return {
                "success": True,
                "command": "npm install",
                "explanation": "Installs all dependencies declared in package.json.",
                "risk_level": "low",
                "risk_reason": "Standard dependency installation.",
                "working_dir": "."
            }

        # 5. Database migrations
        if 'migrate' in p_lower or 'migration' in p_lower:
            cmd = "python3 manage.py makemigrations && python3 manage.py migrate"
            return {
                "success": True,
                "command": cmd,
                "explanation": "Detects changes in Django models and applies schema migrations to the database.",
                "risk_level": "high",
                "risk_reason": "Applies structural schema modifications directly to the database.",
                "working_dir": "."
            }

        # Default fallback: safe command inspection
        return {
            "success": True,
            "command": prompt.strip(),
            "explanation": "Developer requested direct command execution.",
            "risk_level": "medium",
            "risk_reason": "Direct shell execution.",
            "working_dir": "."
        }
