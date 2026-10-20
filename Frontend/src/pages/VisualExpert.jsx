import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { nexusStyleClass } from '../utils/styleTokens.js';

export default function VisualExpert() {
    const { user } = useAuth();
    const isAdmin = !!(user?.is_staff || user?.super_user === 1);
    const [launchContext] = useState(() => {
        const query = new URLSearchParams(window.location.search);
        return { problem_id: query.get('problem_id') || '', expert_id: query.get('expert_id') || '' };
    });
    const [sources, setSources] = useState([]);
    const [selected, setSelected] = useState([]);
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState(null);
    const [history, setHistory] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [draft, setDraft] = useState({ title: '', topic: '', technology: '', source_label: '', source_reference: '', content: '' });
    const autoAsked = useRef(false);

    const refresh = useCallback(async () => {
        try {
            const result = await api.visualExpertSources();
            const rows = result.sources || [];
            setSources(rows);
            setSelected(current => current.filter(id => rows.some(row => row.id === id && row.review_status === 'approved')));
            setError('');
        } catch (err) { setError(err.message || 'Could not load approved knowledge sources.'); }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const approved = useMemo(() => sources.filter(source => source.review_status === 'approved'), [sources]);
    const toggleSource = id => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);

    const sendQuestion = useCallback(async (asked, sourceIds = selected) => {
        if ((!asked.trim() && !launchContext.problem_id) || (!sourceIds.length && !launchContext.problem_id)) return;
        setBusy(true); setError(''); setNotice(''); setAnswer(null);
        try {
            const conversation = history.flatMap(turn => [
                { role: 'user', content: turn.question },
                { role: 'assistant', content: turn.answer },
            ]).slice(-8);
            const result = await api.askVisualExpert({
                question: asked, source_ids: sourceIds,
                problem_id: launchContext.problem_id || undefined,
                expert_id: launchContext.expert_id || undefined,
                conversation,
            });
            setAnswer(result);
            setHistory(current => [{ question: asked || 'Review my current NEXUS problem', ...result, id: Date.now() }, ...current].slice(0, 10));
            setQuestion('');
        } catch (err) { setError(err.message || 'Visual Expert could not answer.'); }
        finally { setBusy(false); }
    }, [selected, history, launchContext]);

    useEffect(() => {
        if (!launchContext.problem_id || !approved.length || autoAsked.current) return;
        autoAsked.current = true;
        setNotice('NEXUS is opening a contextual Visual Expert conversation using the selected issue and approved sources.');
        sendQuestion('');
    }, [approved, launchContext, sendQuestion]);

    const ask = event => {
        event.preventDefault();
        if (!question.trim() || !selected.length) return;
        sendQuestion(question.trim());
    };

    const createSource = async event => {
        event.preventDefault(); setBusy(true); setError(''); setNotice('');
        try {
            await api.createVisualExpertSource(draft);
            setDraft({ title: '', topic: '', technology: '', source_label: '', source_reference: '', content: '' });
            setNotice('Source saved as pending review. Approve it below when you have checked its contents and sharing rights.');
            await refresh();
        } catch (err) { setError(err.message || 'Could not save this source.'); }
        finally { setBusy(false); }
    };

    const reviewSource = async (source, review_status, is_active = source.is_active) => {
        setBusy(true); setError(''); setNotice('');
        try {
            await api.updateVisualExpertSource({ id: source.id, review_status, is_active });
            setNotice(review_status === 'approved' ? 'Source approved and available to users.' : is_active ? 'Source review status updated.' : 'Source archived.');
            await refresh();
        } catch (err) { setError(err.message || 'Could not update this source.'); }
        finally { setBusy(false); }
    };

    return <div>
        <PageHeader title="Visual Expert" subtitle="AI-generated technical guidance grounded in approved NEXUS knowledge sources." live />
        {launchContext.problem_id && <section role="status"  className={["nxs-gqgvd7"].filter(Boolean).join(" ")}>
            NEXUS linked this chat to the problem you just analyzed. The snippet, diagnostics, and AI guidance are being sent only to the configured Ollama service, after you approved this action in VS Code.
        </section>}
        <section  className={["nxs-1fyvdeh"].filter(Boolean).join(" ")}>
            <h2  className={["nxs-yvnrsj"].filter(Boolean).join(" ")}>Choose knowledge sources</h2>
            <p  className={["nxs-orqwg3"].filter(Boolean).join(" ")}>Only approved sources are available. Your question and selected source content will be sent to the Ollama service configured for this NEXUS backend.</p>
            {!approved.length ? <EmptyState title="No approved sources yet" description={isAdmin ? 'Add a source below, review it, and approve it before using Visual Expert.' : 'An administrator must add and approve technical knowledge before this feature can answer.'} /> : approved.map(source => <label key={source.id}  className={["nxs-6pzjim"].filter(Boolean).join(" ")}>
                <input type="checkbox" checked={selected.includes(source.id)} onChange={() => toggleSource(source.id)} />
                <span><strong>{source.title}</strong><span  className={["nxs-nbnldp"].filter(Boolean).join(" ")}>{[source.technology, source.topic, source.source_label].filter(Boolean).join(' · ')}{source.source_reference ? ` · ${source.source_reference}` : ''}</span></span>
            </label>)}
            <form onSubmit={ask}  className={["nxs-1bzpq1k"].filter(Boolean).join(" ")}>
                <label htmlFor="visual-question"  className={["nxs-1vvyqfg"].filter(Boolean).join(" ")}>Ask a follow-up</label>
                <textarea id="visual-question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={3000} required rows={4}  placeholder="The current issue is already attached. Ask a follow-up or leave this blank for a new question."  className={["nxs-10hkjp0"].filter(Boolean).join(" ")}/>
                <button type="submit" disabled={busy || (!launchContext.problem_id && !selected.length) || !question.trim()}  className={["nxs-17fof7h", nexusStyleClass("opacity", busy || !launchContext.problem_id && !selected.length || !question.trim() ? .55 : 1)].filter(Boolean).join(" ")}>{busy ? 'Reviewing sources…' : 'Ask Visual Expert'}</button>
                {answer && <button type="button"  onClick={() => { setAnswer(null); setHistory([]); }} className={["nxs-w8df8e"].filter(Boolean).join(" ")}>Clear conversation</button>}
            </form>
        </section>

        {error && <div role="alert"  className={["nxs-33g3mv"].filter(Boolean).join(" ")}>{error}</div>}
        {notice && <div role="status"  className={["nxs-1bdn0dk"].filter(Boolean).join(" ")}>{notice}</div>}
        {answer && <section  className={["nxs-kcvyod"].filter(Boolean).join(" ")}>
            <div  className={["nxs-ztxf0m"].filter(Boolean).join(" ")}>AI-generated guidance</div>
            <p  className={["nxs-1rkob6g"].filter(Boolean).join(" ")}>{answer.answer}</p>
            <h3  className={["nxs-1ehjvh5"].filter(Boolean).join(" ")}>Sources used</h3>
            {(answer.sources || []).map(source => <div key={source.id}  className={["nxs-1kglgpq"].filter(Boolean).join(" ")}><strong>{source.citation} {source.title}</strong> · {source.source_label}{source.source_reference && <> · {/^(https?):\/\//i.test(source.source_reference) ? <a href={source.source_reference} target="_blank" rel="noreferrer">Open reference</a> : <span>{source.source_reference}</span>}</>}</div>)}
        </section>}
        {history.length > 1 && <section  className={["nxs-1fyvdeh"].filter(Boolean).join(" ")}><h2  className={["nxs-1o5c7c3"].filter(Boolean).join(" ")}>Earlier in this conversation</h2>{history.slice(0, -1).map(item => <details key={item.id}  className={["nxs-qvnuss"].filter(Boolean).join(" ")}><summary>{item.question}</summary><p  className={["nxs-1197gn1"].filter(Boolean).join(" ")}>{item.answer}</p></details>)}</section>}

        {isAdmin && <section  className={["nxs-1fyvdeh"].filter(Boolean).join(" ")}>
            <h2  className={["nxs-1nwwl1n"].filter(Boolean).join(" ")}>Curate approved knowledge</h2>
            <p  className={["nxs-j4lljk"].filter(Boolean).join(" ")}>Add excerpts or internal guidance you are authorized to share. NEXUS does not fetch private Git repositories automatically. New entries remain pending until you explicitly approve them.</p>
            <form onSubmit={createSource}>
                {[['title', 'Title'], ['topic', 'Topic'], ['technology', 'Technology'], ['source_label', 'Source / owner'], ['source_reference', 'Reference URL or document path']].map(([key, label]) => <label key={key}  className={["nxs-ae6lk6"].filter(Boolean).join(" ")}>{label}<input required={key !== 'technology' && key !== 'source_reference'} value={draft[key]} maxLength={key === 'source_reference' ? 1000 : 240} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}   className={["nxs-10hkjp0"].filter(Boolean).join(" ")}/></label>)}
                <label  className={["nxs-ae6lk6"].filter(Boolean).join(" ")}>Approved source content<textarea required value={draft.content} maxLength={50000} rows={8} onChange={event => setDraft(current => ({ ...current, content: event.target.value }))}  placeholder="Paste only material you are authorized to share with users and the configured AI service."  className={["nxs-10hkjp0"].filter(Boolean).join(" ")}/></label>
                <button disabled={busy}  className={["nxs-17fof7h"].filter(Boolean).join(" ")}>Save for review</button>
            </form>
            <h3  className={["nxs-1qnp6mx"].filter(Boolean).join(" ")}>Source review</h3>
            {!sources.length ? <p  className={["nxs-1et2rvk"].filter(Boolean).join(" ")}>No sources have been added.</p> : sources.map(source => <div key={source.id}  className={["nxs-wl2z6x"].filter(Boolean).join(" ")}><strong>{source.title}</strong><span  className={["nxs-1dys80i", nexusStyleClass("color", source.review_status === 'approved' ? '#047857' : '#b45309')].filter(Boolean).join(" ")}>{source.review_status}{!source.is_active ? ' · archived' : ''}</span><p  className={["nxs-1erqz0g"].filter(Boolean).join(" ")}>{source.source_label} · {source.topic}</p><details><summary>Review approved content</summary><pre  className={["nxs-oabzkl"].filter(Boolean).join(" ")}>{source.content}</pre></details>{source.review_status !== 'approved' && <button disabled={busy || !source.is_active}  onClick={() => reviewSource(source, 'approved')} className={["nxs-17fof7h"].filter(Boolean).join(" ")}>Approve</button>}{source.review_status === 'approved' && <button disabled={busy}  onClick={() => reviewSource(source, 'rejected')} className={["nxs-w8df8e"].filter(Boolean).join(" ")}>Revoke approval</button>}{source.is_active ? <button disabled={busy}  onClick={() => reviewSource(source, source.review_status, false)} className={["nxs-w8df8e"].filter(Boolean).join(" ")}>Archive</button> : <button disabled={busy}  onClick={() => reviewSource(source, source.review_status, true)} className={["nxs-w8df8e"].filter(Boolean).join(" ")}>Restore</button>}</div>)}
        </section>}
    </div>;
}
