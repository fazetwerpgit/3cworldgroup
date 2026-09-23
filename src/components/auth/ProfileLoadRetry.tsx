'use client';

import { useState } from 'react';
import { LoaderCircle, WifiOff } from 'lucide-react';
import s from '@/components/portal/rep/rep.module.css';
import { AuthShell } from '@/components/auth/AuthShell';
import a from '@/components/auth/auth.module.css';

// Shown by AuthProvider when the rep is signed in but their profile could not be
// read after automatic retries (usually weak signal). Takes callbacks instead of
// calling useAuth() so AuthContext can render it without a circular import.
export function ProfileLoadRetry({
  message,
  onRetry,
  onSignOut,
}: {
  message: string;
  onRetry: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <AuthShell>
      <span className={`${a.statusIcon} ${a.statusIconWarn}`} aria-hidden="true">
        <WifiOff size={22} />
      </span>
      <h1 className={a.title}>Couldn&rsquo;t load your profile</h1>
      <p role="alert" className={a.sub}>
        {message}
      </p>

      <div className={a.actions}>
        <button type="button" onClick={handleRetry} disabled={retrying} className={`${s.btnPrimary} ${a.btn}`}>
          {retrying ? (
            <>
              <LoaderCircle size={18} className={a.spin} aria-hidden="true" />
              Retrying
            </>
          ) : (
            'Retry'
          )}
        </button>
        <button
          type="button"
          onClick={() => void onSignOut().catch(() => {})}
          disabled={retrying}
          className={`${s.btnSecondary} ${a.btn}`}
        >
          Sign out
        </button>
      </div>
    </AuthShell>
  );
}
