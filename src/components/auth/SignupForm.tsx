'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { validateSignup, passwordStrength, PASSWORD_STRENGTH_LABEL } from '@/lib/auth/signupValidation';
import { friendlyAuthError } from '@/lib/auth/friendlyAuthError';
import { looksLikeBotSignup } from '@/lib/auth/botDetection';
import s from '@/components/portal/rep/rep.module.css';
import { AuthShell } from './AuthShell';
import a from './auth.module.css';

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
  })
    .then(() => {
      if (!window.grecaptcha) {
        throw new Error('reCAPTCHA did not initialize');
      }
    })
    .catch((error) => {
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
const ACCOUNT_EXISTS_ERROR =
  'You already have a portal account. Sign in instead, or reset your password from the login page.';

function SignupSteps({ className }: { className?: string }) {
  return (
    <ol className={`${a.steps} ${className ?? ''}`} aria-label="How sign-up works">
      {SIGNUP_STEPS.map((step) => (
        <li key={step.n}>
          <b>{step.n}</b>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

function SignupStatement() {
  return (
    <>
      <h2 className={a.display}>
        Create your <em>account.</em>
      </h2>
      <p className={a.statementLede}>Takes about a minute. Here is how it works.</p>
      <SignupSteps className={s.deskOnly} />
    </>
  );
}

// Sign-up, direction D: same shell as sign in. The team code is checked on the
// server before the account is created.
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
  const [accountExists, setAccountExists] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountExists(false);
    const check = validateSignup(email, password, displayName, confirmPassword);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    if (looksLikeBotSignup(email, displayName)) {
      setError(
        "This doesn't look like a real name and email. Use your everyday email address, or ask your manager to set up your account.",
      );
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
                  Promise.resolve(grecaptcha.execute(siteKey, { action: 'signup' }))
                    .then(resolve)
                    .catch(reject);
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
          const captchaData = (await captchaResponse.json()) as { ok?: unknown };
          if (!captchaResponse.ok || captchaData.ok !== true) {
            setError(
              'Verification failed. Please try again — if this keeps happening, ask your manager to set up your account.',
            );
            return;
          }
        } catch {
          setError(
            'Verification failed. Please try again — if this keeps happening, ask your manager to set up your account.',
          );
          return;
        }
      }
      try {
        const codeResponse = await fetch('/api/portal/auth/team-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: teamCode }),
        });
        const codeData = (await codeResponse.json()) as { ok?: unknown };
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
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
      const isExistingAccount =
        code === 'account_exists' || code === 'auth/email-already-in-use' || code === 'auth/email-already-exists';
      setAccountExists(isExistingAccount);
      setError(isExistingAccount ? ACCOUNT_EXISTS_ERROR : friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell statement={<SignupStatement />}>
      <p className={a.kicker}>Employee portal</p>
      <h1 className={a.title}>Join your team</h1>
      <p className={a.sub}>Your manager gave you a team code. Use an email you check regularly.</p>

      <form onSubmit={handleSubmit} className={a.stack}>
        {error ? (
          <div className={a.alert} role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <p>
              {error}
              {accountExists ? (
                <>
                  {' '}
                  <Link href="/portal">Go to sign in</Link>
                </>
              ) : null}
            </p>
          </div>
        ) : null}

        <div className={a.field}>
          <label htmlFor="signup-name" className={a.label}>
            Full name
          </label>
          <input
            id="signup-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={a.input}
            autoComplete="name"
            autoCapitalize="words"
            required
          />
        </div>

        <div className={a.field}>
          <label htmlFor="signup-email" className={a.label}>
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={a.input}
            autoComplete="email"
            inputMode="email"
            required
          />
        </div>

        <div className={a.field}>
          <label htmlFor="signup-team-code" className={a.label}>
            Team code
          </label>
          <input
            id="signup-team-code"
            type="text"
            value={teamCode}
            onChange={(e) => setTeamCode(e.target.value)}
            className={a.input}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>

        <div className={a.field}>
          <label htmlFor="signup-password" className={a.label}>
            Password
          </label>
          <div className={a.passWrap}>
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={a.input}
              autoComplete="new-password"
              minLength={6}
              aria-describedby="signup-strength"
              required
            />
            <button
              type="button"
              className={a.eye}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div className={a.strength}>
            <div className={a.strengthBar} data-level={password ? strength : undefined} aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <p id="signup-strength" className={a.strengthLabel}>
              {password ? PASSWORD_STRENGTH_LABEL[strength] : 'Use 6 or more characters'}
            </p>
          </div>
        </div>

        <div className={a.field}>
          <label htmlFor="signup-confirm" className={a.label}>
            Confirm password
          </label>
          <input
            id="signup-confirm"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={a.input}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>

        <button type="submit" className={`${s.btnPrimary} ${a.btn}`} disabled={loading}>
          {loading ? (
            <>
              <LoaderCircle size={18} className={a.spin} aria-hidden="true" />
              Creating account
            </>
          ) : (
            'Create account'
          )}
        </button>
      </form>

      <p className={a.linkRow}>
        Already have an account?{' '}
        <Link href="/portal" className={`${a.link} ${a.linkLime}`}>
          Sign in
        </Link>
      </p>

      <SignupSteps className={s.phoneOnly} />

      <p className={a.note} role="note">
        Applied for a job? You don&apos;t need an account yet. We&apos;ll reach out after we review your application.
      </p>
    </AuthShell>
  );
}
