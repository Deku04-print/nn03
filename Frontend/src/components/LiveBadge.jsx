/**
 * LiveBadge — shows "LIVE" pulse dot + last-updated time + manual refresh button
 */
export default function LiveBadge({ lastUpdated, onRefresh, interval = 300 }) {
    const timeStr = lastUpdated
        ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '—';

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 12,
            color: 'var(--text-muted)',
        }}>
            {/* Pulsing live dot */}
            <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10 }}>
                <span style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: '#22d3a0',
                    opacity: 0.5,
                    animation: 'livePulse 1.5s ease-in-out infinite',
                }} />
                <span style={{
                    position: 'relative',
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#22d3a0',
                }} />
            </span>

            <span>
                LIVE &nbsp;·&nbsp; updated {timeStr} &nbsp;·&nbsp; refreshes every {interval}s
            </span>

            <button
                onClick={onRefresh}
                title="Refresh now"
                style={{
                    background: 'none',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '2px 8px',
                    fontSize: 11,
                    transition: 'all 150ms',
                }}
                onMouseEnter={e => { e.target.style.color = 'var(--text)'; e.target.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={e => { e.target.style.color = 'var(--text-muted)'; e.target.style.borderColor = 'var(--border)'; }}
            >
                ↺ Refresh
            </button>

            <style>{`
        @keyframes livePulse {
          0%, 100% { transform: scale(1);   opacity: 0.5; }
          50%       { transform: scale(1.8); opacity: 0;   }
        }
      `}</style>
        </div>
    );
}