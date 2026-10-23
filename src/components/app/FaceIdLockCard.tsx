'use client';

import { useEffect, useState } from 'react';
import { NativeBridgeError } from '@/lib/app/bridge';
import { biometryCopy, useBiometryType } from '@/lib/app/biometry';
import { fetchBiometricLock, readStoredBiometricLock, setBiometricLock } from '@/lib/app/biometricLock';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import st from '@/components/portal/rep/rep-settings.module.css';

// Settings row, 3C iOS app only: "Require Face ID or passcode to open the
// app". Off by default. Works with Face ID, or the passcode alone. The shell stores the setting per device and locks on resume.
// The wording follows the device (Touch ID, Optic ID, passcode only); see biometry.ts.
export default function FaceIdLockCard() {
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const copy = biometryCopy(useBiometryType());

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
          ? copy.canceled
          : "Couldn't change the app lock setting. Try again."
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className={st.setting}>
      <div className={st.settingText}>
        <span className={st.settingTitle} id="face-id-lock-label">
          {copy.title}
        </span>
        <span className={st.settingSub}>
          {available ? copy.sub : copy.unavailable}
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
