'use client';

import Link from 'next/link';
import { Clock } from 'lucide-react';
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
    </AuthShell>
  );
}
