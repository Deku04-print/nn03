# NEXUS demo script

This script separates live behavior from planned screens. Run the demo only after the local setup and corresponding checks have succeeded. Do not display real credentials, sensitive code, private expert data, or fabricated telemetry.

## Preparation

1. Start PostgreSQL and Ollama, ensure the configured model is available, then run backend migrations and start Django.
2. Start the Vite dashboard and launch the VS Code Extension Development Host.
3. Use dedicated synthetic developer/admin accounts and a harmless sample source file.
4. Verify API availability, logged-in roles, and network configuration before presenting.
5. Use the test/build evidence recorded in `DELIVERY_STATUS.md`; if a workflow has not been verified, label it as a code walkthrough or roadmap item.

## Suggested 8–10 minute walkthrough

1. **Product map (1 min):** explain extension, dashboard, Django API, PostgreSQL, and local/configured Ollama using `ARCHITECTURE.md`.
2. **Dashboard login (1 min):** sign in or open the dashboard from the signed-in extension using the one-time code flow. Show available navigation and loading/error states. Use only metrics returned by the backend; unavailable values should remain unavailable.
3. **VS Code guided help (2 min):** open a non-sensitive sample file, select a small block, invoke analysis, and explain that the user action sends the selected/nearby context to the configured backend/Ollama.
4. **Problem history (1 min):** show current ProblemDNA fields and hybrid local-embedding/keyword retrieval. Claim semantic matches only after the embedding model is installed and records have been backfilled.
5. **Human API (2 min):** with a test expert profile, demonstrate discovery/request/accept/message/outcome only if the lifecycle was verified. Show explicit context consent, request cancellation and participant-isolation test evidence.
6. **AI review/Skill Quest (1–2 min):** show original answer feedback and separate review record; display an evidence-backed learning recommendation. Only show a course link if an administrator has supplied and approved it.
7. **Roadmap and blockers (1 min):** explain pending corporate identity-provider SSO, durable chat history, automatic Visual Expert/company Git ingestion, approved training links, and any outstanding runtime/build verification. Demonstrate Visual Expert only with approved sources and after its Ollama model calls have been verified.

## Evidence checklist

- Capture only synthetic data and redact hostnames/credentials.
- Record exact test/build command and output, timestamp and environment in delivery status.
- Demonstrate role-denied API requests as well as permitted UI access when authorization changes are complete.
- Do not claim performance, solved counts, or agent status unless computed from verified live data.
