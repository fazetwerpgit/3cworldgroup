'use client';

import { useEffect, useState } from 'react';
import { Share } from 'lucide-react';
import { isIosSafari } from '@/lib/pwa/addToHomeScreen';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import st from '@/components/portal/rep/rep-settings.module.css';

// Chrome/Edge/Android fire `beforeinstallprompt`; we stash it and trigger on click.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// "Install app" card for Settings. One-tap install where the browser supports it,
// numbered Share steps on iPhone Safari (no install event there), and nothing at
// all once the portal is running as an installed app.
export default function InstallAppCard() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [iosSafari, setIosSafari] = useState(false);
  const [checked, setChecked] = useState(false);
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

    const ua = window.navigator.userAgent;
    setIsIOS(/iPhone|iPad|iPod/.test(ua));
    setIosSafari(isIosSafari(ua));
    setChecked(true);

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
    iosSafari ? (
      <ol className={`${st.steps} ${st.settingWide}`}>
        <li>
          <span>
            Tap <strong>Share</strong> <Share size={16} aria-label="the Share icon" /> at the bottom of Safari
          </span>
        </li>
        <li>
          <span>
            Tap <strong>Add to Home Screen</strong>
          </span>
        </li>
        <li>
          <span>
            Tap <strong>Add</strong>
          </span>
        </li>
      </ol>
    ) : (
      <p className={`${p.hint} ${st.settingWide}`}>
        Open this page in <strong>Safari</strong> to add it to your home screen.
      </p>
    )
  ) : (
    <p className={`${p.hint} ${st.settingWide}`}>
      Or use the browser menu, then <strong>Add to Home screen</strong> (or <strong>Install app</strong>). Chrome
      and Edge also show an install icon in the address bar.
    </p>
  );

  // Before the client check runs, and once the app is installed, there is
  // nothing to show.
  if (!checked || installed) return null;

  return (
    <div className={st.setting}>
      <div className={st.settingText}>
        <span className={st.settingTitle}>Install the app</span>
        <span className={st.settingSub}>Opens full screen from your home screen.</span>
      </div>
      {deferred ? (
        <button type="button" className={`${s.btnSecondary} ${st.settingBtn}`} onClick={install}>
          Install
        </button>
      ) : null}
      {promptFailed && (
        <p className={`${p.hint} ${p.hintError} ${st.settingWide}`}>
          The one-tap install didn&apos;t start. Use the steps below.
        </p>
      )}
      {manualSteps}
    </div>
  );
}
