import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * usePolling — fetches data immediately on mount.
 * Auto-refresh has been removed; use the returned `refresh` function for manual refresh.
 *
 * @param {Function} fetcher   async function that returns data
 *
 * @returns {{ data, loading, error, refresh }}
 */
export function usePolling(fetcher) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const mountedRef = useRef(true);

    const fetch = useCallback(async (showLoader = false) => {
        if (showLoader) setLoading(true);
        setError('');
        try {
            const result = await fetcher();
            if (mountedRef.current) {
                setData(result);
            }
        } catch (err) {
            if (mountedRef.current) setError(err.message || 'Failed to load data');
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [fetcher]);

    useEffect(() => {
        mountedRef.current = true;
        fetch(true); // initial load with spinner
        return () => {
            mountedRef.current = false;
        };
    }, [fetch]);

    return {
        data,
        loading,
        error,
        refresh: () => fetch(false),
    };
}