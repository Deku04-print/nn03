import { useState } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import WorkLensLogo from '../components/WorkLensLogo.jsx';
import {
  HiOutlineEnvelope,
  HiOutlineLockClosed,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineShieldCheck,
  HiOutlineArrowRight,
  HiOutlineCpuChip,
  HiOutlineSparkles,
  HiOutlineChartBar,
} from 'react-icons/hi2';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, pass);
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-split-page">
      {/* ── Left Side: Product Landing & Feature Showcase ── */}
      <div className="auth-landing-panel">
        {/* Brand Header */}
        <div className="landing-header">
          <WorkLensLogo size={34} showText={true} color="#1a56db" textColor="#0f172a" />
          <span className="landing-pill">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563eb', display: 'inline-block' }} />
            Enterprise Edition
          </span>
        </div>

        {/* Main Hero & Value Proposition */}
        <div className="landing-main-content">
          <div className="landing-eyebrow">
            <HiOutlineSparkles size={16} />
            <span>Autonomous Mentoring & Diagnostics</span>
          </div>

          <h1 className="landing-title">
            Next-Gen Problem DNA & <span>Developer Telemetry</span>
          </h1>

          <p className="landing-desc">
            Empower developer cohorts with real-time error diagnostics, contextual multi-agent mentorship,
            and deep mastery analytics directly inside the VS Code environment.
          </p>

          {/* 3 Core Value Pillars */}
          <div className="landing-features">
            <div className="landing-feature-item">
              <div className="feature-icon-box">
                <HiOutlineCpuChip size={20} />
              </div>
              <div className="feature-text">
                <h4>Problem DNA Telemetry</h4>
                <p>Captures syntax AST patterns, execution symptoms, and attempt histories with zero friction.</p>
              </div>
            </div>

            <div className="landing-feature-item">
              <div className="feature-icon-box">
                <HiOutlineSparkles size={20} />
              </div>
              <div className="feature-text">
                <h4>Progressive Multi-Agent Guidance</h4>
                <p>Specialist agents adaptively scaffold assistance from minimal hints to guided walkthroughs.</p>
              </div>
            </div>

            <div className="landing-feature-item">
              <div className="feature-icon-box">
                <HiOutlineChartBar size={20} />
              </div>
              <div className="feature-text">
                <h4>Cohort Mastery & Growth Curves</h4>
                <p>Actionable visibility into recurring error clusters, developer autonomy indexes, and resolution rates.</p>
              </div>
            </div>
          </div>

          {/* Simulated Live Telemetry Preview Card */}
          <div className="landing-telemetry-preview">
            <div className="preview-top-bar">
              <div className="preview-title">
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 0 2px rgba(16,185,129,0.3)' }} />
                <span>Live Telemetry Stream</span>
              </div>
              <span className="preview-stat">AST Verified ✓</span>
            </div>
            <div className="preview-code-row">
              <span style={{ color: '#0f172a', fontWeight: 600 }}>TypeScript/JSX • Unused Declarations (B49)</span>
              <span style={{ color: '#059669', fontWeight: 700 }}>Resolved (1 hint)</span>
            </div>
          </div>
        </div>

        {/* Landing Footer */}
        <div className="landing-footer">
          <span>Enterprise Secure Telemetry Engine v1.0</span>
          <span>End-to-End Encrypted</span>
        </div>
      </div>

      {/* ── Right Side: Admin Sign-In Console ── */}
      <div className="auth-form-panel">
        <div className="auth-container">
          <div className="auth-card">
            {/* Header & Logo */}
            <div className="auth-header">
              <div className="auth-logo-badge">
                <WorkLensLogo size={36} showText={true} color="#1a56db" textColor="#0f172a" />
                <span className="auth-portal-pill">NEXUS Workspace</span>
              </div>
              <h2>Sign in to Dashboard</h2>
              <p>Use your existing account to view your workspace. Administrators retain access to system insights.</p>
            </div>

            {error && (
              <div className="auth-error-banner" role="alert">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <div className="input-icon-wrapper">
                  <HiOutlineEnvelope className="field-icon" aria-hidden="true" />
                  <input
                    id="email"
                    type="email"
                    className="auth-input"
                    placeholder="user@tcs.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="form-group">
                <div className="field-label-row">
                  <label htmlFor="password">Password</label>
                </div>
                <div className="input-icon-wrapper">
                  <HiOutlineLockClosed className="field-icon" aria-hidden="true" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="auth-input"
                    placeholder="••••••••"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <HiOutlineEyeSlash size={18} /> : <HiOutlineEye size={18} />}
                  </button>
                </div>
              </div>

              <button id="login" className="btn-auth-submit" type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <span className="spinner" style={{ width: 16, height: 16 }} />
                    <span>Verifying Credentials…</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to NEXUS</span>
                    <HiOutlineArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div className="auth-card-footer">
              <HiOutlineShieldCheck className="security-icon" />
              <span>Role-Based Access • TCS Corporate Security</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
