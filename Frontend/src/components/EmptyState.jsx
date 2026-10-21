/**
 * EmptyState – Professional fallback component with contextual SVG illustration.
 */
export default function EmptyState({ title, description, icon = 'data' }) {
    const icons = {
        data: (
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="10" y="20" width="60" height="8" rx="4" fill="#e2e8f0"/>
                <rect x="10" y="34" width="44" height="8" rx="4" fill="#e2e8f0"/>
                <rect x="10" y="48" width="52" height="8" rx="4" fill="#e2e8f0"/>
                <circle cx="64" cy="52" r="14" fill="#eff6ff" stroke="#bfdbfe" strokeWidth="2"/>
                <line x1="64" y1="46" x2="64" y2="52" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="64" cy="55" r="1.5" fill="#93c5fd"/>
            </svg>
        ),
        agents: (
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="20" y="16" width="40" height="30" rx="6" fill="#eff6ff" stroke="#bfdbfe" strokeWidth="2"/>
                <circle cx="32" cy="31" r="4" fill="#93c5fd"/>
                <circle cx="48" cy="31" r="4" fill="#93c5fd"/>
                <rect x="30" y="38" width="20" height="3" rx="1.5" fill="#bfdbfe"/>
                <line x1="40" y1="46" x2="40" y2="58" stroke="#bfdbfe" strokeWidth="2"/>
                <rect x="28" y="54" width="24" height="10" rx="4" fill="#e2e8f0"/>
            </svg>
        ),
        patterns: (
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="12" y="50" width="10" height="20" rx="2" fill="#dbeafe"/>
                <rect x="26" y="38" width="10" height="32" rx="2" fill="#bfdbfe"/>
                <rect x="40" y="28" width="10" height="42" rx="2" fill="#93c5fd"/>
                <rect x="54" y="20" width="10" height="50" rx="2" fill="#60a5fa"/>
                <line x1="10" y1="72" x2="70" y2="72" stroke="#e2e8f0" strokeWidth="2"/>
                <polyline points="17,52 31,40 45,30 59,22" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3"/>
            </svg>
        ),
        learning: (
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="14" y="22" width="40" height="36" rx="5" fill="#eff6ff" stroke="#bfdbfe" strokeWidth="2"/>
                <line x1="22" y1="34" x2="46" y2="34" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round"/>
                <line x1="22" y1="42" x2="38" y2="42" stroke="#bfdbfe" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="58" cy="30" r="12" fill="#fef3c7" stroke="#fde68a" strokeWidth="2"/>
                <line x1="58" y1="24" x2="58" y2="30" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="58" cy="33" r="1.5" fill="#f59e0b"/>
            </svg>
        ),
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '64px 24px',
            gap: 16,
        }}>
            <div style={{
                padding: 20,
                borderRadius: 20,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
            }}>
                {icons[icon] || icons.data}
            </div>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                    {title}
                </div>
                <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 320, lineHeight: 1.6 }}>
                    {description}
                </div>
            </div>
        </div>
    );
}
