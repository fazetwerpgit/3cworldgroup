'use client';

import { useEffect, useState } from 'react';

// Chrome/Edge/Android fire `beforeinstallprompt`; we stash it and trigger on click.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// "Install app" card for Settings. Shows a one-tap install on supported browsers,
// and iOS instructions (Safari has no install event — users use Share → Add to Home Screen).
export default function InstallAppCard() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [promptFailed, setPromptFailed] = useState(false);

  useEffect(() => {
    // Already running as an installed app?
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    // Post-mount detection keeps the server and first client render identical
    // (hydration-safe), same pattern as the theme/localStorage restores.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstalled(standalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      // userChoice can hang forever on stale prompts — don't let the button
      // die silently; give up after 3s and show the manual path.
      await Promise.race([
        deferred.userChoice,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);
      setDeferred(null);
    } catch {
      setDeferred(null);
      setPromptFailed(true);
    }
  };

  const manualSteps = isIOS ? (
    <p className="member-line-sub">
      On iPhone/iPad: open this site in <strong>Safari</strong>, tap the <strong>Share</strong>{' '}
      button (square with an arrow), then <strong>Add to Home Screen</strong>.
    </p>
  ) : (
    <p className="member-line-sub">
      Manual install: browser menu (⋮) → <strong>Add to Home screen</strong> (or{' '}
      <strong>Install app</strong>). Chrome and Edge also show an install icon in the address bar.
    </p>
  );

  return (
    <div>
      <div className="member-line-toggle-row">
        <div>
          <strong>Install the member app</strong>
          <small>One device, quick access.</small>
        </div>
        {installed ? (
          <span className="member-line-chip lime">Installed</span>
        ) : deferred ? (
          <button type="button" className="member-line-button small" onClick={install}>
            Install app
          </button>
        ) : (
          <span className="member-line-status-text">Available to install</span>
        )}
      </div>
      {!installed && (
        <div style={{ paddingBottom: 13 }}>
          {promptFailed && (
            <p className="member-line-sub" style={{ color: 'var(--member-line-gold)' }}>
              The one-tap install didn&apos;t start — use the manual steps below:
            </p>
          )}
          {manualSteps}
        </div>
      )}
    </div>
  );
}
