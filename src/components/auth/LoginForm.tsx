'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CircleCheck, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import {
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  signInWithCredential,
  signInWithPopup,
} from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { friendlyAuthError } from '@/lib/auth/friendlyAuthError';
import { useIsNativeApp } from '@/lib/app/isNativeApp';
import { warmPopupResolver } from '@/lib/firebase/warmPopupResolver';
import type { NativeSignInProvider } from '@/lib/app/bridge';
import { sendAppleAuthorizationCode } from '@/lib/app/appleAuthorizationCode';
import {
  completePendingLink,
  emailFromAuthError,
  getNativeCredential,
  isAccountExistsError,
  nativeAuthErrorMessage,
  isNativeSignInCanceled,
  isNativeSignInPending,
  peekPendingLink,
  providerLabel,
  rememberPendingDisplayName,
  rememberPendingLink,
} from '@/lib/app/nativeAuth';
import { useSignupInvite } from '@/lib/onboarding/rememberedInvite';
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

// Apple logo for the in-app "Continue with Apple" button (Apple HIG: monochrome).
function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.86-.76-1.47.02-2.83.86-3.59 2.17-1.53 2.65-.39 6.58 1.1 8.73.73 1.05 1.6 2.23 2.73 2.19 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.28-.88-2.3-3.48zM14.2 6.13c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.64-1.05 1.67-.92 2.66.97.08 1.96-.49 2.56-1.21z" />
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
  // `authLoading` stays true after a good password while the profile loads;
  // the portal page keeps this form mounted through it.
  const { signIn, error: authError, resetPassword, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [formMode, setFormMode] = useState<FormMode>('login');
  const [resetEmailSent, setResetEmailSent] = useState(false);
  // An invite opened on this device: still open -> back to the packet; sent ->
  // the hire already has an account and just signs in.
  const invite = useSignupInvite();
  // Inside the iOS app the Google popup cannot run: native Google + Apple
  // buttons replace it. On the web this stays false and nothing changes.
  const inApp = useIsNativeApp();
  const [nativeLoading, setNativeLoading] = useState<NativeSignInProvider | null>(null);
  // Set when a native sign-in hit an account that uses another method: the
  // person signs in with that method and the native one is linked to it.
  const [linkPrompt, setLinkPrompt] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState('');

  // Web only: get Google's popup iframe loading now, so the button's popup
  // opens inside the tap on iPhone/Safari (see warmPopupResolver).
  useEffect(() => {
    if (!inApp) warmPopupResolver();
  }, [inApp]);

  // After any successful sign-in in the app, attach a held native credential.
  const finishPendingLink = async () => {
    if (!inApp || !peekPendingLink() || !auth?.currentUser) return;
    const outcome = await completePendingLink(auth.currentUser);
    setLinkPrompt(null);
    if (outcome.status === 'linked') setLinkNotice(`${providerLabel(outcome.provider)} is now linked to your account.`);
    else if (outcome.status === 'failed') setLinkNotice(outcome.message);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // No setPersistence here or on the other sign-ins: Auth already keeps the
      // session in IndexedDB (firebase/config.ts), which survives reloads,
      // restarts and app kills. Switching to localStorage moved the fresh
      // session into WKWebView's lazily flushed localStorage, so leaving the
      // iOS app soon after signing in could lose it (back to the login form).
      await signIn(email, password);
      await finishPendingLink();
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
      // The resolver is passed here only: auth itself is created without one
      // so cold opens skip Google's iframe (see firebase/config.ts).
      await signInWithPopup(auth, new GoogleAuthProvider(), browserPopupRedirectResolver);
      // AuthContext's onAuthStateChanged loads the profile and routes on success.
    } catch (err: unknown) {
      setError(friendlyAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  // In-app only: the shell runs the native sheet, the web signs in with the
  // returned credential. AuthContext then loads the profile (or creates the
  // pending users doc on a first sign-in) exactly as for the web popup.
  const handleNativeSignIn = async (provider: NativeSignInProvider) => {
    // A second tap while the sheet is open does nothing.
    if (isNativeSignInPending()) return;
    setError('');
    setLinkNotice('');
    setNativeLoading(provider);
    try {
      if (!auth) throw new Error('auth/not-configured');
      const native = await getNativeCredential(provider);
      rememberPendingDisplayName(native.displayName);
      try {
        const signedIn = await signInWithCredential(auth, native.credential);
        if (provider === 'apple') void sendAppleAuthorizationCode(signedIn.user, native.appleAuthorizationCode);
      } catch (err) {
        if (!isAccountExistsError(err)) throw err;
        rememberPendingLink({
          provider,
          credential: native.credential,
          email: emailFromAuthError(err),
          appleAuthorizationCode: native.appleAuthorizationCode,
        });
        rememberPendingDisplayName(undefined);
        const who = emailFromAuthError(err);
        setLinkPrompt(
          `${who ? `${who} already has` : 'This email already has'} a portal account. Sign in with your existing method to link ${providerLabel(provider)}.`
        );
        return;
      }
      await finishPendingLink();
    } catch (err: unknown) {
      rememberPendingDisplayName(undefined);
      // A cancel (the person closed the sheet) needs no message.
      if (!isNativeSignInCanceled(err)) setError(nativeAuthErrorMessage(err, provider));
    } finally {
      setNativeLoading(null);
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
      setError("Couldn't send the reset email. Check your email address.");
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
          <p className={a.sub}>
            {inApp ? 'Use Google, Apple or your company email.' : 'Use your Google account or company email.'}
          </p>

          <div className={a.stack}>
            {error || authError ? <AuthAlert message={error || authError || ''} /> : null}
            {invite?.state === 'submitted' ? (
              <div className={a.ok} role="status">
                <CircleCheck size={18} aria-hidden="true" />
                <p>Your onboarding is in. Sign in with the email and password you set during onboarding.</p>
              </div>
            ) : null}

            {linkPrompt ? (
              <div className={a.ok} role="status">
                <CircleCheck size={18} aria-hidden="true" />
                <p>{linkPrompt}</p>
              </div>
            ) : null}
            {linkNotice ? (
              <div className={a.ok} role="status">
                <CircleCheck size={18} aria-hidden="true" />
                <p>{linkNotice}</p>
              </div>
            ) : null}

            {inApp ? (
              <>
                {(['google', 'apple'] as const).map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => handleNativeSignIn(provider)}
                    disabled={nativeLoading !== null || loading}
                    className={`${s.btnSecondary} ${a.google}${provider === 'apple' ? ` ${a.apple}` : ''}`}
                  >
                    {nativeLoading === provider ? (
                      <>
                        {spinner}
                        Signing in
                      </>
                    ) : (
                      <>
                        {provider === 'google' ? <GoogleIcon /> : <AppleIcon />}
                        Continue with {provider === 'google' ? 'Google' : 'Apple'}
                      </>
                    )}
                  </button>
                ))}
              </>
            ) : (
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
            )}

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
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
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

            <button type="submit" disabled={loading || authLoading || googleLoading || nativeLoading !== null} className={`${s.btnPrimary} ${a.btn}`}>
              {loading || authLoading ? (
                <>
                  {spinner}
                  Signing in
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {invite?.state === 'open' ? (
            <p className={a.linkRow}>
              Got an invite from 3C?{' '}
              <Link href={`/onboard/${invite.token}`} className={`${a.link} ${a.linkLime}`}>
                Finish your onboarding
              </Link>
            </p>
          ) : null}
          {invite?.state !== 'submitted' ? (
            <p className={a.linkRow}>
              Have a team code?{' '}
              <Link href="/portal/signup" className={`${a.link} ${a.linkLime}`}>
                Create your account
              </Link>
            </p>
          ) : null}
        </>
      )}
    </AuthShell>
  );
}
