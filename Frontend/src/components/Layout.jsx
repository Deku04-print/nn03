
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import WorkLensLogo from './WorkLensLogo.jsx';

const NAV_SECTIONS = [
    {
        title: 'Core Telemetry',
        items: [
            {
                to: '/',
                label: 'Overview',
                icon: (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1.5" />
                        <rect x="14" y="3" width="7" height="7" rx="1.5" />
                        <rect x="14" y="14" width="7" height="7" rx="1.5" />
                        <rect x="3" y="14" width="7" height="7" rx="1.5" />
                    </svg>
                ),
            },
            {
                to: '/problems',
                label: 'Problem DNA',
                badge: 'Live',
                icon: (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07l14.14-14.14" />
                    </svg>
                ),
            },
            {
                to: '/patterns',
                label: 'Patterns & Clusters',
                icon: (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 2 7 12 12 22 7 12 2" />
                        <polyline points="2 17 12 22 22 17" />
                        <polyline points="2 12 12 17 22 12" />
                    </svg>
                ),
            },
        ],
    },
    {
        title: 'Intelligence & AI',
        items: [
            {
                to: '/agents',
                label: 'AI Orchestrator',
                icon: (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                ),
            },
            {
                to: '/learning',
                label: 'Learning Analytics',
                icon: (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                    </svg>
                ),
            },
        ],
    },
    {
        title: 'Expert Support',
        items: [
            {
                to: '/human-api',
                label: 'Human API',
                icon: (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-5.5A7.5 7.5 0 1 1 20 11.5Z" />
                        <path d="M8 11h.01M12 11h.01M16 11h.01" />
                    </svg>
                ),
            },
            {
                to: '/visual-expert',
                label: 'Visual Expert',
                icon: (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.2 2.2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3.1v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2.2-2.2.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H5v-3h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.2-2.2.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V5h3.1v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.2 2.2-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v3h-.2a1.7 1.7 0 0 0-1.5 1Z" />
                    </svg>
                ),
            },
        ],
    },
    {
        title: 'Management',
        items: [
            {
                to: '/users',
                label: 'User Management',
                icon: (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                ),
            },
        ],
    },
];

export default function Layout() {
    const { user, logout } = useAuth();
    const initials = user?.name
        ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
        : 'WA';

    const isAdminRole = user?.super_user === 1 || user?.is_staff;

    return (
        <div className="layout">
            <aside className="sidebar">
                {/* Brand Header */}
                <div className="sidebar-logo">
                    <WorkLensLogo size={28} showText={true} color="#1a56db" textColor="#0f172a" />
                    <span className="sidebar-badge">ADMIN</span>
                </div>

                {/* Grouped Navigation */}
                <nav className="sidebar-nav">
                    {NAV_SECTIONS.map((section, sIdx) => (
                        <div key={sIdx} className="nav-section">
                            <div className="nav-section-title">{section.title}</div>
                            {section.items.map(({ to, label, icon, badge }) => (
                                <NavLink
                                    key={to}
                                    to={to}
                                    end={to === '/'}
                                    className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                                >
                                    <span className="nav-icon">{icon}</span>
                                    <span className="nav-label">{label}</span>
                                    {badge && (
                                        <span className="nav-badge-live">
                                            <span className="nav-badge-dot" />
                                            {badge}
                                        </span>
                                    )}
                                </NavLink>
                            ))}
                        </div>
                    ))}
                </nav>

                {/* Footer with Operational Status & User Profile */}
                <div className="sidebar-footer">
                    {/* Telemetry Status Indicator */}
                    <div className="sidebar-status-chip">
                        <span className="status-indicator-dot" />
                        <span className="status-text">Engine Online</span>
                        <span className="status-sub">v1.0</span>
                    </div>

                    {/* User Profile Card */}
                    <div className="user-chip">
                        <div className="user-avatar">{initials}</div>
                        <div className="user-info">
                            <div className="user-name" title={user?.name || 'Administrator'}>
                                {user?.name || 'Admin'}
                            </div>
                            <div className="user-role-badge">
                                {isAdminRole ? 'Administrator' : 'NEXUS User'}
                            </div>
                        </div>
                        <button
                            className="sign-out-btn"
                            onClick={logout}
                            title="Sign out of NEXUS"
                            aria-label="Sign out"
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                        </button>
                    </div>
                </div>
            </aside>

            <main className="main">
                <Outlet />
            </main>
        </div>
    );
}
