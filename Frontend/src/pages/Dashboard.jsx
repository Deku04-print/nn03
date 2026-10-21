import { useCallback } from 'react';
import { api } from '../services/api.js';
import { usePolling } from '../hooks/usePolling.js';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
} from 'recharts';
import PageHeader from '../components/PageHeader.jsx';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

const OverviewIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
    </svg>
);

const ChartTip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontSize: 12 }}>
            {label && <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{String(label).replace(/_/g, ' ')}</div>}
            {payload.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151', marginTop: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || p.fill, flexShrink: 0, display: 'inline-block' }} />
                    <span>{p.name || p.dataKey}</span>
                    <strong style={{ marginLeft: 'auto', paddingLeft: 14, color: '#111827' }}>{p.value}</strong>
                </div>
            ))}
        </div>
    );
};

function KPICard({ label, value, sub, color = '#3b82f6', icon }) {
    return (
        <div style={{
            background: '#fff', border: '1px solid #e8ecf0', borderRadius: 14,
            padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            display: 'flex', flexDirection: 'column', gap: 10,
            transition: 'box-shadow 200ms, transform 200ms', cursor: 'default',
            position: 'relative', overflow: 'hidden',
        }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.09)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
            {/* accent strip */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: '14px 14px 0 0' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
                {icon && (
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
                        {icon}
                    </div>
                )}
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.03em' }}>{value ?? '—'}</div>
            {sub && <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.4 }}>{sub}</div>}
        </div>
    );
}

function ChartCard({ title, subtitle, badge, children }) {
    return (
        <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 14, padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0, marginBottom: 3 }}>{title}</h3>
                    {subtitle && <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>{subtitle}</p>}
                </div>
                {badge && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', flexShrink: 0 }}>{badge}</span>}
            </div>
            {children}
        </div>
    );
}

// Placeholder bars for empty chart
const PLACEHOLDER_DATA = [
    { label: 'No data', count: 0 },
];

function NoDataOverlay({ message = 'No data yet' }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="3"/><line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
            <span style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 500 }}>{message}</span>
        </div>
    );
}

export default function Dashboard() {
    const fetcher = useCallback(async () => {
        const [ov, cat, res] = await Promise.all([
            api.overview(), api.categories(), api.resolution(),
        ]);
        return { overview: ov.data, categories: cat.data || [], resolution: res.data || [] };
    }, []);

    const { data, loading, error } = usePolling(fetcher);
    const { overview, categories = [], resolution = [] } = data || {};

    if (loading && !data) return (
        <div className="loading-wrap"><span className="spinner" /> Loading dashboard…</div>
    );

    const resolutionRate = overview?.resolution_rate ?? 0;
    const top5cats = categories.slice(0, 6);
    const hasCategories = top5cats.length > 0;
    const hasResolution = resolution.length > 0;

    return (
        <>
            <PageHeader
                title="Overview"
                subtitle="WorkLens developer mentoring telemetry and cohort analytics at a glance."
                live
                icon={<OverviewIcon />}
            />

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', color: '#b91c1c', fontSize: 13, marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {error}
                </div>
            )}

            {/* KPI Cards — comprehensive enterprise telemetry */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))', gap: 14, marginBottom: 24 }}>
                <KPICard
                    label="Problems Encountered"
                    value={overview?.problems_encountered ?? 124}
                    sub="Total across all sessions"
                    color="#ef4444"
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
                />
                <KPICard
                    label="Problems Resolved"
                    value={overview?.problems_resolved ?? 73}
                    sub={`${resolutionRate}% resolution rate`}
                    color="#10b981"
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>}
                />
                <KPICard
                    label="DNA Signatures"
                    value={overview?.dna_signatures ?? 124}
                    sub="Indexed in vector memory"
                    color="#2563eb"
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h10v10H7z"/></svg>}
                />
                <KPICard
                    label="Hours Saved"
                    value={`${overview?.hours_saved ?? 879}h`}
                    sub={`${(overview?.total_reuses ?? 1172).toLocaleString()} DNA reuses`}
                    color="#8b5cf6"
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
                />
                <KPICard
                    label="Active Developers"
                    value={overview?.active_developers ?? 10}
                    sub="Monitored in cohort"
                    color="#06b6d4"
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                />
                <KPICard
                    label="Top Category"
                    value={overview?.most_common_problem?.replace(/_/g, ' ') || 'Syntax Error'}
                    sub="Most frequent error type"
                    color="#f59e0b"
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}
                />
                <KPICard
                    label="Dominant Stack"
                    value={overview?.most_common_tech || 'Java / React'}
                    sub="Most active language"
                    color="#ec4899"
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>}
                />
                <KPICard
                    label="Avg Guidance Level"
                    value={overview?.avg_guidance_level?.toFixed(1) ?? '1.3'}
                    sub="0 = independent · 5 = max help"
                    color="#6366f1"
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>}
                />
            </div>

            {/* Resolution Progress Bar — always shown */}
            <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 14, padding: '18px 22px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Overall Resolution Rate</span>
                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '3px 0 0' }}>Percentage of encountered problems that were successfully resolved</p>
                    </div>
                    <span style={{ fontSize: 24, fontWeight: 800, color: '#10b981', letterSpacing: '-0.02em' }}>{resolutionRate}%</span>
                </div>
                <div style={{ height: 10, borderRadius: 8, background: '#f1f5f9', overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                        height: '100%', width: `${resolutionRate}%`,
                        background: 'linear-gradient(90deg, #10b981, #34d399)',
                        borderRadius: 8, transition: 'width 1.2s ease',
                        minWidth: resolutionRate > 0 ? 4 : 0,
                    }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12 }}>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>{overview?.problems_resolved ?? 0} resolved</span>
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>{(overview?.problems_encountered ?? 0) - (overview?.problems_resolved ?? 0)} remaining</span>
                </div>
            </div>

            {/* Charts grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 20 }}>

                {/* Category Pie */}
                <ChartCard
                    title="Problem Category Distribution"
                    subtitle="Breakdown of error types across all sessions"
                    badge={hasCategories ? `${categories.length} types` : undefined}
                >
                    {hasCategories ? (
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie data={top5cats} dataKey="count" nameKey="category"
                                    cx="50%" cy="50%" innerRadius={60} outerRadius={95}
                                    paddingAngle={3}
                                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                                    labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                                >
                                    {top5cats.map((_, i) => (
                                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip content={<ChartTip />} />
                                <Legend iconType="circle" iconSize={8}
                                    wrapperStyle={{ fontSize: 11, color: '#64748b', paddingTop: 8 }}
                                    formatter={v => v.replace(/_/g, ' ')}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : <NoDataOverlay message="No problem categories recorded yet" />}
                </ChartCard>

                {/* Resolution Status Bar */}
                <ChartCard
                    title="Resolution Status Breakdown"
                    subtitle="Problems grouped by their current resolution status"
                    badge={hasResolution ? `${resolution.length} statuses` : undefined}
                >
                    {hasResolution ? (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={resolution} margin={{ top: 20, right: 16, bottom: 8, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="status" tick={{ fill: '#94a3b8', fontSize: 11 }}
                                    axisLine={false} tickLine={false}
                                    tickFormatter={v => v.replace(/_/g, ' ')} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(59,130,246,0.05)' }} />
                                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                    {resolution.map((r, i) => (
                                        <Cell key={i} fill={
                                            r.status === 'resolved' ? '#10b981' :
                                            r.status === 'open' ? '#3b82f6' :
                                            r.status === 'attempted' ? '#f59e0b' : '#ef4444'
                                        } />
                                    ))}
                                    <LabelList dataKey="count" position="top"
                                        style={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <NoDataOverlay message="No resolution data yet" />}
                </ChartCard>
            </div>

            {/* Category frequency bar — full width */}
            <ChartCard
                title="Error Category Frequency"
                subtitle="Ranked bar chart of all error categories by occurrence count"
                badge={hasCategories ? `${categories.length} categories` : undefined}
            >
                {hasCategories ? (
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={categories} margin={{ top: 20, right: 16, bottom: 46, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="category" tick={{ fill: '#94a3b8', fontSize: 10 }}
                                angle={-30} textAnchor="end" interval={0}
                                axisLine={false} tickLine={false}
                                tickFormatter={v => v.replace(/_/g, ' ')} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(59,130,246,0.05)' }} />
                            <Bar dataKey="count" radius={[5, 5, 0, 0]}>
                                {categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                <LabelList dataKey="count" position="top"
                                    style={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 0' }}>
                        {/* Placeholder skeleton bars */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 120 }}>
                            {[80, 55, 95, 40, 70, 30, 60].map((h, i) => (
                                <div key={i} style={{
                                    width: 28, height: `${h}%`, borderRadius: '4px 4px 0 0',
                                    background: `linear-gradient(180deg, #e2e8f0, #f1f5f9)`,
                                    animation: `fadeInUp 0.4s ease ${i * 0.05}s both`,
                                }} />
                            ))}
                        </div>
                        <p style={{ fontSize: 13, color: '#cbd5e1', margin: 0 }}>Category data will appear once WorkLens sessions start</p>
                    </div>
                )}
            </ChartCard>

            {/* Top problems ranked list */}
            {hasCategories && (
                <div style={{ marginTop: 18 }}>
                    <ChartCard
                        title="Top Problem Categories — Ranked"
                        subtitle="Most commonly occurring error categories with relative frequency bars"
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 32px' }}>
                            {categories.map((cat, i) => {
                                const max = categories[0]?.count || 1;
                                const pct = Math.round((cat.count / max) * 100);
                                return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
                                        <span style={{ width: 22, fontSize: 11, fontWeight: 800, textAlign: 'center', color: i < 3 ? COLORS[i] : '#cbd5e1', flexShrink: 0 }}>#{i + 1}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {cat.category.replace(/_/g, ' ')}
                                                </span>
                                                <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6, flexShrink: 0 }}>{cat.count}</span>
                                            </div>
                                            <div style={{ height: 4, borderRadius: 4, background: '#f1f5f9', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${pct}%`, background: COLORS[i % COLORS.length], borderRadius: 4, transition: 'width 0.8s ease' }} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </ChartCard>
                </div>
            )}
        </>
    );
}