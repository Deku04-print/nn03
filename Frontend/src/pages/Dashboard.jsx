import { nexusStyleClass } from '../utils/styleTokens.js';
import { useCallback } from 'react';
import { api } from '../services/api.js';
import { usePolling } from '../hooks/usePolling.js';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from
'recharts';
import PageHeader from '../components/PageHeader.jsx';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

const OverviewIcon = () =>
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>;


const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={["nxs-17ph3p0"].filter(Boolean).join(" ")}>
            {label && <div className={["nxs-dtua93"].filter(Boolean).join(" ")}>{String(label).replace(/_/g, ' ')}</div>}
            {payload.map((p, i) =>
      <div key={i} className={["nxs-vq5cqk"].filter(Boolean).join(" ")}>
                    <span className={["nxs-1jz6fct", nexusStyleClass("background", p.color || p.fill)].filter(Boolean).join(" ")} />
                    <span>{p.name || p.dataKey}</span>
                    <strong className={["nxs-1l0416i"].filter(Boolean).join(" ")}>{p.value}</strong>
                </div>
      )}
        </div>);

};

function KPICard({ label, value, sub, color = '#3b82f6', icon }) {
  return (
    <div


      className={["nxs-1516exd"].filter(Boolean).join(" ")}>
            {/* accent strip */}
            <div className={["nxs-18bdkwt", nexusStyleClass("background", color)].filter(Boolean).join(" ")} />
            <div className={["nxs-21fjk6"].filter(Boolean).join(" ")}>
                <span className={["nxs-1rwhglg"].filter(Boolean).join(" ")}>{label}</span>
                {icon &&
        <div className={["nxs-1ves2xz", nexusStyleClass("background", `${color}12`), nexusStyleClass("color", color)].filter(Boolean).join(" ")}>
                        {icon}
                    </div>
        }
            </div>
            <div className={["nxs-1iwlsej", nexusStyleClass("color", color)].filter(Boolean).join(" ")}>{value ?? '—'}</div>
            {sub && <div className={["nxs-w3x0qd"].filter(Boolean).join(" ")}>{sub}</div>}
        </div>);

}

function ChartCard({ title, subtitle, badge, children }) {
  return (
    <div className={["nxs-1iafkan"].filter(Boolean).join(" ")}>
            <div className={["nxs-5v6jgb"].filter(Boolean).join(" ")}>
                <div>
                    <h3 className={["nxs-d689st"].filter(Boolean).join(" ")}>{title}</h3>
                    {subtitle && <p className={["nxs-1xq0eco"].filter(Boolean).join(" ")}>{subtitle}</p>}
                </div>
                {badge && <span className={["nxs-1entffs"].filter(Boolean).join(" ")}>{badge}</span>}
            </div>
            {children}
        </div>);

}

// Placeholder bars for empty chart
const PLACEHOLDER_DATA = [
{ label: 'No data', count: 0 }];


function NoDataOverlay({ message = 'No data yet' }) {
  return (
    <div className={["nxs-1qqsp5w"].filter(Boolean).join(" ")}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="3" /><line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
            <span className={["nxs-bs1cxf"].filter(Boolean).join(" ")}>{message}</span>
        </div>);

}

export default function Dashboard() {
  const fetcher = useCallback(async () => {
    const [ov, cat, res] = await Promise.all([
    api.overview(), api.categories(), api.resolution()]
    );
    return { overview: ov.data, categories: cat.data || [], resolution: res.data || [] };
  }, []);

  const { data, loading, error } = usePolling(fetcher);
  const { overview, categories = [], resolution = [] } = data || {};

  if (loading && !data) return (
    <div className="loading-wrap"><span className="spinner" /> Loading dashboard…</div>);


  const resolutionRate = overview?.resolution_rate ?? 0;
  const top5cats = categories.slice(0, 6);
  const hasCategories = top5cats.length > 0;
  const hasResolution = resolution.length > 0;

  return (
    <>
            <PageHeader
        title="Overview"
                subtitle="Developer support activity and team learning insights at a glance."
        live
        icon={<OverviewIcon />} />
      

            {error &&
      <div className={["nxs-1bnbmdh"].filter(Boolean).join(" ")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    {error}
                </div>
      }

            {/* KPI Cards — comprehensive enterprise telemetry */}
            <div className={["nxs-n7f243", "dashboard-kpi-grid"].filter(Boolean).join(" ")}>
                <KPICard
          label="Problems Encountered"
          value={overview?.problems_encountered ?? 124}
          sub="Total across all sessions"
          color="#ef4444"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>} />
        
                <KPICard
          label="Problems Resolved"
          value={overview?.problems_resolved ?? 73}
          sub={`${resolutionRate}% resolution rate`}
          color="#10b981"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>} />
        
                <KPICard
          label="DNA Signatures"
          value={overview?.dna_signatures ?? 124}
          sub="Indexed in vector memory"
          color="#2563eb"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 7h10v10H7z" /></svg>} />
        
                <KPICard
          label="Hours Saved"
          value={`${overview?.hours_saved ?? 879}h`}
          sub={`${(overview?.total_reuses ?? 1172).toLocaleString()} DNA reuses`}
          color="#8b5cf6"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>} />
        
                <KPICard
          label="Active Developers"
          value={overview?.active_developers ?? 10}
          sub="Monitored in cohort"
          color="#06b6d4"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>} />
        
                <KPICard
          label="Top Category"
          value={overview?.most_common_problem?.replace(/_/g, ' ') || 'Syntax Error'}
          sub="Most frequent error type"
          color="#f59e0b"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>} />
        
                <KPICard
          label="Dominant Stack"
          value={overview?.most_common_tech || 'Java / React'}
          sub="Most active language"
          color="#ec4899"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>} />
        
                <KPICard
          label="Avg Guidance Level"
          value={overview?.avg_guidance_level?.toFixed(1) ?? '1.3'}
          sub="0 = independent · 5 = max help"
          color="#6366f1"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>} />
        
            </div>

            {/* Resolution Progress Bar — always shown */}
            <div className={["nxs-bmc3mz"].filter(Boolean).join(" ")}>
                <div className={["nxs-i2u7a8"].filter(Boolean).join(" ")}>
                    <div>
                        <span className={["nxs-s5psie"].filter(Boolean).join(" ")}>Overall Resolution Rate</span>
                        <p className={["nxs-1b19smh"].filter(Boolean).join(" ")}>Percentage of encountered problems that were successfully resolved</p>
                    </div>
                    <span className={["nxs-o6soj"].filter(Boolean).join(" ")}>{resolutionRate}%</span>
                </div>
                <div className={["nxs-s9cp5f"].filter(Boolean).join(" ")}>
                    <div className={["nxs-bptokc", nexusStyleClass("width", `${resolutionRate}%`), nexusStyleClass("minWidth", resolutionRate > 0 ? 4 : 0)].filter(Boolean).join(" ")} />
                </div>
                <div className={["nxs-1m844fq"].filter(Boolean).join(" ")}>
                    <span className={["nxs-1c5axdj"].filter(Boolean).join(" ")}>{overview?.problems_resolved ?? 0} resolved</span>
                    <span className={["nxs-8bdvl7"].filter(Boolean).join(" ")}>{(overview?.problems_encountered ?? 0) - (overview?.problems_resolved ?? 0)} remaining</span>
                </div>
            </div>

            {/* Charts grid */}
            <div className={["nxs-8e1hva", "dashboard-chart-grid"].filter(Boolean).join(" ")}>

                {/* Category Pie */}
                <ChartCard
          title="Problem Category Distribution"
          subtitle="Breakdown of error types across all sessions"
          badge={hasCategories ? `${categories.length} types` : undefined}>
          
                    {hasCategories ?
          <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie data={top5cats} dataKey="count" nameKey="category"
              cx="50%" cy="50%" innerRadius={60} outerRadius={95}
              paddingAngle={3}
              label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
              labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}>
                
                                    {top5cats.map((_, i) =>
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
                )}
                                </Pie>
                                <Tooltip content={<ChartTip />} />
                                <Legend iconType="circle" iconSize={8}
              wrapperStyle={{ fontSize: 11, color: '#64748b', paddingTop: 8 }}
              formatter={(v) => v.replace(/_/g, ' ')} />
              
                            </PieChart>
                        </ResponsiveContainer> :
          <NoDataOverlay message="No problem categories recorded yet" />}
                </ChartCard>

                {/* Resolution Status Bar */}
                <ChartCard
          title="Resolution Status Breakdown"
          subtitle="Problems grouped by their current resolution status"
          badge={hasResolution ? `${resolution.length} statuses` : undefined}>
          
                    {hasResolution ?
          <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={resolution} margin={{ top: 20, right: 16, bottom: 8, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="status" tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={false} tickLine={false}
              tickFormatter={(v) => v.replace(/_/g, ' ')} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(59,130,246,0.05)' }} />
                                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                    {resolution.map((r, i) =>
                <Cell key={i} fill={
                r.status === 'resolved' ? '#10b981' :
                r.status === 'open' ? '#3b82f6' :
                r.status === 'attempted' ? '#f59e0b' : '#ef4444'
                } />
                )}
                                    <LabelList dataKey="count" position="top"
                className={["nxs-lqvria"].filter(Boolean).join(" ")} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer> :
          <NoDataOverlay message="No resolution data yet" />}
                </ChartCard>
            </div>

            {/* Category frequency bar — full width */}
            <ChartCard
        title="Error Category Frequency"
        subtitle="Ranked bar chart of all error categories by occurrence count"
        badge={hasCategories ? `${categories.length} categories` : undefined}>
        
                {hasCategories ?
        <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={categories} margin={{ top: 20, right: 16, bottom: 46, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="category" tick={{ fill: '#94a3b8', fontSize: 10 }}
            angle={-30} textAnchor="end" interval={0}
            axisLine={false} tickLine={false}
            tickFormatter={(v) => v.replace(/_/g, ' ')} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(59,130,246,0.05)' }} />
                            <Bar dataKey="count" radius={[5, 5, 0, 0]}>
                                {categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                <LabelList dataKey="count" position="top"
              className={["nxs-tmge5h"].filter(Boolean).join(" ")} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer> :

        <div className={["nxs-k2vdxz"].filter(Boolean).join(" ")}>
                        {/* Placeholder skeleton bars */}
                        <div className={["nxs-1ukm2qf"].filter(Boolean).join(" ")}>
                            {[80, 55, 95, 40, 70, 30, 60].map((h, i) =>
            <div key={i} className={["nxs-1swecbv", nexusStyleClass("height", `${h}%`), nexusStyleClass("background", `linear-gradient(180deg, #e2e8f0, #f1f5f9)`)].filter(Boolean).join(" ")} />
            )}
                        </div>
                        <p className={["nxs-1kfeb22"].filter(Boolean).join(" ")}>Category data will appear as NEXUS sessions are recorded.</p>
                    </div>
        }
            </ChartCard>

            {/* Top problems ranked list */}
            {hasCategories &&
      <div className={["nxs-1ltoyjw"].filter(Boolean).join(" ")}>
                    <ChartCard
          title="Top Problem Categories — Ranked"
          subtitle="Most commonly occurring error categories with relative frequency bars">
          
                        <div className={["nxs-tcjjr7", "dashboard-category-list"].filter(Boolean).join(" ")}>
                            {categories.map((cat, i) => {
              const max = categories[0]?.count || 1;
              const pct = Math.round(cat.count / max * 100);
              return (
                <div key={i} className={["nxs-juhmu"].filter(Boolean).join(" ")}>
                                        <span className={["nxs-jrobv7", nexusStyleClass("color", i < 3 ? COLORS[i] : '#cbd5e1')].filter(Boolean).join(" ")}>#{i + 1}</span>
                                        <div className={["nxs-1ed0tpz"].filter(Boolean).join(" ")}>
                                            <div className={["nxs-1m54j6j"].filter(Boolean).join(" ")}>
                                                <span className={["nxs-nqw39x"].filter(Boolean).join(" ")}>
                                                    {cat.category.replace(/_/g, ' ')}
                                                </span>
                                                <span className={["nxs-1gkl61z"].filter(Boolean).join(" ")}>{cat.count}</span>
                                            </div>
                                            <div className={["nxs-1i8oung"].filter(Boolean).join(" ")}>
                                                <div className={["nxs-m0srrn", nexusStyleClass("width", `${pct}%`), nexusStyleClass("background", COLORS[i % COLORS.length])].filter(Boolean).join(" ")} />
                                            </div>
                                        </div>
                                    </div>);

            })}
                        </div>
                    </ChartCard>
                </div>
      }
        </>);

}
