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

interface Grecaptcha {
  ready(callback: () => void): void;
  execute(siteKey: string, options: { action: string }): Promise<string> | string;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

let recaptchaScriptPromise: Promise<void> | null = null;

function loadRecaptchaScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('reCAPTCHA is only available in the browser'));
  }
  if (window.grecaptcha) {
    return Promise.resolve();
  }
  if (recaptchaScriptPromise) {
    return recaptchaScriptPromise;
  }

  const existingScript = document.querySelector<HTMLScriptElement>(
    'script[src^="https://www.google.com/recaptcha/api.js"]',
  );
  recaptchaScriptPromise = new Promise<void>((resolve, reject) => {
    const script = existingScript ?? document.createElement('script');
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Failed to load reCAPTCHA')), { once: true });
    if (!existingScript) {
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '')}`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).then(() => {
    if (!window.grecaptcha) {
      throw new Error('reCAPTCHA did not initialize');
    }
  }).catch((error) => {
    recaptchaScriptPromise = null;
    throw error;
  });

  return recaptchaScriptPromise;
}

// Real 3-step structural fact describing the account flow (team code ->
// verify -> manager activates) — not measured data, same reasoning as
// Settings' static 5 (member-the-line-goal.md).
const SIGNUP_STEPS = [
  { n: 1, label: 'Enter your team code' },
  { n: 2, label: 'Verify your email' },
  { n: 3, label: 'Your manager activates your account' },
];

const TEAM_CODE_ERROR = "That team code isn't right. Ask your manager for the current one.";

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
  const [teamCode, setTeamCode] = useState('');
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
    if (!teamCode.trim()) {
      setError(TEAM_CODE_ERROR);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
      if (siteKey) {
        try {
          await loadRecaptchaScript();
          const token = await new Promise<string>((resolve, reject) => {
            try {
              const grecaptcha = window.grecaptcha;
              if (!grecaptcha) {
                reject(new Error('reCAPTCHA is unavailable'));
                return;
              }
              grecaptcha.ready(() => {
                try {
                  Promise.resolve(grecaptcha.execute(siteKey, { action: 'signup' })).then(resolve).catch(reject);
                } catch (error) {
                  reject(error);
                }
              });
            } catch (error) {
              reject(error);
            }
          });
          const captchaResponse = await fetch('/api/portal/auth/captcha', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          const captchaData = await captchaResponse.json() as { ok?: unknown };
          if (!captchaResponse.ok || captchaData.ok !== true) {
            setError('Verification failed. Please try again — if this keeps happening, ask your manager to set up your account.');
            return;
          }
        } catch {
          setError('Verification failed. Please try again — if this keeps happening, ask your manager to set up your account.');
          return;
        }
      }
      try {
        const codeResponse = await fetch('/api/portal/auth/team-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: teamCode }),
        });
        const codeData = await codeResponse.json() as { ok?: unknown };
        if (!codeResponse.ok || codeData.ok !== true) {
          setError(TEAM_CODE_ERROR);
          return;
        }
      } catch {
        setError(TEAM_CODE_ERROR);
        return;
      }
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
            <p className="member-line-kicker">Employee portal</p>
            <h1>
              <span className="accent">Create your account.</span>
              <span>Takes about a minute.</span>
            </h1>
            <p className="member-line-intro">
              Enter your team code, verify your email, and your manager activates your account.
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
            <p className="member-line-eyebrow">Your details</p>
            <h2>Join with your team code</h2>
            <p>Your manager gave you a team code. Use an email you check regularly.</p>

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
                <label htmlFor="signup-team-code">Team code / required</label>
                <input
                  id="signup-team-code"
                  type="text"
                  value={teamCode}
                  onChange={(e) => setTeamCode(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
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
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>

            <p className="member-line-note" role="note">
              Applied for a job? You don&apos;t need an account yet. We&apos;ll reach out after we review your application.
            </p>

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
                <b>3C</b>
                <span>Team portal</span>
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
