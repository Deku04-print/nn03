"""
WorkLens Infrastructure & DevOps Generator Agent
Analyzes repository architecture, services, databases, and .env files to synthesize
production-grade Dockerfiles, docker-compose.yml, nginx.conf, and Kubernetes manifests.
Calls Ollama LLM to synthesize bespoke configurations tailored to the user's prompt.
"""

import os
import re
import json
import logging
from ai.llm.client import call_llm

logger = logging.getLogger('worklens.ai.infra_generator')


class InfraGeneratorAgent:
    """Agent dedicated strictly to generating infrastructure, containerization, and orchestration manifests."""

    def generate(self, topology: dict, prompt: str = "") -> dict:
        logger.info(f"InfraGeneratorAgent generating DevOps manifests with prompt: '{prompt}' for topology: {topology.get('services')}")

        # 1. Try LLM generation first to dynamically follow the developer's exact prompt
        llm_files = None
        try:
            llm_files = self._call_llm_infra_gen(topology, prompt)
        except Exception as e:
            logger.warning(f"LLM infrastructure synthesis failed, falling back to structural generator: {e}")

        if llm_files and len(llm_files) > 0:
            return {
                "success": True,
                "topology": topology,
                "files": llm_files,
                "stats": {
                    "total_files": len(llm_files),
                    "services": len(topology.get('services', []))
                }
            }

        # 2. Structural fallback generator with prompt scope filtering
        files = self._structural_infra_gen(topology, prompt)

        return {
            "success": True,
            "topology": topology,
            "files": files,
            "stats": {
                "total_files": len(files),
                "services": len(topology.get('services', []))
            }
        }

    def _call_llm_infra_gen(self, topology: dict, prompt: str) -> list:
        """Call Ollama LLM to synthesize only the infrastructure files requested."""
        system_prompt = """You are the WorkLens Infrastructure & DevOps Generator Agent.
Your SOLE purpose is to generate production-ready infrastructure and containerization manifests according to the developer's exact prompt.

CRITICAL RULES:
1. STRICT SCOPE ADHERENCE: Generate ONLY the files explicitly or implicitly requested.
   - If the developer requests "docker-compose.yml and nginx reverse proxy only", output ONLY docker-compose.yml and nginx/nginx.conf. DO NOT generate Dockerfiles or Kubernetes manifests.
   - If the developer requests "Kubernetes only", output ONLY k8s/ manifests.
   - If the developer requests "Full DevOps", output Dockerfiles, docker-compose.yml, nginx.conf, and k8s manifests.
2. Code Quality:
   - Dockerfiles: Multi-stage, alpine or slim, non-root user.
   - docker-compose.yml: Version 3.8, proper service dependencies, healthchecks, networks, volumes.
   - nginx.conf: Reverse proxy routing /api/ and /admin/ to backend, SPA to frontend, WebSocket /ws/ support.
3. OUTPUT FORMAT:
   Return ONLY a valid JSON object with a "files" array. No conversational text or markdown outside of the JSON block:
   ```json
   {
       "files": [
           {
               "path": "docker-compose.yml",
               "category": "Docker Compose",
               "content": "..."
           }
       ]
   }
   ```"""

        user_prompt = f"""Developer Directive: {prompt or 'Full production infrastructure suite'}

Topology Context:
- Has Frontend: {topology.get('hasFrontend')} ({topology.get('frontendType')}) in folder '{topology.get('frontendDir')}' on port {topology.get('frontendPort', 3000)}
- Has Backend: {topology.get('hasBackend')} ({topology.get('backendType')}) in folder '{topology.get('backendDir')}' on port {topology.get('backendPort', 8000)}
- Databases: {', '.join(topology.get('databases', [])) or 'None'}
- Environment Keys: {', '.join(list(topology.get('envVariables', {}).keys())[:15])}

Generate only the requested configuration files in the specified JSON format now."""

        response = call_llm(system=system_prompt, user=user_prompt, temperature=0.1, timeout=40)
        return self._parse_llm_files(response)

    def _parse_llm_files(self, text: str) -> list:
        """Resilient parser that handles valid JSON, JS-style backtick template literals, and regex blocks."""
        files = []

        # Strategy 1: Convert JS-style backtick multiline template strings (`...`) into valid escaped JSON strings
        converted = re.sub(r':\s*`([\s\S]*?)`', lambda m: ': ' + json.dumps(m.group(1)), text)

        # Strategy 2: Extract JSON block and parse with strict=False
        match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', converted, re.DOTALL)
        raw_json = match.group(1) if match else converted.strip()

        try:
            data = json.loads(raw_json, strict=False)
            for f in data.get('files', []):
                p = f.get('path') or f.get('name')
                if p:
                    cat = f.get('category')
                    if not cat:
                        p_lower = p.lower()
                        if 'compose' in p_lower: cat = 'Docker Compose'
                        elif 'nginx' in p_lower: cat = 'Nginx'
                        elif 'k8s' in p_lower or p.startswith('k8s/'): cat = 'Kubernetes'
                        else: cat = 'Docker'
                    files.append({
                        'path': p,
                        'content': f.get('content', '').strip(),
                        'category': cat
                    })
            if files:
                return files
        except Exception as e:
            logger.debug(f"JSON strict=False parsing failed: {e}")

        # Strategy 3: Regex extraction of individual file objects with either backticks or quotes
        blocks = re.findall(
            r'\{\s*(?:\"|\')?(?:path|name)(?:\"|\')?\s*:\s*[\"\\\']([^\"\\\']+)[\"\\\']\s*,\s*(?:\"|\')?content(?:\"|\')?\s*:\s*[`"\\\']([\s\S]*?)[`"\\\']\s*\}',
            text
        )
        for p, content in blocks:
            p_lower = p.lower()
            if 'compose' in p_lower: cat = 'Docker Compose'
            elif 'nginx' in p_lower: cat = 'Nginx'
            elif 'k8s' in p_lower or p.startswith('k8s/'): cat = 'Kubernetes'
            else: cat = 'Docker'
            files.append({'path': p, 'content': content.strip(), 'category': cat})

        return files

    def _structural_infra_gen(self, topology: dict, prompt: str) -> list:
        """Structural fallback generator that strictly filters by user prompt."""
        p_lower = (prompt or "").lower()
        has_only = "only" in p_lower or "just" in p_lower

        wants_compose = "compose" in p_lower or "docker-compose" in p_lower
        wants_nginx = "nginx" in p_lower or "proxy" in p_lower
        wants_k8s = "k8s" in p_lower or "kubernetes" in p_lower or "kube" in p_lower
        wants_docker = "dockerfile" in p_lower or "docker file" in p_lower or ("docker" in p_lower and not wants_compose)

        if not has_only and not (wants_compose or wants_nginx or wants_k8s or wants_docker):
            # Default: full suite
            wants_compose = wants_nginx = wants_k8s = wants_docker = True
        elif not has_only and ("full" in p_lower or "all" in p_lower):
            wants_compose = wants_nginx = wants_k8s = wants_docker = True

        has_frontend = topology.get('hasFrontend', False)
        has_backend = topology.get('hasBackend', False)
        fe_dir = topology.get('frontendDir', 'Frontend')
        be_dir = topology.get('backendDir', 'Backend')
        be_port = topology.get('backendPort', 8000)
        fe_port = topology.get('frontendPort', 3000)
        databases = topology.get('databases', ['PostgreSQL'])

        files = []

        # 1. Service Dockerfiles
        if wants_docker:
            if has_frontend:
                fe_dockerfile = f"""# ── Frontend Multi-Stage Build ──
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --prefer-offline --no-audit

COPY . .
RUN npm run build

# ── Production Runner (Nginx Alpine) ──
FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
RUN printf 'server {{\\n\\
    listen 80;\\n\\
    server_name localhost;\\n\\
    location / {{\\n\\
        root /usr/share/nginx/html;\\n\\
        index index.html index.htm;\\n\\
        try_files $uri $uri/ /index.html;\\n\\
    }}\\n\\
}}\\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
"""
                files.append({
                    "path": os.path.join(fe_dir, "Dockerfile"),
                    "content": fe_dockerfile,
                    "category": "Docker"
                })
                files.append({
                    "path": os.path.join(fe_dir, ".dockerignore"),
                    "content": "node_modules\ndist\nbuild\n.git\n.env*\n*.log\n.DS_Store\n",
                    "category": "Docker"
                })

            if has_backend:
                is_django = topology.get('backendType') == 'Django'
                cmd = (
                    f'CMD ["gunicorn", "--bind", "0.0.0.0:{be_port}", "--workers", "3", "--timeout", "120", "core.wsgi:application"]'
                    if is_django
                    else f'CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "{be_port}"]'
                )
                be_dockerfile = f"""# ── Backend Production Container ──
FROM python:3.11-slim-bullseye AS runner

ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1 \\
    PORT={be_port}

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc \\
    libpq-dev \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \\
    pip install --no-cache-dir -r requirements.txt && \\
    pip install --no-cache-dir gunicorn uvicorn

COPY . .

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE {be_port}

{cmd}
"""
                files.append({
                    "path": os.path.join(be_dir, "Dockerfile"),
                    "content": be_dockerfile,
                    "category": "Docker"
                })
                files.append({
                    "path": os.path.join(be_dir, ".dockerignore"),
                    "content": "__pycache__\n*.pyc\n*.pyo\n.venv\nvenv\n.git\n.env*\n*.sqlite3\nmedia\n*.log\n.DS_Store\n",
                    "category": "Docker"
                })

            if not has_frontend and not has_backend:
                files.append({
                    "path": "Dockerfile",
                    "content": "FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nEXPOSE 3000\nCMD [\"npm\", \"start\"]\n",
                    "category": "Docker"
                })
                files.append({
                    "path": ".dockerignore",
                    "content": "node_modules\n.git\n.env*\n*.log\n.DS_Store\n",
                    "category": "Docker"
                })

        # 2. docker-compose.yml
        if wants_compose:
            compose_services = []
            volumes = []

            if 'PostgreSQL' in databases:
                compose_services.append("""  postgres:
    image: postgres:15-alpine
    container_name: worklens_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_NAME:-worklens}
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres123}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-postgres}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app_network""")
                volumes.append("  postgres_data:")

            if 'Redis' in databases:
                compose_services.append("""  redis:
    image: redis:7-alpine
    container_name: worklens_redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - app_network""")
                volumes.append("  redis_data:")

            if has_backend:
                compose_services.append(f"""  backend:
    build:
      context: ./{be_dir}
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
      - "{be_port}:{be_port}"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - app_network""")

            if has_frontend:
                compose_services.append(f"""  frontend:
    build:
      context: ./{fe_dir}
      dockerfile: Dockerfile
    container_name: worklens_frontend
    restart: unless-stopped
    ports:
      - "80:80"
    depends_on:
      - backend
    networks:
      - app_network""")

            frontend_dependency = "- frontend\n      " if has_frontend else ""
            compose_services.append(f"""  nginx:
    image: nginx:alpine
    container_name: worklens_proxy
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      {frontend_dependency}- backend
    networks:
      - app_network""")

            joined_services = '\n\n'.join(compose_services)
            joined_volumes = '\n'.join(volumes)
            compose_str = f"""version: '3.8'

services:
{joined_services}

networks:
  app_network:
    driver: bridge

volumes:
{joined_volumes}
"""
            files.append({
                "path": "docker-compose.yml",
                "content": compose_str,
                "category": "Docker Compose"
            })

        # 3. nginx/nginx.conf
        if wants_nginx:
            frontend_upstream = f"""upstream frontend_web {{
        server frontend:80;
        keepalive 32;
    }}""" if has_frontend else ""

            frontend_location = """proxy_pass http://frontend_web;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;""" if has_frontend else """return 200 '{"status":"ok"}';
            add_header Content-Type application/json;"""

            nginx_conf = f"""user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {{
    worker_connections 1024;
}}

http {{
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    sendfile on;
    keepalive_timeout 65;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    upstream backend_api {{
        server backend:{be_port};
        keepalive 32;
    }}

    {frontend_upstream}

    server {{
        listen 80;
        server_name localhost;

        client_max_body_size 50M;

        # Security Headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;

        location /api/ {{
            proxy_pass http://backend_api;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }}

        location /ws/ {{
            proxy_pass http://backend_api;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "Upgrade";
            proxy_set_header Host $host;
        }}

        location / {{
            {frontend_location}
        }}
    }}
}}
"""
            files.append({
                "path": "nginx/nginx.conf",
                "content": nginx_conf,
                "category": "Nginx"
            })

        # 4. Kubernetes Manifests
        if wants_k8s:
            k8s_backend = f"""apiVersion: apps/v1
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
        - containerPort: {be_port}
        envFrom:
        - configMapRef:
            name: worklens-config
        - secretRef:
            name: worklens-secret
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
  - port: {be_port}
    targetPort: {be_port}
"""
            files.append({
                "path": "k8s/backend.yaml",
                "content": k8s_backend,
                "category": "Kubernetes"
            })

            if has_frontend:
                k8s_frontend = """apiVersion: apps/v1
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
"""
                files.append({
                    "path": "k8s/frontend.yaml",
                    "content": k8s_frontend,
                    "category": "Kubernetes"
                })

            backend_or_frontend_svc = 'worklens-frontend-svc' if has_frontend else 'worklens-backend-svc'
            ingress_port = 80 if has_frontend else be_port
            k8s_ingress = f"""apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: worklens-ingress
  annotations:
    kubernetes.io/ingress.class: "nginx"
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
              number: {be_port}
      - path: /
        pathType: Prefix
        backend:
          service:
            name: {backend_or_frontend_svc}
            port:
              number: {ingress_port}
"""
            files.append({
                "path": "k8s/ingress.yaml",
                "content": k8s_ingress,
                "category": "Kubernetes"
            })

            k8s_config = f"""apiVersion: v1
kind: ConfigMap
metadata:
  name: worklens-config
data:
  ENVIRONMENT: "production"
  PORT: "{be_port}"
  DATABASE_HOST: "postgres-svc"
  DATABASE_PORT: "5432"
"""
            files.append({
                "path": "k8s/configmap.yaml",
                "content": k8s_config,
                "category": "Kubernetes"
            })

            k8s_secret = """apiVersion: v1
kind: Secret
metadata:
  name: worklens-secret
type: Opaque
stringData:
  SECRET_KEY: "change-in-production-secret"
  DB_PASSWORD: "securepassword123"
"""
            files.append({
                "path": "k8s/secret.yaml",
                "content": k8s_secret,
                "category": "Kubernetes"
            })

        return files
