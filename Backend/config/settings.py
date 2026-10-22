"""
WorkLens Django Settings
"""
import os
from pathlib import Path
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent

import dotenv
dotenv.load_dotenv(BASE_DIR / '.env')

# ── Core ─────────────────────────────────────────────────────────
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'dev-secret-key-change-in-production')
DEBUG      = os.environ.get('DEBUG', 'True') == 'True'
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

# ── Apps ─────────────────────────────────────────────────────────
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    # WorkLens apps
    'apps.users',
    'apps.worklens',
    'apps.problems',
    'apps.knowledge',
    'apps.agents',
    'apps.analytics',
    'apps.assistance',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF    = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'

TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [],
    'APP_DIRS': True,
    'OPTIONS': {
        'context_processors': [
            'django.template.context_processors.debug',
            'django.template.context_processors.request',
            'django.contrib.auth.context_processors.auth',
            'django.contrib.messages.context_processors.messages',
        ],
    },
}]

# ── Database ─────────────────────────────────────────────────────
import dj_database_url  # noqa – installed with psycopg2-binary
_DB_URL = os.environ.get('DATABASE_URL', 'sqlite:///./worklens_dev.db')

# Gracefully fall back to SQLite for dev if psycopg2 / postgres is not available
try:
    DATABASES = {'default': dj_database_url.parse(_DB_URL, conn_max_age=600)}
except Exception:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'worklens_dev.db',
        }
    }

# ── Auth ─────────────────────────────────────────────────────────
AUTH_USER_MODEL = 'users.WorkLensUser'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
]

# ── REST Framework ────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',
        'user': '1000/hour',
    },
    'EXCEPTION_HANDLER': 'config.exceptions.worklens_exception_handler',
}

# ── JWT ───────────────────────────────────────────────────────────
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':  timedelta(hours=8),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': os.environ.get('JWT_SECRET', SECRET_KEY),
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ── CORS ─────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = os.environ.get(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:3000,http://localhost:5173,http://localhost:3456'
).split(',')

# ── Static / Media ────────────────────────────────────────────────
STATIC_URL  = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
LANGUAGE_CODE = 'en-us'
TIME_ZONE     = 'UTC'
USE_TZ        = True

# ── AI / WorkLens settings ────────────────────────────────────────
OLLAMA_BASE_URL  = os.environ.get('OLLAMA_BASE_URL', 'http://172.20.203.113:5011')
OLLAMA_MODEL     = os.environ.get('OLLAMA_MODEL', 'qwen3:8b')

# ── Hybrid retrieval scoring weights (§28) ────────────────────────
# Total should ideally sum to 1.0 but is not enforced — allows relative tuning.
# Override each individually via environment variables.
RETRIEVAL_WEIGHTS = {
    'semantic':  float(os.environ.get('RW_SEMANTIC',  '0.60')),  # cosine similarity
    'language':  float(os.environ.get('RW_LANGUAGE',  '0.15')),  # same language bonus
    'category':  float(os.environ.get('RW_CATEGORY',  '0.15')),  # same category bonus
    'verified':  float(os.environ.get('RW_VERIFIED',  '0.10')),  # verified-DNA bonus
}

HUMAN_API_RESPONSE_THRESHOLD = max(1, int(os.environ.get('HUMAN_API_RESPONSE_THRESHOLD', '4')))
# Prepared integration point only; credentials stay server-side.
COMPANY_GIT_BASE_URL = os.environ.get('COMPANY_GIT_BASE_URL', '')
COMPANY_GIT_ORGANIZATION = os.environ.get('COMPANY_GIT_ORGANIZATION', '')
COMPANY_GIT_TOKEN = os.environ.get('COMPANY_GIT_TOKEN', '')
