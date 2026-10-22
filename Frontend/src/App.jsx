import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Problems from './pages/Problems.jsx';
import Patterns from './pages/Patterns.jsx';
import Agents from './pages/Agents.jsx';
import Learning from './pages/Learning.jsx';
import UserManagement from './pages/UserManagement.jsx';
import UserDashboard from './pages/UserDashboard.jsx';
import HumanAPI from './pages/HumanAPI.jsx';
import AssistanceChat from './pages/AssistanceChat.jsx';
import BrowserHandoff from './pages/BrowserHandoff.jsx';
import './assistance.css';

function PrivateRoute({ element, admin = false }) {
    const { isSignedIn, loading, user } = useAuth();
    const location = useLocation();
    if (loading) return <div className="loading-wrap"><span className="spinner" /></div>;
    if (!isSignedIn) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
    if (admin && user?.super_user !== 1) return <Navigate to="/" replace />;
    return element;
}

function PublicRoute({ element }) {
    const { isSignedIn, loading } = useAuth();
    const location = useLocation();
    if (loading) return <div className="loading-wrap"><span className="spinner" /></div>;
    const previous = location.state?.from || sessionStorage.getItem('wl_return_to') || '/';
    const destination = /^\/(?:human-api(?:\/|$)|profile$)/.test(previous) ? previous : '/';
    if (isSignedIn) sessionStorage.removeItem('wl_return_to');
    return isSignedIn ? <Navigate to={destination} replace /> : element;
}

function Home() {
    const { user } = useAuth();
    return user?.super_user === 1 ? <Dashboard /> : <UserDashboard />;
}

function AppRoutes() {
    return (
        <Routes>
            <Route path="/login" element={<PublicRoute element={<Login />} />} />
            <Route path="/handoff" element={<BrowserHandoff />} />
            <Route path="/human-api/:caseId" element={<PrivateRoute element={<HumanAPI />} />} />
            <Route path="/human-api/chat/:sessionId" element={<PrivateRoute element={<AssistanceChat />} />} />
            <Route element={<Layout />}>
                <Route path="/" element={<PrivateRoute element={<Home />} />} />
                <Route path="/profile" element={<PrivateRoute element={<UserDashboard />} />} />
                <Route path="/problems" element={<PrivateRoute admin element={<Problems />} />} />
                <Route path="/patterns" element={<PrivateRoute admin element={<Patterns />} />} />
                <Route path="/agents" element={<PrivateRoute admin element={<Agents />} />} />
                <Route path="/learning" element={<PrivateRoute admin element={<Learning />} />} />
                <Route path="/users" element={<PrivateRoute admin element={<UserManagement />} />} />
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
