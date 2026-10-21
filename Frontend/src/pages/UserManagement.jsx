import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getErrorMessage } from '../utils/errors';
import { api } from '../services/api';
import * as XLSX from 'xlsx';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';

const UM_PAGE_SIZE = 20;

const DEFAULT_PASSWORD = 'Tcs#1234';

const EMPTY_FORM = { name: '', email: '', batch: '', sub_batch: '', password: DEFAULT_PASSWORD, is_admin: false };
const EMPTY_EDIT = { name: '', email: '', batch: '', sub_batch: '' };

function StatusBadge({ active }) {
    return active
        ? <span className="badge badge-success">Active</span>
        : <span className="badge badge-muted">Inactive</span>;
}

// ── User Insights Modal ────────────────────────────────────────────────────
function UserInsightsModal({ user, onClose }) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const overlayRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await api.userStats(user.id);
                if (!cancelled) setStats(res.stats);
            } catch (e) {
                if (!cancelled) setError(getErrorMessage(e, 'Failed to load stats.'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [user.id]);

    // Close on backdrop click
    const handleOverlayClick = (e) => {
        if (e.target === overlayRef.current) onClose();
    };

    // Close on Escape
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const formatTime = (minutes) => {
        if (!minutes) return '0 min';
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (h === 0) return `${m} min`;
        return m === 0 ? `${h}h` : `${h}h ${m}min`;
    };

    return (
        <div className="ui-modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
            <div className="ui-modal" role="dialog" aria-modal="true" aria-label={`Insights for ${user.name}`}>
                {/* Header */}
                <div className="ui-modal-header">
                    <div className="ui-modal-user">
                        <div className="ui-modal-avatar">
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div className="ui-modal-name">{user.name}</div>
                            <div id="useremail" className="ui-modal-email">{user.email}</div>
                        </div>
                    </div>
                    <button className="ui-modal-close" onClick={onClose} title="Close">✕</button>
                </div>

                {/* Body */}
                <div className="ui-modal-body">
                    {loading && (
                        <div className="loading-wrap" style={{ minHeight: 160 }}>
                            <span className="spinner" /> Loading insights…
                        </div>
                    )}
                    {error && (
                        <div className="um-form-error">{error}</div>
                    )}
                    {stats && !loading && (
                        <>
                            {/* Stat tiles */}
                            <div className="ui-stats-grid">
                                <div className="ui-stat-tile">
                                    <div className="ui-stat-val">{stats.total_questions}</div>
                                    <div className="ui-stat-lbl">Questions Asked</div>
                                </div>
                                <div className="ui-stat-tile">
                                    <div className="ui-stat-val">{formatTime(stats.total_usage_minutes)}</div>
                                    <div className="ui-stat-lbl">Total Usage Time</div>
                                </div>
                                <div className="ui-stat-tile">
                                    <div className="ui-stat-val ui-stat-val--sm">{stats.most_common_problem || '—'}</div>
                                    <div className="ui-stat-lbl">Top Problem Type</div>
                                </div>
                                <div className="ui-stat-tile">
                                    <div className="ui-stat-val ui-stat-val--sm">{stats.most_used_language || '—'}</div>
                                    <div className="ui-stat-lbl">Top Language</div>
                                </div>
                            </div>

                            {/* Breakdowns */}
                            <div className="ui-breakdown-row">
                                {stats.category_breakdown?.length > 0 && (
                                    <div className="ui-breakdown">
                                        <div className="ui-breakdown-title">Problem Categories</div>
                                        {stats.category_breakdown.map((item, i) => {
                                            const max = stats.category_breakdown[0].count;
                                            const pct = max > 0 ? Math.round((item.count / max) * 100) : 0;
                                            return (
                                                <div key={i} className="ui-bar-row">
                                                    <span className="ui-bar-label">{item.category || 'Unknown'}</span>
                                                    <div className="ui-bar-track">
                                                        <div className="ui-bar-fill" style={{ width: `${pct}%` }} />
                                                    </div>
                                                    <span className="ui-bar-count">{item.count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                {stats.language_breakdown?.length > 0 && (
                                    <div className="ui-breakdown">
                                        <div className="ui-breakdown-title">Languages Used</div>
                                        {stats.language_breakdown.map((item, i) => {
                                            const max = stats.language_breakdown[0].count;
                                            const pct = max > 0 ? Math.round((item.count / max) * 100) : 0;
                                            return (
                                                <div key={i} className="ui-bar-row">
                                                    <span className="ui-bar-label">{item.language || 'Unknown'}</span>
                                                    <div className="ui-bar-track">
                                                        <div className="ui-bar-fill ui-bar-fill--lang" style={{ width: `${pct}%` }} />
                                                    </div>
                                                    <span className="ui-bar-count">{item.count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                {!stats.category_breakdown?.length && !stats.language_breakdown?.length && (
                                    <div className="empty-state" style={{ padding: '24px 0' }}>
                                        No activity data yet for this user.
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Edit User Modal ────────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSaved }) {
    const [edit, setEdit] = useState({ name: user.name, email: user.email, batch: user.batch || '', sub_batch: user.sub_batch || '' });
    const [editError, setEditError] = useState('');
    const [editLoading, setEditLoading] = useState(false);
    const overlayRef = useRef(null);

    const handleOverlayClick = (e) => { if (e.target === overlayRef.current) onClose(); };

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setEditError('');
        if (!edit.name.trim() || !edit.email.trim()) {
            setEditError('Name and Email are required.'); return;
        }
        setEditLoading(true);
        try {
            await api.updateUser(user.id, {
                name: edit.name.trim(),
                email: edit.email.trim().toLowerCase(),
                batch: edit.batch.trim(),
                sub_batch: edit.sub_batch.trim(),
            });
            onSaved();
            onClose();
        } catch (err) {
            setEditError(getErrorMessage(err, 'Failed to update user.'));
        } finally {
            setEditLoading(false);
        }
    };

    return (
        <div className="ui-modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
            <div className="ui-modal" role="dialog" aria-modal="true" aria-label={`Edit ${user.name}`} style={{ maxWidth: 480 }}>
                <div className="ui-modal-header">
                    <div className="ui-modal-user">
                        <div className="ui-modal-avatar">{user.name.charAt(0).toUpperCase()}</div>
                        <div>
                            <div className="ui-modal-name">Edit User</div>
                            <div className="ui-modal-email">{user.email}</div>
                        </div>
                    </div>
                    <button className="ui-modal-close" onClick={onClose} title="Close">✕</button>
                </div>
                <div className="ui-modal-body">
                    {editError && <div className="um-form-error" style={{ marginBottom: 12 }}>{editError}</div>}
                    <form className="um-form-grid" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Full Name *</label>
                            <input
                                type="text"
                                value={edit.name}
                                onChange={e => setEdit(f => ({ ...f, name: e.target.value }))}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Email *</label>
                            <input
                                type="email"
                                value={edit.email}
                                onChange={e => setEdit(f => ({ ...f, email: e.target.value }))}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Batch</label>
                            <input
                                type="text"
                                placeholder="e.g. B49"
                                value={edit.batch}
                                onChange={e => setEdit(f => ({ ...f, batch: e.target.value }))}
                            />
                        </div>
                        <div className="form-group">
                            <label>Sub-Batch</label>
                            <input
                                type="text"
                                placeholder="e.g. C3"
                                value={edit.sub_batch}
                                onChange={e => setEdit(f => ({ ...f, sub_batch: e.target.value }))}
                            />
                        </div>
                        <div className="um-form-actions">
                            <button type="submit" className="btn btn-accent" disabled={editLoading}>
                                {editLoading ? 'Saving…' : 'Save Changes'}
                            </button>
                            <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

// ── Create / Admin Modal ─────────────────────────────────────────────────
function CreateUserModal({ isAdmin: adminMode, onClose, onCreated }) {
    const [form, setForm] = useState({ name: '', email: '', batch: '', sub_batch: '', password: 'Tcs#1234', is_admin: adminMode });
    const [formError, setFormError] = useState('');
    const [formLoading, setFormLoading] = useState(false);
    const overlayRef = useRef(null);

    useEffect(() => {
        const h = e => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        if (!form.name.trim() || !form.email.trim()) { setFormError('Name and Email are required.'); return; }
        setFormLoading(true);
        try {
            await api.createUser({
                name: form.name.trim(),
                email: form.email.trim().toLowerCase(),
                batch: form.batch.trim(),
                sub_batch: form.sub_batch.trim(),
                password: form.password || 'Tcs#1234',
                is_admin: adminMode,
                super_user: adminMode ? 1 : 0,
            });
            onCreated();
            onClose();
        } catch (err) {
            setFormError(getErrorMessage(err, 'Failed to create user.'));
        } finally {
            setFormLoading(false);
        }
    };

    const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 14, fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: '#fff', transition: 'border-color 150ms, box-shadow 150ms' };
    const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: 24 }}
            ref={overlayRef} onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
            <div style={{ background: '#fff', borderRadius: 16, maxWidth: 520, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}
                onClick={e => e.stopPropagation()}>
                {/* Modal header */}
                <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: adminMode ? 'linear-gradient(135deg,#8b5cf6,#6d28d9)' : 'linear-gradient(135deg,#3b82f6,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        </div>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Create {adminMode ? 'Admin' : 'User'}</div>
                            <div style={{ fontSize: 12, color: '#94a3b8' }}>Fill in the details below</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 16 }}>×</button>
                </div>
                {/* Modal body */}
                <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {formError && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '10px 14px', color: '#b91c1c', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginTop: 1, flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            {formError}
                        </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                            <label style={labelStyle}>Full Name *</label>
                            <input id="fullname" type="text" placeholder="e.g. Ravi Kumar" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required style={inputStyle} onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.12)'; }} onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }} />
                        </div>
                        <div>
                            <label style={labelStyle}>Email Address *</label>
                            <input id="email" type="email" placeholder="empid@tcs.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required style={inputStyle} onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.12)'; }} onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }} />
                        </div>
                    </div>
                    {!adminMode && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            <div>
                                <label style={labelStyle}>Batch</label>
                                <input id="batch" type="text" placeholder="e.g. B49" value={form.batch} onChange={e => setForm(f => ({ ...f, batch: e.target.value }))} style={inputStyle} onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.12)'; }} onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }} />
                            </div>
                            <div>
                                <label style={labelStyle}>Sub-Batch</label>
                                <input id="subbatch" type="text" placeholder="e.g. C3" value={form.sub_batch} onChange={e => setForm(f => ({ ...f, sub_batch: e.target.value }))} style={inputStyle} onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.12)'; }} onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }} />
                            </div>
                        </div>
                    )}
                    <div>
                        <label style={labelStyle}>Password</label>
                        <input id="password" type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={inputStyle} onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.12)'; }} onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }} />
                        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Default: Tcs#1234 — user can change after first login</p>
                    </div>
                    {/* Footer */}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid #f1f5f9' }}>
                        <button type="button" onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 600 }}>Cancel</button>
                        <button id="createuser" type="submit" disabled={formLoading} style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: adminMode ? '#8b5cf6' : '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 700, opacity: formLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {formLoading ? (<><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />Creating…</>) : `Create ${adminMode ? 'Admin' : 'User'}`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function UserManagement() {
    // ── Data ──────────────────────────────────────────────────────────────
    const [users, setUsers] = useState([]);
    const [batches, setBatches] = useState([]);
    const [subBatches, setSubBatches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // ── Filters ───────────────────────────────────────────────────────────
    const [filterBatch, setFilterBatch] = useState('');
    const [filterSubBatch, setFilterSubBatch] = useState('');
    const [filterStatus, setFilterStatus] = useState('active');
    const [filterRole, setFilterRole] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // ── Bulk action loading ───────────────────────────────────────────────
    const [bulkLoading, setBulkLoading] = useState(false);

    // ── Create Modal ──────────────────────────────────────────────────────
    const [showCreateModal, setShowCreateModal] = useState(null); // null | 'user' | 'admin'

    // ── Bulk Upload ───────────────────────────────────────────────────────
    const fileInputRef = useRef(null);
    const [uploadLoading, setUploadLoading] = useState(false);

    // ── Insights Modal ────────────────────────────────────────────────────
    const [insightsUser, setInsightsUser] = useState(null);

    // ── Edit Modal ────────────────────────────────────────────────────────
    const [editUser, setEditUser] = useState(null);
    const handleCloseEdit = useCallback(() => setEditUser(null), []);

    // ── Table pagination ──────────────────────────────────────────────────
    const [umPage, setUmPage] = useState(1);
    useEffect(() => { setUmPage(1); }, [searchQuery, filterBatch, filterSubBatch, filterStatus, filterRole]);

    // ── Fetch helpers ─────────────────────────────────────────────────────
    const flash = (msg, type = 'success') => {
        if (type === 'success') { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); }
        else { setError(msg); setTimeout(() => setError(''), 5000); }
    };

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const params = {};
            if (filterBatch) params.batch = filterBatch;
            if (filterSubBatch) params.sub_batch = filterSubBatch;
            params.status = filterStatus;
            const res = await api.listUsers(params);
            setUsers(res.users || []);
        } catch (e) {
            flash(getErrorMessage(e, 'Failed to load users.'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchBatches = async () => {
        try {
            const res = await api.getBatches();
            setBatches(res.batches || []);
            setSubBatches(res.sub_batches || []);
        } catch { /* non-critical */ }
    };

    useEffect(() => { fetchBatches(); }, []);
    useEffect(() => { fetchUsers(); }, [filterBatch, filterSubBatch, filterStatus]);

    // ── Toggle Active ─────────────────────────────────────────────────────
    const handleToggleActive = async (user) => {
        try {
            await api.updateUser(user.id, { is_active: !user.is_active });
            flash(`User ${user.is_active ? 'deactivated' : 'activated'}.`);
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
        } catch (e) {
            flash(getErrorMessage(e, 'Action failed.'), 'error');
        }
    };

    // ── Delete ────────────────────────────────────────────────────────────
    const handleDelete = async (user) => {
        if (!window.confirm(`Delete "${user.name}"? This cannot be undone.`)) return;
        try {
            await api.deleteUser(user.id);
            flash('User deleted.');
            setUsers(prev => prev.filter(u => u.id !== user.id));
            await fetchUsers();
        } catch (e) {
            flash(getErrorMessage(e, 'Failed to delete user.'), 'error');
        }
    };

    // ── Filtered sub-batches based on selected batch ──────────────────────
    const filteredSubBatches = filterBatch
        ? users
            .filter(u => u.batch === filterBatch && u.sub_batch)
            .map(u => u.sub_batch)
            .filter((v, i, a) => a.indexOf(v) === i)
        : subBatches;

    // ── Search + Role filtered users (client-side) ───────────────────────
    const isAdmin = (u) => u.is_staff || u.super_user === 1;
    const filteredUsers = users.filter(u => {
        if (filterRole === 'admin' && !isAdmin(u)) return false;
        if (filterRole === 'user' && isAdmin(u)) return false;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            if (!u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
        }
        return true;
    });
    const umTotalPages = Math.ceil(filteredUsers.length / UM_PAGE_SIZE);
    const displayedUsers = filteredUsers.slice((umPage - 1) * UM_PAGE_SIZE, umPage * UM_PAGE_SIZE);

    // ── Bulk Actions ──────────────────────────────────────────────────────
    const handleBulkDeactivate = async () => {
        const targets = displayedUsers.filter(u => u.is_active);
        if (!targets.length) { flash('No active users to deactivate.', 'error'); return; }
        if (!window.confirm(`Deactivate ${targets.length} active user(s) in the current view?`)) return;
        setBulkLoading(true);
        try {
            await Promise.all(targets.map(u => api.updateUser(u.id, { is_active: false })));
            flash(`${targets.length} user(s) deactivated.`);
            await fetchUsers();
        } catch (e) { flash(getErrorMessage(e, 'Bulk deactivate failed.'), 'error'); }
        finally { setBulkLoading(false); }
    };

    const handleBulkActivate = async () => {
        const targets = displayedUsers.filter(u => !u.is_active);
        if (!targets.length) { flash('No inactive users to activate.', 'error'); return; }
        if (!window.confirm(`Activate ${targets.length} inactive user(s) in the current view?`)) return;
        setBulkLoading(true);
        try {
            await Promise.all(targets.map(u => api.updateUser(u.id, { is_active: true })));
            flash(`${targets.length} user(s) activated.`);
            await fetchUsers();
        } catch (e) { flash(getErrorMessage(e, 'Bulk activate failed.'), 'error'); }
        finally { setBulkLoading(false); }
    };

    const handleBulkDelete = async () => {
        if (!displayedUsers.length) { flash('No users to delete.', 'error'); return; }
        if (!window.confirm(`Permanently delete ALL ${displayedUsers.length} user(s) in the current view? This cannot be undone.`)) return;
        setBulkLoading(true);
        try {
            await Promise.all(displayedUsers.map(u => api.deleteUser(u.id)));
            flash(`${displayedUsers.length} user(s) deleted.`);
            await fetchUsers();
            await fetchBatches();
        } catch (e) { flash(getErrorMessage(e, 'Bulk delete failed.'), 'error'); }
        finally { setBulkLoading(false); }
    };

    // ── Bulk Upload ───────────────────────────────────────────────────────
    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadLoading(true);
        try {
            const res = await api.bulkUpload(file);
            if (res.success) {
                const msg = `Imported ${res.created_count} user(s). Skipped: ${res.skipped_count}. Errors: ${res.error_count}.`;
                flash(msg);
                await fetchUsers();
                await fetchBatches();
            } else {
                flash(res.detail || 'Upload failed.', 'error');
            }
        } catch (e) {
            flash(getErrorMessage(e, 'Upload failed.'), 'error');
        } finally {
            setUploadLoading(false);
            e.target.value = '';
        }
    };

    // ── Download Template ─────────────────────────────────────────────────
    const handleDownloadTemplate = () => {
        const ws = XLSX.utils.aoa_to_sheet([['Name', 'Email', 'Batch', 'Sub-Batch']]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Users');
        XLSX.writeFile(wb, 'worklens_users_template.xlsx');
    };

    const handleCloseInsights = useCallback(() => setInsightsUser(null), []);

    return (
        <div>
            {/* ── Page Header ── */}
            <PageHeader
                title="User Management"
                subtitle="Create, bulk-import, filter, and manage WorkLens user accounts & permissions."
                icon={
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                }
                actions={
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            id="adduser"
                            className="btn btn-accent"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            onClick={() => setShowCreateModal('user')}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            Create User
                        </button>
                        <button
                            id="createadmin"
                            className="btn btn-outline"
                            style={{ borderColor: 'rgba(109,104,255,0.5)', color: '#818cf8', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            onClick={() => setShowCreateModal('admin')}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            Create Admin
                        </button>
                    </div>
                }
            />

            {/* ── Flash Messages ── */}
            {success && <div className="um-flash um-flash-success">{success}</div>}
            {error && <div className="um-flash um-flash-error">{error}</div>}

            {/* ── Action Bar (Bulk Tools) ── */}
            <div className="um-action-bar" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <div className="um-upload-row">
                    <label className="btn btn-outline btn-sm um-upload-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                        {uploadLoading ? 'Uploading…' : 'Bulk Upload (.xlsx)'}
                        <input
                            id="uploadlxlsx"
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                            disabled={uploadLoading}
                        />
                    </label>
                    <button id="downformt" className="btn btn-outline btn-sm" onClick={handleDownloadTemplate} title="Download Excel template" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        Download Format
                    </button>
                </div>
            </div>

            {/* ── Filter Bar ── */}
            <div className="um-filter-bar card">
                <span className="um-filter-label">Filter:</span>

                {/* Search by name or email */}
                <div className="um-search-wrap">
                    <svg className="um-search-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        id="searchuser"
                        className="um-search-input"
                        type="text"
                        placeholder="Search by name or email…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button className="um-search-clear" onClick={() => setSearchQuery('')} title="Clear search">✕</button>
                    )}
                </div>

                <select
                    id="selectbatch"
                    className="um-select"
                    value={filterBatch}
                    onChange={e => { setFilterBatch(e.target.value); setFilterSubBatch(''); }}
                >
                    <option value="">All Batches</option>
                    {batches.map(b => <option key={b} value={b}>{b}</option>)}
                </select>

                <select
                    id="selectsubbatch"
                    className="um-select"
                    value={filterSubBatch}
                    onChange={e => setFilterSubBatch(e.target.value)}
                >
                    <option value="">All Sub-Batches</option>
                    {filteredSubBatches.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                <select
                    id="active"
                    className="um-select"
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="all">All</option>
                </select>

                <select
                    id="filterrole"
                    className="um-select"
                    value={filterRole}
                    onChange={e => setFilterRole(e.target.value)}
                >
                    <option value="">All Roles</option>
                    <option value="admin">Admin</option>
                    <option value="user">User</option>
                </select>

                <div className="um-bulk-actions">
                    <button
                        id="refresh"
                        className="btn btn-outline btn-sm"
                        onClick={fetchUsers}
                        disabled={bulkLoading}
                    >
                        Refresh
                    </button>
                    <button
                        id="bulkactivate"
                        className="btn btn-outline btn-sm um-bulk-activate"
                        onClick={handleBulkActivate}
                        disabled={bulkLoading}
                        title="Activate all inactive users in current view"
                    >
                        {bulkLoading ? '…' : '✓ Activate All'}
                    </button>
                    <button
                        id="bulkdeactivate"
                        className="btn btn-outline btn-sm um-bulk-deactivate"
                        onClick={handleBulkDeactivate}
                        disabled={bulkLoading}
                        title="Deactivate all active users in current view"
                    >
                        {bulkLoading ? '…' : '⊘ Deactivate All'}
                    </button>
                    <button
                        id="bulkdelete"
                        className="btn btn-outline btn-sm um-bulk-delete"
                        onClick={handleBulkDelete}
                        disabled={bulkLoading}
                        title="Delete all users in current view"
                    >
                        {bulkLoading ? '…' : 'Delete All'}
                    </button>
                </div>
            </div>

            {/* ── Users Table ── */}
            <div className="card um-table-section">
                <div className="um-table-header">
                    <span className="card-title" style={{ marginBottom: 0 }}>
                        Users
                    </span>
                    <span className="um-count">
                        {displayedUsers.length}{searchQuery ? ` of ${users.length}` : ''} result{displayedUsers.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {loading ? (
                    <div className="loading-wrap"><span className="spinner" /> Loading users…</div>
                ) : displayedUsers.length === 0 ? (
                    <div className="empty-state">
                        {searchQuery ? `No users match "${searchQuery}".` : 'No users found for the selected filters.'}
                    </div>
                ) : (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Batch</th>
                                    <th>Sub-Batch</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayedUsers.map(user => (
                                    <tr key={user.id}>
                                        <td className="um-name">{user.name}</td>
                                        <td className="um-email">{user.email}</td>
                                        <td>
                                            {isAdmin(user)
                                                ? <span className="badge" style={{ background: '#1a56db', color: '#fff', fontSize: '0.7rem', padding: '2px 8px', borderRadius: 999 }}>Admin</span>
                                                : <span className="badge badge-muted" style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 999 ,color:'#1a56db'}}>User</span>
                                            }
                                        </td>
                                        <td>{user.batch || <span className="um-empty">—</span>}</td>
                                        <td>{user.sub_batch || <span className="um-empty">—</span>}</td>
                                        <td><StatusBadge active={user.is_active} /></td>
                                        <td className="um-date">
                                            {new Date(user.created_at).toLocaleDateString('en-IN', {
                                                day: '2-digit', month: 'short', year: 'numeric'
                                            })}
                                        </td>
                                        <td>
                                            <div className="um-actions">
                                                {/* Eye icon — insights modal */}
                                                <button
                                                    id="viewuser"
                                                    className="btn-action btn-action-info"
                                                    onClick={() => setInsightsUser(user)}
                                                    title="View user insights"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                        <circle cx="12" cy="12" r="3" />
                                                    </svg>
                                                </button>
                                                {/* Edit icon */}
                                                <button
                                                    id="edituser"
                                                    className="btn-action btn-action-edit"
                                                    onClick={() => setEditUser(user)}
                                                    title="Edit user"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    id="deactivate"
                                                    className={`btn-action ${user.is_active ? 'btn-action-warn' : 'btn-action-success'}`}
                                                    onClick={() => handleToggleActive(user)}
                                                    title={user.is_active ? 'Deactivate' : 'Activate'}
                                                >
                                                    {user.is_active ? 'Deactivate' : 'Activate'}
                                                </button>
                                                <button
                                                    id="deleteuser"
                                                    className="btn-action btn-action-danger"
                                                    onClick={() => handleDelete(user)}
                                                    title="Delete user"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ── Pagination Footer ── */}
                {!loading && filteredUsers.length > 0 && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 18px',
                        borderTop: '1px solid var(--border-color, #e2e8f0)',
                        background: 'var(--surface-color, #ffffff)',
                        borderRadius: '0 0 var(--radius-md, 12px) var(--radius-md, 12px)',
                        flexWrap: 'wrap',
                        gap: 12
                    }}>
                        <div style={{ fontSize: 13, color: '#64748b' }}>
                            Showing <strong style={{ color: '#1e293b' }}>{((umPage - 1) * UM_PAGE_SIZE) + 1}</strong> to <strong style={{ color: '#1e293b' }}>{Math.min(umPage * UM_PAGE_SIZE, filteredUsers.length)}</strong> of <strong style={{ color: '#1e293b' }}>{filteredUsers.length}</strong> users
                        </div>
                        <Pagination page={umPage} totalPages={umTotalPages} onPageChange={setUmPage} />
                    </div>
                )}
            </div>

            {/* ── Create User / Admin Modal ── */}
            {showCreateModal && (
                <CreateUserModal
                    isAdmin={showCreateModal === 'admin'}
                    onClose={() => setShowCreateModal(null)}
                    onCreated={async () => {
                        flash(`${showCreateModal === 'admin' ? 'Admin' : 'User'} created successfully.`);
                        await fetchUsers();
                        await fetchBatches();
                    }}
                />
            )}

            {/* ── Edit User Modal ── */}
            {editUser && (
                <EditUserModal
                    user={editUser}
                    onClose={handleCloseEdit}
                    onSaved={async () => { flash('User updated successfully.'); await fetchUsers(); await fetchBatches(); }}
                />
            )}

            {/* ── User Insights Modal ── */}
            {insightsUser && (
                <UserInsightsModal user={insightsUser} onClose={handleCloseInsights} />
            )}
        </div>
    );
} 