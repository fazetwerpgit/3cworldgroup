'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { validateSignup, passwordStrength, PASSWORD_STRENGTH_LABEL } from '@/lib/auth/signupValidation';
import { friendlyAuthError } from '@/lib/auth/friendlyAuthError';
import { looksLikeBotSignup } from '@/lib/auth/botDetection';

// Real 3-step structural fact describing the account flow (verify -> manager
// approves -> role assigned + onboarding starts) — not measured data, same
// reasoning as Settings' static 5 (member-the-line-goal.md).
const SIGNUP_STEPS = [
  { n: 1, label: 'Verify your email' },
  { n: 2, label: 'Manager approves your account' },
  { n: 3, label: 'You get your role and start onboarding' },
];

// Scoped restyle: this component no longer renders the shared AuthShell (that
// component stays untouched — still used by LoginForm/PendingApproval, out
// of scope this round). Signup gets its own split brand/form canvas matching
// the approved mockup; zero blast radius to Login or PendingApproval.
export function SignupForm() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const strength = useMemo(() => passwordStrength(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateSignup(email, password, displayName, confirmPassword);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    if (looksLikeBotSignup(email, displayName)) {
      setError('This doesn\'t look like a real name and email. Use your everyday email address, or ask your manager to set up your account.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signUp(email.trim(), password, displayName.trim());
      // AuthContext set pendingApproval; go to /portal, which renders the
      // real PendingApproval component (this page only knows how to show the form).
      router.push('/portal');
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="member-line-signup-page">
      <div className="member-line-signup-shell member-line">
        <div className="member-line-masthead">
          <div>
            <p className="member-line-kicker">signup broadcast / first signal</p>
            <h1>
              <span className="accent">Join the line.</span>
              <span>Find your lane.</span>
            </h1>
            <p className="member-line-intro">
              Verify. Get approved. Start onboarding with the role that fits your next move.
            </p>
          </div>
          <div className="member-line-display portal-metallic-num portal-num" aria-label="3 signup steps">
            3
          </div>
        </div>

        <div className="member-line-section-index">
          <b>01</b>
          <span>/ public entry</span>
        </div>

        <div className="member-line-signup">
          <section className="member-line-form-card">
            <p className="member-line-eyebrow">01 / your signal</p>
            <h2>Create a member account</h2>
            <p>Use an email you check regularly. Manager approval follows verification.</p>

            <form onSubmit={handleSubmit} className="member-line-form-stack">
              {error && <div className="member-line-note warn" role="alert">{error}</div>}

              <div className="member-line-field">
                <label htmlFor="signup-name">Full name / required</label>
                <input
                  id="signup-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>

              <div className="member-line-field">
                <label htmlFor="signup-email">Email / required</label>
                <input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="member-line-field">
                <label htmlFor="signup-password">Password / required</label>
                <div className="member-line-password">
                  <input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    className="show"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="inline size-3.5" /> : <Eye className="inline size-3.5" />}{' '}
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="member-line-strength">
                  <div className={`member-line-strength-bar ${password ? strength : ''}`}>
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="member-line-strength-label">
                    {password ? PASSWORD_STRENGTH_LABEL[strength] : 'Enter 6+ characters'}
                  </div>
                </div>
              </div>

              <div className="member-line-field">
                <label htmlFor="signup-confirm">Confirm password / required</label>
                <input
                  id="signup-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>

              <button type="submit" className="member-line-button primary" disabled={loading}>
                {loading ? 'Requesting access…' : 'Request access'}
              </button>
            </form>

            <div className="member-line-steps">
              {SIGNUP_STEPS.map((step) => (
                <div key={step.n} className="member-line-step">
                  <b>{step.n}</b>
                  <span>{step.label}</span>
                </div>
              ))}
            </div>

            <div className="member-line-form-links">
              <Link href="/portal">Sign in</Link>
              <Link href="/">
                <ArrowLeft className="mr-1 inline size-3" /> Back to main site
              </Link>
            </div>
          </section>

          <aside className="member-line-brand-card">
            <div>
              <div className="member-line-index-line">
                <b>02</b>
                <span>/ the member signal</span>
              </div>
              <h2>
                Make the next move <em>visible.</em>
              </h2>
              <p className="member-line-sub">
                A place for the work, the proof, and the people who keep it moving.
              </p>
            </div>
            <div className="member-line-brand-footer">
              <span>verify / approve / begin</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                live /
                <Image
                  src="/logo.png"
                  alt="3C World Group"
                  width={20}
                  height={20}
                  className="member-line-brand-logo"
                />
              </span>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
