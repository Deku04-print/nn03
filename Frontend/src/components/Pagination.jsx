/** Accessible, stylesheet-driven pagination for dashboard tables and lists. */
export default function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;

  const pages = [];
  const delta = 2;
  const left = Math.max(2, page - delta);
  const right = Math.min(totalPages - 1, page + delta);

  pages.push(1);
  if (left > 2) pages.push('…');
  for (let current = left; current <= right; current += 1) pages.push(current);
  if (right < totalPages - 1) pages.push('…');
  if (totalPages > 1) pages.push(totalPages);

  return (
    <nav className="pagination" aria-label="Pagination">
      <button className="pagination-button pagination-arrow" type="button" disabled={page <= 1}
        onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
      {pages.map((item, index) => typeof item === 'number' ? (
        <button key={item} className={`pagination-button${item === page ? ' is-active' : ''}`}
          type="button" aria-current={item === page ? 'page' : undefined}
          onClick={() => onPage(item)}>{item}</button>
      ) : <span className="pagination-ellipsis" key={`ellipsis-${index}`} aria-hidden="true">…</span>)}
      <button className="pagination-button pagination-arrow" type="button" disabled={page >= totalPages}
        onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
    </nav>
  );
}
