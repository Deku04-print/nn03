import { useCallback, useState } from 'react';
import { api } from '../services/api.js';
import { useAssistancePolling } from '../hooks/useAssistancePolling.js';
import PageHeader from '../components/PageHeader.jsx';

export default function UserDashboard() {
    const fetcher = useCallback(async () => {
        const [dashboard, notifications] = await Promise.all([api.assistance('dashboard/'), api.assistance('notifications/')]);
        return { ...dashboard, ...notifications };
    }, []);
    const { data, error, refresh } = useAssistancePolling(fetcher, 10000);
    const [actionError, setActionError] = useState('');
    return <div className="nx-personal"><PageHeader title="My dashboard" subtitle="Your troubleshooting history, progress, and notifications" />
        {(error || actionError) && <p className="nx-error" role="alert">{error || actionError}</p>}
        {!data && !error && <p role="status">Loading your workspace…</p>}
        {data && <><div className="nx-personal-grid"><section className="nx-card"><span className="nx-eyebrow">Personal profile</span><h2>{data.profile.name}</h2><p>{data.profile.email}</p><p>{data.total_problems} problems · {data.resolved_problems} resolved</p></section>
            <section className="nx-card"><h2>Notifications {data.unread_count > 0 && `(${data.unread_count})`}</h2>{!data.notifications.length && <p>No notifications yet.</p>}{data.notifications.map(n => <div className="nx-notification" key={n.id}><span>{n.title}<small>{new Date(n.created_at).toLocaleString()}</small></span>{!n.read_at && <button className="nx-secondary" onClick={async () => { try { await api.assistance('notifications/', { id: n.id }); refresh(); } catch (e) { setActionError(e.message); } }}>Mark read</button>}</div>)}<small>Open session notifications from the bell in your VS Code extension.</small></section></div>
            <section className="nx-card"><h2>My problem history</h2>{!data.problems.length && <p>Your extension conversations will appear here when you start troubleshooting.</p>}{data.problems.map(p => <details className="nx-history" key={p.id}><summary>{p.description || 'Troubleshooting problem'} <span className="nx-muted">{p.language} · {p.status}</span></summary>{data.conversations.filter(t => t.problem_id === p.id).reverse().map(t => <div className="nx-history-turn" key={t.id}><p><strong>You:</strong> {t.question || 'Code analysis'}</p><p><strong>NEXUS:</strong> {t.response.message || [t.response.observation, t.response.insight, ...(t.response.next_steps || [])].filter(Boolean).join('\n')}</p></div>)}</details>)}</section>
            <section className="nx-card"><h2>Assistance outcomes</h2>{!data.assistance_outcomes.length && <p>No assistance sessions yet.</p>}{data.assistance_outcomes.map(s => <p key={s.id}>{s.mode === 'human' ? 'Human assistance' : 'AI historical knowledge'} · {s.status} · {s.outcome}<small className="nx-block">{s.resolution_summary}</small></p>)}</section>
        </>}
    </div>;
}
