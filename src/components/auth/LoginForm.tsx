'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CircleCheck, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { GoogleAuthProvider, browserLocalPersistence, setPersistence, signInWithPopup } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { friendlyAuthError } from '@/lib/auth/friendlyAuthError';
import s from '@/components/portal/rep/rep.module.css';
import { AuthShell } from './AuthShell';
import a from './auth.module.css';

type FormMode = 'login' | 'forgot';

// Multi-color Google "G", inline so no network/image dependency.
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

export function AuthAlert({ message }: { message: string }) {
  return (
    <div className={a.alert} role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
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

  const spinner = <LoaderCircle size={18} className={a.spin} aria-hidden="true" />;

  return (
    <AuthShell>
      {formMode === 'forgot' ? (
        <>
          <h1 className={a.title}>Reset password</h1>
          <p className={a.sub}>We&apos;ll email you a reset link.</p>

          <form onSubmit={handleForgotPassword} className={a.stack}>
            {resetEmailSent ? (
              <div className={a.ok} role="status">
                <CircleCheck size={18} aria-hidden="true" />
                <p>Reset link sent. Check your inbox.</p>
              </div>
            ) : (
              <>
                {error ? <AuthAlert message={error} /> : null}

                <div className={a.field}>
                  <label htmlFor="reset-email" className={a.label}>
                    Email address
                  </label>
                  <input
                    type="email"
                    id="reset-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={a.input}
                    placeholder="you@3cworldgroup.com"
                    autoComplete="email"
                    inputMode="email"
                    required
                  />
                </div>

                <button type="submit" disabled={loading} className={`${s.btnPrimary} ${a.btn}`}>
                  {loading ? (
                    <>
                      {spinner}
                      Sending
                    </>
                  ) : (
                    'Send reset link'
                  )}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setFormMode('login');
                resetForm();
              }}
              className={a.link}
            >
              Back to sign in
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className={a.title}>Sign in</h1>
          <p className={a.sub}>Use your Google account or company email.</p>

          <div className={a.stack}>
            {error || authError ? <AuthAlert message={error || authError || ''} /> : null}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              className={`${s.btnSecondary} ${a.google}`}
            >
              {googleLoading ? (
                <>
                  {spinner}
                  Signing in
                </>
              ) : (
                <>
                  <GoogleIcon />
                  Continue with Google
                </>
              )}
            </button>

            <div className={a.divider}>or</div>
          </div>

          <form onSubmit={handleSubmit} className={a.stack}>
            <div className={a.field}>
              <label htmlFor="email" className={a.label}>
                Email address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={a.input}
                placeholder="you@3cworldgroup.com"
                autoComplete="email"
                inputMode="email"
                required
              />
            </div>

            <div className={a.field}>
              <div className={a.label}>
                <label htmlFor="password">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setFormMode('forgot');
                    resetForm();
                  }}
                  className={`${a.link} ${a.linkLime}`}
                >
                  Forgot password?
                </button>
              </div>
              <div className={a.passWrap}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={a.input}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className={a.eye}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading || googleLoading} className={`${s.btnPrimary} ${a.btn}`}>
              {loading ? (
                <>
                  {spinner}
                  Signing in
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className={a.linkRow}>
            Have a team code?{' '}
            <Link href="/portal/signup" className={`${a.link} ${a.linkLime}`}>
              Create your account
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
