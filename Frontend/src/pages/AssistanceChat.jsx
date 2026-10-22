import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useAssistancePolling } from '../hooks/useAssistancePolling.js';

export default function AssistanceChat() {
    const { sessionId } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const fetchSession = useCallback(async () => {
        const [session, messages] = await Promise.all([api.assistance(`sessions/${sessionId}/`), api.assistance(`sessions/${sessionId}/messages/`)]);
        return { session, ...messages };
    }, [sessionId]);
    const { data, error: connectionError, refresh } = useAssistancePolling(fetchSession);
    const session = data?.session;
    const [messages, setMessages] = useState([]);
    const [draft, setDraft] = useState('');
    const [pending, setPending] = useState(null);
    const [sending, setSending] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [ending, setEnding] = useState(false);
    const [summary, setSummary] = useState('');
    const [outcome, setOutcome] = useState('unresolved');
    const [feedbackDone, setFeedbackDone] = useState(false);
    const [feedbackSuccess, setFeedbackSuccess] = useState(false);
    const [rating, setRating] = useState(0);
    const [resolved, setResolved] = useState(false);
    const [understandable, setUnderstandable] = useState(true);
    const [comment, setComment] = useState('');
    const [experts, setExperts] = useState([]);
    const [switchMode, setSwitchMode] = useState(null);
    const [older, setOlder] = useState(false);
    const hasLoadedOlder = useRef(false);
    const stream = useRef(null);
    const stayAtBottom = useRef(true);
    const owner = session?.requester_id === user?.id;

    useEffect(() => {
        setMessages([]); setDraft(''); setPending(null); setFeedbackDone(false); setFeedbackSuccess(false);
        setError(''); setEnding(false); setExperts([]); setOlder(false); stayAtBottom.current = true;
        hasLoadedOlder.current = false;
    }, [sessionId]);
    useEffect(() => {
        if (!data) return;
        setMessages(previous => {
            const map = new Map(previous.map(m => [m.id, m]));
            data.messages.forEach(m => map.set(m.id, m));
            return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
        });
        if (!hasLoadedOlder.current) setOlder(data.has_older);
    }, [data]);
    useEffect(() => {
        if (stayAtBottom.current && stream.current) stream.current.scrollTop = stream.current.scrollHeight;
    }, [messages]);
    useEffect(() => {
        if (!owner || !session?.case_id) return;
        let active = true;
        api.assistance(`experts/?case_id=${session.case_id}`).then(r => { if (active) setExperts(r.experts); }).catch(() => {});
        return () => { active = false; };
    }, [owner, session?.case_id]);
    useEffect(() => {
        if (session?.status !== 'active') return;
        const warn = e => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [session?.status]);

    async function act(action, extra = {}) {
        setBusy(true); setError('');
        try { await api.assistance(`sessions/${sessionId}/`, { action, ...extra }); refresh(); return true; }
        catch (e) { setError(e.message); return false; }
        finally { setBusy(false); }
    }
    async function send(event) {
        event?.preventDefault();
        if (sending) return;
        const item = pending || { text: draft.trim(), client_id: crypto.randomUUID ? crypto.randomUUID() : uuid() };
        if (!item.text) return;
        setPending(item); setSending(true); setError('');
        try {
            await api.assistance(`sessions/${sessionId}/messages/`, item);
            setPending(null); setDraft(''); stayAtBottom.current = true; refresh();
        } catch (e) { setError(e.message + ' Your message can be retried safely.'); }
        finally { setSending(false); }
    }
    // crypto.randomUUID requires a secure context; the authorized LAN HTTP demo still needs stable retry IDs.
    function uuid() {
        const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
        const h = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }
    async function chooseMode(mode) {
        if (mode === session.mode) return;
        if (session.mode === 'human' && ['active', 'pending'].includes(session.status)) {
            if (!window.confirm('End this human session before switching modes? You can submit or skip feedback next. Human messages will stay in this session.')) return;
            setSwitchMode(mode); setEnding(true); return;
        }
        await startMode(mode);
    }
    async function startMode(mode) {
        setBusy(true); setError('');
        try {
            const expert = experts.find(e => mode === 'visual' ? e.visual_eligible : e.human_eligible && e.availability === 'available');
            if (!expert) throw new Error('No eligible expert is available for this mode.');
            const next = await api.assistance('sessions/', { case_id: session.case_id, expert_id: expert.id, mode });
            setSwitchMode(null); navigate(`/human-api/chat/${next.id}`);
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }
    function finishFeedback() {
        setFeedbackDone(true);
        if (switchMode) startMode(switchMode);
    }
    async function feedback(e) {
        e.preventDefault(); setBusy(true); setError('');
        try {
            await api.assistance(`sessions/${sessionId}/feedback/`, { resolved, rating, understandable, comment });
            setFeedbackSuccess(true);
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }
    async function loadOlder() {
        setBusy(true);
        try {
            const page = await api.assistance(`sessions/${sessionId}/messages/?before=${messages[0].id}`);
            hasLoadedOlder.current = true;
            setMessages(prev => [...page.messages, ...prev]); setOlder(page.has_older);
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    }
    const bothModes = owner && experts.some(e => e.visual_eligible) && experts.some(e => e.human_eligible && e.availability === 'available');
    const needFeedback = owner && session?.status === 'ended' && !session.feedback_submitted && !feedbackDone;
    return <main className="nx-focus nx-chat">
        <header className="nx-top"><Link to="/" className="nx-brand" onClick={e => { if (session?.status === 'active' && !window.confirm('Leave this page? The session remains active until you end it.')) e.preventDefault(); }}>NEXUS</Link>
            <div><strong>{session?.title || 'Troubleshooting session'}</strong><small className="nx-block">{session?.expert.name} · {session?.status}</small></div>
            {bothModes && <div className="nx-toggle" aria-label="Chat mode">{['human', 'visual'].map(mode => <button key={mode} className={session.mode === mode ? 'selected' : ''} disabled={busy || ending || needFeedback} onClick={() => chooseMode(mode)}>{mode === 'human' ? 'Human API' : 'Visual Expert'}</button>)}</div>}
            {session && ['pending', 'active'].includes(session.status) && <button className="nx-secondary" disabled={busy || sending} onClick={() => setEnding(true)}>End session</button>}
        </header>
        <div className="nx-chat-meta"><span>{session?.mode === 'visual' ? 'Visual Expert · AI-generated assistant using approved historical technical information' : 'Human API · Messages from real participants'}</span><span role="status">{connectionError ? 'Reconnecting automatically…' : data ? 'Connected · polls every 2 seconds' : 'Connecting…'}</span></div>
        {(error || connectionError) && <p className="nx-error" role="alert">{error || connectionError}</p>}
        {!session && !connectionError && <p role="status">Loading session…</p>}
        {session && <details className="nx-card nx-context"><summary>Authorized problem context</summary><pre>{session.shared_context.summary}</pre><pre>{session.shared_context.history}</pre>{session.shared_context.share_code && <pre>{session.shared_context.selected_code}</pre>}</details>}
        {session?.status === 'pending' && <div className="nx-card"><h2>Waiting for the expert</h2><p>The expert has been notified. This page checks automatically.</p>{!owner && <div className="nx-actions"><button disabled={busy} onClick={() => act('accept')}>Accept request</button><button className="nx-secondary" disabled={busy} onClick={() => act('reject')}>Decline</button></div>}</div>}
        <div className="nx-stream" ref={stream} onScroll={() => { const el = stream.current; stayAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }} role="log" aria-label="Session messages">
            {older && <button className="nx-secondary" disabled={busy} onClick={loadOlder}>Load earlier messages</button>}
            {!messages.length && session?.status === 'active' && <div className="nx-chat-empty"><h2>Make the next step clearer.</h2><p>{session.mode === 'human' ? 'Start with what you have tried and what still fails.' : 'Ask a technical question. Answers cite approved knowledge and disclose gaps.'}</p></div>}
            {messages.map(m => <article key={m.id} className={`nx-bubble ${m.author_id === user?.id ? 'mine' : ''}`}><div className="nx-message-meta"><strong>{m.kind === 'ai' ? 'Visual Expert · AI' : m.author_id === user?.id ? 'You' : m.author_id === session?.requester_id ? 'Requesting user' : session?.expert.name}</strong><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><p>{m.text}</p>
                {!!m.sources.length && <details><summary>Approved evidence ({m.sources.length})</summary>{m.sources.map(s => <p key={s.id}>{s.title} · {s.reference} · {s.evidence}</p>)}<small>Diagnostic suggestions are model inference; source approval does not verify the generated answer.</small></details>}</article>)}
            {pending && <div className="nx-pending">{pending.text}<small>{sending ? 'Sending…' : 'Not delivered completely · retry below'}</small></div>}
        </div>
        {session?.status === 'active' && <form className="nx-composer" onSubmit={send}><textarea aria-label="Message" maxLength={10000} value={draft} disabled={!!pending} onChange={e => setDraft(e.target.value)} placeholder="Describe what you observed…" /><button disabled={sending || (!pending && !draft.trim())}>{sending ? 'Sending…' : pending ? 'Retry' : 'Send'}</button></form>}
        {ending && <div className="nx-overlay"><form className="nx-card nx-dialog" onSubmit={async e => { e.preventDefault(); if (await act('end', { outcome, resolution_summary: summary })) setEnding(false); }}><h2>Record the outcome</h2><label>Problem outcome<select value={outcome} onChange={e => setOutcome(e.target.value)}><option value="unresolved">Unresolved / needs follow-up</option><option value="resolved">Reported resolved</option></select></label><label>Resolution summary<textarea maxLength={10000} value={summary} onChange={e => setSummary(e.target.value)} placeholder="What helped, what remains, and how to verify" /></label><div className="nx-actions"><button disabled={busy || sending}>End session safely</button><button type="button" className="nx-secondary" onClick={() => { setEnding(false); setSwitchMode(null); }}>Cancel</button></div>{error && <p role="alert" className="nx-error">{error}</p>}</form></div>}
        {(needFeedback || feedbackSuccess) && <div className="nx-overlay"><div className="nx-card nx-dialog">{feedbackSuccess ? <><h2>Thank you. Your feedback is saved.</h2><button onClick={() => { setFeedbackSuccess(false); finishFeedback(); }}>Continue</button></> : <form onSubmit={feedback}><span className="nx-eyebrow">{session.mode === 'human' ? 'Human session feedback' : 'AI-quality feedback · Visual Expert'}</span><h2>How did the session help?</h2><label><input type="checkbox" checked={resolved} onChange={e => setResolved(e.target.checked)} /> My problem was resolved</label><fieldset><legend>{session.mode === 'human' ? 'How helpful was the expert?' : 'How helpful was the AI assistant?'}</legend><div className="nx-stars">{[1, 2, 3, 4, 5].map(n => <button type="button" key={n} aria-label={`${n} stars`} aria-pressed={rating === n} onClick={() => setRating(n)}>{n <= rating ? '★' : '☆'}</button>)}</div></fieldset><label><input type="checkbox" checked={understandable} onChange={e => setUnderstandable(e.target.checked)} /> The explanation was understandable</label><label>Optional feedback<textarea value={comment} maxLength={4000} onChange={e => setComment(e.target.value)} /></label><div className="nx-actions"><button disabled={busy || !rating}>Save feedback</button><button type="button" className="nx-secondary" disabled={busy} onClick={finishFeedback}>Skip feedback</button></div>{error && <p className="nx-error" role="alert">{error}</p>}</form>}</div></div>}
        {session && ['ended', 'rejected'].includes(session.status) && !needFeedback && !feedbackSuccess && <div className="nx-actions nx-closed"><p>Session {session.status}. {session.resolution_summary}</p><Link to={owner ? `/human-api/${session.case_id}` : '/'}>Return to previous context</Link></div>}
    </main>;
}
