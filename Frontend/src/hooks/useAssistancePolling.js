import { useEffect, useRef, useState, useCallback } from 'react';

// One request at a time, automatic reconnect with bounded backoff, stopped on unmount.
export function useAssistancePolling(fetcher, interval = 2000) {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const refresh = useCallback(() => setRevision(n => n + 1), []);
    useEffect(() => {
        let active = true, timer, failures = 0;
        async function poll() {
            try {
                const value = await fetcher();
                if (active) { setData(value); setError(''); failures = 0; }
            } catch (e) {
                if (active) { setError(e.message); failures++; }
            }
            if (active) timer = setTimeout(poll, Math.min(30000, interval * 2 ** Math.min(failures, 4)));
        }
        setData(null);
        poll();
        return () => { active = false; clearTimeout(timer); };
    }, [fetcher, interval, revision]);
    return { data, error, refresh };
}
