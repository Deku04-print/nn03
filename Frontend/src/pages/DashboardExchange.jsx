import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuth } from '../hooks/useAuth.jsx';

export default function DashboardExchange() {
    const navigate = useNavigate();
    const { loginWithAccessToken } = useAuth();
    const [error, setError] = useState('');
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        const code = new URLSearchParams(window.location.hash.slice(1)).get('code');
        // The code arrives in the fragment (never sent in an HTTP request); remove it before exchange.
        window.history.replaceState({}, document.title, '/auth/exchange');
        if (!code) {
            setError('No sign-in code was supplied. Return to VS Code and open the dashboard again.');
            return;
        }
        const redirectUri = `${window.location.origin}/auth/exchange`;
        api.exchangeDashboardCode(code, redirectUri)
            .then(async grant => {
                const user = await loginWithAccessToken(grant.access);
                const destination = grant.next_path || (user?.is_staff || user?.super_user === 1 ? '/' : user?.is_expert ? '/human-api' : '/learning');
                navigate(destination, { replace: true });
            })
            .catch(reason => setError(reason.message || 'The sign-in code could not be exchanged.'));
    }, [loginWithAccessToken, navigate]);

    return <main  className={["nxs-11q3dax"].filter(Boolean).join(" ")}>
        <section  className={["nxs-1xg2amg"].filter(Boolean).join(" ")}>
            <h1  className={["nxs-1e6iknr"].filter(Boolean).join(" ")}>NEXUS dashboard sign-in</h1>
            {error ? <div role="alert"  className={["nxs-1xlhjm"].filter(Boolean).join(" ")}>{error}</div> : <p role="status"  className={["nxs-17iiej5"].filter(Boolean).join(" ")}>Securely completing your one-time sign-in…</p>}
        </section>
    </main>;
}
