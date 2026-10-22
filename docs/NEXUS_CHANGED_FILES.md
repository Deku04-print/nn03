# Updated source files

Copy these source paths into the existing project, preserving the same directory structure. Do not replace the company database or machine configuration. All existing migrations and dependency manifests must also remain available.

## Modified

- `Backend/ai/agents/mentor_agent.py`
- `Backend/apps/analytics/views.py`
- `Backend/apps/knowledge/views.py`
- `Backend/apps/worklens/serializers.py`
- `Backend/apps/worklens/views.py`
- `Backend/config/settings.py`
- `Backend/config/urls.py`
- `Backend/tests/test_problem_dna.py`
- `Backend/tests/test_verification.py`
- `Frontend/src/App.jsx`
- `Frontend/src/components/Layout.jsx`
- `Frontend/src/hooks/useAuth.jsx`
- `Frontend/src/pages/Agents.jsx`
- `Frontend/src/pages/Login.jsx`
- `Frontend/src/pages/UserManagement.jsx`
- `Frontend/src/services/api.js`
- `NEXUS Extension/.vscode/launch.json`
- `NEXUS Extension/extension.js`
- `NEXUS Extension/media/worklens.css`
- `NEXUS Extension/media/worklens.js`
- `NEXUS Extension/package.json`
- `NEXUS Extension/src/api/worklensApi.js`
- `NEXUS Extension/src/commands/worklensCommand.js`
- `NEXUS Extension/src/ui/webview.js`
- `NEXUS Extension/src/ui/worklensPanel.js`

## Added

- `.gitignore`
- `Backend/.env.example`
- `Backend/apps/assistance/__init__.py`
- `Backend/apps/assistance/apps.py`
- `Backend/apps/assistance/management/__init__.py`
- `Backend/apps/assistance/management/commands/__init__.py`
- `Backend/apps/assistance/management/commands/seed_demo_experts.py`
- `Backend/apps/assistance/migrations/0001_initial.py`
- `Backend/apps/assistance/migrations/__init__.py`
- `Backend/apps/assistance/models.py`
- `Backend/apps/assistance/serializers.py`
- `Backend/apps/assistance/services.py`
- `Backend/apps/assistance/urls.py`
- `Backend/apps/assistance/views.py`
- `Backend/tests/check_migration_copy.py`
- `Backend/tests/test_assistance.py`
- `Backend/tests/test_assistance_live.py`
- `Frontend/.env.example`
- `Frontend/src/assistance.css`
- `Frontend/src/components/ExpertSettings.jsx`
- `Frontend/src/hooks/useAssistancePolling.js`
- `Frontend/src/hooks/usePolling.js`
- `Frontend/src/pages/AssistanceChat.jsx`
- `Frontend/src/pages/BrowserHandoff.jsx`
- `Frontend/src/pages/HumanAPI.jsx`
- `Frontend/src/pages/UserDashboard.jsx`
- `NEXUS Extension/media/assistance.js`
- `NEXUS Extension/media/icon.png`
- `NEXUS Extension/media/nexus-placeholder.svg`
- `NEXUS Extension/src/assistance/controller.js`
- `NEXUS Extension/test/api.test.js`
- `NEXUS Extension/test/assistance.test.js`
- `README.md`
- `docs/COMPANY_LAPTOP_HANDOVER.md`
- `docs/NEXUS_CHANGED_FILES.md`
- `docs/NEXUS_FEATURE_AUDIT.md`
- `docs/NEXUS_IMPLEMENTATION_STATUS.md`

## Local runtime data (do not copy or commit)

- `Backend/worklens_dev.db`: additive assistance migration and five fictional demo profiles applied; original records preserved.
- `Backend/.verification/before-assistance-20261022-3bb8ba09.db`: private pre-migration backup.
- Frontend build output and existing dependency/cache changes are excluded from this manifest.

Dependency versions did not change. Include the existing `Backend/requirements.txt`, both JavaScript `package.json` files and both `package-lock.json` files when copying a complete source bundle.
