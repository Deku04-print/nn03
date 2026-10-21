import { useState, useCallback, useMemo, useEffect } from 'react';
import { api } from '../services/api.js';
import { usePolling } from '../hooks/usePolling.js';
import Pagination from '../components/Pagination.jsx';
import EmptyState from '../components/EmptyState.jsx';
import PageHeader from '../components/PageHeader.jsx';

const PAGE_SIZE = 12;

const VERIFY_MAP = {
    pending:            { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', label: 'Pending' },
    partially_resolved: { bg: '#fef3c7', color: '#b45309', border: '#fde68a', label: 'Partial Fix' },
    verified:           { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', label: 'Verified' },
    failed:             { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', label: 'Failed' },
};

const SCOPE_MAP = {
    organization: { label: 'Enterprise Global', color: '#2563eb', bg: '#eff6ff', border: '#dbeafe' },
    team:         { label: 'Team Shared',       color: '#7c3aed', bg: '#f5f3ff', border: '#ede9fe' },
    private:      { label: 'Private (Twin)',    color: '#059669', bg: '#ecfdf5', border: '#d1fae5' },
};

function StatusBadge({ status }) {
    const key = (status || 'pending').toLowerCase();
    const conf = VERIFY_MAP[key] || VERIFY_MAP.pending;
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 10px',
            borderRadius: 999,
            fontSize: 11.5,
            fontWeight: 700,
            background: conf.bg,
            color: conf.color,
            border: `1px solid ${conf.border}`,
            textTransform: 'capitalize',
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: conf.color }} />
            {conf.label}
        </span>
    );
}

function ScopeBadge({ scope }) {
    const key = (scope || 'organization').toLowerCase();
    const conf = SCOPE_MAP[key] || SCOPE_MAP.organization;
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2.5px 8px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700,
            background: conf.bg,
            color: conf.color,
            border: `1px solid ${conf.border}`,
        }}>
            {conf.label}
        </span>
    );
}

// ── DNA Inspector & Governance Modal ───────────────────────────────────────

function DNAInspectorModal({ problem, onClose, onUpdated }) {
    if (!problem) return null;

    const [status, setStatus] = useState(problem.verification_status || 'pending');
    const [scope, setScope] = useState(problem.scope_zone || 'organization');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const [copySuccess, setCopySuccess] = useState(false);

    useEffect(() => {
        setStatus(problem.verification_status || 'pending');
        setScope(problem.scope_zone || 'organization');
        setSaveMsg('');
    }, [problem]);

    const handleSaveGovernance = async () => {
        setSaving(true);
        setSaveMsg('');
        try {
            const res = await api.updateProblemDNA(problem.id, {
                verification_status: status,
                scope_zone: scope,
            });
            if (res.success && res.data) {
                setSaveMsg('Governance saved successfully');
                if (onUpdated) onUpdated(res.data);
                setTimeout(() => setSaveMsg(''), 3000);
            }
        } catch (err) {
            setSaveMsg(`Error: ${err.message || 'Failed to update'}`);
        } finally {
            setSaving(false);
        }
    };

    const handleCopyRunbook = () => {
        const symptomsText = Array.isArray(problem.symptoms) && problem.symptoms.length
            ? problem.symptoms.map(s => `- ${s}`).join('\n')
            : 'None observed';
        const attemptsText = Array.isArray(problem.attempts) && problem.attempts.length
            ? problem.attempts.map(a => `### Attempt ${a.attempt_number || 1} [${(a.result || 'unknown').toUpperCase()}]\n${a.description || 'No details'}`).join('\n\n')
            : 'No recorded attempts';

        const runbookMd = `# Problem DNA Runbook: ${problem.error_type || 'Issue Signature'}
**Category**: ${problem.category || 'General'} | **Language**: ${problem.language || 'Any'} | **Scope**: ${problem.scope_zone || 'organization'}
**Verification Status**: ${problem.verification_status || 'pending'} | **Trust Score**: ${Math.round((problem.reliability_score || 0.85) * 100)}%
**Total Reuses**: ${problem.reuse_count || 0} | **Est. Engineering Hours Saved**: ${((problem.reuse_count || 0) * 0.75).toFixed(1)} hrs

---

## 1. Observed Symptoms
${symptomsText}

## 2. Attempt Progression
${attemptsText}

## 3. Root Cause Analysis
${problem.root_cause || 'Root cause investigation details pending.'}

## 4. Verified Remediation
\`\`\`${problem.language || 'bash'}
${problem.fix_snippet || '// Verification fix snippet not recorded.'}
\`\`\`

---
*Generated by NEXUS ProblemDNA Reusable Problem Memory Engine*`;

        navigator.clipboard.writeText(runbookMd).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2500);
        });
    };

    const trustPercent = Math.round((problem.reliability_score || 0.85) * 100);
    const estHours = ((problem.reuse_count || 0) * 0.75).toFixed(1);

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.65)',
                zIndex: 1050,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(6px)',
                padding: '16px',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: '#ffffff',
                    borderRadius: 16,
                    maxWidth: 780,
                    width: '100%',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 65px -12px rgba(15, 23, 42, 0.35)',
                    border: '1px solid #e2e8f0',
                    overflow: 'hidden',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header (Fixed) */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    background: '#ffffff',
                    flexShrink: 0,
                    gap: 16,
                }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                            <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.07em',
                                color: '#2563eb',
                                background: '#eff6ff',
                                padding: '3px 9px',
                                borderRadius: 6,
                                border: '1px solid #dbeafe',
                            }}>
                                Problem DNA Memory Record
                            </span>
                            <StatusBadge status={status} />
                            <ScopeBadge scope={scope} />
                        </div>
                        <h3 style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color: '#0f172a',
                            margin: 0,
                            lineHeight: 1.3,
                            wordBreak: 'break-word',
                        }}>
                            {problem.error_type?.replace(/_/g, ' ') || 'Diagnostic Signature'}
                        </h3>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span>Signature ID:</span>
                            <code style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                padding: '1px 7px',
                                borderRadius: 5,
                                fontFamily: 'monospace',
                                fontSize: 11.5,
                                color: '#334155',
                            }}>
                                {problem.id || 'N/A'}
                            </code>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: '#f1f5f9',
                            border: 'none',
                            borderRadius: 8,
                            width: 32,
                            height: 32,
                            cursor: 'pointer',
                            fontSize: 16,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#64748b',
                            fontWeight: 700,
                            flexShrink: 0,
                            transition: 'all 120ms',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
                        aria-label="Close modal"
                    >
                        ✕
                    </button>
                </div>

                {/* Body (Scrollable along Y) */}
                <div style={{
                    padding: '20px 24px',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                }}>
                    {/* Enterprise Governance Control Bar */}
                    <div style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                                    Verification Lifecycle
                                </label>
                                <select
                                    value={status}
                                    onChange={e => setStatus(e.target.value)}
                                    style={{
                                        border: '1px solid #cbd5e1',
                                        borderRadius: 7,
                                        padding: '6px 10px',
                                        fontSize: 12.5,
                                        fontWeight: 600,
                                        background: '#ffffff',
                                        color: '#1e293b',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <option value="verified">Verified (High Trust)</option>
                                    <option value="partially_resolved">Partially Resolved</option>
                                    <option value="pending">Pending Review</option>
                                    <option value="failed">Failed / Obsolete</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                                    Data Privacy Zone
                                </label>
                                <select
                                    value={scope}
                                    onChange={e => setScope(e.target.value)}
                                    style={{
                                        border: '1px solid #cbd5e1',
                                        borderRadius: 7,
                                        padding: '6px 10px',
                                        fontSize: 12.5,
                                        fontWeight: 600,
                                        background: '#ffffff',
                                        color: '#1e293b',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <option value="organization">Enterprise Global (All Orgs)</option>
                                    <option value="team">Team Shared</option>
                                    <option value="private">Private (Personal Twin Only)</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button
                                onClick={handleSaveGovernance}
                                disabled={saving}
                                style={{
                                    padding: '7px 16px',
                                    background: '#2563eb',
                                    border: 'none',
                                    borderRadius: 7,
                                    fontSize: 12.5,
                                    fontWeight: 700,
                                    color: '#ffffff',
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                }}
                            >
                                {saving ? 'Saving…' : 'Save Governance'}
                            </button>
                            {saveMsg && (
                                <span style={{ fontSize: 12, fontWeight: 600, color: saveMsg.startsWith('Error') ? '#dc2626' : '#059669' }}>
                                    {saveMsg}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Impact & Trust Strip */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                        gap: 10,
                        width: '100%',
                    }}>
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                                Reliability Score
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 16, fontWeight: 800, color: trustPercent >= 90 ? '#059669' : '#d97706' }}>
                                    {trustPercent}%
                                </span>
                                <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ width: `${trustPercent}%`, height: '100%', background: trustPercent >= 90 ? '#059669' : '#d97706', borderRadius: 3 }} />
                                </div>
                            </div>
                        </div>

                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                                Reuses in WorkLens
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#2563eb' }}>
                                {problem.reuse_count || 0} times
                            </div>
                        </div>

                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                                Hours Saved
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#059669' }}>
                                ~{estHours} hrs
                            </div>
                        </div>

                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                                Language / Stack
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', textTransform: 'capitalize' }}>
                                {problem.language || 'General'} {problem.framework ? `· ${problem.framework}` : ''}
                            </div>
                        </div>
                    </div>

                    {/* Attempt Trajectory & Dead-End Inspector */}
                    <div style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        padding: '14px 16px',
                    }}>
                        <div style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#475569',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: 10,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                            Attempt Progression & Dead-End History
                        </div>

                        {Array.isArray(problem.attempts) && problem.attempts.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {problem.attempts.map((att, i) => {
                                    const isSuccess = (att.result || '').toLowerCase() === 'success';
                                    const isPartial = (att.result || '').toLowerCase() === 'partial';
                                    const isFailed = (att.result || '').toLowerCase() === 'failed';
                                    const borderColor = isSuccess ? '#a7f3d0' : isPartial ? '#fde68a' : '#fecaca';
                                    const badgeBg = isSuccess ? '#ecfdf5' : isPartial ? '#fef3c7' : '#fef2f2';
                                    const badgeColor = isSuccess ? '#047857' : isPartial ? '#b45309' : '#b91c1c';

                                    return (
                                        <div
                                            key={i}
                                            style={{
                                                border: `1px solid ${borderColor}`,
                                                background: '#f8fafc',
                                                borderRadius: 8,
                                                padding: '10px 14px',
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: 12,
                                            }}
                                        >
                                            <div style={{
                                                width: 24,
                                                height: 24,
                                                borderRadius: '50%',
                                                background: badgeBg,
                                                color: badgeColor,
                                                border: `1px solid ${borderColor}`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 11,
                                                fontWeight: 800,
                                                flexShrink: 0,
                                                marginTop: 2,
                                            }}>
                                                {att.attempt_number || i + 1}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                                                        Attempt {att.attempt_number || i + 1}
                                                        {att.guidance_level ? ` · Guidance L${att.guidance_level}` : ''}
                                                    </span>
                                                    <span style={{
                                                        fontSize: 10.5,
                                                        fontWeight: 700,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.05em',
                                                        padding: '2px 7px',
                                                        borderRadius: 4,
                                                        background: badgeBg,
                                                        color: badgeColor,
                                                    }}>
                                                        {att.result || 'Unknown'}
                                                    </span>
                                                </div>
                                                <p style={{ margin: 0, fontSize: 12.5, color: '#334155', lineHeight: 1.5 }}>
                                                    {att.description || 'No description recorded.'}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ fontSize: 12.5, color: '#64748b', fontStyle: 'italic', padding: '6px 0' }}>
                                No previous failed attempts recorded. Solution was identified on initial analysis.
                            </div>
                        )}
                    </div>

                    {/* Observed Symptoms */}
                    {Array.isArray(problem.symptoms) && problem.symptoms.length > 0 && (
                        <div style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 10,
                            padding: '14px 16px',
                        }}>
                            <div style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#475569',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                marginBottom: 8,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                Observed Symptoms & Diagnostics ({problem.symptoms.length})
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: '#334155', lineHeight: 1.6 }}>
                                {problem.symptoms.map((s, i) => (
                                    <li key={i} style={{ wordBreak: 'break-word', marginBottom: 4 }}>
                                        {s}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Root Cause & Remediation */}
                    {problem.root_cause && (
                        <div style={{
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            borderRadius: 10,
                            padding: '14px 16px',
                        }}>
                            <div style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#1e40af',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                marginBottom: 6,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                Identified Root Cause
                            </div>
                            <p style={{
                                fontSize: 13,
                                color: '#1e3a8a',
                                lineHeight: 1.6,
                                margin: 0,
                                wordBreak: 'break-word',
                            }}>
                                {problem.root_cause}
                            </p>
                        </div>
                    )}

                    {/* Code Pattern / Fix Snippet */}
                    {problem.fix_snippet && (
                        <div style={{
                            background: '#0f172a',
                            borderRadius: 10,
                            padding: '14px 16px',
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 8,
                            }}>
                                <span style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#94a3b8',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                }}>
                                    Verified Remediation Pattern
                                </span>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(problem.fix_snippet);
                                        setCopySuccess(true);
                                        setTimeout(() => setCopySuccess(false), 2000);
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid #334155',
                                        borderRadius: 6,
                                        color: '#cbd5e1',
                                        padding: '2px 8px',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {copySuccess ? 'Copied!' : 'Copy Code'}
                                </button>
                            </div>
                            <pre style={{
                                margin: 0,
                                fontSize: 12,
                                fontFamily: 'monospace',
                                color: '#38bdf8',
                                overflowX: 'auto',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            }}>
                                {problem.fix_snippet}
                            </pre>
                        </div>
                    )}
                </div>

                {/* Footer (Fixed) */}
                <div style={{
                    padding: '14px 24px',
                    borderTop: '1px solid #f1f5f9',
                    background: '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                }}>
                    <button
                        onClick={handleCopyRunbook}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '7px 14px',
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: 8,
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: '#2563eb',
                            cursor: 'pointer',
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        {copySuccess ? 'Runbook Copied!' : 'Export Runbook (Markdown)'}
                    </button>

                    <button
                        onClick={onClose}
                        style={{
                            padding: '7px 18px',
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#334155',
                            cursor: 'pointer',
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main Problems Page Component ──────────────────────────────────────────

export default function Problems() {
    const [activeTab, setActiveTab] = useState('registry'); // 'registry' | 'recall'
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterScope, setFilterScope] = useState('');
    const [filterLang, setFilterLang] = useState('');
    const [filterCat, setFilterCat] = useState('');
    const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'reused' | 'trust'
    const [page, setPage] = useState(1);
    const [selectedProblem, setSelectedProblem] = useState(null);

    // Recall Playground state
    const [recallQuery, setRecallQuery] = useState('');
    const [recallLang, setRecallLang] = useState('');
    const [recallResults, setRecallResults] = useState([]);
    const [recalling, setRecalling] = useState(false);

    // Analytics summary
    const [analytics, setAnalytics] = useState(null);

    const loadAnalytics = useCallback(() => {
        api.problemAnalytics()
            .then(res => { if (res.success) setAnalytics(res.data); })
            .catch(() => {});
    }, []);

    const fetcher = useCallback(() => api.problemsList({ limit: 250 }).then(r => r.data || []), []);
    const { data: rawData, loading, error, refresh } = usePolling(fetcher);
    const items = useMemo(() => rawData || [], [rawData]);

    useEffect(() => {
        loadAnalytics();
    }, [loadAnalytics]);

    // Unique options for dropdowns
    const langOptions = useMemo(() =>
        [...new Set(items.map(p => p.language).filter(Boolean))].sort(),
        [items]
    );

    const catOptions = useMemo(() =>
        [...new Set(items.map(p => p.category).filter(Boolean))].sort(),
        [items]
    );

    // Handle Semantic Recall test
    const handleRecallSearch = async (e) => {
        if (e) e.preventDefault();
        if (!recallQuery.trim()) return;
        setRecalling(true);
        try {
            const res = await api.similarProblems(recallQuery, recallLang, '');
            setRecallResults(res.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setRecalling(false);
        }
    };

    // Filter & sort problem records
    const filtered = useMemo(() => {
        return items.filter(p => {
            const q = search.toLowerCase();
            const matchSearch = !q || [p.category, p.language, p.error_type, p.code_pattern, p.root_cause, ...(p.symptoms || [])]
                .some(f => f?.toLowerCase().includes(q));
            const matchStatus = !filterStatus || (p.verification_status || 'pending').toLowerCase() === filterStatus.toLowerCase();
            const matchScope = !filterScope || (p.scope_zone || 'organization').toLowerCase() === filterScope.toLowerCase();
            const matchLang = !filterLang || p.language === filterLang;
            const matchCat = !filterCat || p.category === filterCat;
            return matchSearch && matchStatus && matchScope && matchLang && matchCat;
        }).sort((a, b) => {
            if (sortBy === 'reused') return (b.reuse_count || 0) - (a.reuse_count || 0);
            if (sortBy === 'trust') return (b.reliability_score || 0) - (a.reliability_score || 0);
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });
    }, [items, search, filterStatus, filterScope, filterLang, filterCat, sortBy]);

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const handleClearFilters = () => {
        setSearch('');
        setFilterStatus('');
        setFilterScope('');
        setFilterLang('');
        setFilterCat('');
        setSortBy('newest');
        setPage(1);
    };

    const handleProblemUpdated = (updatedRecord) => {
        refresh();
        loadAnalytics();
        setSelectedProblem(updatedRecord);
    };

    return (
        <div>
            <DNAInspectorModal
                problem={selectedProblem}
                onClose={() => setSelectedProblem(null)}
                onUpdated={handleProblemUpdated}
            />

            {/* Page Header */}
            <PageHeader
                title="Problem DNA Knowledge Network"
                subtitle="Reusable problem memory, verified remediation signatures, and expert deflection across enterprise sessions."
                live={true}
                icon={
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07l14.14-14.14" />
                    </svg>
                }
                actions={
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={() => { refresh(); loadAnalytics(); }}
                            className="btn btn-outline btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                            Sync DNA Memory
                        </button>
                    </div>
                }
            />

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', color: '#b91c1c', fontSize: 13, marginBottom: 20 }}>
                    {error}
                </div>
            )}

            {/* Strategic KPI Metric Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
                {[
                    {
                        label: 'Indexed DNA Signatures',
                        val: analytics?.total_signatures ?? items.length,
                        sub: `${catOptions.length} active error categories`,
                        color: '#3b82f6',
                    },
                    {
                        label: 'Verification Rate',
                        val: `${analytics?.verified_rate ?? 0}%`,
                        sub: `${analytics?.verified_count ?? 0} high-confidence signatures`,
                        color: '#10b981',
                    },
                    {
                        label: 'Cumulative Reuses',
                        val: (analytics?.total_reuses ?? 0).toLocaleString(),
                        sub: `${analytics?.expert_deflection_rate ?? 0}% expert deflection`,
                        color: '#8b5cf6',
                    },
                    {
                        label: 'Hours Saved',
                        val: `${analytics?.hours_saved ?? 0} hrs`,
                        sub: 'Est. engineering time preserved',
                        color: '#f59e0b',
                    },
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
                        <div style={{ fontSize: 26, fontWeight: 800, color: stat.color, lineHeight: 1.1 }}>
                            {stat.val}
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                            {stat.sub}
                        </div>
                    </div>
                ))}
            </div>

            {/* Navigation Tabs */}
            <div style={{
                display: 'flex',
                gap: 8,
                borderBottom: '1px solid #e2e8f0',
                marginBottom: 16,
            }}>
                <button
                    onClick={() => setActiveTab('registry')}
                    style={{
                        padding: '10px 18px',
                        fontSize: 13,
                        fontWeight: 700,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: activeTab === 'registry' ? '#2563eb' : '#64748b',
                        borderBottom: activeTab === 'registry' ? '2px solid #2563eb' : '2px solid transparent',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                    Problem DNA Registry & Governance
                </button>

                <button
                    onClick={() => setActiveTab('recall')}
                    style={{
                        padding: '10px 18px',
                        fontSize: 13,
                        fontWeight: 700,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: activeTab === 'recall' ? '#2563eb' : '#64748b',
                        borderBottom: activeTab === 'recall' ? '2px solid #2563eb' : '2px solid transparent',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    Semantic Recall Playground (Flywheel Step 3)
                </button>
            </div>

            {/* TAB 1: REGISTRY & GOVERNANCE */}
            {activeTab === 'registry' && (
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                    {/* Search & Filter Toolbar */}
                    <div style={{
                        padding: '14px 18px',
                        borderBottom: '1px solid #f1f5f9',
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        background: '#f8fafc',
                    }}>
                        {/* Search */}
                        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            <input
                                placeholder="Search symptoms, errors, root causes…"
                                value={search}
                                onChange={e => { setSearch(e.target.value); setPage(1); }}
                                style={{
                                    width: '100%',
                                    paddingLeft: 36,
                                    paddingRight: 12,
                                    paddingTop: 8,
                                    paddingBottom: 8,
                                    border: '1px solid #cbd5e1',
                                    borderRadius: 8,
                                    fontSize: 13,
                                    fontFamily: 'inherit',
                                    outline: 'none',
                                    background: '#ffffff',
                                    color: '#1e293b',
                                }}
                            />
                        </div>

                        {/* Status Filter */}
                        <select
                            value={filterStatus}
                            onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
                            style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 12px', fontSize: 13, background: '#ffffff', color: '#334155', cursor: 'pointer', outline: 'none' }}
                        >
                            <option value="">All Statuses</option>
                            <option value="verified">Verified</option>
                            <option value="partially_resolved">Partially Resolved</option>
                            <option value="pending">Pending Review</option>
                            <option value="failed">Failed</option>
                        </select>

                        {/* Scope Filter */}
                        <select
                            value={filterScope}
                            onChange={e => { setFilterScope(e.target.value); setPage(1); }}
                            style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 12px', fontSize: 13, background: '#ffffff', color: '#334155', cursor: 'pointer', outline: 'none' }}
                        >
                            <option value="">All Scopes</option>
                            <option value="organization">Enterprise Global</option>
                            <option value="team">Team Shared</option>
                            <option value="private">Private (Twin)</option>
                        </select>

                        {/* Language Filter */}
                        <select
                            value={filterLang}
                            onChange={e => { setFilterLang(e.target.value); setPage(1); }}
                            style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 12px', fontSize: 13, background: '#ffffff', color: '#334155', cursor: 'pointer', outline: 'none' }}
                        >
                            <option value="">All Languages</option>
                            {langOptions.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>

                        {/* Category Filter */}
                        <select
                            value={filterCat}
                            onChange={e => { setFilterCat(e.target.value); setPage(1); }}
                            style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 12px', fontSize: 13, background: '#ffffff', color: '#334155', cursor: 'pointer', outline: 'none' }}
                        >
                            <option value="">All Categories</option>
                            {catOptions.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                        </select>

                        {/* Sort selector */}
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value)}
                            style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 12px', fontSize: 13, background: '#ffffff', color: '#334155', cursor: 'pointer', outline: 'none' }}
                        >
                         <option value="newest">Sort: Newest First</option>
                            <option value="reused">Sort: Most Reused</option>
                            <option value="trust">Sort: Highest Trust</option>
                        </select>

                        {(search || filterStatus || filterScope || filterLang || filterCat || sortBy !== 'newest') && (
                            <button
                                onClick={handleClearFilters}
                                style={{ padding: '8px 14px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#ffffff', color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                            >
                                Clear Filters
                            </button>
                        )}

                        <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#64748b' }}>
                            Showing {filtered.length} of {items.length} records
                        </div>
                    </div>

                    {/* Table */}
                    {loading && !items.length ? (
                        <div style={{ padding: '50px 20px', textAlign: 'center', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                            <span className="spinner" /> Loading Problem DNA records…
                        </div>
                    ) : items.length === 0 ? (
                        <EmptyState
                            icon="data"
                            title="No Problem DNA signatures recorded yet"
                            description="As developers encounter and solve errors with WorkLens, signatures will be indexed into reusable memory."
                        />
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Category</th>
                                        <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Error Type & Root Cause</th>
                                        <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Stack</th>
                                        <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Privacy Scope</th>
                                        <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Reuses & Deflection</th>
                                        <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Trust Score</th>
                                        <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</th>
                                        <th style={{ textAlign: 'right', padding: '12px 18px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Governance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} style={{ padding: '40px 18px', textAlign: 'center', color: '#64748b' }}>
                                                No problem signatures match your active filter criteria.
                                            </td>
                                        </tr>
                                    ) : paged.map(p => {
                                        const trust = Math.round((p.reliability_score || 0.85) * 100);
                                        return (
                                            <tr
                                                key={p.id}
                                                style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 120ms' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseLeave={e => e.currentTarget.style.background = ''}
                                            >
                                                <td style={{ padding: '12px 18px' }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '3px 8px', borderRadius: 6 }}>
                                                        {p.category?.replace(/_/g, ' ') || 'General'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 18px', maxWidth: 260 }}>
                                                    <div style={{ fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {p.error_type?.replace(/_/g, ' ') || 'Diagnostic'}
                                                    </div>
                                                    <div style={{ fontSize: 11.5, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                                                        {p.root_cause || (Array.isArray(p.symptoms) && p.symptoms[0]) || 'Root cause pending verification'}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 18px' }}>
                                                    <span style={{ fontFamily: 'monospace', fontSize: 12, background: '#f1f5f9', padding: '3px 8px', borderRadius: 6, color: '#334155' }}>
                                                        {p.language || 'Any'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 18px' }}>
                                                    <ScopeBadge scope={p.scope_zone} />
                                                </td>
                                                <td style={{ padding: '12px 18px' }}>
                                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{p.reuse_count || 0}</span>
                                                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>
                                                        (~{((p.reuse_count || 0) * 0.75).toFixed(1)}h saved)
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 18px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span style={{ fontSize: 12, fontWeight: 700, color: trust >= 90 ? '#059669' : '#d97706' }}>
                                                            {trust}%
                                                        </span>
                                                        <div style={{ width: 45, height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                                                            <div style={{ width: `${trust}%`, height: '100%', background: trust >= 90 ? '#059669' : '#d97706' }} />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 18px' }}>
                                                    <StatusBadge status={p.verification_status} />
                                                </td>
                                                <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                                                    <button
                                                        onClick={() => setSelectedProblem(p)}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 5,
                                                            padding: '5px 12px',
                                                            borderRadius: 6,
                                                            border: '1px solid #cbd5e1',
                                                            background: '#ffffff',
                                                            color: '#2563eb',
                                                            fontWeight: 600,
                                                            fontSize: 12,
                                                            cursor: 'pointer',
                                                            transition: 'all 120ms',
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.background = '#eff6ff'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#ffffff'; }}
                                                    >
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                                        Inspect
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {!loading && filtered.length > 0 && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 18px',
                            borderTop: '1px solid #e2e8f0',
                            background: '#ffffff',
                            flexWrap: 'wrap',
                            gap: 12,
                        }}>
                            <div style={{ fontSize: 13, color: '#64748b' }}>
                                Showing <strong style={{ color: '#0f172a' }}>{((page - 1) * PAGE_SIZE) + 1}</strong> to <strong style={{ color: '#0f172a' }}>{Math.min(page * PAGE_SIZE, filtered.length)}</strong> of <strong style={{ color: '#0f172a' }}>{filtered.length}</strong> items
                            </div>
                            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: SEMANTIC RECALL PLAYGROUND */}
            {activeTab === 'recall' && (
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div style={{ maxWidth: 800, marginBottom: 20 }}>
                        <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                            Flywheel Step 3: Semantic Recall Test Engine
                        </h3>
                        <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                            Simulates WorkLens querying the Problem DNA memory graph. Enter any terminal error, compiler log, or symptom to evaluate hybrid semantic matching scores against verified solutions.
                        </p>
                    </div>

                    <form onSubmit={handleRecallSearch} style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="e.g. zsh: command not found: create OR TypeError: Cannot read properties of undefined..."
                            value={recallQuery}
                            onChange={e => setRecallQuery(e.target.value)}
                            style={{
                                flex: 1,
                                minWidth: 320,
                                padding: '10px 14px',
                                border: '1px solid #cbd5e1',
                                borderRadius: 8,
                                fontSize: 13,
                                outline: 'none',
                                color: '#1e293b',
                            }}
                        />
                        <select
                            value={recallLang}
                            onChange={e => setRecallLang(e.target.value)}
                            style={{
                                border: '1px solid #cbd5e1',
                                borderRadius: 8,
                                padding: '10px 14px',
                                fontSize: 13,
                                background: '#ffffff',
                                color: '#334155',
                                outline: 'none',
                            }}
                        >
                            <option value="">Any Language</option>
                            {langOptions.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <button
                            type="submit"
                            disabled={recalling || !recallQuery.trim()}
                            style={{
                                padding: '10px 20px',
                                background: '#2563eb',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 8,
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: (recalling || !recallQuery.trim()) ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                            }}
                        >
                            {recalling ? 'Searching Memory…' : 'Recall Similar Solutions'}
                        </button>
                    </form>

                    {/* Results */}
                    {recalling ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                            <span className="spinner" /> Querying Problem DNA Vector Space…
                        </div>
                    ) : recallResults.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Found {recallResults.length} Closest Problem DNA Signatures:
                            </div>
                            {recallResults.map((r, i) => {
                                const simPct = Math.round((r._score || 0) * 100);
                                return (
                                    <div
                                        key={r.id || i}
                                        style={{
                                            border: '1px solid #e2e8f0',
                                            borderRadius: 12,
                                            padding: '16px 20px',
                                            background: '#f8fafc',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 8,
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '3px 8px', borderRadius: 6 }}>
                                                    {r.category || 'General'}
                                                </span>
                                                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                                                    {r.language || 'Any'}
                                                </span>
                                                {r.verified && (
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#047857', background: '#ecfdf5', padding: '2px 7px', borderRadius: 6, border: '1px solid #a7f3d0' }}>
                                                        Verified Solution
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                                                    Match Score: {simPct}%
                                                </span>
                                            </div>
                                        </div>

                                        <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
                                            <strong>Root Cause:</strong> {r.root_cause || 'Root cause logged in ProblemDNA'}
                                        </div>

                                        {r.guidance && (
                                            <div style={{ fontSize: 12.5, color: '#475569' }}>
                                                <strong>Remediation Guidance:</strong> {Array.isArray(r.guidance) ? r.guidance.join('; ') : r.guidance}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : recallQuery ? (
                        <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: 13 }}>
                            No high-confidence Problem DNA match found for "{recallQuery}".
                            In the NEXUS flywheel, this triggers <strong>Step 4: AI Guided Reasoning</strong> and <strong>Step 5: Human API Expert Connection</strong>.
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}