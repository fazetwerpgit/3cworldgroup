'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import {
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  linkWithCredential,
  linkWithPopup,
  unlink,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { friendlyAuthError } from '@/lib/auth/friendlyAuthError';
import { useIsNativeApp } from '@/lib/app/isNativeApp';
import { warmPopupResolver } from '@/lib/firebase/warmPopupResolver';
import { sendAppleAuthorizationCode } from '@/lib/app/appleAuthorizationCode';
import {
  APPLE_PROVIDER_ID,
  GOOGLE_PROVIDER_ID,
  PASSWORD_PROVIDER_ID,
  getNativeCredential,
  linkedMethodRows,
  nativeAuthErrorMessage,
  isNativeSignInCanceled,
  isNativeSignInPending,
  passwordCredential,
  type SignInMethodId,
} from '@/lib/app/nativeAuth';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import st from '@/components/portal/rep/rep-settings.module.css';

function providerIdsOf(user: FirebaseUser | null | undefined): string[] {
  return user?.providerData.map((info) => info.providerId) ?? [];
}

function passwordLinkError(err: unknown): string {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  if (code === 'auth/weak-password') return 'Too weak. Pick a longer password.';
  if (code === 'auth/requires-recent-login') return 'For your security, sign out and back in, then try again.';
  if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use')
    return 'Another portal account already uses this email with a password.';
  if (code === 'auth/provider-already-linked') return 'A password is already set.';
  return friendlyAuthError(err);
}

// "Linked sign-in methods" (SPEC A2): one account, several ways in. Linking
// Apple needs the native sheet, so it is offered only in the 3C iOS app.
export default function LinkedSignInMethods() {
  const inApp = useIsNativeApp();
  const [providers, setProviders] = useState<string[]>([]);
  const [busy, setBusy] = useState<SignInMethodId | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    setProviders(providerIdsOf(auth?.currentUser));
  }, []);

  // Web only: the Google link popup must open inside the tap (see warmPopupResolver).
  useEffect(() => {
    if (!inApp) warmPopupResolver();
  }, [inApp]);

  const refresh = async (user: FirebaseUser) => {
    try {
      await user.reload();
    } catch {
      // The list below falls back to what the SDK already has.
    }
    setProviders(providerIdsOf(auth?.currentUser ?? user));
  };

  const link = async (id: SignInMethodId) => {
    const user = auth?.currentUser;
    if (!user) return;
    if (id === PASSWORD_PROVIDER_ID) {
      setPasswordOpen(true);
      return;
    }
    if (inApp && isNativeSignInPending()) return;
    setBusy(id);
    setMessage(null);
    const provider = id === APPLE_PROVIDER_ID ? 'apple' : 'google';
    try {
      if (inApp) {
        const native = await getNativeCredential(provider);
        await linkWithCredential(user, native.credential);
        if (provider === 'apple') void sendAppleAuthorizationCode(user, native.appleAuthorizationCode);
      } else if (id === GOOGLE_PROVIDER_ID) {
        await linkWithPopup(user, new GoogleAuthProvider(), browserPopupRedirectResolver);
      }
      await refresh(user);
      setMessage({ ok: true, text: `${provider === 'apple' ? 'Apple' : 'Google'} is linked.` });
    } catch (err) {
      if (!isNativeSignInCanceled(err)) setMessage({ ok: false, text: nativeAuthErrorMessage(err, provider) });
    } finally {
      setBusy(null);
    }
  };

  const linkPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth?.currentUser;
    if (!user?.email) {
      setMessage({ ok: false, text: 'This account has no email address to use with a password.' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ ok: false, text: 'Use at least 6 characters.' });
      return;
    }
    setBusy(PASSWORD_PROVIDER_ID);
    setMessage(null);
    try {
      await linkWithCredential(user, passwordCredential(user.email, newPassword));
      await refresh(user);
      setPasswordOpen(false);
      setNewPassword('');
      setMessage({ ok: true, text: `You can now sign in with ${user.email} and this password.` });
    } catch (err) {
      setMessage({ ok: false, text: passwordLinkError(err) });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: SignInMethodId, label: string) => {
    const user = auth?.currentUser;
    if (!user) return;
    setBusy(id);
    setMessage(null);
    try {
      await unlink(user, id);
      await refresh(user);
      setMessage({ ok: true, text: `${label} is no longer linked.` });
    } catch {
      setMessage({ ok: false, text: `Couldn't remove ${label}. Try again.` });
    } finally {
      setBusy(null);
    }
  };

  const rows = linkedMethodRows(providers, inApp);
  if (!auth?.currentUser) return null;

  return (
    <section className={s.panel} aria-labelledby="signin-methods-title">
      <div className={s.panelHead}>
        <h2 id="signin-methods-title" className={st.panelTitle}>
          Linked sign-in methods
        </h2>
      </div>
      {rows.map((row) => (
        <div className={st.setting} key={row.id}>
          <div className={st.settingText}>
            <span className={st.settingTitle}>{row.label}</span>
            <span className={st.settingSub}>{row.linked ? 'You can sign in with this.' : 'Not linked.'}</span>
          </div>
          {row.linked ? (
            row.canUnlink ? (
              <button
                type="button"
                className={`${s.btnSecondary} ${st.settingBtn}`}
                onClick={() => remove(row.id, row.label)}
                disabled={busy !== null}
              >
                {busy === row.id ? 'Removing…' : 'Unlink'}
              </button>
            ) : (
              <span className={st.on}>
                <Check size={16} aria-hidden="true" /> Linked
              </span>
            )
          ) : row.canLink ? (
            <button
              type="button"
              className={`${s.btnSecondary} ${st.settingBtn}`}
              onClick={() => link(row.id)}
              disabled={busy !== null}
            >
              {busy === row.id ? 'Linking…' : 'Link'}
            </button>
          ) : null}
          {row.id === PASSWORD_PROVIDER_ID && passwordOpen && !row.linked ? (
            <form onSubmit={linkPassword} className={`${st.stack} ${st.settingWide}`}>
              <label className={p.field}>
                <span className={p.label}>New password</span>
                <input
                  className={p.input}
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </label>
              <div className={st.actions}>
                <button
                  type="button"
                  className={s.btnSecondary}
                  onClick={() => {
                    setPasswordOpen(false);
                    setNewPassword('');
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className={s.btnPrimary} disabled={busy !== null}>
                  {busy === PASSWORD_PROVIDER_ID ? 'Saving…' : 'Set password'}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ))}
      {message ? (
        <div className={st.drawer}>
          <div className={`${p.notice} ${message.ok ? p.noticeLime : p.noticeRed}`} role={message.ok ? 'status' : 'alert'}>
            <span>{message.text}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
