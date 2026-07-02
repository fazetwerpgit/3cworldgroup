'use client';

import { useEffect, useState } from 'react';
import { Download, Check, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
      await deferred.userChoice;
      setDeferred(null);
    } catch {
      // The stashed prompt can go stale (already used, or the browser revoked
      // it). Fall back to manual instructions instead of a dead button.
      setDeferred(null);
      setPromptFailed(true);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-border dark:bg-card">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[#0A1F44] dark:border-border dark:bg-muted dark:text-foreground">
          <Smartphone className="size-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-[#0A1F44] dark:text-foreground">Install the App</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">
            Add 3C Console to your phone&apos;s home screen for a full-screen, app-like experience.
          </p>

          <div className="mt-4">
            {installed ? (
              <div className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                <Check className="size-4" />
                Installed — you&apos;re running the app.
              </div>
            ) : deferred ? (
              <Button type="button" onClick={install} className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
                <Download className="size-4" />
                Install app
              </Button>
            ) : isIOS ? (
              <p className="text-sm text-slate-600 dark:text-muted-foreground">
                On iPhone/iPad: tap the <span className="font-medium">Share</span> button in
                Safari, then <span className="font-medium">Add to Home Screen</span>. (Chrome on
                iPhone: tap Share in the address bar, then Add to Home Screen.)
              </p>
            ) : (
              <p className="text-sm text-slate-500 dark:text-muted-foreground">
                {promptFailed
                  ? 'The one-tap install didn’t start — use your browser’s menu (⋮) → '
                  : 'Use your browser’s menu (⋮) → '}
                <span className="font-medium text-slate-700 dark:text-foreground">
                  Add to Home screen
                </span>{' '}
                (or <span className="font-medium text-slate-700 dark:text-foreground">Install app</span>) —
                Chrome and Edge also show an install icon in the address bar.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
