/**
 * PageHeader — professional header used across all admin pages.
 * Shows title, subtitle, live badge, breadcrumb, and optional action slot.
 */
export default function PageHeader({ title, subtitle, actions, live = false, icon }) {
    return (
        <div style={{
            marginBottom: 28,
            paddingBottom: 20,
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 20,
            flexWrap: 'wrap',
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                {icon && (
                    <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                        border: '1px solid #bfdbfe',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, color: '#3b82f6',
                    }}>
                        {icon}
                    </div>
                )}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <h1 style={{
                            fontSize: 22, fontWeight: 800, color: '#0f172a',
                            margin: 0, letterSpacing: '-0.025em', lineHeight: 1.2,
                        }}>{title}</h1>
                        {live && (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                fontSize: 11, fontWeight: 600, padding: '3px 9px',
                                borderRadius: 20, background: 'rgba(16,185,129,0.08)',
                                border: '1px solid rgba(16,185,129,0.2)', color: '#059669',
                            }}>
                                <span style={{
                                    width: 6, height: 6, borderRadius: '50%',
                                    background: '#10b981',
                                    boxShadow: '0 0 0 2px rgba(16,185,129,0.3)',
                                    animation: 'livePulse 2s ease infinite',
                                    display: 'inline-block',
                                }} />
                                Live
                            </span>
                        )}
                    </div>
                    {subtitle && (
                        <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                            {subtitle}
                        </p>
                    )}
                </div>
            </div>

            {actions && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {actions}
                </div>
            )}
        </div>
    );
}
