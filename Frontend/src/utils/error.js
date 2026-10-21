export function getErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
    if (!err) return fallback;

    // Server unreachable / no internet
    if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
        return 'Cannot reach the server. Please check your connection.';
    }
    if (err.status >= 500) return 'Server error. Please try again later.';

    // Prefer structured payloads from the backend
    let detail = err.detail ?? err.data?.detail ?? err.response?.data?.detail;

    // Message may be a JSON string like '{"detail":"Email already exists"}'
    if (detail === undefined && typeof err.message === 'string') {
        try {
            const parsed = JSON.parse(err.message);
            detail = parsed.detail ?? parsed.message ?? parsed.error;
        } catch {
            detail = err.message;
        }
    }

    // FastAPI/Pydantic validation errors: [{ loc: ['body','email'], msg: '...' }]
    if (Array.isArray(detail)) {
        const text = detail.map(d => {
            const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : null;
            const msg = (d.msg || '').replace(/^Value error, /, '');
            return field && field !== 'body' ? `${field}: ${msg}` : msg;
        }).join('. ');
        return text || fallback;
    }

    if (detail && typeof detail === 'object') detail = detail.message || detail.msg;

    // Python repr of DRF errors: "{'email': [ErrorDetail(string='msg', code='unique')]}"
    if (typeof detail === 'string' && detail.includes('ErrorDetail')) {
        const matches = [...detail.matchAll(/ErrorDetail\(string='([^']+)'/g)];
        if (matches.length) return matches.map(m => m[1]).join('. ');
    }

    // Never show stack traces, HTML error pages, or "[object Object]"
    if (typeof detail === 'string' && detail.trim()
        && !/\<html|Traceback|\[object|^\w*Error:/i.test(detail)) {
        return detail;
    }

    // Django REST Framework field errors: { email: ['already exists'], name: ['required'] }
    const body = err.data ?? err.response?.data;
    if (body && typeof body === 'object' && !Array.isArray(body)) {
        const messages = Object.entries(body)
            .filter(([, v]) => v)
            .map(([field, v]) => {
                const msgs = Array.isArray(v) ? v : [v];
                const text = msgs.map(m => (typeof m === 'string' ? m : m?.string ?? String(m))).join(', ');
                const label = field === 'non_field_errors' ? '' : `${field}: `;
                return `${label}${text}`;
            })
            .join('. ');
        if (messages.trim()) return messages;
    }

    return fallback;
}