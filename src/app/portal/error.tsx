'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import s from '@/components/portal/rep/rep.module.css';
import { AuthShell } from '@/components/auth/AuthShell';
import a from '@/components/auth/auth.module.css';

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Portal error:', error);
  }, [error]);

  return (
    <AuthShell>
      <span className={`${a.statusIcon} ${a.statusIconWarn}`} aria-hidden="true">
        <AlertTriangle size={22} />
      </span>
      <h1 className={a.title}>Something went wrong</h1>
      <p className={a.sub}>This page didn&apos;t load. Try again, or head back to your dashboard.</p>

      <div className={a.actions}>
        <button type="button" onClick={() => reset()} className={`${s.btnPrimary} ${a.btn}`}>
          Try again
        </button>
        {/* Full navigation on purpose: a hard load clears whatever state broke. */}
        <a href="/portal/dashboard" className={`${s.btnSecondary} ${a.btn}`}>
          Go to dashboard
        </a>
      </div>
    </AuthShell>
  );
}
