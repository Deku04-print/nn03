# NEXUS security and privacy

## Current controls found

- Django REST Framework defaults to SimpleJWT authentication and `IsAuthenticated`.
- Admin user-management routes use staff checks; collaboration endpoints have authentication, participant, and expert-role checks.
- Cohort, developer, and agent analytics endpoints now require staff access; empty-data responses no longer substitute sample counts or estimated hours.
- Extension JWTs are stored with VS Code SecretStorage. Dashboard JWT is stored in browser localStorage.
- The AI payload sanitizer redacts a limited set of tokens, key patterns, email addresses, database URLs and IP:port values from selected fields.
- Human API context sharing has an explicit opt-in, and the original AI answer is stored separately from human review/correction.
- `.env` and local environment/build outputs are ignored by Git. `.env.example` files contain placeholders only.

These controls are identified in source inspection and are not a security certification or the result of a full penetration test.

## High-priority findings and mitigations

1. **Core API authorization:** `NexusBaseView` now requires `IsAuthenticated`; ProblemDNA endpoints scope private records to their owners and restrict verification to staff. Tests cover current access behavior; this is not a security certification.
2. **Dashboard session exchange:** extension and dashboard use a short-lived, single-use code bound to an allowlisted callback and matching Origin. The code (not a JWT) crosses the callback fragment, is removed from history before exchange, and the API stores only its hash. Corporate identity-provider SSO is absent. The dashboard retains its existing localStorage JWT behavior after exchange.
3. **Development defaults:** `DEBUG=True` and fallback development secrets exist. Production configuration must set a unique secret, `DEBUG=False`, allowed hosts, HTTPS/security headers, and restricted CORS.
4. **AI context transmission:** a requested analysis transmits selected code/diagnostics to configured Ollama. Regex sanitization can miss secrets. Minimize context, disclose destinations, apply organizational policy, and do not use sensitive data unless authorized.
5. **Analytics integrity:** fixed fallback values in dashboard pages may look like live system metrics. Remove or label them before relying on them for governance or decisions.
6. **Stored source context:** ProblemContext contains selected/surrounding code. Define retention, deletion, access, backup, and export policy before production use.
7. **Ollama details:** URL/model/timeouts and optional gateway bearer token are server-side environment settings. User-safe failures should not disclose internal endpoints. Do not embed gateway credentials in the extension or browser.
8. **Repository ingestion:** no ingestion path exists today. Any future Git connector must use an authorized, least-privilege service credential, exclusions, secret handling, source references, retention, and deletion support.

## Minimum production checklist

- Establish authorized identity, role provisioning, password reset and revocation policies.
- Apply endpoint authentication and object-level access tests to each API group.
- Use TLS for browser/API and remote Ollama traffic; restrict network reachability and egress.
- Keep secrets in approved secret storage; rotate exposed secrets. Do not commit `.env` or copied credentials.
- Restrict CORS and `ALLOWED_HOSTS`; set `DEBUG=False`; configure Django secure cookie, proxy, CSRF, and HTTPS settings for the actual deployment topology.
- Set rate limits appropriate to LLM cost/capacity and protect login, feedback, and upload endpoints.
- Define data minimization, retention, deletion, backup access, incident response, and audit review.
- Treat prompts, retrieved repository content, diagnostics and user files as untrusted input. Defend against prompt injection and avoid executing generated commands.
- Review authorization for human experts, expert discovery data, assigned cases, message access and admin actions.
- Label AI-generated content, preserve uncertainty and evidence, and keep human correction distinct.

## Privacy boundaries

- Normal extension analysis should be limited to explicitly selected/active authorized context; current extension sends selected code and related diagnostics after invocation.
- Advanced multi-file inspection requires Workspace Trust, previews names and chosen paths, caps scope at five files, excludes sensitive/generated paths, supports approval and cancellation, and re-sanitizes on the backend. Secret filtering remains best-effort; follow organizational policy.
- Human requests must share only the reviewed, consented context; a human expert may request extra context, which must require a new consent decision.
- Team analytics should be aggregate and role-limited. Do not expose identifiable chat content or rank employees from question frequency.
- Skill gaps are tentative recommendations, not performance judgments. Let users correct/dismiss them.
- No code, terminal data, internal URL, or credential should be sent to an external AI provider by implicit fallback. There is no external-provider fallback in current code.
