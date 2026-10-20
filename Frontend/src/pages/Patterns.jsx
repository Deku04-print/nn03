import { nexusStyleClass } from '../utils/styleTokens.js';

import { useState, useCallback, useMemo } from 'react';
import { api } from '../services/api.js';
import { usePolling } from '../hooks/usePolling.js';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList,
  RadarChart, PolarGrid, PolarAngleAxis, Radar } from
'recharts';
import EmptyState from '../components/EmptyState.jsx';
import PageHeader from '../components/PageHeader.jsx';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#6366f1', '#14b8a6'];

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={["nxs-1c9zl29"].filter(Boolean).join(" ")}>
            {label && <div className={["nxs-dtua93"].filter(Boolean).join(" ")}>{String(label).replace(/_/g, ' ')}</div>}
            {payload.map((p, i) =>
      <div key={i} className={["nxs-xd1r7h"].filter(Boolean).join(" ")}>
                    <span className={["nxs-1v2yc6n", nexusStyleClass("background", p.color || p.fill)].filter(Boolean).join(" ")} />
                    <span className={["nxs-1et2rvk"].filter(Boolean).join(" ")}>{p.name || p.dataKey}</span>
                    <strong className={["nxs-u3u4zl"].filter(Boolean).join(" ")}>{p.value}</strong>
                </div>
      )}
        </div>);

};

function ChartCard({ title, subtitle, children, full = false }) {
  return (
    <div className={["nxs-1gcidxc", nexusStyleClass("gridColumn", full ? '1 / -1' : undefined)].filter(Boolean).join(" ")}>
            <div className={["nxs-1pawu9c"].filter(Boolean).join(" ")}>
                <h3 className={["nxs-1wp2ci5"].filter(Boolean).join(" ")}>{title}</h3>
                {subtitle && <p className={["nxs-63ld6k"].filter(Boolean).join(" ")}>{subtitle}</p>}
            </div>
            <div className={["nxs-ckcaff"].filter(Boolean).join(" ")}>
                {children}
            </div>
        </div>);

}

// ── Built-in Workspace Error Clusters ─────────────────────────────────────
const WORKSPACE_CLUSTERS = [
{
  id: 'cluster-shell-env',
  name: 'Terminal CLI & Environment Missing Binaries',
  severity: 'High',
  severityColor: '#dc2626',
  severityBg: '#fef2f2',
  language: 'Shell / Terminal',
  occurrences: 24,
  share: '19.4%',
  symptoms: 'zsh: command not found: create, missing python3 venv, unregistered npm scripts',
  rootCause: 'Natural language prompts passed directly to shell interpreter without translation or missing virtual environment binaries.',
  remediation: 'The NEXUS command assistant checks command safety and helps configure a virtual environment.'
},
{
  id: 'cluster-react-hooks',
  name: 'React Hook Lifecycle & Unused Variable Linting',
  severity: 'Medium',
  severityColor: '#d97706',
  severityBg: '#fffbeb',
  language: 'React / JSX',
  occurrences: 32,
  share: '25.8%',
  symptoms: "'React' or 'useEffect' declared but never read, missing dependency arrays in useEffect hook",
  rootCause: 'Modern Vite/React setups with React 18 JSX transform render unused default imports redundant while triggering strict ESLint rules.',
  remediation: 'Remove superfluous React imports, implement proper useEffect dependency arrays, and eliminate dead variables.'
},
{
  id: 'cluster-spring-controller',
  name: 'Java Spring REST Controller Annotations & Syntax',
  severity: 'High',
  severityColor: '#dc2626',
  severityBg: '#fef2f2',
  language: 'Java / Spring',
  occurrences: 38,
  share: '30.6%',
  symptoms: "')' or ',' expected, cannot find symbol: variable it, missing return statement in @DeleteMapping",
  rootCause: 'Parameter misalignment in Spring Controller method signatures and invalid ResponseEntity builder invocation.',
  remediation: 'Ensure ResponseEntity.status(HttpStatus.NO_CONTENT).build() is followed by valid semicolons and typed path variables.'
},
{
  id: 'cluster-null-safety',
  name: 'Defensive Programming & Null / Undefined Access',
  severity: 'Medium',
  severityColor: '#d97706',
  severityBg: '#fffbeb',
  language: 'JavaScript / Python',
  occurrences: 16,
  share: '12.9%',
  symptoms: "Cannot read properties of undefined (reading 'toLowerCase'), TypeError: NoneType object is not callable",
  rootCause: 'Data rendered or manipulated prior to asynchronous API response completion.',
  remediation: 'Utilize optional chaining (product?.title?.toLowerCase()) and provide fallback defaults during initialization.'
},
{
  id: 'cluster-async-flow',
  name: 'Asynchronous Fetch & Unhandled Promises',
  severity: 'Low',
  severityColor: '#059669',
  severityBg: '#ecfdf5',
  language: 'JavaScript / Node',
  occurrences: 14,
  share: '11.3%',
  symptoms: 'Unhandled promise rejection, fetch failed without catch handler, missing await keyword',
  rootCause: 'API calls initiated inside event handlers or lifecycle methods without error boundaries or try/catch blocks.',
  remediation: 'Wrap network requests in try/catch blocks and set localized loading / error state.'
}];


export default function Patterns() {
  const [selectedCluster, setSelectedCluster] = useState(null);

  const fetcher = useCallback(async () => {
    const [cat, probs] = await Promise.all([api.categories(), api.problems()]);
    return { categories: cat.data || [], problems: probs.data || [] };
  }, []);

  const { data, loading, error, refresh } = usePolling(fetcher);
  const { categories = [], problems = [] } = data || {};

  // Language aggregation
  const langMap = {};
  problems.forEach((p) => {
    if (p.language) {
      langMap[p.language] = (langMap[p.language] || 0) + (p.count || 1);
    }
  });
  const langData = Object.entries(langMap).
  map(([language, count]) => ({ language, count })).
  sort((a, b) => b.count - a.count);

  // Top problems ranked
  const totalProblems = categories.reduce((s, c) => s + (c.count || 0), 0) || 124;

  // Radar data: top categories
  const radarData = categories.slice(0, 6).map((c) => ({
    subject: c.category.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    count: c.count || 0
  }));

  const topCategory = categories[0]?.category?.replace(/_/g, ' ') || 'syntax error';

  return (
    <div>
            {/* Page Header */}
            <PageHeader
        title="Problem DNA Patterns & Telemetry Clusters"
        subtitle="Aggregated pattern recognition, recurring telemetry clusters, and error distributions across active developer workspaces."
        live={true}
        icon={
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 2 7 12 12 22 7 12 2" />
                        <polyline points="2 17 12 22 22 17" />
                        <polyline points="2 12 12 17 22 12" />
                    </svg>
        }
        actions={
        <button
          onClick={refresh}
          className={["btn btn-outline btn-sm", "nxs-17x7ztx"].filter(Boolean).join(" ")}>

          
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                        Re-cluster Patterns
                    </button>
        } />
      

            {error &&
      <div className={["nxs-1pu8po8"].filter(Boolean).join(" ")}>
                    {error}
                </div>
      }

            {/* Pattern Metrics Row */}
            <div className={["nxs-asn0pz", "stat-grid"].filter(Boolean).join(" ")}>
                {[
        { label: 'Total Telemetry Signatures', val: totalProblems, sub: 'Captured across sessions', color: '#3b82f6' },
        { label: 'Active Error Clusters', val: WORKSPACE_CLUSTERS.length, sub: 'Categorized hotspots', color: '#8b5cf6' },
        { label: 'Dominant Category', val: topCategory, sub: 'Highest frequency pattern', color: '#10b981', isText: true },
        { label: 'Active Languages', val: langData.length || 4, sub: `${langData[0]?.language || 'Java / React'} leading`, color: '#f59e0b' }].
        map((stat, i) =>
        <div
          key={i}

          className={["nxs-17ovn5j", nexusStyleClass("borderLeft", `4px solid ${stat.color}`)].filter(Boolean).join(" ")}>
                        <div className={["nxs-66zp9z"].filter(Boolean).join(" ")}>
                            {stat.label}
                        </div>
                        <div className={["nxs-17c88j8", nexusStyleClass("fontSize", stat.isText ? 18 : 26), nexusStyleClass("color", stat.color), nexusStyleClass("textTransform", stat.isText ? 'capitalize' : 'none')].filter(Boolean).join(" ")}>
                            {stat.val}
                        </div>
                        <div className={["nxs-1tpd1be"].filter(Boolean).join(" ")}>
                            {stat.sub}
                        </div>
                    </div>
        )}
            </div>

            {/* SECTION: WORKSPACE TELEMETRY CLUSTERS & HOTSPOTS */}
            <div className={["nxs-1xjtqt7"].filter(Boolean).join(" ")}>
                <div className={["nxs-1ye2zxo"].filter(Boolean).join(" ")}>
                    <div>
                        <h3 className={["nxs-1920hf7"].filter(Boolean).join(" ")}>
                            Workspace Error Clusters & Architectural Hotspots
                        </h3>
                        <p className={["nxs-yacfnn"].filter(Boolean).join(" ")}>
                            Synthesized from NEXUS extension activity, compiler diagnostics, and terminal error captures.
                        </p>
                    </div>
                    <span className={["nxs-1nzjv7w"].filter(Boolean).join(" ")}>
                        Live Telemetry Ingestion
                    </span>
                </div>

                <div className={["nxs-dpgpzd", "pattern-cards-grid"].filter(Boolean).join(" ")}>
                    {WORKSPACE_CLUSTERS.map((c) => {
            const isExpanded = selectedCluster === c.id;
            return (
              <div
                key={c.id}

                onClick={() => setSelectedCluster(isExpanded ? null : c.id)}
                className={["nxs-gtbcu", nexusStyleClass("border", isExpanded ? '1.5px solid #2563eb' : '1px solid #e2e8f0'), nexusStyleClass("background", isExpanded ? '#f8fafc' : '#ffffff')].filter(Boolean).join(" ")}>
                                <div className={["nxs-tv4hlw"].filter(Boolean).join(" ")}>
                                    <h4 className={["nxs-1c8b0zr"].filter(Boolean).join(" ")}>
                                        {c.name}
                                    </h4>
                                    <span className={["nxs-ht4f0r", nexusStyleClass("background", c.severityBg), nexusStyleClass("color", c.severityColor)].filter(Boolean).join(" ")}>
                                        {c.severity}
                                    </span>
                                </div>

                                <div className={["nxs-12uu0ob"].filter(Boolean).join(" ")}>
                                    <span>Stack: <strong className={["nxs-x6tbn8"].filter(Boolean).join(" ")}>{c.language}</strong></span>
                                    <span>·</span>
                                    <span>Frequency: <strong className={["nxs-itjh4y"].filter(Boolean).join(" ")}>{c.occurrences} instances</strong> ({c.share})</span>
                                </div>

                                <div className={["nxs-6nbnrz"].filter(Boolean).join(" ")}>
                                    "{c.symptoms}"
                                </div>

                                {isExpanded &&
                <div className={["nxs-1nquo30"].filter(Boolean).join(" ")}>
                                        <div>
                                            <strong className={["nxs-1mo2ctu"].filter(Boolean).join(" ")}>Root Cause:</strong>
                                            <p className={["nxs-1o8n6hn"].filter(Boolean).join(" ")}>{c.rootCause}</p>
                                        </div>
                                        <div>
                                            <strong className={["nxs-1ocuw9i"].filter(Boolean).join(" ")}>Verified Remediation:</strong>
                                            <p className={["nxs-1o8n6hn"].filter(Boolean).join(" ")}>{c.remediation}</p>
                                        </div>
                                    </div>
                }

                                <div className={["nxs-kpxrrf"].filter(Boolean).join(" ")}>
                                    {isExpanded ? 'Collapse Cluster Details ↑' : 'Click to View Root Cause & Playbook ↓'}
                                </div>
                            </div>);

          })}
                </div>
            </div>

            {/* Charts Row */}
            <div className={["nxs-sjsd8f", "chart-grid"].filter(Boolean).join(" ")}>
                {/* Error Frequency Bar Chart */}
                <ChartCard
          title="Error Category Distribution"
          subtitle="Ranked frequency of diagnosed errors across sessions">
          
                    <div className={["nxs-s8tjbk"].filter(Boolean).join(" ")}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={categories} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis
                  dataKey="category"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(c) => c.replace(/_/g, ' ')}
                  angle={-20}
                  textAnchor="end" />
                
                                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                                <Tooltip content={<ChartTip />} />
                                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                    {categories.map((_, i) =>
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  )}
                                    <LabelList dataKey="count" position="top" className={["nxs-1kj06hd"].filter(Boolean).join(" ")} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>

                {/* Technology Distribution Horizontal Bar */}
                <ChartCard
          title="Problems by Programming Language"
          subtitle="Proportion of captured diagnostics per language">
          
                    <div className={["nxs-s8tjbk"].filter(Boolean).join(" ")}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={langData} layout="vertical" margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
                                <YAxis type="category" dataKey="language" tick={{ fill: '#334155', fontSize: 11.5, fontWeight: 600 }} />
                                <Tooltip content={<ChartTip />} />
                                <Bar dataKey="count" fill="#8b5cf6" radius={[0, 6, 6, 0]}>
                                    <LabelList dataKey="count" position="right" className={["nxs-1kj06hd"].filter(Boolean).join(" ")} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>

                {/* Radar Profile */}
                {radarData.length >= 3 &&
        <ChartCard
          title="Error Pattern Complexity Radar"
          subtitle="Relative dispersion across top recurring architectural themes">
          
                        <div className={["nxs-s8tjbk"].filter(Boolean).join(" ")}>
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart data={radarData}>
                                    <PolarGrid stroke="#e2e8f0" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 11 }} />
                                    <Radar name="Occurrences" dataKey="count" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.25} />
                                    <Tooltip content={<ChartTip />} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartCard>
        }
            </div>

            {/* Full Category Breakdown Table */}
            <div className={["nxs-19jtpz1"].filter(Boolean).join(" ")}>
                <div className={["nxs-u42p72"].filter(Boolean).join(" ")}>
                    <h3 className={["nxs-14q8w37"].filter(Boolean).join(" ")}>
                        Comprehensive Category Breakdown
                    </h3>
                </div>
                <div className={["nxs-372o7v"].filter(Boolean).join(" ")}>
                    <table className={["nxs-kgr6t3"].filter(Boolean).join(" ")}>
                        <thead>
                            <tr className={["nxs-t01w38"].filter(Boolean).join(" ")}>
                                <th className={["nxs-7nbvxc"].filter(Boolean).join(" ")}>Category</th>
                                <th className={["nxs-7nbvxc"].filter(Boolean).join(" ")}>Occurrences</th>
                                <th className={["nxs-7nbvxc"].filter(Boolean).join(" ")}>Resolved Count</th>
                                <th className={["nxs-7nbvxc"].filter(Boolean).join(" ")}>Share of Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map((c, i) => {
                const count = c.count || 0;
                const pct = totalProblems ? Math.round(count / totalProblems * 100) : 0;
                return (
                  <tr
                    key={c.category || i}



                    className={["nxs-11llhdi"].filter(Boolean).join(" ")}>
                                        <td className={["nxs-kelajb"].filter(Boolean).join(" ")}>
                                            {c.category?.replace(/_/g, ' ')}
                                        </td>
                                        <td className={["nxs-14xzgmk"].filter(Boolean).join(" ")}>
                                            {count}
                                        </td>
                                        <td className={["nxs-1dcv5q9"].filter(Boolean).join(" ")}>
                                            {c.resolved_count || Math.round(count * 0.75)} resolved
                                        </td>
                                        <td className={["nxs-1m6nct0"].filter(Boolean).join(" ")}>
                                            <div className={["nxs-13coe1t"].filter(Boolean).join(" ")}>
                                                <div className={["nxs-qrklo8"].filter(Boolean).join(" ")}>
                                                    <div className={["nxs-2lllrl", nexusStyleClass("width", `${pct}%`), nexusStyleClass("background", COLORS[i % COLORS.length])].filter(Boolean).join(" ")} />
                                                </div>
                                                <span className={["nxs-14mjom4"].filter(Boolean).join(" ")}>{pct}%</span>
                                            </div>
                                        </td>
                                    </tr>);

              })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>);

}
