'use client';

import { useEffect, useState } from 'react';
import { NativeBridgeError } from '@/lib/app/bridge';
import { fetchBiometricLock, readStoredBiometricLock, setBiometricLock } from '@/lib/app/biometricLock';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import st from '@/components/portal/rep/rep-settings.module.css';

// Settings row, 3C iOS app only: "Require Face ID to open the app". Off by
// default. The shell stores the setting per device and locks on resume.
export default function FaceIdLockCard() {
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setEnabled(readStoredBiometricLock());
    let cancelled = false;
    fetchBiometricLock()
      .then((result) => {
        if (cancelled || !result) return;
        setEnabled(result.enabled);
        setAvailable(result.available);
      })
      .catch(() => {
        // An older shell without the lock: keep the mirrored value.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async () => {
    const next = !enabled;
    setWorking(true);
    setError('');
    try {
      const result = await setBiometricLock(next);
      if (result) {
        setEnabled(result.enabled);
        setAvailable(result.available);
      }
    } catch (err) {
      setError(
        err instanceof NativeBridgeError && err.code === 'canceled'
          ? 'Face ID was cancelled, so nothing changed.'
          : "Couldn't change the Face ID setting. Try again."
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className={st.setting}>
      <div className={st.settingText}>
        <span className={st.settingTitle} id="face-id-lock-label">
          Require Face ID to open the app
        </span>
        <span className={st.settingSub}>
          {available ? 'Asks for Face ID when you come back to the app.' : "Face ID isn't set up on this iPhone."}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-labelledby="face-id-lock-label"
        className={`${s.btnSecondary} ${st.settingBtn}`}
        onClick={toggle}
        disabled={working || (!available && !enabled)}
      >
        {working ? 'Saving…' : enabled ? 'On' : 'Off'}
      </button>
      {error && <p className={`${p.hint} ${p.hintError} ${st.settingWide}`} role="alert">{error}</p>}
    </div>
  );
}
