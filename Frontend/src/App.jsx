import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Problems from './pages/Problems.jsx';
import Patterns from './pages/Patterns.jsx';
import Agents from './pages/Agents.jsx';
import Learning from './pages/Learning.jsx';
import UserManagement from './pages/UserManagement.jsx';

function PrivateRoute({ element }) {
    const { isSignedIn, loading } = useAuth();
    if (loading) return <div className="loading-wrap"><span className="spinner" /></div>;
    return isSignedIn ? element : <Navigate to="/login" replace />;
}

function PublicRoute({ element }) {
    const { isSignedIn, loading } = useAuth();
    if (loading) return <div className="loading-wrap"><span className="spinner" /></div>;
    return isSignedIn ? <Navigate to="/" replace /> : element;
}

function AppRoutes() {
    return (
        <Routes>
            <Route path="/login" element={<PublicRoute element={<Login />} />} />
            <Route element={<Layout />}>
                <Route path="/" element={<PrivateRoute element={<Dashboard />} />} />
                <Route path="/problems" element={<PrivateRoute element={<Problems />} />} />
                <Route path="/patterns" element={<PrivateRoute element={<Patterns />} />} />
                <Route path="/agents" element={<PrivateRoute element={<Agents />} />} />
                <Route path="/learning" element={<PrivateRoute element={<Learning />} />} />
                <Route path="/users" element={<PrivateRoute element={<UserManagement />} />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <AppRoutes />
        </AuthProvider>
    );
}