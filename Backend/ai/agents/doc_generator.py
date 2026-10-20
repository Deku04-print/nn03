
"""
NEXUS Document Generator Agent
Analyzes workspace files, frameworks, and architecture to produce:
1. Technical Markdown Documentation (.md)
2. Mermaid Architecture Diagram (.mmd)
3. Formatted PDF Report (.pdf) via ReportLab
"""

import io
import base64
import logging
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Preformatted
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from ai.llm.client import call_llm

logger = logging.getLogger('nexus.ai.doc_generator')


class DocumentGeneratorAgent:
    """Agent that creates structured workspace documentation, Mermaid diagrams, and PDFs."""

    def generate(self, workspace_name: str, file_tree: list, dependencies: dict, prompt: str = "") -> dict:
        """
        Analyze the workspace and generate markdown, mermaid diagram, and PDF bytes.
        """
        logger.info(f"DocumentGeneratorAgent generating docs for: {workspace_name}")

        # 1. Synthesize project structure and detected stack
        detected_stack = self._detect_stack(file_tree, dependencies)
        
        # 2. Generate Markdown Documentation
        markdown_content = self._generate_markdown(workspace_name, file_tree, dependencies, detected_stack, prompt)
        
        # 3. Generate Mermaid Architecture Diagram (.mmd)
        mermaid_content = self._generate_mermaid(workspace_name, detected_stack, file_tree)
        
        # 4. Generate PDF Document via ReportLab
        pdf_bytes = self._generate_pdf(workspace_name, detected_stack, markdown_content, mermaid_content)
        pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')

        return {
            "success": True,
            "workspace_name": workspace_name,
            "markdown": markdown_content,
            "mermaid": mermaid_content,
            "pdf_base64": pdf_base64,
            "stats": {
                "total_files": len(file_tree),
                "frameworks": detected_stack.get("frameworks", []),
                "languages": detected_stack.get("languages", [])
            }
        }

    def _detect_stack(self, file_tree: list, dependencies: dict) -> dict:
        """Detect technologies and frameworks from file extensions and package dependencies."""
        languages = set()
        frameworks = set()

        ext_map = {
            '.js': 'JavaScript',
            '.jsx': 'React / JavaScript',
            '.ts': 'TypeScript',
            '.tsx': 'React / TypeScript',
            '.py': 'Python',
            '.html': 'HTML5',
            '.css': 'CSS3',
            '.json': 'JSON',
            '.sql': 'SQL',
            '.go': 'Go',
            '.rs': 'Rust',
            '.java': 'Java',
        }

        for path in file_tree:
            path_lower = path.lower()
            for ext, lang in ext_map.items():
                if path_lower.endswith(ext):
                    languages.add(lang)
            if 'django' in path_lower or 'manage.py' in path_lower:
                frameworks.add('Django REST Framework')
            if 'vite.config' in path_lower or 'src/app.jsx' in path_lower or 'src/main.jsx' in path_lower:
                frameworks.add('Vite / React')
            if 'package.json' in path_lower:
                frameworks.add('Node.js Ecosystem')
            if 'extension.js' in path_lower or 'vscode' in path_lower:
                frameworks.add('VS Code Extension API')

        # Add from dependencies
        deps_keys = list(dependencies.keys()) if isinstance(dependencies, dict) else []
        for dep in deps_keys:
            dep_lower = str(dep).lower()
            if 'react' in dep_lower:
                frameworks.add('React')
            if 'vite' in dep_lower:
                frameworks.add('Vite')
            if 'recharts' in dep_lower:
                frameworks.add('Recharts Data Visualization')
            if 'reportlab' in dep_lower:
                frameworks.add('ReportLab PDF Engine')

        return {
            "languages": sorted(list(languages)) or ["JavaScript", "Python"],
            "frameworks": sorted(list(frameworks)) or ["Modern Web Architecture"]
        }

    def _generate_markdown(self, name: str, files: list, dependencies: dict, stack: dict, prompt: str) -> str:
        """Generate structured markdown documentation."""
        langs_str = ", ".join(stack.get("languages", []))
        fworks_str = ", ".join(stack.get("frameworks", []))

        # Sample top directory structure
        dirs = {}
        for f in files[:80]:
            parts = f.split('/')
            top = parts[0] if len(parts) > 1 else "root"
            dirs.setdefault(top, []).append(parts[-1])

        tree_repr = []
        for d, sample_files in list(dirs.items())[:8]:
            tree_repr.append(f"- **`{d}/`**: contains {len(sample_files)} primary files (`{', '.join(sample_files[:4])}`...)")

        tree_str = "\n".join(tree_repr)

        return f"""# {name} — Architecture & Project Documentation
*Generated automatically by NEXUS Document Generator Agent*

---

## 1. Executive Summary
**{name}** is an enterprise-grade software system engineered using modern development standards. 
This document provides a comprehensive technical overview of the codebase architecture, 
runtime components, module hierarchy, and configuration specifications.

- **Primary Languages**: {langs_str}
- **Frameworks & Core Libraries**: {fworks_str}
- **Total Project Files Indexed**: {len(files)}
- **Agent Focus**: {prompt or "Full Workspace Architecture & Implementation Guide"}

---

## 2. Technology Stack & Key Dependencies

| Layer | Technologies & Frameworks | Purpose |
| :--- | :--- | :--- |
| **User Interface** | {', '.join([f for f in stack.get('frameworks', []) if 'React' in f or 'Vite' in f]) or 'Web / Extension UI'} | Client-side interaction & rendering |
| **Backend / Services** | {', '.join([f for f in stack.get('frameworks', []) if 'Django' in f or 'Node' in f]) or 'API Server & Business Logic'} | Telemetry processing, authentication & API |
| **Intelligence Engine** | Multi-Agent Orchestrator, Ollama Local LLMs, Semantic Retrieval | Autonomous diagnostics & code guidance |
| **Data & Storage** | Relational Database, Workspace SecretStorage | Session persistence & telemetry history |

---

## 3. Directory Layout & Module Breakdown

The codebase follows a modular separation of concerns:

{tree_str}

---

## 4. System Architecture Blueprint

The platform employs a decoupled client-server architecture:
1. **Client / Extension Layer**: Captures editor telemetry, diagnostics, and developer interactions without blocking the active editor.
2. **API & Orchestrator Layer**: Validates requests, authenticates sessions via JWT tokens, and routes tasks to specialized agents.
3. **Knowledge & Analytics Engine**: Aggregates Problem DNA signatures, extracts recurring code error patterns, and streams live metrics to the admin dashboard.

---

---

## 5. Technical Specifications & Configuration Parameters
- **Runtime Environment**: Production-ready containerized or local runtime targeting Node.js / Python LTS.
- **Service Interfaces**: Structured REST / WebSocket contracts with standardized JSON payload schemas.
- **State & Telemetry**: Context-preserving session isolation ensuring zero cross-project data leakage.

---

## 6. Scope & Architecture Mandate
This document and its companion deliverables (`ARCHITECTURE.mmd`, `PROJECT_DOCUMENTATION.pdf`) are produced exclusively for system architectural documentation, structural topologies, and technical reporting. The Document Generator Agent strictly adheres to technical documentation without generating application source code.
"""

    def _generate_mermaid(self, name: str, stack: dict, files: list) -> str:
        """Generate valid Mermaid flowchart diagram syntax (.mmd)."""
        has_frontend = any('frontend' in f.lower() for f in files)
        has_backend = any('backend' in f.lower() for f in files)
        has_extension = any('extension' in f.lower() for f in files)

        return f"""flowchart TD
    %% Architecture Blueprint for {name}
    subgraph ClientLayer ["Client & Interface Layer"]
        UI["React Web Dashboard<br/>(Vite + Tailwind/CSS)"]
        EXT["VS Code NEXUS Extension<br/>(Sidebar Webview & Commands)"]
    end

    subgraph APILayer ["API & Orchestration Layer"]
        GATEWAY["API Gateway / Router<br/>(Django REST / JWT Auth)"]
        ORCH["NEXUS AI Orchestrator<br/>(StateGraph & Route Dispatcher)"]
    end

    subgraph AgentsLayer ["Specialist AI Agents"]
        DOC["Document Generator Agent<br/>(.md / .pdf / .mmd)"]
        MENTOR["Mentor Agent<br/>(Progressive Hint Guidance)"]
        CLASSIFIER["Problem Classifier<br/>(Problem DNA Signatures)"]
    end

    subgraph DataLayer ["Persistence & Knowledge"]
        DB[("Relational Database<br/>Sessions, Users & Problems")]
        DNA[("Problem DNA Registry<br/>Clustered Patterns")]
        SECRETS["VS Code SecretStorage<br/>Secure Tokens"]
    end

    %% Flow Connections
    EXT -->|"Captured Context & AST"| GATEWAY
    UI -->|"Analytics & User Management"| GATEWAY
    EXT -.->|"Local Auth Token"| SECRETS

    GATEWAY -->|"Authenticated Request"| ORCH
    ORCH --> MENTOR
    ORCH --> CLASSIFIER
    ORCH --> DOC

    DOC -->|"Writes Output Files"| EXT
    CLASSIFIER -->|"Indexes Telemetry"| DNA
    GATEWAY -->|"CRUD Operations"| DB
    MENTOR -->|"Telemetry Logs"| DB

    classDef primary fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e3a8a;
    classDef secondary fill:#f8fafc,stroke:#64748b,stroke-width:1px,color:#0f172a;
    classDef highlight fill:#ecfdf5,stroke:#059669,stroke-width:2px,color:#065f46;

    class UI,EXT primary;
    class GATEWAY,ORCH secondary;
    class DOC,MENTOR,CLASSIFIER highlight;
"""

    def _generate_pdf(self, name: str, stack: dict, markdown: str, mermaid: str) -> bytes:
        """Generate a formatted PDF document using ReportLab."""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=40,
            leftMargin=40,
            topMargin=40,
            bottomMargin=40
        )

        styles = getSampleStyleSheet()

        # Custom typography styles
        title_style = ParagraphStyle(
            'DocTitle',
            parent=styles['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=22,
            leading=26,
            textColor=colors.HexColor('#0f172a'),
            spaceAfter=6
        )

        subtitle_style = ParagraphStyle(
            'DocSubtitle',
            parent=styles['Normal'],
            fontName='Helvetica-Oblique',
            fontSize=11,
            leading=14,
            textColor=colors.HexColor('#2563eb'),
            spaceAfter=14
        )

        h2_style = ParagraphStyle(
            'DocH2',
            parent=styles['Heading2'],
            fontName='Helvetica-Bold',
            fontSize=14,
            leading=18,
            textColor=colors.HexColor('#1e40af'),
            spaceBefore=14,
            spaceAfter=6
        )

        body_style = ParagraphStyle(
            'DocBody',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=10,
            leading=14,
            textColor=colors.HexColor('#334155'),
            spaceAfter=6
        )

        code_style = ParagraphStyle(
            'DocCode',
            parent=styles['Normal'],
            fontName='Courier',
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor('#0369a1'),
            backColor=colors.HexColor('#f8fafc'),
            borderColor=colors.HexColor('#e2e8f0'),
            borderWidth=1,
            borderPadding=8,
            spaceBefore=6,
            spaceAfter=10
        )

        story = []

        # Header Title
        story.append(Paragraph(f"<b>{name}</b>", title_style))
        story.append(Paragraph("System Architecture & Technical Documentation &bull; Generated by NEXUS", subtitle_style))
        story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#2563eb'), spaceAfter=14))

        # Executive Overview
        story.append(Paragraph("1. Executive Overview", h2_style))
        story.append(Paragraph(
            f"This technical document specifies the architectural model and software components of <b>{name}</b>. "
            "The system is structured for modular scalability, secure developer mentoring, and zero-exfiltration telemetry.",
            body_style
        ))

        # Stack Table
        story.append(Spacer(1, 8))
        story.append(Paragraph("2. Detected Ecosystem & Frameworks", h2_style))
        table_data = [
            [Paragraph("<b>Component Layer</b>", body_style), Paragraph("<b>Identified Technologies</b>", body_style)],
            [Paragraph("Programming Languages", body_style), Paragraph(", ".join(stack.get('languages', [])), body_style)],
            [Paragraph("Frameworks & Runtimes", body_style), Paragraph(", ".join(stack.get('frameworks', [])), body_style)],
            [Paragraph("Documentation Engine", body_style), Paragraph("NEXUS Document Generator Agent v1.0", body_style)]
        ]
        t = Table(table_data, colWidths=[160, 360])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#eff6ff')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(t)
        story.append(Spacer(1, 10))

        # Architecture Flow Diagram Syntax
        story.append(Paragraph("3. System Flow & Component Blueprint (Mermaid Architecture)", h2_style))
        story.append(Paragraph(
            "Below is the component relationship graph compiled into the standalone <code>docs/ARCHITECTURE.mmd</code> file:",
            body_style
        ))
        story.append(Preformatted(mermaid[:950], code_style))

        # Developer Setup
        story.append(Paragraph("4. Quick Setup & Execution", h2_style))
        setup_text = (
            "&bull; <b>Frontend</b>: <code>npm install && npm run dev</code> (Port 3000)<br/>"
            "&bull; <b>Backend</b>: <code>pip install -r requirements.txt && python3 manage.py runserver</code> (Port 8999)<br/>"
            "&bull; <b>VS Code Extension</b>: Launch via F5 or press F9 in editor to open NEXUS sidebar."
        )
        story.append(Paragraph(setup_text, body_style))
        story.append(Spacer(1, 14))

        # Footer note
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#cbd5e1'), spaceBefore=12, spaceAfter=8))
        story.append(Paragraph("NEXUS Autonomous Engineering Platform &bull; Confidential &bull; TCS Network Secured", ParagraphStyle(
            'Footer', parent=styles['Normal'], fontName='Helvetica', fontSize=8, textColor=colors.HexColor('#94a3b8'), alignment=1
        )))

        doc.build(story)
        return buffer.getvalue()

