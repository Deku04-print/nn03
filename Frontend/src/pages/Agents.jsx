import { useCallback } from 'react';
import { api } from '../services/api.js';
import { usePolling } from '../hooks/usePolling.js';
import PageHeader from '../components/PageHeader.jsx';

export default function Agents() {
    const fetcher = useCallback(() => api.agents(), []);
    const { data, loading, error, refresh } = usePolling(fetcher);
    const interactions = data?.data || [];
    return <div className="nx-personal"><PageHeader title="AI Orchestrator" subtitle="Recorded agent activity from the existing workflow" />
        <button className="btn btn-outline" onClick={refresh}>Refresh</button>
        {loading && <p role="status">Loading agent activity…</p>}{error && <p className="nx-error" role="alert">{error}</p>}
        {!loading && !error && !interactions.length && <div className="nx-card">No agent interactions have been recorded yet.</div>}
        {interactions.map(row => <article className="nx-card" key={`${row.agent_name}-${row.action}`}><h2>{row.agent_name}</h2><p>{row.action} · {row.count} interactions</p><p>Average guidance level: {Number(row.avg_guidance).toFixed(1)} · Average latency: {Math.round(row.avg_latency)} ms</p></article>)}
    </div>;
}
