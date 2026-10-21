// Context Sanitizer — removes secrets/credentials before sending to backend
// Protects: API keys, JWT tokens, passwords, private keys, DB connection strings

const SECRET_PATTERNS = [
    // Generic API keys / tokens
    { pattern: /(['"]?(?:api[_-]?key|apikey|token|access[_-]?token|auth[_-]?token|secret)[_-]?\w*['"]?\s*[:=]\s*)['"]?[\w\-./+=]{16,}['"]?/gi, label: 'API_KEY' },
    // Passwords  
    { pattern: /(['"]?password['"]?\s*[:=]\s*)['"]?[^\s,;'"]{4,}['"]?/gi, label: 'PASSWORD' },
    // JWT tokens (three base64 parts separated by dots)
    { pattern: /eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g, label: 'JWT_TOKEN' },
    // Private key blocks
    { pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, label: 'PRIVATE_KEY' },
    // Database connection strings
    { pattern: /(?:postgresql|mysql|mongodb|redis):\/\/[^\s'"]+/gi, label: 'DB_CONNECTION' },
    // AWS credentials
    { pattern: /(?:AKIA|ASIA|AROA|AIDA)[A-Z0-9]{16}/g, label: 'AWS_KEY' },
    // Generic hex secrets (32+ hex chars often used as secrets)
    { pattern: /\b[0-9a-fA-F]{32,}\b/g, label: 'HEX_SECRET' },
];

/**
 * Redact secrets from a string.
 * @param {string} text
 * @returns {string}
 */
function redactString(text) {
    if (typeof text !== 'string') return text;
    let result = text;
    for (const { pattern, label } of SECRET_PATTERNS) {
        result = result.replace(pattern, (match, prefix) => {
            // If the pattern has a group (prefix), keep the key name, mask the value
            if (prefix) return `${prefix}[REDACTED_${label}]`;
            return `[REDACTED_${label}]`;
        });
    }
    return result;
}

/**
 * Recursively sanitize an object's string values.
 * @param {any} obj
 * @returns {any}
 */
function sanitizeContext(obj) {
    if (typeof obj === 'string') return redactString(obj);
    if (Array.isArray(obj)) return obj.map(sanitizeContext);
    if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeContext(value);
        }
        return sanitized;
    }
    return obj;
}

module.exports = { sanitizeContext };
