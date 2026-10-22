import { useEffect, useState } from 'react';
import { api, saveToken } from '../services/api.js';

export default function BrowserHandoff() {
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true, timer;
        const id = window.location.hash.slice(1);
        if (!/^[0-9a-f-]{36}$/i.test(id)) { setError('Invalid handoff. Open Human API from VS Code again.'); return; }
        // Proof stays in this browser; the URL ID alone cannot authenticate a browser.
        let proof = sessionStorage.getItem('nexus-handoff-' + id);
        if (!proof) {
            const bytes = crypto.getRandomValues(new Uint8Array(32));
            proof = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            sessionStorage.setItem('nexus-handoff-' + id, proof);
        }
        async function exchange() {
            try {
                const result = await api.assistance(`handoffs/${id}/browser/`, { proof, action: 'exchange' });
                if (!active) return;
                if (result.pending) timer = setTimeout(exchange, 2000);
                else {
                    sessionStorage.removeItem('nexus-handoff-' + id);
                    saveToken(result.access);
                    window.location.replace(result.destination);
                }
            } catch (e) { if (active) setError(e.message + ' Open Human API from VS Code again if the handoff expired.'); }
        }
        api.assistance(`handoffs/${id}/browser/`, { proof, action: 'claim' }).then(result => {
            if (active) { setCode(result.verification_code); exchange(); }
        }).catch(e => { if (active) setError(e.message); });
        return () => { active = false; clearTimeout(timer); };
    }, []);
    return <main className="nx-focus"><div className="nx-card nx-handoff"><span className="nx-eyebrow">NEXUS · Secure handoff</span>
        <h1>Continue from VS Code</h1><p>Match this code with the prompt in VS Code and approve this browser. Your existing identity will carry over.</p>
        {code && <strong className="nx-code">{code}</strong>}{error ? <p role="alert" className="nx-error">{error}</p> : <p role="status">Waiting for confirmation in VS Code…</p>}
    </div></main>;
}
