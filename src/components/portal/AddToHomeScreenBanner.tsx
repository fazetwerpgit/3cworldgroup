'use client';

import { useEffect, useState } from 'react';
import { Share, X } from 'lucide-react';
import { shouldShowAddToHomeScreen } from '@/lib/pwa/addToHomeScreen';

const DISMISSED_KEY = 'a2hs-dismissed';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    // Storage unavailable (private mode, blocked site data). Treat as
    // dismissed so we never render without a way to remember the choice.
    return true;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Ignore; the banner is hidden for this page view regardless.
  }
}

/**
 * One-time nudge for iPhone Safari users to install the portal to their home
 * screen. Rendering is decided on the client after mount so SSR never sees
 * navigator/localStorage. Never shows inside the installed app.
 */
export default function AddToHomeScreenBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    setVisible(
      shouldShowAddToHomeScreen({
        userAgent: nav.userAgent ?? '',
        standalone: nav.standalone === true,
        dismissed: readDismissed(),
      }),
    );
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    writeDismissed();
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Add 3C Console to your home screen"
      className="mb-4 flex items-start gap-3 rounded-lg border border-[#0A1F44]/[.14] bg-white px-4 py-3 text-[#0A1F44] shadow-sm dark:border-white/[.12] dark:bg-white/[.04] dark:text-[#f4f7fa]"
    >
      <Share className="mt-0.5 size-5 shrink-0 text-[#5a8f1f] dark:text-[#9fd44f]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Add 3C Console to your home screen</p>
        <p className="mt-0.5 text-sm text-[#0A1F44]/75 dark:text-[#f4f7fa]/75">
          Tap the Share button, then Add to Home Screen. You&apos;ll get an app icon that opens straight to the portal.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-2 rounded-md bg-[#0A1F44] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#153c74] dark:bg-[#9fd44f] dark:text-[#0A1F44] dark:hover:bg-[#b5e06a]"
        >
          Got it
        </button>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 text-[#0A1F44]/60 hover:text-[#0A1F44] dark:text-[#f4f7fa]/60 dark:hover:text-[#f4f7fa]"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
