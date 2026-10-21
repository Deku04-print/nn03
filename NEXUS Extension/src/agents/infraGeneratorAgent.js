// WorkLens Infrastructure & DevOps Generator Agent
// Analyzes project structure, .env files, and tech stack to synthesize production Docker, Docker Compose, Nginx, and Kubernetes manifests.
'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class InfraGeneratorAgent {
    /**
     * @param {import('../ui/worklensPanel').WorklensPanelProvider} panelProvider
     * @param {import('../api/worklensApi').WorklensApi} api
     */
    constructor(panelProvider, api) {
        this.panelProvider = panelProvider;
        this.api = api;
    }

    /**
     * Run infrastructure generation for workspace
     * @param {string} [prompt] Custom user directive (e.g. 'Production ready with Redis and Nginx', 'K8s only')
     */
    async run(prompt = '') {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.panelProvider.postMessage({
                type: 'infra_agent_error',
                message: 'No open workspace folder found. Please open a project first.'
            });
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;

        try {
            // ── Step 1: Workspace Topology & .env Inspection ───────────────
            this.panelProvider.postMessage({
                type: 'infra_agent_step',
                step: 1,
                totalSteps: 5,
                title: 'Analyzing Project Architecture & .env',
                message: 'Scanning services, detecting frameworks, reading .env keys and database drivers...'
            });

            const topology = await this._analyzeTopology(workspaceRoot);

            // ── Step 2: Environment & Port Mapping ─────────────────────────
            this.panelProvider.postMessage({
                type: 'infra_agent_step',
                step: 2,
                totalSteps: 5,
                title: 'Mapping Ports, Services & Databases',
                message: `Identified ${topology.services.length} service(s) [${topology.services.map(s => s.name).join(', ')}] with ${topology.databases.join(', ') || 'internal storage'}.`
            });

            // ── Step 3: Synthesis of Manifests ─────────────────────────────
            this.panelProvider.postMessage({
                type: 'infra_agent_step',
                step: 3,
                totalSteps: 5,
                title: 'Synthesizing DevOps & Manifests',
                message: 'Generating hardened Dockerfiles, docker-compose.yml, nginx.conf, and Kubernetes manifests...'
            });

            let infraResult;
            try {
                if (this.api && typeof this.api.generateInfra === 'function') {
                    infraResult = await this.api.generateInfra({
                        topology: topology,
                        prompt: prompt
                    });
                } else {
                    infraResult = this._localFallbackGenerate(topology, prompt);
                }
            } catch (apiErr) {
                console.warn('[InfraGeneratorAgent] Backend API unavailable, using local synthesis:', apiErr.message);
                infraResult = this._localFallbackGenerate(topology, prompt);
            }

            // ── Step 4: Write Deliverables to Respective Folders ───────────
            this.panelProvider.postMessage({
                type: 'infra_agent_step',
                step: 4,
                totalSteps: 5,
                title: 'Writing Infrastructure Files',
                message: 'Writing Dockerfiles, docker-compose.yml, nginx.conf, and k8s/ manifests directly to disk...'
            });

            const createdFiles = [];
            for (const fileItem of infraResult.files || []) {
                const targetAbsPath = path.join(workspaceRoot, fileItem.path);
                const targetDir = path.dirname(targetAbsPath);

                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }

                fs.writeFileSync(targetAbsPath, fileItem.content, 'utf-8');

                createdFiles.push({
                    name: path.basename(fileItem.path),
                    relPath: fileItem.path,
                    absPath: targetAbsPath,
                    category: fileItem.category || 'Docker',
                    lines: fileItem.content.split('\n').length,
                    size: fs.statSync(targetAbsPath).size
                });
            }

            // ── Step 5: Finalize & Notify Webview ──────────────────────────
            this.panelProvider.postMessage({
                type: 'infra_agent_step',
                step: 5,
                totalSteps: 5,
                title: 'Infrastructure Ready',
                message: `Generated ${createdFiles.length} infrastructure configuration files across the project.`
            });

            this.panelProvider.postMessage({
                type: 'infra_agent_complete',
                topology: {
                    servicesCount: topology.services.length,
                    databases: topology.databases,
                    hasK8s: createdFiles.some(f => f.category === 'Kubernetes'),
                    hasDockerCompose: createdFiles.some(f => f.name === 'docker-compose.yml'),
                    hasNginx: createdFiles.some(f => f.name === 'nginx.conf')
                },
                files: createdFiles,
                runCommand: 'docker-compose up --build -d'
            });

            vscode.window.showInformationMessage(
                `WorkLens: Successfully generated ${createdFiles.length} DevOps & Infrastructure files!`,
                'View docker-compose.yml',
                'Run docker-compose'
            ).then(choice => {
                if (choice === 'View docker-compose.yml') {
                    const composeFile = path.join(workspaceRoot, 'docker-compose.yml');
                    if (fs.existsSync(composeFile)) {
                        vscode.commands.executeCommand('worklens.openFile', { path: composeFile });
                    }
                } else if (choice === 'Run docker-compose') {
                    vscode.commands.executeCommand('worklens.runTestCommand', { command: 'docker-compose up --build -d' });
                }
            });

        } catch (err) {
            console.error('[InfraGeneratorAgent] Error generating infrastructure:', err);
            this.panelProvider.postMessage({
                type: 'infra_agent_error',
                message: `Infrastructure generation failed: ${err.message}`
            });
        }
    }

    /**
     * Inspect workspace folder structure, package managers, and .env files
     */
    async _analyzeTopology(workspaceRoot) {
        const topology = {
            hasFrontend: false,
            frontendType: null,
            frontendDir: null,
            frontendPort: 3000,
            hasBackend: false,
            backendType: null,
            backendDir: null,
            backendPort: 8000,
            databases: [],
            envVariables: {},
            services: []
        };

        // 1. Check for .env files (.env, .env.example, .env.local)
        const envCandidates = ['.env', '.env.example', '.env.local', 'Backend/.env', 'Frontend/.env'];
        for (const candidate of envCandidates) {
            const p = path.join(workspaceRoot, candidate);
            if (fs.existsSync(p)) {
                try {
                    const envText = fs.readFileSync(p, 'utf-8');
                    const lines = envText.split('\n');
                    for (const l of lines) {
                        const trimmed = l.trim();
                        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                            const [key, ...vals] = trimmed.split('=');
                            const cleanKey = key.trim();
                            const val = vals.join('=').trim().replace(/['"]/g, '');
                            if (cleanKey && !topology.envVariables[cleanKey]) {
                                topology.envVariables[cleanKey] = val || 'changeme';
                            }
                        }
                    }
                } catch (_) {}
            }
        }

        // Detect databases from env keys or packages
        const envKeys = Object.keys(topology.envVariables).map(k => k.toLowerCase());
        const envVals = Object.values(topology.envVariables).map(v => String(v).toLowerCase());

        if (envKeys.some(k => k.includes('postgres') || k.includes('pg_')) || envVals.some(v => v.includes('postgres'))) {
            topology.databases.push('PostgreSQL');
        }
        if (envKeys.some(k => k.includes('mongo')) || envVals.some(v => v.includes('mongodb'))) {
            topology.databases.push('MongoDB');
        }
        if (envKeys.some(k => k.includes('redis')) || envVals.some(v => v.includes('redis://'))) {
            topology.databases.push('Redis');
        }
        if (envKeys.some(k => k.includes('mysql')) || envVals.some(v => v.includes('mysql'))) {
            topology.databases.push('MySQL');
        }

        // 2. Detect Frontend service
        const fePaths = [
            path.join(workspaceRoot, 'Frontend'),
            path.join(workspaceRoot, 'frontend'),
            path.join(workspaceRoot, 'client'),
            path.join(workspaceRoot, 'practice'),
            workspaceRoot
        ];

        for (const dir of fePaths) {
            if (fs.existsSync(dir)) {
                const pkgPath = path.join(dir, 'package.json');
                if (fs.existsSync(pkgPath)) {
                    try {
                        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
                        if (deps['react'] || deps['vue'] || deps['@angular/core'] || deps['svelte'] || deps['vite'] || deps['next']) {
                            topology.hasFrontend = true;
                            topology.frontendDir = path.relative(workspaceRoot, dir) || '.';
                            topology.frontendType = deps['next'] ? 'Next.js' : (deps['vite'] ? 'Vite+React' : 'React');
                            topology.frontendPort = deps['next'] ? 3000 : (deps['vite'] ? 5173 : 3000);
                            topology.services.push({
                                name: 'frontend',
                                type: topology.frontendType,
                                relDir: topology.frontendDir,
                                port: topology.frontendPort
                            });
                            break;
                        }
                    } catch (_) {}
                }
            }
        }

        // 3. Detect Backend service
        const bePaths = [
            path.join(workspaceRoot, 'Backend'),
            path.join(workspaceRoot, 'backend'),
            path.join(workspaceRoot, 'server'),
            path.join(workspaceRoot, 'api'),
            workspaceRoot
        ];

        for (const dir of bePaths) {
            if (fs.existsSync(dir)) {
                const managePy = path.join(dir, 'manage.py');
                const reqTxt = path.join(dir, 'requirements.txt');
                const pyproject = path.join(dir, 'pyproject.toml');
                const pkgJson = path.join(dir, 'package.json');

                if (fs.existsSync(managePy)) {
                    topology.hasBackend = true;
                    topology.backendType = 'Django';
                    topology.backendDir = path.relative(workspaceRoot, dir) || '.';
                    topology.backendPort = 8000;
                    topology.services.push({
                        name: 'backend',
                        type: 'Django',
                        relDir: topology.backendDir,
                        port: 8000
                    });
                    break;
                } else if (fs.existsSync(reqTxt) || fs.existsSync(pyproject)) {
                    topology.hasBackend = true;
                    topology.backendType = 'FastAPI/Python';
                    topology.backendDir = path.relative(workspaceRoot, dir) || '.';
                    topology.backendPort = 8000;
                    topology.services.push({
                        name: 'backend',
                        type: 'FastAPI/Python',
                        relDir: topology.backendDir,
                        port: 8000
                    });
                    break;
                } else if (dir !== topology.frontendDir && fs.existsSync(pkgJson)) {
                    try {
                        const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf-8'));
                        const deps = { ...(pkg.dependencies || {}) };
                        if (deps['express'] || deps['@nestjs/core'] || deps['koa'] || deps['fastify']) {
                            topology.hasBackend = true;
                            topology.backendType = 'Node/Express';
                            topology.backendDir = path.relative(workspaceRoot, dir) || '.';
                            topology.backendPort = 5000;
                            topology.services.push({
                                name: 'backend',
                                type: 'Node/Express',
                                relDir: topology.backendDir,
                                port: 5000
                            });
                            break;
                        }
                    } catch (_) {}
                }
            }
        }

        // If no services detected, default to a monolithic container
        if (topology.services.length === 0) {
            topology.services.push({
                name: 'app',
                type: 'Node/Web',
                relDir: '.',
                port: 3000
            });
        }

        if (topology.databases.length === 0) {
            topology.databases.push('PostgreSQL'); // default production standard
        }

        return topology;
    }

    /**
     * Local synthesis generator for complete DevOps & Infrastructure suite
     */
    _localFallbackGenerate(topology, prompt) {
        const files = [];

        const pLower = (prompt || '').toLowerCase();
        const hasOnly = pLower.includes('only') || pLower.includes('just');

        let wantsCompose = pLower.includes('compose') || pLower.includes('docker-compose');
        let wantsNginx = pLower.includes('nginx') || pLower.includes('proxy');
        let wantsK8s = pLower.includes('k8s') || pLower.includes('kubernetes') || pLower.includes('kube');
        let wantsDocker = pLower.includes('dockerfile') || pLower.includes('docker file') || (pLower.includes('docker') && !wantsCompose);

        if (!hasOnly && !wantsCompose && !wantsNginx && !wantsK8s && !wantsDocker) {
            wantsCompose = wantsNginx = wantsK8s = wantsDocker = true;
        } else if (!hasOnly && (pLower.includes('full') || pLower.includes('all') || pLower.includes('devops'))) {
            wantsCompose = wantsNginx = wantsK8s = wantsDocker = true;
        }

        const hasFrontend = topology.hasFrontend && topology.frontendDir !== '.';
        const hasBackend = topology.hasBackend && topology.backendDir !== '.';
        const feDir = topology.frontendDir || 'Frontend';
        const beDir = topology.backendDir || 'Backend';
        const fePort = topology.frontendPort || 3000;
        const bePort = topology.backendPort || 8000;

        // 1. Frontend Dockerfile & .dockerignore
        if (wantsDocker && hasFrontend) {
            const feDockerfile = `# ── Frontend Multi-Stage Build ──
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --prefer-offline --no-audit

# Build production bundle
COPY . .
RUN npm run build

# ── Production Runner (Nginx Alpine) ──
FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
# Custom SPA routing config
RUN printf 'server {\\n\\
    listen 80;\\n\\
    server_name localhost;\\n\\
    location / {\\n\\
        root /usr/share/nginx/html;\\n\\
        index index.html index.htm;\\n\\
        try_files $uri $uri/ /index.html;\\n\\
    }\\n\\
}\\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;
            files.push({
                path: path.join(feDir, 'Dockerfile'),
                content: feDockerfile,
                category: 'Docker'
            });

            files.push({
                path: path.join(feDir, '.dockerignore'),
                content: `node_modules\ndist\nbuild\n.git\n.env*\n*.log\n.DS_Store\n`,
                category: 'Docker'
            });
        }

        // 2. Backend Dockerfile & .dockerignore
        if (wantsDocker && hasBackend) {
            const isDjango = topology.backendType === 'Django';
            const beDockerfile = `# ── Backend Production Container ──
FROM python:3.11-slim-bullseye AS runner

ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1 \\
    PORT=${bePort}

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc \\
    libpq-dev \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \\
    pip install --no-cache-dir -r requirements.txt && \\
    pip install --no-cache-dir gunicorn uvicorn

# Copy application source
COPY . .

# Create non-privileged user for security
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE ${bePort}

${isDjango ? 'CMD ["gunicorn", "--bind", "0.0.0.0:' + bePort + '", "--workers", "3", "--timeout", "120", "core.wsgi:application"]' : 'CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "' + bePort + '"]'}
`;
            files.push({
                path: path.join(beDir, 'Dockerfile'),
                content: beDockerfile,
                category: 'Docker'
            });

            files.push({
                path: path.join(beDir, '.dockerignore'),
                content: `__pycache__\n*.pyc\n*.pyo\n.venv\nvenv\n.git\n.env*\n*.sqlite3\nmedia\n*.log\n.DS_Store\n`,
                category: 'Docker'
            });
        }

        // Single service fallback Dockerfile if neither subfolder exists
        if (wantsDocker && !hasFrontend && !hasBackend) {
            files.push({
                path: 'Dockerfile',
                content: `# WorkLens Production Container
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
`,
                category: 'Docker'
            });
            files.push({
                path: '.dockerignore',
                content: `node_modules\n.git\n.env*\n*.log\n.DS_Store\n`,
                category: 'Docker'
            });
        }

        // 3. Root docker-compose.yml
        if (wantsCompose) {
            const composeServices = [];
            const volumes = [];

            if (topology.databases.includes('PostgreSQL')) {
                composeServices.push(`  postgres:
    image: postgres:15-alpine
    container_name: worklens_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: \${DB_NAME:-worklens}
      POSTGRES_USER: \${DB_USER:-postgres}
      POSTGRES_PASSWORD: \${DB_PASSWORD:-postgres123}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${DB_USER:-postgres}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app_network`);
                volumes.push('  postgres_data:');
            }

            if (topology.databases.includes('Redis')) {
                composeServices.push(`  redis:
    image: redis:7-alpine
    container_name: worklens_redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - app_network`);
                volumes.push('  redis_data:');
            }

            if (hasBackend) {
                composeServices.push(`  backend:
    build:
      context: ./${beDir}
      dockerfile: Dockerfile
    container_name: worklens_backend
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - DATABASE_HOST=postgres
      - DATABASE_PORT=5432
      - REDIS_HOST=redis
    ports:
      - "${bePort}:${bePort}"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - app_network`);
            }

            if (hasFrontend) {
                composeServices.push(`  frontend:
    build:
      context: ./${feDir}
      dockerfile: Dockerfile
    container_name: worklens_frontend
    restart: unless-stopped
    ports:
      - "80:80"
    depends_on:
      - backend
    networks:
      - app_network`);
            }

            // Nginx reverse proxy service
            composeServices.push(`  nginx:
    image: nginx:alpine
    container_name: worklens_proxy
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      ${hasFrontend ? '- frontend\n      ' : ''}- backend
    networks:
      - app_network`);

            const dockerComposeContent = `version: '3.8'

services:
${composeServices.join('\n\n')}

networks:
  app_network:
    driver: bridge

volumes:
${volumes.join('\n')}
`;
            files.push({
                path: 'docker-compose.yml',
                content: dockerComposeContent,
                category: 'Docker Compose'
            });
        }

        // 4. nginx/nginx.conf
        if (wantsNginx) {
            const nginxContent = `user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Upstream services
    upstream backend_api {
        server backend:${bePort};
        keepalive 32;
    }

    ${hasFrontend ? `upstream frontend_web {
        server frontend:80;
        keepalive 32;
    }` : ''}

    server {
        listen 80;
        server_name localhost;

        client_max_body_size 50M;

        # Security Headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        # API & Django Admin Reverse Proxy
        location /api/ {
            proxy_pass http://backend_api;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        location /admin/ {
            proxy_pass http://backend_api;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        # WebSocket support
        location /ws/ {
            proxy_pass http://backend_api;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "Upgrade";
            proxy_set_header Host $host;
        }

        # Frontend SPA Web App
        location / {
            ${hasFrontend ? `proxy_pass http://frontend_web;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;` : `return 200 '{"status":"ok","service":"WorkLens Gateway"}';
            add_header Content-Type application/json;`}
        }
    }
}
`;
            files.push({
                path: 'nginx/nginx.conf',
                content: nginxContent,
                category: 'Nginx'
            });
        }

        // 5. Kubernetes Manifests (\`k8s/\` folder)
        if (wantsK8s) {
            const k8sBackend = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: worklens-backend
  labels:
    app: worklens-backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: worklens-backend
  template:
    metadata:
      labels:
        app: worklens-backend
    spec:
      containers:
      - name: backend
        image: worklens-backend:latest
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: ${bePort}
        envFrom:
        - configMapRef:
            name: worklens-config
        - secretRef:
            name: worklens-secret
        resources:
          limits:
            cpu: "1000m"
            memory: "1024Mi"
          requests:
            cpu: "250m"
            memory: "256Mi"
        livenessProbe:
          httpGet:
            path: /api/health/
            port: ${bePort}
          initialDelaySeconds: 15
          periodSeconds: 20
---
apiVersion: v1
kind: Service
metadata:
  name: worklens-backend-svc
spec:
  type: ClusterIP
  selector:
    app: worklens-backend
  ports:
  - port: ${bePort}
    targetPort: ${bePort}
`;
            files.push({
                path: 'k8s/backend.yaml',
                content: k8sBackend,
                category: 'Kubernetes'
            });

            if (hasFrontend) {
                const k8sFrontend = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: worklens-frontend
  labels:
    app: worklens-frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: worklens-frontend
  template:
    metadata:
      labels:
        app: worklens-frontend
    spec:
      containers:
      - name: frontend
        image: worklens-frontend:latest
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 80
        resources:
          limits:
            cpu: "500m"
            memory: "512Mi"
          requests:
            cpu: "100m"
            memory: "128Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: worklens-frontend-svc
spec:
  type: ClusterIP
  selector:
    app: worklens-frontend
  ports:
  - port: 80
    targetPort: 80
`;
                files.push({
                    path: 'k8s/frontend.yaml',
                    content: k8sFrontend,
                    category: 'Kubernetes'
                });
            }

            const k8sIngress = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: worklens-ingress
  annotations:
    kubernetes.io/ingress.class: "nginx"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
spec:
  rules:
  - host: worklens.local
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: worklens-backend-svc
            port:
              number: ${bePort}
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ${hasFrontend ? 'worklens-frontend-svc' : 'worklens-backend-svc'}
            port:
              number: ${hasFrontend ? 80 : bePort}
`;
            files.push({
                path: 'k8s/ingress.yaml',
                content: k8sIngress,
                category: 'Kubernetes'
            });

            const k8sConfigMap = `apiVersion: v1
kind: ConfigMap
metadata:
  name: worklens-config
data:
  ENVIRONMENT: "production"
  PORT: "${bePort}"
  DATABASE_HOST: "postgres-svc"
  DATABASE_PORT: "5432"
`;
            files.push({
                path: 'k8s/configmap.yaml',
                content: k8sConfigMap,
                category: 'Kubernetes'
            });

            const k8sSecret = `apiVersion: v1
kind: Secret
metadata:
  name: worklens-secret
type: Opaque
stringData:
  SECRET_KEY: "change-this-in-production-secret"
  DB_PASSWORD: "securepassword123"
`;
            files.push({
                path: 'k8s/secret.yaml',
                content: k8sSecret,
                category: 'Kubernetes'
            });
        }

        return {
            success: true,
            topology: topology,
            files: files
        };
    }
}

module.exports = { InfraGeneratorAgent };

