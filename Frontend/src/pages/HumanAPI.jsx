import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api.js';

export default function HumanAPI() {
    const { caseId } = useParams();
    const navigate = useNavigate();
    const [context, setContext] = useState(null);
    const [experts, setExperts] = useState(null);
    const [search, setSearch] = useState('');
    const [skill, setSkill] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState('');
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let active = true;
        setError(''); setExperts(null);
        const timer = setTimeout(async () => {
            try {
                const [c, e] = await Promise.all([
                    api.assistance(`cases/?case_id=${caseId}`),
                    api.assistance(`experts/?${new URLSearchParams({ case_id: caseId, search, skill })}`),
                ]);
                if (active) { setContext(c); setExperts(e.experts); }
            } catch (e) { if (active) setError(e.message); }
        }, 200);
        return () => { active = false; clearTimeout(timer); };
    }, [caseId, search, skill, retry]);
    async function start(expert, mode) {
        setBusy(expert.id + mode); setError('');
        try {
            const session = await api.assistance('sessions/', { case_id: caseId, expert_id: expert.id, mode });
            navigate(`/human-api/chat/${session.id}`);
        } catch (e) { setError(e.message); } finally { setBusy(''); }
    }
    return <main className="nx-focus">
        <header className="nx-top"><Link to="/" className="nx-brand">NEXUS</Link><span>Expert assistance</span><Link to="/">Return to my dashboard</Link></header>
        <div className="nx-intro"><span className="nx-eyebrow">Human API</span><h1>A fresh perspective on your problem.</h1>
            <p>Find a colleague with relevant skills, or explore approved knowledge from a former employee.</p></div>
        {context && <details className="nx-card nx-context"><summary>{context.shared_context.summary}</summary><p>Only this reviewed context is shared with the selected expert.</p><pre>{context.shared_context.history}</pre>{context.shared_context.share_code && <pre>{context.shared_context.selected_code}</pre>}</details>}
        <div className="nx-filters"><input aria-label="Search experts" placeholder="Search by name or skill" value={search} onChange={e => setSearch(e.target.value)} />
            <input aria-label="Filter by approved skill" placeholder="Exact skill, e.g. React" value={skill} onChange={e => setSkill(e.target.value)} /><button className="nx-secondary" onClick={() => setRetry(n => n + 1)}>Refresh</button></div>
        {error && <div role="alert" className="nx-error">{error} <button onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
        {!experts && !error && <p role="status">Finding relevant experts…</p>}
        {experts?.length === 0 && <div className="nx-card"><h2>No matching expert is available</h2><p>Your escalation context is saved. Clear filters or return later when an administrator makes an expert available.</p></div>}
        <div className="nx-experts">{experts?.map(expert => <article className="nx-card nx-expert" key={expert.id}>
            <div className="nx-expert-head"><span className="nx-avatar">{expert.name.split(' ').slice(0, 2).map(n => n[0]).join('')}</span><div><h2>{expert.name}</h2><span className={`nx-status ${expert.availability}`}>{expert.organizational_status_label} · {expert.availability}</span></div></div>
            {expert.is_demo && <span className="nx-demo">Fictional demonstration profile</span>}<p>{expert.bio}</p>
            <div className="nx-skills">{expert.skills.map(s => <span className={expert.matched_skills.includes(s) ? 'matched' : ''} key={s}>{s}</span>)}</div>
            {expert.git_verified_at ? <p>Verified Git contributions: {JSON.stringify(expert.git_contributions)}</p> : expert.is_demo ? <p className="nx-muted">Synthetic contributions · {expert.git_contributions.sample_commits} sample commits</p> : <p className="nx-muted">Verified Git contribution data not supplied</p>}
            <p className="nx-muted">{expert.rating ? `${expert.rating}/5 · ${expert.feedback_count} human-session ratings` : 'No published human-assistance rating yet'}</p>
            <div className="nx-actions">{expert.human_eligible && <button disabled={!!busy || expert.availability !== 'available'} onClick={() => start(expert, 'human')}>{busy === expert.id + 'human' ? 'Requesting…' : 'Request assistance'}</button>}
                {expert.visual_eligible && <button className="nx-secondary" disabled={!!busy} onClick={() => start(expert, 'visual')}>{busy === expert.id + 'visual' ? 'Opening…' : 'Open Visual Expert'}</button>}</div>
            {expert.visual_eligible && <small>AI-generated assistance using approved historical technical information.</small>}
        </article>)}</div>
    </main>;
}
