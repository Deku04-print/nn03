import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, saveToken, clearToken, getToken, isSignedIn } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadMe = useCallback(async () => {
        if (!isSignedIn()) { setLoading(false); return; }
        try {
            const res = await api.me();
            setUser(res.user);
        } catch {
            clearToken();
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadMe(); }, [loadMe]);

    const login = async (email, password) => {
        const res = await api.login(email, password);
        saveToken(res.access);
        const me = await api.me();
        if (!me.user) {
            clearToken();
            throw new Error('Unable to load your user profile.');
        }
        setUser(me.user);
    };

    const logout = () => {
        clearToken();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, isSignedIn: !!user }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
