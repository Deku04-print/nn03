import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { nexusStyleClass } from '../utils/styleTokens.js';

export default function HumanAPI() {
    const { user } = useAuth();
    if (!user?.is_expert && !user?.is_staff && user?.super_user !== 1) return <DeveloperHumanAPI />;
    return <ExpertDesk />;
}

function ExpertDesk() {
    const { user } = useAuth();
    const [sessions, setSessions] = useState([]);
    const [reviews, setReviews] = useState([]);
    const [selected, setSelected] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [outcome, setOutcome] = useState('resolved');
    const [summary, setSummary] = useState('');
    const [reviewForm, setReviewForm] = useState({});
    const [incomingRequest, setIncomingRequest] = useState(null);
    const seenPendingIds = useRef(null);

    const refresh = useCallback(async () => {
        try {
            const [sessionResult, reviewResult] = await Promise.all([api.humanSessions('expert'), api.reviews(true)]);
            const rows = sessionResult.sessions || [];
            setSessions(rows);
            const pendingRows = rows.filter(item => item.status === 'pending');
            const currentIds = new Set(pendingRows.map(item => item.id));
            if (seenPendingIds.current === null) {
                seenPendingIds.current = currentIds;
            } else {
                const arriving = pendingRows.find(item => !seenPendingIds.current.has(item.id));
                if (arriving) {
                    setIncomingRequest(arriving);
                    if ('Notification' in window && Notification.permission === 'granted') {
                        new Notification('NEXUS: new Human API request', { body: `${arriving.developer?.name || 'A developer'} needs help: ${arriving.reason || 'Open the request to review the problem.'}` });
                    }
                }
                seenPendingIds.current = currentIds;
            }
            setReviews(reviewResult.reviews || []);
            if (selected?.id) {
                const detail = await api.humanSession(selected.id);
                setSelected(detail.session);
            }
            setError('');
        } catch (err) {
            setError(err.message || 'Could not load Human API work. An expert profile must be configured for this account.');
        }
    }, [selected?.id]);

    useEffect(() => { refresh(); const timer = setInterval(refresh, 3000); return () => clearInterval(timer); }, [refresh]);

    const perform = async (fn) => {
        setBusy(true);
        try { const result = await fn(); await refresh(); return result; }
        catch (err) { setError(err.message || 'The request failed.'); }
        finally { setBusy(false); }
    };

    const selectSession = async (session) => {
        try { const result = await api.humanSession(session.id); setSelected(result.session); }
        catch (err) { setError(err.message); }
    };

    const sendMessage = async (event) => {
        event.preventDefault();
        const content = event.currentTarget.elements.message.value.trim();
        if (!content || !selected) return;
        event.currentTarget.reset();
        await perform(() => api.sendHumanMessage(selected.id, content));
    };

    const submitOutcome = (event) => {
        event.preventDefault();
        if (!selected) return;
        perform(() => api.submitHumanOutcome(selected.id, { outcome, summary }));
    };

    const claimReview = async (reviewId) => {
        await perform(async () => {
            const result = await api.claimReview(reviewId);
            setReviewForm(result.review);
        });
    };

    const submitReview = (event) => {
        event.preventDefault();
        if (!reviewForm.id) return;
        const form = event.currentTarget;
        perform(() => api.submitReviewOutcome(reviewForm.id, {
            outcome: form.elements.outcome.value,
            explanation: form.elements.explanation.value,
            suggested_correction: form.elements.correction.value,
        })).then(() => setReviewForm({}));
    };

    return (
        <div>
            <PageHeader title="Human API · Expert Desk" subtitle="Respond to developer help requests and review flagged NEXUS answers." live />
            {incomingRequest && <div role="alertdialog" aria-modal="true" aria-labelledby="incoming-title"  className={["nxs-uivn1f"].filter(Boolean).join(" ")}>
                <section  className={["nxs-1tsck5y"].filter(Boolean).join(" ")}>
                    <h2 id="incoming-title"  className={["nxs-179tho7"].filter(Boolean).join(" ")}>New developer request</h2>
                    <p><strong>{incomingRequest.developer?.name || 'A developer'}</strong> is asking for help.</p>
                    <p  className={["nxs-1197gn1"].filter(Boolean).join(" ")}>{incomingRequest.reason || 'NEXUS prepared an issue summary. Open the request to review it.'}</p>
                    {incomingRequest.context_shared && <p  className={["nxs-6lgcs3"].filter(Boolean).join(" ")}>The developer approved sharing the linked snippet, diagnostics, and NEXUS guidance. Open the request to inspect this context.</p>}
                    <button  onClick={() => { setIncomingRequest(null); selectSession(incomingRequest); }} className={["nxs-1p2ql6v"].filter(Boolean).join(" ")}>Open request</button>
                    <button  onClick={() => setIncomingRequest(null)} className={["nxs-3y9qhf"].filter(Boolean).join(" ")}>Dismiss</button>
                </section>
            </div>}
            {user?.is_expert && !user?.is_staff && user?.super_user !== 1 && <ExpertProfileSettings />}
            {error && <div role="alert"  className={["nxs-6ascxq"].filter(Boolean).join(" ")}>{error}</div>}

            <h2  className={["nxs-1ihruvc"].filter(Boolean).join(" ")}>Assistance requests</h2>
            {!sessions.length ? <EmptyState title="No requests yet" description="New requests assigned to your expert profile will appear here." /> : sessions.map(session => (
                <section key={session.id}  className={["nxs-1pggffk"].filter(Boolean).join(" ")}>
                    <div  className={["nxs-1my07h6"].filter(Boolean).join(" ")}>
                        <div>
                            <strong>{session.developer?.name || 'Developer'}</strong>
                            <div  className={["nxs-kcn0vy"].filter(Boolean).join(" ")}>{session.status} · {new Date(session.requested_at).toLocaleString()}</div>
                            <div  className={["nxs-et2xu7"].filter(Boolean).join(" ")}>{session.reason || 'No additional question supplied.'}</div>
                        </div>
                        <div>
                            <button  onClick={() => selectSession(session)} className={["nxs-3y9qhf"].filter(Boolean).join(" ")}>Open</button>
                            {session.status === 'pending' && <>
                                <button disabled={busy}  onClick={() => perform(() => api.respondHumanSession(session.id, 'accept'))} className={["nxs-1p2ql6v"].filter(Boolean).join(" ")}>Accept</button>
                                <button disabled={busy}  onClick={() => perform(() => api.respondHumanSession(session.id, 'decline'))} className={["nxs-3y9qhf"].filter(Boolean).join(" ")}>Decline</button>
                            </>}
                        </div>
                    </div>
                </section>
            ))}

            {selected && <section  className={["nxs-1di3n0k"].filter(Boolean).join(" ")}>
                <div  className={["nxs-h6lji0"].filter(Boolean).join(" ")}>
                    <h2  className={["nxs-qhwkfm"].filter(Boolean).join(" ")}>Private session · {selected.status}</h2>
                    <button  onClick={() => setSelected(null)} className={["nxs-3y9qhf"].filter(Boolean).join(" ")}>Close view</button>
                </div>
                <p><strong>Developer:</strong> {selected.developer?.name} · <strong>Reason:</strong> {selected.reason || 'Not provided'}</p>
                {selected.context_shared && <div  className={["nxs-1f5l0sz"].filter(Boolean).join(" ")}>
                    <strong>Developer-approved context</strong>
                    <pre  className={["nxs-1bzot5s"].filter(Boolean).join(" ")}>{JSON.stringify(selected.approved_context, null, 2)}</pre>
                </div>}
                <div  className={["nxs-1tcltw2"].filter(Boolean).join(" ")}>
                    {(selected.messages || []).map(message => <div key={message.id}  className={["nxs-1kmhqwm", nexusStyleClass("background", message.sender_id === selected.expert?.id ? '#eff6ff' : '#f8fafc')].filter(Boolean).join(" ")}>
                        <strong>{message.sender_name}</strong><small  className={["nxs-9pl8mh"].filter(Boolean).join(" ")}>{new Date(message.created_at).toLocaleString()}</small><div  className={["nxs-1lag2es"].filter(Boolean).join(" ")}>{message.content}</div>
                    </div>)}
                </div>
                {selected.status === 'accepted' && <form onSubmit={sendMessage}  className={["nxs-jm24uy"].filter(Boolean).join(" ")}>
                    <textarea name="message" required maxLength={6000} placeholder="Reply to the developer"   className={["nxs-hb4bx1"].filter(Boolean).join(" ")}/>
                    <button disabled={busy}  className={["nxs-1p2ql6v"].filter(Boolean).join(" ")}>Send message</button>
                </form>}
                {['accepted', 'closed', 'expired'].includes(selected.status) && <form onSubmit={submitOutcome}  className={["nxs-17dptvx"].filter(Boolean).join(" ")}>
                    <label>Session outcome<select value={outcome} onChange={e => setOutcome(e.target.value)}  className={["nxs-hb4bx1"].filter(Boolean).join(" ")}>
                        <option value="resolved">Resolved</option><option value="partially_resolved">Partially resolved</option><option value="unresolved">Unresolved</option><option value="escalated">Escalated</option>
                    </select></label>
                    <label>Resolution summary<textarea value={summary} onChange={e => setSummary(e.target.value)} maxLength={3000}   className={["nxs-hb4bx1"].filter(Boolean).join(" ")}/></label>
                    <button disabled={busy}  className={["nxs-1p2ql6v"].filter(Boolean).join(" ")}>Record outcome and close</button>
                </form>}
            </section>}

            <h2  className={["nxs-1m2wmh7"].filter(Boolean).join(" ")}>AI answer review queue</h2>
            {!reviews.length && !reviewForm.id ? <EmptyState title="Review queue is clear" description="Answers developers flag as incorrect or insufficient will appear here." /> : reviews.map(review => (
                <section key={review.id}  className={["nxs-1pggffk"].filter(Boolean).join(" ")}>
                    <strong>{review.reason.replaceAll('_', ' ')}</strong><div  className={["nxs-1dt9gln"].filter(Boolean).join(" ")}>Requested by {review.developer?.name} · {new Date(review.created_at).toLocaleString()}</div>
                    <p>{review.notes || 'No notes supplied.'}</p>
                    {review.ai_response && <pre  className={["nxs-udol0e"].filter(Boolean).join(" ")}>{JSON.stringify(review.ai_response, null, 2)}</pre>}
                    {review.context && <p>{review.context.language} · {review.context.category}: {review.context.description}</p>}
                    <button disabled={busy}  onClick={() => claimReview(review.id)} className={["nxs-1p2ql6v"].filter(Boolean).join(" ")}>Claim review</button>
                </section>
            ))}
            {reviewForm.id && <form onSubmit={submitReview}  className={["nxs-1pggffk"].filter(Boolean).join(" ")}>
                <h3>Submit expert review</h3>
                <p><strong>Reason:</strong> {reviewForm.reason?.replaceAll('_', ' ')}</p>
                {reviewForm.ai_response && <pre  className={["nxs-udol0e"].filter(Boolean).join(" ")}>{JSON.stringify(reviewForm.ai_response, null, 2)}</pre>}
                {reviewForm.context_shared && reviewForm.context && <p  className={["nxs-17iiej5"].filter(Boolean).join(" ")}>Developer-approved context: {reviewForm.context.language} · {reviewForm.context.category}: {reviewForm.context.description}</p>}
                <label>Assessment<select name="outcome"  className={["nxs-hb4bx1"].filter(Boolean).join(" ")}><option value="correct">Correct</option><option value="partially_correct">Partially correct</option><option value="incorrect">Incorrect</option><option value="insufficient">Insufficient</option></select></label>
                <label>Explanation<textarea name="explanation" required maxLength={5000}   className={["nxs-hb4bx1"].filter(Boolean).join(" ")}/></label>
                <label>Suggested correction<textarea name="correction" maxLength={5000}   className={["nxs-hb4bx1"].filter(Boolean).join(" ")}/></label>
                <button disabled={busy}  className={["nxs-1p2ql6v"].filter(Boolean).join(" ")}>Submit review</button>
            </form>}
        </div>
    );
}

function ExpertProfileSettings() {
    const [profile, setProfile] = useState(null);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api.myExpertProfile().then(result => setProfile(result.expert)).catch(err => setError(err.message || 'Could not load your approved expert profile.'));
    }, []);

    const submit = async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        const split = key => String(values.get(key) || '').split(',').map(value => value.trim()).filter(Boolean);
        setBusy(true); setError(''); setSaved(false);
        try {
            const result = await api.updateMyExpertProfile({
                bio: values.get('bio'),
                languages: split('languages'), frameworks: split('frameworks'), categories: split('categories'),
                years_experience: values.get('years_experience') === '' ? null : Number(values.get('years_experience')),
                is_available: values.get('is_available') === 'on',
            });
            setProfile(result.expert); setSaved(true);
        } catch (err) { setError(err.message || 'Could not save your expert profile.'); }
        finally { setBusy(false); }
    };

    if (!profile) return <section  className={["nxs-1pggffk"].filter(Boolean).join(" ")}><p role={error ? 'alert' : 'status'}>{error || 'Loading expert profile…'}</p></section>;

    return <form onSubmit={submit}  className={["nxs-1pggffk"].filter(Boolean).join(" ")}>
        <h2  className={["nxs-1nwwl1n"].filter(Boolean).join(" ")}>Your expert profile</h2>
        <label  className={["nxs-ae6lk6"].filter(Boolean).join(" ")}>Profile summary<textarea name="bio" defaultValue={profile.bio} maxLength={3000}   className={["nxs-hb4bx1"].filter(Boolean).join(" ")}/></label>
        <div  className={["nxs-bkojxw"].filter(Boolean).join(" ")}>
            {[
                ['languages', 'Languages', profile.languages],
                ['frameworks', 'Frameworks', profile.frameworks],
                ['categories', 'Problem categories', profile.categories],
            ].map(([name, label, values]) => <label key={name}  className={["nxs-a53ok4"].filter(Boolean).join(" ")}>{label} (comma separated)<input name={name} defaultValue={(values || []).join(', ')}   className={["nxs-hb4bx1"].filter(Boolean).join(" ")}/></label>)}
            <label  className={["nxs-a53ok4"].filter(Boolean).join(" ")}>Years of experience<input name="years_experience" type="number" min="0" max="60" defaultValue={profile.years_experience ?? ''}   className={["nxs-hb4bx1"].filter(Boolean).join(" ")}/></label>
        </div>
        <label  className={["nxs-134h3xf"].filter(Boolean).join(" ")}><input name="is_available" type="checkbox" defaultChecked={profile.is_available} />Available for new requests</label>
        <div><button disabled={busy}  className={["nxs-1p2ql6v"].filter(Boolean).join(" ")}>Save profile</button>{saved && <span role="status"  className={["nxs-1u3mvdo"].filter(Boolean).join(" ")}>Profile saved.</span>}</div>
        {error && <p role="alert"  className={["nxs-1xlhjm"].filter(Boolean).join(" ")}>{error}</p>}
    </form>;
}

function DeveloperHumanAPI() {
    const [experts, setExperts] = useState([]);
    const [recentProblems, setRecentProblems] = useState([]);
    const [problemId, setProblemId] = useState(() => new URLSearchParams(window.location.search).get('problem_id') || '');
    const [sessions, setSessions] = useState([]);
    const [selected, setSelected] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [feedbackDone, setFeedbackDone] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const [expertResult, sessionResult, problemResult] = await Promise.all([
                api.experts(problemId ? { problem_id: problemId } : {}),
                api.humanSessions('developer'),
                api.problemsList({ limit: 30 }),
            ]);
            setExperts(expertResult.experts || []);
            setSessions(sessionResult.sessions || []);
            const ownProblems = (problemResult.data || []).filter(problem => problem.problem_id);
            setRecentProblems(ownProblems);
            if (!problemId && ownProblems.length) setProblemId(ownProblems[0].problem_id);
            if (selected?.id) {
                const detail = await api.humanSession(selected.id);
                setSelected(detail.session);
            }
            setError('');
        } catch (err) { setError(err.message || 'Could not load Human API requests.'); }
    }, [problemId, selected?.id]);

    useEffect(() => { refresh(); const timer = setInterval(refresh, 3000); return () => clearInterval(timer); }, [refresh]);

    const perform = async (fn) => {
        setBusy(true);
        try { const result = await fn(); await refresh(); return result; }
        catch (err) { setError(err.message || 'The request failed.'); }
        finally { setBusy(false); }
    };

    const openSession = async (session) => {
        try {
            const result = await api.humanSession(session.id);
            setSelected(result.session);
            setFeedbackDone(false);
        } catch (err) { setError(err.message || 'Could not open this request.'); }
    };

    const requestExpert = (expert) => {
        if (!problemId) {
            setError('Analyze a problem in the NEXUS extension first so it can attach your snippet and diagnostics automatically.');
            return;
        }
        if (!window.confirm('Share the saved sanitized code snippet, diagnostics, and NEXUS guidance for this issue with the selected expert?')) return;
        return perform(async () => {
        const result = await api.createHumanSession({
            expert_id: expert.user_id,
            problem_id: problemId,
            share_context: true,
            context: {},
        });
        setSelected(result.session);
        return result;
        });
    };

    const sendMessage = (event) => {
        event.preventDefault();
        const content = event.currentTarget.elements.message.value.trim();
        if (!content || !selected) return;
        event.currentTarget.reset();
        perform(() => api.sendHumanMessage(selected.id, content));
    };

    return <div>
        <PageHeader title="Human API" subtitle="Request help from an available expert. You control whether case details are shared." />
        {error && <div role="alert"  className={["nxs-6ascxq"].filter(Boolean).join(" ")}>{error}</div>}

        <section  className={["nxs-1pggffk"].filter(Boolean).join(" ")}>
            <h2  className={["nxs-1nwwl1n"].filter(Boolean).join(" ")}>Get help with a recent NEXUS problem</h2>
            <p  className={["nxs-orqwg3"].filter(Boolean).join(" ")}>NEXUS preselects your latest analyzed issue and prepares the request from its saved diagnosis. You do not need to retype the problem.</p>
            <label  className={["nxs-1q9navx"].filter(Boolean).join(" ")}>Analyzed issue
                <select value={problemId} onChange={event => setProblemId(event.target.value)}  className={["nxs-hb4bx1"].filter(Boolean).join(" ")}>
                    <option value="">Choose an issue</option>
                    {recentProblems.map(problem => <option key={problem.problem_id} value={problem.problem_id}>
                        {[problem.language, problem.framework, problem.category?.replaceAll('_', ' '), problem.root_cause || problem.code_pattern].filter(Boolean).join(' · ').slice(0, 180)}
                    </option>)}
                </select>
            </label>
            {!problemId && !recentProblems.length && <EmptyState title="No analyzed issues found" description="Analyze a problem in the NEXUS extension first. Its approved context will then appear here." />}
            {!experts.length ? <EmptyState title="No matching experts are available" description="Try broader filters, or check back when an expert is available." /> : experts.map(expert => <article key={expert.user_id}  className={["nxs-fgya7"].filter(Boolean).join(" ")}>
                <div  className={["nxs-fcob79"].filter(Boolean).join(" ")}>
                    <div>
                        <strong>{expert.name}</strong>
                        <div  className={["nxs-64zl4f"].filter(Boolean).join(" ")}>{expert.bio || 'Expert profile'}</div>
                        <div  className={["nxs-x5b4ql"].filter(Boolean).join(" ")}>Languages: {(expert.languages || []).join(', ') || 'Not listed'} · Frameworks: {(expert.frameworks || []).join(', ') || 'Not listed'} · Categories: {(expert.categories || []).join(', ') || 'Not listed'}</div>
                        {expert.match_criteria?.length > 0 && <div  className={["nxs-18746fh"].filter(Boolean).join(" ")}>Matches: {expert.match_criteria.join(', ')}</div>}
                    </div>
                    <button disabled={busy || !problemId || sessions.some(s => ['pending', 'accepted'].includes(s.status))}  onClick={() => requestExpert(expert)} className={["nxs-1p2ql6v"].filter(Boolean).join(" ")}>Start contextual chat</button>
                </div>
            </article>)}
        </section>

        <h2  className={["nxs-1ihruvc"].filter(Boolean).join(" ")}>My requests</h2>
        {!sessions.length ? <EmptyState title="No Human API requests yet" description="Choose an available expert above when you want human assistance." /> : sessions.map(session => <section key={session.id}  className={["nxs-1pggffk"].filter(Boolean).join(" ")}>
            <strong>{session.expert?.name || 'Expert'}</strong>
            <div  className={["nxs-kcn0vy"].filter(Boolean).join(" ")}>{session.status} · Requested {new Date(session.requested_at).toLocaleString()}</div>
            <p>{session.reason || 'No description provided.'}</p>
            <button  onClick={() => openSession(session)} className={["nxs-3y9qhf"].filter(Boolean).join(" ")}>Open request</button>
            {session.status === 'pending' && <button disabled={busy}  onClick={() => perform(() => api.respondHumanSession(session.id, 'cancel'))} className={["nxs-3y9qhf"].filter(Boolean).join(" ")}>Cancel request</button>}
        </section>)}

        {selected && <section  className={["nxs-1di3n0k"].filter(Boolean).join(" ")}>
            <div  className={["nxs-21fjk6"].filter(Boolean).join(" ")}><h2  className={["nxs-17doahw"].filter(Boolean).join(" ")}>Private session · {selected.status}</h2><button  onClick={() => setSelected(null)} className={["nxs-3y9qhf"].filter(Boolean).join(" ")}>Close view</button></div>
            <p><strong>Expert:</strong> {selected.expert?.name} · <strong>Context shared:</strong> {selected.context_shared ? 'Yes, as approved when requested' : 'No'}</p>
            {selected.status === 'pending' && <button disabled={busy}  onClick={() => perform(() => api.respondHumanSession(selected.id, 'cancel'))} className={["nxs-3y9qhf"].filter(Boolean).join(" ")}>Cancel request</button>}
            {selected.context_shared && selected.approved_context && <details><summary>Review shared case details</summary><pre  className={["nxs-xch5wi"].filter(Boolean).join(" ")}>{JSON.stringify(selected.approved_context, null, 2)}</pre></details>}
            <div  className={["nxs-11206cy"].filter(Boolean).join(" ")}>
                {(selected.messages || []).map(message => <div key={message.id}  className={["nxs-8viim4"].filter(Boolean).join(" ")}><strong>{message.sender_name}</strong><small  className={["nxs-9pl8mh"].filter(Boolean).join(" ")}>{new Date(message.created_at).toLocaleString()}</small><div  className={["nxs-1lag2es"].filter(Boolean).join(" ")}>{message.content}</div></div>)}
            </div>
            {selected.status === 'accepted' && <form onSubmit={sendMessage}  className={["nxs-jm24uy"].filter(Boolean).join(" ")}><textarea name="message" required maxLength={6000} placeholder="Message your expert privately"   className={["nxs-hb4bx1"].filter(Boolean).join(" ")}/><button disabled={busy}  className={["nxs-1p2ql6v"].filter(Boolean).join(" ")}>Send message</button><button type="button" disabled={busy}  onClick={() => perform(() => api.closeHumanSession(selected.id))} className={["nxs-3y9qhf"].filter(Boolean).join(" ")}>End session</button></form>}
            {['closed', 'expired', 'cancelled'].includes(selected.status) && !feedbackDone && <form  onSubmit={event => { event.preventDefault(); const form = event.currentTarget; perform(async () => { await api.submitHumanFeedback(selected.id, { rating: Number(form.elements.rating.value), comments: form.elements.comments.value }); setFeedbackDone(true); }); }} className={["nxs-jm24uy"].filter(Boolean).join(" ")}><label>Session feedback <select name="rating"  className={["nxs-hb4bx1"].filter(Boolean).join(" ")}><option value="5">Very helpful</option><option value="4">Helpful</option><option value="3">Somewhat helpful</option><option value="2">Not very helpful</option><option value="1">Not helpful</option></select></label><textarea name="comments" maxLength={3000} placeholder="Optional comments"   className={["nxs-hb4bx1"].filter(Boolean).join(" ")}/><button disabled={busy}  className={["nxs-1p2ql6v"].filter(Boolean).join(" ")}>Submit feedback</button></form>}
            {feedbackDone && <p role="status">Thank you. Your feedback has been recorded.</p>}
        </section>}
    </div>;
}
