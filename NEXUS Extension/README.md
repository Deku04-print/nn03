# WorkLens — AI-Powered Developer Mentor & Autonomous Workspace Agents

[![Version](https://img.shields.io/badge/version-0.1.1-blue.svg)](#)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85.0%2B-007ACC.svg)](#)
[![Multi-Agent](https://img.shields.io/badge/Multi--Agent-Orchestrator-7C3AED.svg)](#)
[![Documentation](https://img.shields.io/badge/Artifacts-.md%20|%20.mmd%20|%20.pdf-059669.svg)](#)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#)

> **Autonomous workspace intelligence, progressive Socratic debugging, and comprehensive documentation generation built directly into your VS Code sidebar.**

---

## 🌟 Overview

**WorkLens** redefines AI-assisted software development. Rather than blindly injecting unverified code snippets into your codebase, WorkLens operates on two powerful paradigms:

1. **Cognitive Developer Mentorship**: Guides engineers through complex bugs using Socratic questioning, calibrated progressive hints, and language server diagnostics verification.
2. **Autonomous Agent Workspace**: Houses specialized AI agents capable of deep repository inspection, architectural modeling, and multi-format document generation.

---

## 🚀 Autonomous Agent Directory

Access the **Agents** tab directly inside the WorkLens sidebar to interact with dedicated specialist agents:

### 1. Document Generator Agent *(Active & Available)*
Deep-scans your active workspace (abstract syntax trees, directory structures, and dependencies) to autonomously compile **three enterprise deliverables** directly into `<workspace>/docs/`:

| Deliverable | Format | Purpose & Contents |
| :--- | :---: | :--- |
| **Technical Documentation** | `.md` | Architectural executive summary, technology stack matrices, module breakdowns, configuration specs, and setup instructions. |
| **System Architecture Diagram** | `.mmd` | Multi-tier interactive Mermaid flowchart mapping client layers, API gateways, orchestrators, and persistence stores. |
| **Executive Summary Report** | `.pdf` | Publication-ready executive report compiled with ReportLab, featuring structured tables, headers, and metadata. |

### 2. Test Suite Generator Agent *(Active & Available)*
Autonomously parses exported functions, components, routes, and modules to synthesize production-ready unit test suites. Automatically creates the **`tests/` folder directly inside the respective targeted directory or module**:

| Target & Framework | Test Runner | Generated Deliverable |
| :--- | :---: | :--- |
| **Python & Django REST** | `pytest` | `test_<module>.py` with fixtures, APIClient mocks, and edge-case assertions. |
| **React, Vite & TypeScript** | `vitest` / `jest` | `<Component>.test.jsx` with `@testing-library/react` mocks and fireEvent handlers. |
| **Java Enterprise** | `JUnit 5` | `<Class>Test.java` with `@Test`, `@DisplayName`, and Mockito mock fixtures. |
| **Angular & JavaScript** | `karma` / `jasmine` | `<module>.spec.js` with describe/it suites and spyOn mocks. |

### 3. Security & Code Review Agent *(Upcoming)*
Inspects repository boundaries for hardcoded credentials, dependency CVEs, and insecure code anti-patterns aligned with OWASP standards.


---

## 🧠 Core Mentorship Features

### 🔍 Socratic Problem Analysis (`worklens.ask`)
Captures compiler diagnostics, AST context, and active selections to diagnose the root cause of an issue without giving away the direct solution.

### 🧭 Guided Debugging Sequence (`worklens.guide`)
Provides a structured, step-by-step plain-English debugging sequence that enables the developer to understand runtime logic and state lifecycles.

### 💡 Progressive Hint Engine (`worklens.hint`)
Delivers incremental, 4-tier hints that escalate in specificity only when the developer requests more depth:
- **Level 1**: Conceptual nudge & domain explanation.
- **Level 2**: Targeted line & variable scope inspection.
- **Level 3**: Structural correction pattern.
- **Level 4**: Verified syntactical reference.

### ✅ Automated Fix Verification (`worklens.verify`)
Compares VS Code language server diagnostics before and after your edits to certify whether the issue has been definitively resolved.

---

## ⌨️ Command Palette & Keyboard Shortcuts

| Command | Title | Default Shortcut | Description |
| :--- | :--- | :---: | :--- |
| `worklens.openPanel` | **Open WorkLens Panel** | `F9` | Toggles the WorkLens mentor sidebar. |
| `worklens.ask` | **Ask WorkLens** | Context Menu | Analyzes active selection or file diagnostics. |
| `worklens.guide` | **Guide Me to Debug** | Context Menu | Initiates guided Socratic debugging. |
| `worklens.hint` | **Give Me a Hint** | Chat Input / `Enter` | Requests the next calibrated progressive hint. |
| `worklens.explain` | **Explain This Problem** | Context Menu | Provides deep conceptual breakdown of the bug. |
| `worklens.verify` | **Verify My Fix** | Context Menu | Evaluates editor diagnostics to confirm resolution. |
| `worklens.generateDocs` | **Generate Workspace Documentation** | Command Palette | Autonomously creates `.md`, `.mmd`, and `.pdf` in `docs/`. |
| `worklens.generateTests` | **Generate Test Suite** | Command Palette | Synthesizes unit test files into respective `tests/` folders. |
| `worklens.runTestCommand` | **Run Test Suite** | Context Menu | Executes test runner in VS Code integrated terminal. |


---

## ⚙️ Configuration & Settings

Configure WorkLens behavior through **Settings** (`Cmd+,` / `Ctrl+,`) or via `.vscode/settings.json`:

```json
{
  "worklens.backendUrl": "http://127.0.0.1:8000/",
  "worklens.enhancedMode": false
}
```

- **`worklens.backendUrl`**: Base URL of the WorkLens AI Orchestrator service (defaults to local instance `http://127.0.0.1:8000/`).
- **`worklens.enhancedMode`**: Enables multi-file cross-module dependency tracing for deep architectural context.

---

## 🔒 Enterprise Security & Data Isolation

- **Context-Bound Scope**: WorkLens only analyzes workspace files within your project root. Third-party vendor folders (`node_modules`, `.venv`, `.git`) are strictly filtered.
- **Encrypted Token Storage**: Authentication tokens are stored securely in the native OS keychain using the **VS Code SecretStorage API**.
- **No Unsolicited Code Execution**: Document Generator and Mentor agents operate strictly within verified analysis boundaries.

---

## 📋 Requirements & Prerequisites

- **VS Code**: Version `1.85.0` or higher.
- **Backend Service**: WorkLens AI Backend running locally or on an enterprise network (Django + Ollama/LLM + ReportLab).
- **Mermaid Preview** *(Optional)*: Recommended for live rendering of `.mmd` diagrams inside VS Code (e.g. *Markdown Preview Mermaid Support*).

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE.txt` for more details.
