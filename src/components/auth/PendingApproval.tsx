'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CircleCheck, Clock } from 'lucide-react';
import { pendingIdTokenForDelete, clearPendingIdToken } from '@/lib/auth/pendingSession';
import { AuthAlert } from '@/components/auth/LoginForm';
import { useAuth } from '@/contexts/AuthContext';
import { useSignupInvite } from '@/lib/onboarding/rememberedInvite';
import s from '@/components/portal/rep/rep.module.css';
import { AuthShell } from '@/components/auth/AuthShell';
import a from '@/components/auth/auth.module.css';

export function PendingApproval() {
  const { clearPendingApproval } = useAuth();
  // A hire whose invite is still open on this device (e.g. they tried
  // Continue with Google first) finishes through the packet, not an approval.
  const invite = useSignupInvite();
  // "Delete my request" (App Store 5.1.1(v)): a two-step confirm, then the
  // same self-delete route as Settings, with the token AuthContext parked.
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const deleteRequest = async () => {
    const token = pendingIdTokenForDelete();
    if (!token) {
      setDeleteError('For your security, sign in again, then choose Delete my request.');
      setConfirming(false);
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch('/api/portal/auth/me', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setDeleteError(
          res.status === 401
            ? 'For your security, sign in again, then choose Delete my request.'
            : body?.error || "Couldn't delete your request. Try again."
        );
        return;
      }
      clearPendingIdToken();
      setDeleted(true);
    } catch {
      setDeleteError('No signal. Check your connection and try again.');
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (deleted) {
    return (
      <AuthShell>
        <h1 className={a.title}>Request deleted</h1>
        <div className={a.ok} role="status">
          <CircleCheck size={18} aria-hidden="true" />
          <p>Your sign-up request and account are deleted.</p>
        </div>
        <div className={a.actions}>
          <button type="button" onClick={clearPendingApproval} className={`${s.btnPrimary} ${a.btn}`}>
            Back to sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <span className={a.statusIcon} aria-hidden="true">
        <Clock size={22} />
      </span>
      <h1 className={a.title}>Account pending approval</h1>
      <p className={a.sub}>
        Your account is waiting for admin approval. If you signed up with email and password, check your inbox and spam
        folder for a verification email. You can sign in once it&apos;s approved. No need to sign up again.
      </p>
      {invite?.state === 'open' ? (
        <p className={a.sub}>You have an invite from 3C. Your onboarding packet is still open, so finish it first.</p>
      ) : null}

      <div className={a.actions}>
        {invite?.state === 'open' ? (
          <Link href={`/onboard/${invite.token}`} className={`${s.btnPrimary} ${a.btn}`}>
            Finish your onboarding
          </Link>
        ) : null}
        <button
          type="button"
          onClick={clearPendingApproval}
          className={`${invite?.state === 'open' ? s.btnSecondary : s.btnPrimary} ${a.btn}`}
        >
          Back to sign in
        </button>
      </div>

      {deleteError ? <AuthAlert message={deleteError} /> : null}
      <div className={a.actions}>
        {confirming ? (
          <>
            <p className={a.sub}>This deletes your sign-up request and your account. It can&apos;t be undone.</p>
            <button
              type="button"
              onClick={deleteRequest}
              disabled={deleting}
              className={`${s.btnPrimary} ${a.btn}`}
            >
              {deleting ? 'Deleting…' : 'Yes, delete my request'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className={`${s.btnSecondary} ${a.btn}`}
            >
              Keep my request
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={a.link}>
            Delete my request
          </button>
        )}
      </div>
    </AuthShell>
  );
}
