export default function LiveBadge({ lastUpdated, onRefresh, interval = 300 }) {
  const time = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="live-status">
      <span className="live-status-dot" aria-hidden="true" />
      <span>{time ? `Updated ${time}` : 'Live'}</span>
      {onRefresh && (
        <>
          <span className="live-status-separator" aria-hidden="true">·</span>
          <span className="live-status-caption">Refreshes every {interval}s</span>
          <button className="live-refresh-button" type="button" onClick={onRefresh} title="Refresh now">
            Refresh
          </button>
        </>
      )}
    </div>
  );
}
