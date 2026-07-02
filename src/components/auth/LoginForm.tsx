'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type FormMode = 'login' | 'forgot';

const inputClasses =
  'w-full h-11 rounded-md border border-slate-300 bg-white px-3.5 text-[15px] text-slate-950 placeholder:text-slate-400 outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#8dc63f] focus:ring-2 focus:ring-[#8dc63f]/30 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-400';

export function LoginForm() {
  const { signIn, error: authError, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formMode, setFormMode] = useState<FormMode>('login');
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
    } catch (err: unknown) {
      // Error is already handled in AuthContext
      if (err instanceof Error) {
        // Map Firebase error codes to user-friendly messages
        if (err.message.includes('invalid-credential')) {
          setError('Invalid email or password. Please try again.');
        } else if (err.message.includes('too-many-requests')) {
          setError('Too many failed attempts. Please try again later.');
        } else {
          setError('Failed to sign in. Please check your credentials.');
        }
      }
    } finally {
      setLoading(false);
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
            Use your company email.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {(error || authError) && errorBanner(error || authError || '')}

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
              disabled={loading}
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
