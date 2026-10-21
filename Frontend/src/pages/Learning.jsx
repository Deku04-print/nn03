import { useState, useCallback, useEffect } from 'react';
import { api } from '../services/api.js';
import { usePolling } from '../hooks/usePolling.js';
import {
    RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
    Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList
} from 'recharts';
import EmptyState from '../components/EmptyState.jsx';
import PageHeader from '../components/PageHeader.jsx';

export default function Learning() {
    const [selectedDevId, setSelectedDevId] = useState(null);
    const [devDetail, setDevDetail] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [search, setSearch] = useState('');

    // Fetch developers list
    const fetcher = useCallback(() => api.developersList().then(r => r.data || []), []);
    const { data: rawDevelopers, loading: loadingDevs, error, refresh } = usePolling(fetcher);
    const developers = rawDevelopers || [];

    // Load developer detail when selected
    const handleSelectDeveloper = async (devId) => {
        setSelectedDevId(devId);
        setLoadingDetail(true);
        try {
            const res = await api.developerDetail(devId);
            if (res.success) {
                setDevDetail(res.data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingDetail(false);
        }
    };

    const handleBackToRoster = () => {
        setSelectedDevId(null);
        setDevDetail(null);
    };

    // Filter developers
    const filteredDevs = developers.filter(d => {
        const q = search.toLowerCase();
        return !q || d.name?.toLowerCase().includes(q) || d.email?.toLowerCase().includes(q) || d.batch?.toLowerCase().includes(q);
    });

    const totalDevs = developers.length;
    const avgResolution = developers.length
        ? Math.round(developers.reduce((s, d) => s + (d.resolution_rate || 0), 0) / developers.length)
        : 62;

    return (
        <div>
            {/* Header */}
            <PageHeader
                title="SkillQuest Developer Capability Intelligence"
                subtitle="Evidence-based developer proficiency profiling, strength tracking, and concept gap diagnostics derived from real workspace telemetry."
                live={true}
                icon={
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                    </svg>
                }
                actions={
                    selectedDevId ? (
                        <button
                            onClick={handleBackToRoster}
                            className="btn btn-outline btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                            ← Back to Developers Roster
                        </button>
                    ) : (
                        <button
                            onClick={refresh}
                            className="btn btn-outline btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                            Sync Developer Telemetry
                        </button>
                    )
                }
            />

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', color: '#b91c1c', fontSize: 13, marginBottom: 20 }}>
                    {error}
                </div>
            )}

            {/* VIEW 1: DEVELOPER ROSTER (DEFAULT) */}
            {!selectedDevId && (
                <div>
                    {/* Metrics Strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
                        {[
                            { label: 'Active Developers', val: totalDevs, sub: 'Under continuous telemetry', color: '#2563eb' },
                            { label: 'Org Mean Resolution', val: `${avgResolution}%`, sub: 'Unassisted problem solving', color: '#059669' },
                            { label: 'Leading Practice', val: 'Full Stack & Cloud', sub: 'TCS Practices', color: '#8b5cf6', isText: true },
                            { label: 'Target Skill Gaps', val: 'Docker & Shell', sub: 'Highest guidance needed', color: '#f59e0b', isText: true },
                        ].map((stat, i) => (
                            <div
                                key={i}
                                style={{
                                    background: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 12,
                                    padding: '16px 18px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                    borderLeft: `4px solid ${stat.color}`,
                                }}
                            >
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                                    {stat.label}
                                </div>
                                <div style={{ fontSize: stat.isText ? 18 : 26, fontWeight: 800, color: stat.color, lineHeight: 1.1 }}>
                                    {stat.val}
                                </div>
                                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                                    {stat.sub}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Developer Directory Section */}
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, background: '#f8fafc' }}>
                            <div>
                                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 2px 0' }}>
                                    Enterprise Developer Directory & Telemetry Index
                                </h3>
                                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                                    Select any developer to inspect their detailed language strengths, concept lags, and personalized coaching plan.
                                </p>
                            </div>
                            <input
                                placeholder="Search by developer name, email, practice…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{
                                    padding: '7px 14px',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: 8,
                                    fontSize: 12.5,
                                    width: 280,
                                    outline: 'none',
                                    background: '#ffffff',
                                }}
                            />
                        </div>

                        {loadingDevs && !developers.length ? (
                            <div style={{ padding: '50px 20px', textAlign: 'center', color: '#64748b' }}>
                                <span className="spinner" /> Loading developer capabilities…
                            </div>
                        ) : filteredDevs.length === 0 ? (
                            <EmptyState
                                icon="user"
                                title="No developers found"
                                description="No active developers matched your search query."
                            />
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Developer</th>
                                            <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Practice / Role</th>
                                            <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Primary Stack</th>
                                            <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Problems Logged</th>
                                            <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Resolution Rate</th>
                                            <th style={{ textAlign: 'right', padding: '12px 18px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Deep Analysis</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredDevs.map(dev => (
                                            <tr
                                                key={dev.id}
                                                style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 120ms' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseLeave={e => e.currentTarget.style.background = ''}
                                            >
                                                <td style={{ padding: '12px 18px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <div style={{
                                                            width: 34,
                                                            height: 34,
                                                            borderRadius: '50%',
                                                            background: '#eff6ff',
                                                            color: '#2563eb',
                                                            border: '1px solid #bfdbfe',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontWeight: 800,
                                                            fontSize: 13,
                                                        }}>
                                                            {dev.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{dev.name}</div>
                                                            <div style={{ fontSize: 11.5, color: '#64748b' }}>{dev.email}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 18px' }}>
                                                    <div style={{ fontWeight: 600, color: '#334155' }}>{dev.batch}</div>
                                                    <div style={{ fontSize: 11, color: '#64748b' }}>{dev.sub_batch}</div>
                                                </td>
                                                <td style={{ padding: '12px 18px' }}>
                                                    <span style={{ fontFamily: 'monospace', fontSize: 12, background: '#f1f5f9', padding: '3px 8px', borderRadius: 6, color: '#334155' }}>
                                                        {dev.primary_language}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 18px' }}>
                                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{dev.total_problems}</span>
                                                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>
                                                        ({dev.resolved_problems} resolved)
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 18px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <div style={{ width: 60, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                                                            <div style={{ width: `${dev.resolution_rate}%`, height: '100%', background: dev.resolution_rate >= 60 ? '#10b981' : '#f59e0b', borderRadius: 3 }} />
                                                        </div>
                                                        <span style={{ fontSize: 12, fontWeight: 700, color: dev.resolution_rate >= 60 ? '#059669' : '#d97706' }}>
                                                            {dev.resolution_rate}%
                                                        </span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                                                    <button
                                                        onClick={() => handleSelectDeveloper(dev.id)}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 6,
                                                            padding: '6px 14px',
                                                            background: '#2563eb',
                                                            color: '#ffffff',
                                                            border: 'none',
                                                            borderRadius: 7,
                                                            fontSize: 12,
                                                            fontWeight: 700,
                                                            cursor: 'pointer',
                                                            boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
                                                        }}
                                                    >
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                                        Analyze Developer
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* VIEW 2: DEEP-DIVE DEVELOPER ANALYSIS */}
            {selectedDevId && (
                <div>
                    {loadingDetail ? (
                        <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
                            <span className="spinner" /> Analyzing developer telemetry across workspaces…
                        </div>
                    ) : devDetail ? (
                        <div>
                            {/* Developer Executive Badge Bar */}
                            <div style={{
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: 14,
                                padding: '20px 24px',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                                marginBottom: 20,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: 16,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <div style={{
                                        width: 52,
                                        height: 52,
                                        borderRadius: '50%',
                                        background: '#2563eb',
                                        color: '#ffffff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 20,
                                        fontWeight: 800,
                                    }}>
                                        {devDetail.developer?.name?.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                                                {devDetail.developer?.name}
                                            </h2>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '3px 8px', borderRadius: 6, border: '1px solid #dbeafe' }}>
                                                {devDetail.developer?.batch}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 12.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span>{devDetail.developer?.email}</span>
                                            <span>·</span>
                                            <span>Role: <strong style={{ color: '#334155' }}>{devDetail.developer?.sub_batch}</strong></span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Resolution Rate</div>
                                        <div style={{ fontSize: 22, fontWeight: 800, color: '#059669' }}>{devDetail.developer?.resolution_rate}%</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Capability Percentile</div>
                                        <div style={{ fontSize: 22, fontWeight: 800, color: '#2563eb' }}>Top {100 - (devDetail.developer?.percentile || 80)}%</div>
                                    </div>
                                </div>
                            </div>

                            {/* Two-Column Grid: Strengths vs Lagging */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20, marginBottom: 20 }}>
                                {/* STRENGTHS CARD */}
                                <div style={{
                                    background: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 14,
                                    padding: '22px 24px',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                                    borderTop: '4px solid #059669',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                        <div>
                                            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 2px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                                Demonstrated Strengths & High Proficiency
                                            </h3>
                                            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                                                Languages and frameworks where the developer operates independently with minimal guidance.
                                            </p>
                                        </div>
                                    </div>

                                    {devDetail.strengths?.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {devDetail.strengths.map((str, i) => (
                                                <div
                                                    key={i}
                                                    style={{
                                                        border: '1px solid #d1fae5',
                                                        background: '#f0fdf4',
                                                        borderRadius: 10,
                                                        padding: '12px 16px',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span style={{ fontSize: 13, fontWeight: 800, color: '#065f46', textTransform: 'capitalize' }}>
                                                                {str.language}
                                                            </span>
                                                            <span style={{ fontSize: 11, color: '#047857', background: '#d1fae5', padding: '1px 7px', borderRadius: 4, fontWeight: 700 }}>
                                                                {str.framework}
                                                            </span>
                                                        </div>
                                                        <span style={{ fontSize: 14, fontWeight: 800, color: '#047857' }}>
                                                            {str.proficiency_score}% Mastery
                                                        </span>
                                                    </div>

                                                    <div style={{ fontSize: 12, color: '#065f46', marginBottom: 6 }}>
                                                        ✓ Solved {str.problems_solved} of {str.total_encountered} encountered issues with minimal mentor escalation.
                                                    </div>

                                                    <div style={{ width: '100%', height: 5, background: '#a7f3d0', borderRadius: 3, overflow: 'hidden' }}>
                                                        <div style={{ width: `${str.proficiency_score}%`, height: '100%', background: '#059669', borderRadius: 3 }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: 12.5, color: '#64748b', fontStyle: 'italic' }}>
                                            Baseline capability data is still compiling.
                                        </div>
                                    )}
                                </div>

                                {/* LAGGING CONCEPTS CARD */}
                                <div style={{
                                    background: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 14,
                                    padding: '22px 24px',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                                    borderTop: '4px solid #dc2626',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                        <div>
                                            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 2px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                                Concept Gaps & Areas Lagging Behind
                                            </h3>
                                            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                                                Topics where repeated attempts or high mentor guidance levels (L2-L3) were required.
                                            </p>
                                        </div>
                                    </div>

                                    {devDetail.lagging?.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {devDetail.lagging.slice(0, 4).map((lag, i) => (
                                                <div
                                                    key={i}
                                                    style={{
                                                        border: '1px solid #fee2e2',
                                                        background: '#fef2f2',
                                                        borderRadius: 10,
                                                        padding: '12px 16px',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                        <span style={{ fontSize: 13, fontWeight: 800, color: '#991b1b' }}>
                                                            {lag.topic}
                                                        </span>
                                                        <span style={{
                                                            fontSize: 10.5,
                                                            fontWeight: 800,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.05em',
                                                            padding: '2px 7px',
                                                            borderRadius: 4,
                                                            background: lag.priority === 'High' ? '#fecaca' : '#fed7aa',
                                                            color: lag.priority === 'High' ? '#b91c1c' : '#c2410c',
                                                        }}>
                                                            {lag.priority} Priority Gap
                                                        </span>
                                                    </div>

                                                    <div style={{ fontSize: 12, color: '#7f1d1d', marginBottom: 6 }}>
                                                        {lag.unresolved_count} unresolved instances across sessions · Friction difficulty: {lag.difficulty_score}%
                                                    </div>

                                                    <div style={{ fontSize: 12, color: '#1e293b', background: '#ffffff', padding: '8px 10px', borderRadius: 6, border: '1px solid #fecaca' }}>
                                                        <strong style={{ color: '#b91c1c' }}>Actionable Coaching: </strong>
                                                        {lag.recommendation}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: 12.5, color: '#64748b', fontStyle: 'italic' }}>
                                            No critical skill gaps detected. Developer is performing smoothly across topics.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Topic Mastery Matrix */}
                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '22px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 20 }}>
                                <div style={{ marginBottom: 16 }}>
                                    <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 2px 0' }}>
                                        Curriculum & Concept Mastery Matrix
                                    </h3>
                                    <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                                        Automated grading against corporate engineering competency standards based on telemetry evidence.
                                    </p>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                                    {devDetail.topic_matrix?.map((tm, idx) => {
                                        const isStrong = tm.status === 'Strong';
                                        const isCompetent = tm.status === 'Competent';
                                        const color = isStrong ? '#059669' : isCompetent ? '#2563eb' : '#dc2626';
                                        const bg = isStrong ? '#ecfdf5' : isCompetent ? '#eff6ff' : '#fef2f2';

                                        return (
                                            <div
                                                key={idx}
                                                style={{
                                                    background: '#f8fafc',
                                                    border: '1px solid #e2e8f0',
                                                    borderRadius: 10,
                                                    padding: '14px 16px',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                                                        {tm.domain}
                                                    </span>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, padding: '2px 7px', borderRadius: 4 }}>
                                                        {tm.status}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                                                        <div style={{ width: `${tm.mastery}%`, height: '100%', background: color, borderRadius: 3 }} />
                                                    </div>
                                                    <span style={{ fontSize: 12, fontWeight: 800, color }}>{tm.mastery}%</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}
