'use client';

import { Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import s from '@/components/portal/rep/rep.module.css';
import { AuthShell } from '@/components/auth/AuthShell';
import a from '@/components/auth/auth.module.css';

export function PendingApproval() {
  const { clearPendingApproval } = useAuth();
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

      <div className={a.actions}>
        <button type="button" onClick={clearPendingApproval} className={`${s.btnPrimary} ${a.btn}`}>
          Back to sign in
        </button>
      </div>
    </AuthShell>
  );
}
