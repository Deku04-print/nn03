import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

const EMPTY = { eligible: false, bio: '', skills: [], organizational_status: 'active', availability: 'offline', visual_enabled: false, git_identity: '' };

export default function ExpertSettings({ userId }) {
    const [form, setForm] = useState(null);
    const [knowledge, setKnowledge] = useState([]);
    const [audit, setAudit] = useState([]);
    const [note, setNote] = useState({ title: '', content: '', source_reference: '', approved: false });
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [reviews, setReviews] = useState(null);
    async function load() {
        const data = await api.expertSettings(userId);
        setForm(data.profile ? Object.fromEntries(Object.keys(EMPTY).map(k => [k, data.profile[k] ?? EMPTY[k]])) : EMPTY);
        setKnowledge(data.knowledge); setAudit(data.audit);
    }
    useEffect(() => { load().catch(e => setError(e.message)); }, [userId]);
    async function run(fn) {
        setBusy(true); setError(''); setMessage('');
        try { await fn(); await load(); setMessage('Saved.'); } catch (e) { setError(e.message); } finally { setBusy(false); }
    }
    const change = (key, value) => setForm(f => ({ ...f, [key]: value }));
    return <details className="nx-expert-settings"><summary>Expert eligibility & approved knowledge</summary>
        {error && <p className="nx-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
        {!form ? <p>Loading expert settings…</p> : <>
            <label><input type="checkbox" checked={form.eligible} onChange={e => change('eligible', e.target.checked)} /> Eligible expert (retains normal user access)</label>
            <label>Organizational status<select value={form.organizational_status} onChange={e => change('organizational_status', e.target.value)}><option value="active">Active</option><option value="exited">Exited Organization</option></select></label>
            <label>Availability<select value={form.availability} onChange={e => change('availability', e.target.value)}>{['available', 'offline', 'busy'].map(a => <option key={a} value={a}>{a}</option>)}</select></label>
            <label>Approved competencies (comma separated)<input value={form.skills.join(', ')} onChange={e => change('skills', e.target.value.split(',').map(s => s.trim()))} /></label>
            <label>Profile description<textarea value={form.bio} onChange={e => change('bio', e.target.value)} /></label>
            <label>Git identity<input value={form.git_identity} onChange={e => change('git_identity', e.target.value)} /></label>
            <label><input type="checkbox" checked={form.visual_enabled} onChange={e => change('visual_enabled', e.target.checked)} /> Permit Visual Expert when Exited Organization and approved knowledge exists</label>
            <button type="button" className="btn btn-accent" disabled={busy} onClick={() => run(() => api.expertSettings(userId, { ...form, skills: form.skills.filter(Boolean) }))}>Save expert settings</button>
            <h3>Approved historical knowledge</h3><p>Use only technical information authorized for organization-wide reuse. Source references are retained.</p>
            {knowledge.map(k => <div key={k.id}><strong>{k.title}</strong><p>{k.source_reference} · {k.approved ? 'Approved' : 'Unapproved'}</p><button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(() => api.knowledge(userId, { approved: !k.approved }, k.id))}>{k.approved ? 'Revoke approval' : 'Approve'}</button></div>)}
            {['title', 'source_reference'].map(key => <label key={key}>{key.replace('_', ' ')}<input value={note[key]} onChange={e => setNote(n => ({ ...n, [key]: e.target.value }))} /></label>)}
            <label>Technical knowledge<textarea value={note.content} onChange={e => setNote(n => ({ ...n, content: e.target.value }))} /></label>
            <label><input type="checkbox" checked={note.approved} onChange={e => setNote(n => ({ ...n, approved: e.target.checked }))} /> I approve this knowledge for organization-wide technical reuse</label>
            <button type="button" className="btn btn-outline" disabled={busy || !note.title.trim() || !note.content.trim() || !note.source_reference.trim()} onClick={() => run(async () => { await api.knowledge(userId, note); setNote({ title: '', content: '', source_reference: '', approved: false }); })}>Add knowledge</button>
            <details><summary>Status & knowledge audit ({audit.length})</summary>{audit.map(a => <p key={a.id}>{new Date(a.created_at).toLocaleString()} · actor {a.actor_id || 'system'}<br />{JSON.stringify(a.changes)}</p>)}</details>
            <button type="button" className="btn btn-outline" onClick={async () => { try { setReviews(await api.assistance('admin/reviews/')); } catch (e) { setError(e.message); } }}>Review session outcomes & feedback</button>
            {reviews && <details open><summary>Authorized assistance review</summary>{reviews.sessions.map(s => <p key={s.id}>{s.mode} · {s.status} · {s.outcome}<br />{s.resolution_summary}{reviews.feedback.filter(f => f.session_id === s.id).map(f => <small className="nx-block" key={f.session_id}>{f.rating}/5 · {f.resolved ? 'Resolved' : 'Unresolved'} · {f.comment}</small>)}</p>)}</details>}
        </>}
    </details>;
}
