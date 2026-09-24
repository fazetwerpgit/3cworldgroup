'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, CircleCheck, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { validateSignup, passwordStrength, PASSWORD_STRENGTH_LABEL } from '@/lib/auth/signupValidation';
import { friendlyAuthError } from '@/lib/auth/friendlyAuthError';
import { looksLikeBotSignup } from '@/lib/auth/botDetection';
import { useSignupInvite } from '@/lib/onboarding/rememberedInvite';
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

// Real 3-step structural fact describing the account flow (team code or 3C
// invite -> verify -> manager activates) — not measured data, same reasoning
// as Settings' static 5 (member-the-line-goal.md).
const SIGNUP_STEPS = [
  { n: 1, label: 'Enter your team code' },
  { n: 2, label: 'Verify your email' },
  { n: 3, label: 'Your manager activates your account' },
];

const TEAM_CODE_ERROR = "That team code isn't right. Ask your manager for the current one.";
const INVITE_ERROR = 'Your invite from 3C is no longer open. Ask your manager for a new invite or the team code.';
const ACCOUNT_EXISTS_ERROR =
  'You already have a portal account. Sign in instead, or reset your password from the login page.';

function SignupSteps({ invited }: { invited: boolean }) {
  return (
    <ol className={a.steps} aria-label="How sign-up works">
      {SIGNUP_STEPS.map((step) => (
        <li key={step.n}>
          <b>{step.n}</b>
          <span>{invited && step.n === 1 ? 'Use your invite from 3C' : step.label}</span>
        </li>
      ))}
    </ol>
  );
}

// Sign-up, direction D: same shell as sign in. The team code — or, for a hire
// 3C invited, their invite — is checked on the server before the account is
// created. An invited hire is pointed back to their onboarding packet first.
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
  // `?invite=<token>` or an invite opened on this device, confirmed by the server.
  const invite = useSignupInvite({ fromUrl: true });
  const invited = invite?.state === 'open';

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
    if (!invited && !teamCode.trim()) {
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
      const gateError = invited ? INVITE_ERROR : TEAM_CODE_ERROR;
      try {
        const codeResponse = await fetch('/api/portal/auth/team-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invited ? { inviteToken: invite.token } : { code: teamCode }),
        });
        const codeData = (await codeResponse.json()) as { ok?: unknown; state?: unknown };
        if (!codeResponse.ok || codeData.ok !== true || (invited && codeData.state !== 'open')) {
          setError(gateError);
          return;
        }
      } catch {
        setError(gateError);
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
    <AuthShell>
      <h1 className={a.title}>Join your team</h1>
      <p className={a.sub}>
        {invited
          ? 'You have an invite from 3C. Your onboarding packet sets up your account.'
          : 'Your manager gave you a team code. Use an email you check regularly.'}
      </p>

      {invited ? (
        <div className={a.stack}>
          <Link href={`/onboard/${invite.token}`} className={`${s.btnPrimary} ${a.btn}`}>
            Continue your onboarding
          </Link>
          <div className={a.divider}>or</div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className={a.stack}>
        {invite?.state === 'submitted' ? (
          <div className={a.ok} role="status">
            <CircleCheck size={18} aria-hidden="true" />
            <p>
              You already set up your account during onboarding.{' '}
              <Link href="/portal">Sign in with the password you set there</Link>
            </p>
          </div>
        ) : null}
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

        {invited ? (
          <p className={a.hint}>Invited by 3C — no team code needed.</p>
        ) : (
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
        )}

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

      <SignupSteps invited={invited} />

      <p className={a.note} role="note">
        Applied for a job? You don&apos;t need an account yet. We&apos;ll reach out after we review your application.
      </p>
    </AuthShell>
  );
}
