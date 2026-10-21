/**
 * Pagination – Professional numbered pagination component.
 */
export default function Pagination({ page, totalPages, onPage }) {
    if (totalPages <= 1) return null;

    const pages = [];
    const delta = 2;
    const left = Math.max(2, page - delta);
    const right = Math.min(totalPages - 1, page + delta);

    pages.push(1);
    if (left > 2) pages.push('…');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push('…');
    if (totalPages > 1) pages.push(totalPages);

    const btnStyle = (active) => ({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 34,
        height: 34,
        padding: '0 6px',
        borderRadius: 8,
        border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
        background: active ? 'var(--accent)' : 'var(--bg-card)',
        color: active ? '#fff' : 'var(--text-dim)',
        fontFamily: 'var(--font)',
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        transition: 'all 140ms',
        lineHeight: 1,
    });

    const arrowStyle = (disabled) => ({
        ...btnStyle(false),
        color: disabled ? 'var(--border)' : 'var(--text-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
    });

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <button
                style={arrowStyle(page <= 1)}
                disabled={page <= 1}
                onClick={() => onPage(page - 1)}
                title="Previous page"
            >
                ‹
            </button>
            {pages.map((p, i) => (
                typeof p === 'number' ? (
                    <button
                        key={p}
                        style={btnStyle(p === page)}
                        onClick={() => onPage(p)}
                        onMouseEnter={e => { if (p !== page) { e.target.style.background = 'var(--bg-hover)'; e.target.style.color = 'var(--text)'; }}}
                        onMouseLeave={e => { if (p !== page) { e.target.style.background = 'var(--bg-card)'; e.target.style.color = 'var(--text-dim)'; }}}
                    >
                        {p}
                    </button>
                ) : (
                    <span key={`ellipsis-${i}`} style={{ color: 'var(--text-muted)', fontSize: 14, padding: '0 2px' }}>…</span>
                )
            ))}
            <button
                style={arrowStyle(page >= totalPages)}
                disabled={page >= totalPages}
                onClick={() => onPage(page + 1)}
                title="Next page"
            >
                ›
            </button>
        </div>
    );
}
