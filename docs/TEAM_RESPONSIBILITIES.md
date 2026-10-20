# NEXUS team responsibilities

No employee names are assigned in this plan. Teams should fill owner fields after kickoff. Status means evidence in this repository or a recorded verification run, not reported intention.

| Team | Owns | Interfaces / shared responsibilities |
| --- | --- | --- |
| Frontend Team | React/Vite dashboard, extension webview UX, navigation, themes, accessibility, loading/error/empty states. | Aligns API payloads with Backend; explicit context permission UX with DevOps/Testing and AI/ML; never relies on UI-only authorization. |
| Backend Team | Django models/migrations, APIs, authentication/authorization, lifecycle rules, persistence, admin controls, retention hooks. | Defines API contracts with Frontend; supports AI request metadata and access boundaries; coordinates migration and rollback with DevOps/Testing. |
| DevOps and Testing Team | Clean-machine setup, environment configuration, CI/build/test scripts, deployment/rollback guidance, security/regression verification. | Does not own business rules; blocks release on severe access/privacy failures; documents unavailable infrastructure honestly. |
| AI/ML Team | Existing Ollama/LangGraph flow, prompts, retrieval, source grounding, evaluation, safety behavior and Skill Quest evidence logic. | Coordinates data contracts and privacy with Backend; uses authorized sources only; does not alter production prompts from unreviewed feedback. |

## Ownership boundaries

- Backend owns authorization and source-of-truth lifecycle; Frontend owns user consent presentation and clear status display.
- AI/ML owns model behavior and evaluation; Backend owns request validation, persistence, rate limits and data access.
- DevOps/Testing verifies behavior and reproducibility; each implementation team supplies testable acceptance criteria and evidence.
- Git-host access, internal courses, and company AI endpoints must be provisioned by authorized company owners. No team should fabricate credentials or source data.

## Cross-team handoff checklist

1. Agree request/response schema and permissions before parallel UI/API work.
2. Identify user data and whether it contains code, logs, or PII.
3. Define failure and empty states before implementation is called complete.
4. Provide migrations plus rollback notes for data changes.
5. Record test command, actual result, date and any infrastructure blockers.
