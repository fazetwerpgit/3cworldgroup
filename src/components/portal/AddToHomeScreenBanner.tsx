'use client';

import { useEffect, useState } from 'react';
import { Share } from 'lucide-react';
import { shouldShowAddToHomeScreen } from '@/lib/pwa/addToHomeScreen';
import '@/styles/sweep-rep-b.css';

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
export default function AddToHomeScreenBanner({ pushPromptVisible }: { pushPromptVisible: boolean | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(
      shouldShowAddToHomeScreen({
        userAgent: nav.userAgent ?? '',
        standalone: nav.standalone === true,
        dismissed: readDismissed(),
      }),
    );
  }, []);

  if (!visible || pushPromptVisible !== false) return null;

  const dismiss = () => {
    writeDismissed();
    setVisible(false);
  };

  return (
    <div role="region" aria-label="Add this portal to your home screen" className="portal-add-home-prompt">
      <Share className="size-5 shrink-0 text-[#5a8f1f] dark:text-[#9fd44f]" aria-hidden="true" />
      <p className="portal-add-home-prompt-copy">Add this portal to your home screen from Safari&apos;s Share menu.</p>
      <button type="button" onClick={dismiss} className="portal-add-home-prompt-dismiss">
        Dismiss
      </button>
    </div>
  );
}
