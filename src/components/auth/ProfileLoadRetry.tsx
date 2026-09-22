'use client';

import { useState } from 'react';
import { WifiOff } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';

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
      <div className="w-full max-w-sm animate-fade-in-up">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-[#8dc63f]/15 text-[#5a8f1f] dark:text-[#9fd44f]">
          <WifiOff className="h-5 w-5" />
        </span>
        <p className="portal-label mt-5">Employee portal</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
          Couldn&rsquo;t load your profile
        </h1>
        <p role="alert" className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {message}
        </p>

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="portal-motion inline-flex h-11 w-full items-center justify-center rounded-md bg-[#8dc63f] font-semibold text-[#0A1F44] hover:bg-[#7ab82e] disabled:opacity-60"
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
          <button
            type="button"
            onClick={() => void onSignOut().catch(() => {})}
            disabled={retrying}
            className="inline-flex h-11 w-full items-center justify-center rounded-md text-sm text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-60 dark:text-slate-400 dark:hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    </AuthShell>
  );
}
