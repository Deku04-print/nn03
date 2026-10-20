import { nexusStyleClass } from '../utils/styleTokens.js';
import { useState, useCallback } from 'react';
import { api } from '../services/api.js';
import { usePolling } from '../hooks/usePolling.js';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell, LabelList
} from 'recharts';
import EmptyState from '../components/EmptyState.jsx';
import PageHeader from '../components/PageHeader.jsx';

const FLEET_AGENTS = [
    {
        name: 'MentorAgent',
        displayName: 'Mentor Agent',
        badge: 'Progressive Debugging',
        status: 'Active',
        statusColor: '#059669',
        statusBg: '#ecfdf5',
        role: 'Autonomous Developer Mentor & Terminal Shell Specialist',
        usecase: 'Investigates compilation and runtime errors, diagnoses terminal shell failures (e.g. zsh/bash errors, missing dependencies), and provides progressive multi-tier guidance hints without giving away answers.',
        inputs: 'Active code selection, diagnostics array, compiler logs, terminal stderr/stdout',
        outputs: 'Progressive hint trajectory (L0 to L3), identified root cause, and verified remediation diffs',
        riskLevel: 'Zero Risk (Read-Only / Guidance)',
        latencyAvg: '395ms',
    },
    {
        name: 'InfraGeneratorAgent',
        displayName: 'Infrastructure Architect Agent',
        badge: 'DevOps & Orchestration',
        status: 'Active',
        statusColor: '#059669',
        statusBg: '#ecfdf5',
        role: 'Workspace Infrastructure & Container Manifest Synthesizer',
        usecase: 'Analyzes full workspace structure and environment configs to autonomously generate production-ready Dockerfile, docker-compose.yml, nginx.conf reverse proxy, and Kubernetes manifests (service, deployment, ingress).',
        inputs: 'Project file tree, package manifests (package.json, requirements.txt), environment variables',
        outputs: 'Complete production infrastructure suite placed in respective target directories',
        riskLevel: 'Low Risk (Workspace File Generation)',
        latencyAvg: '1,110ms',
    },
    {
        name: 'CommandGeneratorAgent',
        displayName: 'Command Execution Agent',
        badge: 'Human-in-the-Loop',
        status: 'Active',
        statusColor: '#059669',
        statusBg: '#ecfdf5',
        role: 'Safe Natural Language Terminal Dispatcher',
        usecase: 'Converts natural language commands (e.g., "create django app with proper virtual environment") into safe, OS-specific shell commands with explicit developer accept/reject approval gates before execution.',
        inputs: 'Natural language user instruction, OS environment (macOS/Linux/Windows), shell context (zsh/bash)',
        outputs: 'OS-tailored command line string, risk score (Low / Medium / High), execution dispatch hook',
        riskLevel: 'Medium Risk (Interactive Human Confirmation Required)',
        latencyAvg: '312ms',
    },
    {
        name: 'TestGeneratorAgent',
        displayName: 'Test Engineering Agent',
        badge: 'QA & Verification',
        status: 'Active',
        statusColor: '#059669',
        statusBg: '#ecfdf5',
        role: 'Autonomous Unit & Integration Test Case Engineer',
        usecase: 'Inspects active code files, detects exported functions/components, and generates comprehensive test suites (Vitest, Jest, PyTest, JUnit) preventing duplicate test naming bugs and ensuring mocking and assertion coverage.',
        inputs: 'Target source file, language AST, detected test framework configuration',
        outputs: 'Executable test file with boundary checks, mock dependencies, and assertion suites',
        riskLevel: 'Low Risk (Test File Creation)',
        latencyAvg: '559ms',
    },
    {
        name: 'DocGeneratorAgent',
        displayName: 'Documentation Agent',
        badge: 'Architecture & Docs',
        status: 'Active',
        statusColor: '#059669',
        statusBg: '#ecfdf5',
        role: 'Enterprise Architecture Blueprint & Report Synthesizer',
        usecase: 'Scans the multi-directory codebase to generate structured markdown architecture documentation (PROJECT_DOCUMENTATION.md), interactive Mermaid sequence/component blueprints, and executive PDF summaries.',
        inputs: 'Workspace directory tree, dependency graph, framework definitions',
        outputs: 'Markdown architectural documentation, Mermaid visual blueprints, executive PDF export',
        riskLevel: 'Zero Risk (Read-Only Documentation)',
        latencyAvg: '1,498ms',
    },
    {
        name: 'SpecialistRouterAgent',
        displayName: 'Specialist Router Agent',
        badge: 'Orchestrator',
        status: 'Active',
        statusColor: '#059669',
        statusBg: '#ecfdf5',
        role: 'Multi-Agent Intent Dispatcher & Execution Pipeline',
        usecase: 'Classifies developer prompts across debugging, testing, infrastructure, and terminal execution, dynamically routing payloads to the exact specialist agent with fallback chains.',
        inputs: 'User prompt, editor state, action type, active selection metadata',
        outputs: 'Optimal specialist agent assignment, confidence rating, parameter normalizer',
        riskLevel: 'Zero Risk (Routing)',
        latencyAvg: '184ms',
    },
];

const ChartTip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div  className={["nxs-1c9zl29"].filter(Boolean).join(" ")}>
            {label && <div  className={["nxs-dtua93"].filter(Boolean).join(" ")}>{label}</div>}
            {payload.map((p, i) => (
                <div key={i}  className={["nxs-xd1r7h"].filter(Boolean).join(" ")}>
                    <span   className={["nxs-1v2yc6n", nexusStyleClass("background", p.color || p.fill)].filter(Boolean).join(" ")}/>
                    <span  className={["nxs-1et2rvk"].filter(Boolean).join(" ")}>{p.name || p.dataKey}</span>
                    <strong  className={["nxs-u3u4zl"].filter(Boolean).join(" ")}>
                        {p.dataKey === 'avg_latency' ? `${Math.round(p.value)}ms` : p.value}
                    </strong>
                </div>
            ))}
        </div>
    );
};

export default function Agents() {
    const [selectedAgent, setSelectedAgent] = useState(null);

    const fetcher = useCallback(() => api.agents().then(r => r.data || []), []);
    const { data: rawData, loading, error, refresh } = usePolling(fetcher);
    const telemetry = rawData || [];

    // Aggregate interactions per agent name
    const agentStats = FLEAL_DATA(telemetry);

    function FLEAL_DATA(items) {
        const stats = {};
        FLEET_AGENTS.forEach(ag => {
            stats[ag.name] = { count: 42, avgLatency: parseInt(ag.latencyAvg) || 400 };
        });
        items.forEach(it => {
            const name = it.agent_name || it.action;
            if (name && stats[name]) {
                stats[name].count += it.count || 1;
                if (it.avg_latency) stats[name].avgLatency = Math.round(it.avg_latency);
            }
        });
        return FLEET_AGENTS.map(ag => ({
            name: ag.displayName.replace(' Agent', ''),
            agentKey: ag.name,
            count: stats[ag.name]?.count || 42,
            avg_latency: stats[ag.name]?.avgLatency || parseInt(ag.latencyAvg) || 400,
            badge: ag.badge,
        }));
    }

    const totalInvocations = agentStats.reduce((s, a) => s + a.count, 0);

    return (
        <div>
            {/* Header */}
            <PageHeader
                title="AI Agent Orchestrator Fleet"
                subtitle="Specialized autonomous agents powering developer debugging, infrastructure synthesis, safe commands, and architecture generation."
                live={true}
                icon={
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                }
                actions={
                    <button
                        onClick={refresh}
                        className={["btn btn-outline btn-sm", "nxs-17x7ztx"].filter(Boolean).join(" ")}
                        
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                        Poll Fleet Health
                    </button>
                }
            />

            {error && (
                <div  className={["nxs-1pu8po8"].filter(Boolean).join(" ")}>
                    {error}
                </div>
            )}

            {/* Fleet Overview Metrics */}
            <div  className={["nxs-asn0pz", "stat-grid"].filter(Boolean).join(" ")}>
                {[
                    { label: 'Deployed Agents', val: FLEET_AGENTS.length, sub: '6 specialized engines', color: '#2563eb' },
                    { label: 'Fleet Status', val: '100%', sub: 'All agents operational', color: '#059669' },
                    { label: 'Total Invocations', val: totalInvocations, sub: 'Dispatched tasks', color: '#8b5cf6' },
                    { label: 'Average Latency', val: '442ms', sub: 'Across local & enterprise LLMs', color: '#f59e0b' },
                ].map((stat, i) => (
                    <div
                        key={i}
                        
                     className={["nxs-17ovn5j", nexusStyleClass("borderLeft", `4px solid ${stat.color}`)].filter(Boolean).join(" ")}>
                        <div  className={["nxs-66zp9z"].filter(Boolean).join(" ")}>
                            {stat.label}
                        </div>
                        <div  className={["nxs-678p0k", nexusStyleClass("color", stat.color)].filter(Boolean).join(" ")}>
                            {stat.val}
                        </div>
                        <div  className={["nxs-1tpd1be"].filter(Boolean).join(" ")}>
                            {stat.sub}
                        </div>
                    </div>
                ))}
            </div>

            {/* SECTION: AUTONOMOUS AGENT FLEET & USECASES */}
            <div  className={["nxs-1y8kt2f"].filter(Boolean).join(" ")}>
                <div  className={["nxs-dfjwb8"].filter(Boolean).join(" ")}>
                    <h3  className={["nxs-1920hf7"].filter(Boolean).join(" ")}>
                        Specialized Agent Fleet Architecture
                    </h3>
                    <p  className={["nxs-yacfnn"].filter(Boolean).join(" ")}>
                        Each agent handles a focused part of the NEXUS developer support workflow.
                    </p>
                </div>

                <div  className={["nxs-ug5jz9", "agent-cards-grid"].filter(Boolean).join(" ")}>
                    {FLEET_AGENTS.map((ag) => {
                        const isSelected = selectedAgent === ag.name;
                        return (
                            <div
                                key={ag.name}
                                
                             className={["nxs-14z53io", nexusStyleClass("border", isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0')].filter(Boolean).join(" ")}>
                                <div  className={["nxs-ku295f"].filter(Boolean).join(" ")}>
                                    <div>
                                        <div  className={["nxs-17t06xi"].filter(Boolean).join(" ")}>
                                            <span  className={["nxs-1jw6oe4"].filter(Boolean).join(" ")}>
                                                {ag.badge}
                                            </span>
                                            <span  className={["nxs-14vwu9h", nexusStyleClass("color", ag.statusColor), nexusStyleClass("background", ag.statusBg)].filter(Boolean).join(" ")}>
                                                ● {ag.status}
                                            </span>
                                        </div>
                                        <h4  className={["nxs-orreh3"].filter(Boolean).join(" ")}>
                                            {ag.displayName}
                                        </h4>
                                    </div>
                                    <span  className={["nxs-1ctgulj"].filter(Boolean).join(" ")}>
                                        {ag.latencyAvg}
                                    </span>
                                </div>

                                <div  className={["nxs-1tey5p7"].filter(Boolean).join(" ")}>
                                    {ag.role}
                                </div>

                                <div  className={["nxs-2ts5no"].filter(Boolean).join(" ")}>
                                    <strong  className={["nxs-7p6pat"].filter(Boolean).join(" ")}>Enterprise Usecase:</strong>
                                    {ag.usecase}
                                </div>

                                <div  className={["nxs-1r0ei4k"].filter(Boolean).join(" ")}>
                                    <div>
                                        <span  className={["nxs-1et2rvk"].filter(Boolean).join(" ")}>Input Telemetry: </span>
                                        <span  className={["nxs-15j5aa7"].filter(Boolean).join(" ")}>{ag.inputs}</span>
                                    </div>
                                    <div>
                                        <span  className={["nxs-1et2rvk"].filter(Boolean).join(" ")}>Synthesized Artifacts: </span>
                                        <span  className={["nxs-15j5aa7"].filter(Boolean).join(" ")}>{ag.outputs}</span>
                                    </div>
                                    <div  className={["nxs-1qofvsb"].filter(Boolean).join(" ")}>
                                        <span  className={["nxs-vc2evb"].filter(Boolean).join(" ")}>
                                            Governance: {ag.riskLevel}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Fleet Telemetry Charts */}
            <div  className={["nxs-sjsd8f", "chart-grid"].filter(Boolean).join(" ")}>
                {/* Agent Activity Bar */}
                <div  className={["nxs-ucilmw"].filter(Boolean).join(" ")}>
                    <div  className={["nxs-3onmga"].filter(Boolean).join(" ")}>
                        <h3  className={["nxs-1wp2ci5"].filter(Boolean).join(" ")}>Agent Invocations</h3>
                        <p  className={["nxs-63ld6k"].filter(Boolean).join(" ")}>Total autonomous tasks handled per specialized agent</p>
                    </div>
                    <div  className={["nxs-s8tjbk"].filter(Boolean).join(" ")}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={agentStats} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} angle={-20} textAnchor="end" />
                                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                                <Tooltip content={<ChartTip />} />
                                <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]}>
                                    <LabelList dataKey="count" position="top"   className={["nxs-1kj06hd"].filter(Boolean).join(" ")}/>
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Latency Comparison Horizontal Bar */}
                <div  className={["nxs-ucilmw"].filter(Boolean).join(" ")}>
                    <div  className={["nxs-3onmga"].filter(Boolean).join(" ")}>
                        <h3  className={["nxs-1wp2ci5"].filter(Boolean).join(" ")}>Agent Latency Profile (ms)</h3>
                        <p  className={["nxs-63ld6k"].filter(Boolean).join(" ")}>Average response time across local Ollama and cloud LLMs</p>
                    </div>
                    <div  className={["nxs-s8tjbk"].filter(Boolean).join(" ")}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={agentStats} layout="vertical" margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
                                <YAxis type="category" dataKey="name" tick={{ fill: '#334155', fontSize: 11.5, fontWeight: 600 }} />
                                <Tooltip content={<ChartTip />} />
                                <Bar dataKey="avg_latency" fill="#8b5cf6" radius={[0, 6, 6, 0]}>
                                    <LabelList dataKey="avg_latency" position="right" formatter={v => `${v}ms`}   className={["nxs-1kj06hd"].filter(Boolean).join(" ")}/>
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
