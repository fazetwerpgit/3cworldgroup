'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
  signInWithPopup,
} from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';

type FormMode = 'login' | 'forgot';

const inputClasses =
  'w-full h-11 rounded-md border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 placeholder:text-slate-400 outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#8dc63f] focus:ring-2 focus:ring-[#8dc63f]/30 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-400';

// Multi-color Google "G", inline so no network/image dependency.
function GoogleIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}

// Turn Firebase auth error codes into plain-language, actionable messages.
function friendlyAuthError(err: unknown): string {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  const raw = err instanceof Error ? err.message : '';
  const c = `${code} ${raw}`;
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found'))
    return 'Invalid email or password. Please try again.';
  if (c.includes('invalid-email')) return 'That email address doesn’t look right.';
  if (c.includes('user-disabled')) return 'This account has been disabled. Contact your manager.';
  if (c.includes('too-many-requests')) return 'Too many attempts. Wait a minute, then try again.';
  if (c.includes('network-request-failed')) return 'Network problem. Check your connection and try again.';
  if (c.includes('popup-closed-by-user') || c.includes('cancelled-popup-request')) return 'Sign-in was cancelled.';
  if (c.includes('popup-blocked')) return 'Your browser blocked the sign-in window. Allow pop-ups and try again.';
  if (c.includes('account-exists-with-different-credential'))
    return 'This email already uses a password. Sign in with your email and password below.';
  if (c.includes('not-configured')) return 'Sign-in isn’t configured. Contact your administrator.';
  return 'Something went wrong signing in. Please try again.';
}

export function LoginForm() {
  const { signIn, error: authError, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [formMode, setFormMode] = useState<FormMode>('login');
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Keep reps signed in across reloads and browser restarts.
      if (auth) await setPersistence(auth, browserLocalPersistence);
      await signIn(email, password);
    } catch (err: unknown) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      if (!auth) throw new Error('auth/not-configured');
      await setPersistence(auth, browserLocalPersistence);
      await signInWithPopup(auth, new GoogleAuthProvider());
      // AuthContext's onAuthStateChanged loads the profile and routes on success.
    } catch (err: unknown) {
      setError(friendlyAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await resetPassword(email);
      setResetEmailSent(true);
    } catch {
      setError('Failed to send reset email. Please check your email address.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setError('');
    setResetEmailSent(false);
  };

  const errorBanner = (message: string) => (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
    >
      {message}
    </div>
  );

  const formPanel = (
    <div className="w-full max-w-sm animate-fade-in-up">
      {formMode === 'forgot' ? (
        <>
          <p className="portal-label">Employee portal</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Reset password
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            We&apos;ll email you a reset link.
          </p>

          <form onSubmit={handleForgotPassword} className="mt-8 space-y-5">
            {resetEmailSent ? (
              <div className="rounded-md border border-[#8dc63f]/40 bg-[#8dc63f]/10 px-4 py-3 text-sm text-[#3f6212] dark:text-[#d7ecc0]">
                Reset link sent — check your inbox.
              </div>
            ) : (
              <>
                {error && errorBanner(error)}

                <div>
                  <label htmlFor="reset-email" className="portal-label mb-2 block">
                    Email address
                  </label>
                  <input
                    type="email"
                    id="reset-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClasses}
                    placeholder="you@3cworldgroup.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="portal-motion h-11 w-full rounded-md bg-[#8dc63f] font-semibold text-[#0A1F44] hover:bg-[#7ab82e] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setFormMode('login');
                resetForm();
              }}
              className="w-full text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              Back to sign in
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="portal-label">Employee portal</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Sign in
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Use your Google account or company email.
          </p>

          <div className="mt-8 space-y-5">
            {(error || authError) && errorBanner(error || authError || '')}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              className="portal-motion flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              {googleLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                <>
                  <GoogleIcon />
                  Continue with Google
                </>
              )}
            </button>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">or</span>
              <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-5">
            <div>
              <label htmlFor="email" className="portal-label mb-2 block">
                Email address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClasses}
                placeholder="you@3cworldgroup.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="password" className="portal-label">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setFormMode('forgot');
                    resetForm();
                  }}
                  className="text-xs font-medium text-slate-500 transition-colors hover:text-[#7ab82e] dark:text-slate-400 dark:hover:text-[#9fd44f]"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClasses} pr-11`}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="portal-motion h-11 w-full rounded-md bg-[#8dc63f] font-semibold text-[#0A1F44] hover:bg-[#7ab82e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Signing in…
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Need an account? Contact your manager.
          </p>
        </>
      )}

      <div className="mt-10 text-center lg:text-left">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to main site
        </Link>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-white dark:bg-[#0b1424]">
      {/* Brand deck — full-bleed navy on mobile, left panel with a diagonal
          lime seam on desktop. The seam is two stacked clip-path layers:
          lime underneath, navy inset 5px so a parallel lime edge shows. */}
      <div className="absolute inset-0 lg:w-[56%]">
        <div
          className="absolute inset-0 bg-[#8dc63f] max-lg:hidden"
          style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 110px) 100%, 0 100%)' }}
        />
        <div
          className="absolute inset-0 bg-[#0A1F44] lg:[clip-path:polygon(0_0,calc(100%_-_6px)_0,calc(100%_-_116px)_100%,0_100%)]"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 60% 45% at 18% 92%, rgba(141,198,63,0.14), transparent 70%), linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
            backgroundSize: '100% 100%, 32px 32px, 32px 32px',
          }}
        />
      </div>

      <div className="relative flex min-h-screen flex-col lg:flex-row">
        {/* Left: brand statement */}
        <div className="flex flex-col justify-between px-6 pb-10 pt-8 text-white sm:px-10 lg:min-h-screen lg:w-[56%] lg:px-14 lg:pb-14 lg:pt-12 lg:pr-40">
          <div className="flex items-center gap-3 animate-fade-in">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/15">
              <Image
                src="/logo.png"
                alt="3C World Group"
                width={30}
                height={30}
                priority
                className="h-[30px] w-[30px] object-contain"
              />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-wide">3C World Group</p>
              <p className="text-xs text-white/50">Employee Portal</p>
            </div>
          </div>

          <div className="my-10 max-w-xl lg:my-0">
            <h2 className="portal-display animate-fade-in-up text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              The day starts
              <br />
              <span className="text-[#8dc63f]">here.</span>
            </h2>
            <p className="animate-fade-in-up delay-200 mt-5 max-w-md text-[15px] leading-relaxed text-white/65">
              Your numbers, your team, your next move — all in one place.
            </p>
          </div>

          <div className="animate-fade-in-up delay-300 hidden flex-wrap items-center gap-x-6 gap-y-2 lg:flex">
            {['Live leaderboard', 'Team chat', 'Sales pipeline'].map((item) => (
              <span key={item} className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/50">
                <span className="h-1.5 w-1.5 rounded-full bg-[#8dc63f]" />
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* Right: sign-in */}
        <div className="flex flex-1 items-start justify-center px-6 pb-16 sm:px-10 lg:items-center lg:px-14">
          {/* Mobile: the form floats as a card on the navy deck.
              Desktop: it sits flat on the light panel. */}
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-lg shadow-black/20 dark:border-white/10 dark:bg-[#0e1c33] sm:p-8 lg:max-w-none lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:dark:bg-transparent">
            <div className="flex justify-center lg:block">{formPanel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
