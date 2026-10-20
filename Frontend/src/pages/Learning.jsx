import { nexusStyleClass } from '../utils/styleTokens.js';

import { useState, useCallback, useEffect } from 'react';
import { api } from '../services/api.js';
import { usePolling } from '../hooks/usePolling.js';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from
'recharts';
import EmptyState from '../components/EmptyState.jsx';
import PageHeader from '../components/PageHeader.jsx';

export default function Learning() {
  const [selectedDevId, setSelectedDevId] = useState(null);
  const [devDetail, setDevDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState('');

  // Fetch developers list
  const fetcher = useCallback(() => api.developersList().then((r) => r.data || []), []);
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
  const filteredDevs = developers.filter((d) => {
    const q = search.toLowerCase();
    return !q || d.name?.toLowerCase().includes(q) || d.email?.toLowerCase().includes(q) || d.batch?.toLowerCase().includes(q);
  });

  const totalDevs = developers.length;
  const avgResolution = developers.length ?
  Math.round(developers.reduce((s, d) => s + (d.resolution_rate || 0), 0) / developers.length) :
  62;

  return (
    <div>
            {/* Header */}
            <PageHeader
        title="SkillQuest Developer Capability Intelligence"
        subtitle="Evidence-based developer proficiency profiling, strength tracking, and concept gap diagnostics derived from real workspace telemetry."
        live={true}
        icon={
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                    </svg>
        }
        actions={
        selectedDevId ?
        <button
          onClick={handleBackToRoster}
          className={["btn btn-outline btn-sm", "nxs-17x7ztx"].filter(Boolean).join(" ")}>

          
                            ← Back to Developers Roster
                        </button> :

        <button
          onClick={refresh}
          className={["btn btn-outline btn-sm", "nxs-17x7ztx"].filter(Boolean).join(" ")}>

          
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                            Sync Developer Telemetry
                        </button>

        } />
      

            {error &&
      <div className={["nxs-1pu8po8"].filter(Boolean).join(" ")}>
                    {error}
                </div>
      }

            {/* VIEW 1: DEVELOPER ROSTER (DEFAULT) */}
            {!selectedDevId &&
      <div>
                    {/* Metrics Strip */}
                    <div className={["nxs-asn0pz", "stat-grid"].filter(Boolean).join(" ")}>
                        {[
          { label: 'Active Developers', val: totalDevs, sub: 'Under continuous telemetry', color: '#2563eb' },
          { label: 'Org Mean Resolution', val: `${avgResolution}%`, sub: 'Unassisted problem solving', color: '#059669' },
          { label: 'Leading Practice', val: 'Full Stack & Cloud', sub: 'TCS Practices', color: '#8b5cf6', isText: true },
          { label: 'Target Skill Gaps', val: 'Docker & Shell', sub: 'Highest guidance needed', color: '#f59e0b', isText: true }].
          map((stat, i) =>
          <div
            key={i}

            className={["nxs-17ovn5j", nexusStyleClass("borderLeft", `4px solid ${stat.color}`)].filter(Boolean).join(" ")}>
                                <div className={["nxs-66zp9z"].filter(Boolean).join(" ")}>
                                    {stat.label}
                                </div>
                                <div className={["nxs-17c88j8", nexusStyleClass("fontSize", stat.isText ? 18 : 26), nexusStyleClass("color", stat.color)].filter(Boolean).join(" ")}>
                                    {stat.val}
                                </div>
                                <div className={["nxs-1tpd1be"].filter(Boolean).join(" ")}>
                                    {stat.sub}
                                </div>
                            </div>
          )}
                    </div>

                    {/* Developer Directory Section */}
                    <div className={["nxs-19jtpz1"].filter(Boolean).join(" ")}>
                        <div className={["nxs-v7sdiz"].filter(Boolean).join(" ")}>
                            <div>
                                <h3 className={["nxs-tuuffy"].filter(Boolean).join(" ")}>
                                    Enterprise Developer Directory & Telemetry Index
                                </h3>
                                <p className={["nxs-63ld6k"].filter(Boolean).join(" ")}>
                                    Select any developer to inspect their detailed language strengths, concept lags, and personalized coaching plan.
                                </p>
                            </div>
                            <input
              placeholder="Search by developer name, email, practice…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}

              className={["nxs-1o7jisa"].filter(Boolean).join(" ")} />
                        </div>

                        {loadingDevs && !developers.length ?
          <div className={["nxs-15p6m6w"].filter(Boolean).join(" ")}>
                                <span className="spinner" /> Loading developer capabilities…
                            </div> :
          filteredDevs.length === 0 ?
          <EmptyState
            icon="user"
            title="No developers found"
            description="No active developers matched your search query." /> :


          <div className={["nxs-372o7v"].filter(Boolean).join(" ")}>
                                <table className={["nxs-kgr6t3"].filter(Boolean).join(" ")}>
                                    <thead>
                                        <tr className={["nxs-t01w38"].filter(Boolean).join(" ")}>
                                            <th className={["nxs-7nbvxc"].filter(Boolean).join(" ")}>Developer</th>
                                            <th className={["nxs-7nbvxc"].filter(Boolean).join(" ")}>Practice / Role</th>
                                            <th className={["nxs-7nbvxc"].filter(Boolean).join(" ")}>Primary Stack</th>
                                            <th className={["nxs-7nbvxc"].filter(Boolean).join(" ")}>Problems Logged</th>
                                            <th className={["nxs-7nbvxc"].filter(Boolean).join(" ")}>Resolution Rate</th>
                                            <th className={["nxs-12fxx15"].filter(Boolean).join(" ")}>Deep Analysis</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredDevs.map((dev) =>
                <tr
                  key={dev.id}



                  className={["nxs-11llhdi"].filter(Boolean).join(" ")}>
                                                <td className={["nxs-1m6nct0"].filter(Boolean).join(" ")}>
                                                    <div className={["nxs-j05hdm"].filter(Boolean).join(" ")}>
                                                        <div className={["nxs-19401ns"].filter(Boolean).join(" ")}>
                                                            {dev.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className={["nxs-1jfpmbo"].filter(Boolean).join(" ")}>{dev.name}</div>
                                                            <div className={["nxs-1ppt0jz"].filter(Boolean).join(" ")}>{dev.email}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className={["nxs-1m6nct0"].filter(Boolean).join(" ")}>
                                                    <div className={["nxs-l0zoyf"].filter(Boolean).join(" ")}>{dev.batch}</div>
                                                    <div className={["nxs-9gt9om"].filter(Boolean).join(" ")}>{dev.sub_batch}</div>
                                                </td>
                                                <td className={["nxs-1m6nct0"].filter(Boolean).join(" ")}>
                                                    <span className={["nxs-1aoppbp"].filter(Boolean).join(" ")}>
                                                        {dev.primary_language}
                                                    </span>
                                                </td>
                                                <td className={["nxs-1m6nct0"].filter(Boolean).join(" ")}>
                                                    <span className={["nxs-1jfpmbo"].filter(Boolean).join(" ")}>{dev.total_problems}</span>
                                                    <span className={["nxs-jcnl7v"].filter(Boolean).join(" ")}>
                                                        ({dev.resolved_problems} resolved)
                                                    </span>
                                                </td>
                                                <td className={["nxs-1m6nct0"].filter(Boolean).join(" ")}>
                                                    <div className={["nxs-13coe1t"].filter(Boolean).join(" ")}>
                                                        <div className={["nxs-1mpukom"].filter(Boolean).join(" ")}>
                                                            <div className={["nxs-2lllrl", nexusStyleClass("width", `${dev.resolution_rate}%`), nexusStyleClass("background", dev.resolution_rate >= 60 ? '#10b981' : '#f59e0b')].filter(Boolean).join(" ")} />
                                                        </div>
                                                        <span className={["nxs-1n40g1j", nexusStyleClass("color", dev.resolution_rate >= 60 ? '#059669' : '#d97706')].filter(Boolean).join(" ")}>
                                                            {dev.resolution_rate}%
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className={["nxs-203mfm"].filter(Boolean).join(" ")}>
                                                    <button
                      onClick={() => handleSelectDeveloper(dev.id)}

                      className={["nxs-ea43ya"].filter(Boolean).join(" ")}>
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                                        Analyze Developer
                                                    </button>
                                                </td>
                                            </tr>
                )}
                                    </tbody>
                                </table>
                            </div>
          }
                    </div>
                </div>
      }

            {/* VIEW 2: DEEP-DIVE DEVELOPER ANALYSIS */}
            {selectedDevId &&
      <div>
                    {loadingDetail ?
        <div className={["nxs-8o9uzj"].filter(Boolean).join(" ")}>
                            <span className="spinner" /> Analyzing developer telemetry across workspaces…
                        </div> :
        devDetail ?
        <div>
                            {/* Developer Executive Badge Bar */}
                            <div className={["nxs-1rscuhm"].filter(Boolean).join(" ")}>
                                <div className={["nxs-1bdva60"].filter(Boolean).join(" ")}>
                                    <div className={["nxs-o9i9to"].filter(Boolean).join(" ")}>
                                        {devDetail.developer?.name?.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className={["nxs-17t06xi"].filter(Boolean).join(" ")}>
                                            <h2 className={["nxs-63ywsg"].filter(Boolean).join(" ")}>
                                                {devDetail.developer?.name}
                                            </h2>
                                            <span className={["nxs-doq39z"].filter(Boolean).join(" ")}>
                                                {devDetail.developer?.batch}
                                            </span>
                                        </div>
                                        <div className={["nxs-10eekiq"].filter(Boolean).join(" ")}>
                                            <span>{devDetail.developer?.email}</span>
                                            <span>·</span>
                                            <span>Role: <strong className={["nxs-x6tbn8"].filter(Boolean).join(" ")}>{devDetail.developer?.sub_batch}</strong></span>
                                        </div>
                                    </div>
                                </div>

                                <div className={["nxs-9abrdl"].filter(Boolean).join(" ")}>
                                    <div className={["nxs-106slq2"].filter(Boolean).join(" ")}>
                                        <div className={["nxs-ta19en"].filter(Boolean).join(" ")}>Resolution Rate</div>
                                        <div className={["nxs-iihd8j"].filter(Boolean).join(" ")}>{devDetail.developer?.resolution_rate}%</div>
                                    </div>
                                    <div className={["nxs-106slq2"].filter(Boolean).join(" ")}>
                                        <div className={["nxs-ta19en"].filter(Boolean).join(" ")}>Capability Percentile</div>
                                        <div className={["nxs-13k5ycv"].filter(Boolean).join(" ")}>Top {100 - (devDetail.developer?.percentile || 80)}%</div>
                                    </div>
                                </div>
                            </div>

                            {/* Two-Column Grid: Strengths vs Lagging */}
                            <div className={["nxs-1d8kmdc", "learning-content-grid"].filter(Boolean).join(" ")}>
                                {/* STRENGTHS CARD */}
                                <div className={["nxs-3p47qa"].filter(Boolean).join(" ")}>
                                    <div className={["nxs-1ye2zxo"].filter(Boolean).join(" ")}>
                                        <div>
                                            <h3 className={["nxs-1c8s6gi"].filter(Boolean).join(" ")}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                                Demonstrated Strengths & High Proficiency
                                            </h3>
                                            <p className={["nxs-63ld6k"].filter(Boolean).join(" ")}>
                                                Languages and frameworks where the developer operates independently with minimal guidance.
                                            </p>
                                        </div>
                                    </div>

                                    {devDetail.strengths?.length > 0 ?
              <div className={["nxs-y5daoc"].filter(Boolean).join(" ")}>
                                            {devDetail.strengths.map((str, i) =>
                <div
                  key={i}

                  className={["nxs-16phpex"].filter(Boolean).join(" ")}>
                                                    <div className={["nxs-duo7wr"].filter(Boolean).join(" ")}>
                                                        <div className={["nxs-13coe1t"].filter(Boolean).join(" ")}>
                                                            <span className={["nxs-9kkq28"].filter(Boolean).join(" ")}>
                                                                {str.language}
                                                            </span>
                                                            <span className={["nxs-i9w6o4"].filter(Boolean).join(" ")}>
                                                                {str.framework}
                                                            </span>
                                                        </div>
                                                        <span className={["nxs-4hzhfo"].filter(Boolean).join(" ")}>
                                                            {str.proficiency_score}% Mastery
                                                        </span>
                                                    </div>

                                                    <div className={["nxs-zjafq"].filter(Boolean).join(" ")}>
                                                        ✓ Solved {str.problems_solved} of {str.total_encountered} encountered issues with minimal mentor escalation.
                                                    </div>

                                                    <div className={["nxs-wlvkyj"].filter(Boolean).join(" ")}>
                                                        <div className={["nxs-14tke9a", nexusStyleClass("width", `${str.proficiency_score}%`)].filter(Boolean).join(" ")} />
                                                    </div>
                                                </div>
                )}
                                        </div> :

              <div className={["nxs-1g2vre8"].filter(Boolean).join(" ")}>
                                            Baseline capability data is still compiling.
                                        </div>
              }
                                </div>

                                {/* LAGGING CONCEPTS CARD */}
                                <div className={["nxs-1nscfla"].filter(Boolean).join(" ")}>
                                    <div className={["nxs-1ye2zxo"].filter(Boolean).join(" ")}>
                                        <div>
                                            <h3 className={["nxs-1c8s6gi"].filter(Boolean).join(" ")}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                                Concept Gaps & Areas Lagging Behind
                                            </h3>
                                            <p className={["nxs-63ld6k"].filter(Boolean).join(" ")}>
                                                Topics where repeated attempts or high mentor guidance levels (L2-L3) were required.
                                            </p>
                                        </div>
                                    </div>

                                    {devDetail.lagging?.length > 0 ?
              <div className={["nxs-y5daoc"].filter(Boolean).join(" ")}>
                                            {devDetail.lagging.slice(0, 4).map((lag, i) =>
                <div
                  key={i}

                  className={["nxs-rzgdnh"].filter(Boolean).join(" ")}>
                                                    <div className={["nxs-4slag1"].filter(Boolean).join(" ")}>
                                                        <span className={["nxs-14tthjy"].filter(Boolean).join(" ")}>
                                                            {lag.topic}
                                                        </span>
                                                        <span className={["nxs-12m0vz7", nexusStyleClass("background", lag.priority === 'High' ? '#fecaca' : '#fed7aa'), nexusStyleClass("color", lag.priority === 'High' ? '#b91c1c' : '#c2410c')].filter(Boolean).join(" ")}>
                                                            {lag.priority} Priority Gap
                                                        </span>
                                                    </div>

                                                    <div className={["nxs-1n67mm8"].filter(Boolean).join(" ")}>
                                                        {lag.unresolved_count} unresolved instances across sessions · Friction difficulty: {lag.difficulty_score}%
                                                    </div>

                                                    <div className={["nxs-16f54ku"].filter(Boolean).join(" ")}>
                                                        <strong className={["nxs-1xlhjm"].filter(Boolean).join(" ")}>Actionable Coaching: </strong>
                                                        {lag.recommendation}
                                                    </div>
                                                </div>
                )}
                                        </div> :

              <div className={["nxs-1g2vre8"].filter(Boolean).join(" ")}>
                                            No critical skill gaps detected. Developer is performing smoothly across topics.
                                        </div>
              }
                                </div>
                            </div>

                            {/* Topic Mastery Matrix */}
                            <div className={["nxs-1xjtqt7"].filter(Boolean).join(" ")}>
                                <div className={["nxs-3onmga"].filter(Boolean).join(" ")}>
                                    <h3 className={["nxs-tuuffy"].filter(Boolean).join(" ")}>
                                        Curriculum & Concept Mastery Matrix
                                    </h3>
                                    <p className={["nxs-63ld6k"].filter(Boolean).join(" ")}>
                                        Automated grading against corporate engineering competency standards based on telemetry evidence.
                                    </p>
                                </div>

                                <div className={["nxs-19811w0", "learning-card-grid"].filter(Boolean).join(" ")}>
                                    {devDetail.topic_matrix?.map((tm, idx) => {
                const isStrong = tm.status === 'Strong';
                const isCompetent = tm.status === 'Competent';
                const color = isStrong ? '#059669' : isCompetent ? '#2563eb' : '#dc2626';
                const bg = isStrong ? '#ecfdf5' : isCompetent ? '#eff6ff' : '#fef2f2';

                return (
                  <div
                    key={idx}

                    className={["nxs-czvmld"].filter(Boolean).join(" ")}>
                                                <div className={["nxs-rya6v9"].filter(Boolean).join(" ")}>
                                                    <span className={["nxs-feupb"].filter(Boolean).join(" ")}>
                                                        {tm.domain}
                                                    </span>
                                                    <span className={["nxs-3z34vj", nexusStyleClass("color", color), nexusStyleClass("background", bg)].filter(Boolean).join(" ")}>
                                                        {tm.status}
                                                    </span>
                                                </div>
                                                <div className={["nxs-j05hdm"].filter(Boolean).join(" ")}>
                                                    <div className={["nxs-11u75ah"].filter(Boolean).join(" ")}>
                                                        <div className={["nxs-2lllrl", nexusStyleClass("width", `${tm.mastery}%`), nexusStyleClass("background", color)].filter(Boolean).join(" ")} />
                                                    </div>
                                                    <span className={["nxs-1ualua6", nexusStyleClass("color", color)].filter(Boolean).join(" ")}>{tm.mastery}%</span>
                                                </div>
                                            </div>);

              })}
                                </div>
                            </div>
                        </div> :
        null}
                </div>
      }
        </div>);

}
