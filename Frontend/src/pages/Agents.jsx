/**
 * WorkLens API service — communicates with Django backend.
 * Reads VITE_API_URL from env or falls back to '' (uses Vite proxy in dev).
 */
const BASE = import.meta.env.VITE_API_URL || '';

let _token = localStorage.getItem('wl_token') || null;

export function getToken() { return _token; }
export function isSignedIn() { return !!_token; }

export function saveToken(t) {
    _token = t;
    localStorage.setItem('wl_token', t);
}

export function clearToken() {
    _token = null;
    localStorage.removeItem('wl_token');
}

async function request(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (_token) headers['Authorization'] = `Bearer ${_token}`;

    const res = await fetch(`${BASE}${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) { clearToken(); window.location.href = '/login'; }
    if (!res.ok) {
        const err = new Error(data?.detail || data?.error?.message || `Error ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

export const api = {
    // Auth
    login: (email, password) =>
        request('/api/auth/login/', { method: 'POST', body: JSON.stringify({ email, password }) }),
    me: () => request('/api/auth/me/'),

    // Analytics
    overview: () => request('/api/analytics/overview/'),
    problems: () => request('/api/analytics/problems/'),
    categories: () => request('/api/analytics/categories/'),
    problemUsers: (params = {}) =>
        request('/api/analytics/problem-users/?' + new URLSearchParams(params).toString()),
    resolution: () => request('/api/analytics/resolution/'),
    agents: () => request('/api/analytics/agents/'),
    developersList: () => request('/api/analytics/developers/'),
    developerDetail: (userId) => request(`/api/analytics/developers/${userId}/`),

    // Problems  / ProblemDNA
    problemsList: (params = {}) => {
        const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
        return request(`/api/problems/${qs}`);
    },
    problemDetail: (id) => request(`/api/problems/${id}/`),
    updateProblemDNA: (id, data) => request(`/api/problems/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    problemAnalytics: () => request('/api/problems/analytics/'),
    similarProblems: (q, lang = '', cat = '') =>
        request(`/api/problems/similar/?q=${encodeURIComponent(q)}&language=${encodeURIComponent(lang)}&category=${encodeURIComponent(cat)}`),

    // User Management (admin)
    listUsers: (params = {}) => request('/api/admin/users/?' + new URLSearchParams(params).toString()),
    createUser: (data) => request('/api/admin/users/', { method: 'POST', body: JSON.stringify(data) }),
    updateUser: (id, data) => request(`/api/admin/users/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteUser: (id) => request(`/api/admin/users/${id}/`, { method: 'DELETE' }),
    getBatches: () => request('/api/admin/users/batches/'),
    userStats: (id) => request(`/api/admin/users/${id}/stats/`),
    bulkUpload: (file) => {
        const fd = new FormData();
        fd.append('file', file);
        const headers = {};
        if (_token) headers['Authorization'] = `Bearer ${_token}`;
        return fetch(`${BASE}/api/admin/users/bulk-upload/`, { method: 'POST', body: fd, headers })
            .then(r => r.json());
    },
};

