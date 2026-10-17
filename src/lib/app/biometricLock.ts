import { requestNative, type BiometricLockResult } from './bridge';
import { isNativeApp } from './isNativeApp';

// "Require Face ID or passcode to open the app" (3C iOS app only). The shell owns the real
// setting (it stores it and locks on resume); localStorage only mirrors it so
// the Settings toggle shows the right state before the shell answers.

export const BIOMETRIC_LOCK_KEY = '3c-face-id-lock';

/** The mirrored setting. Off by default, and off when storage is blocked. */
export function readStoredBiometricLock(): boolean {
  try {
    return window.localStorage.getItem(BIOMETRIC_LOCK_KEY) === 'on';
  } catch {
    return false;
  }
}

function storeBiometricLock(enabled: boolean) {
  try {
    window.localStorage.setItem(BIOMETRIC_LOCK_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage blocked: the shell still holds the real setting.
  }
}

/** Reads the shell's setting and mirrors it. Null outside the app. */
export async function fetchBiometricLock(): Promise<BiometricLockResult | null> {
  if (!isNativeApp()) return null;
  const result = await requestNative<'biometricLock'>({ type: 'biometricLock' });
  storeBiometricLock(result.enabled);
  return result;
}

/** Turns the lock on or off in the shell and mirrors what it reports. Null outside the app. */
export async function setBiometricLock(enabled: boolean): Promise<BiometricLockResult | null> {
  if (!isNativeApp()) return null;
  const result = await requestNative<'biometricLock'>({ type: 'biometricLock', enabled });
  storeBiometricLock(result.enabled);
  return result;
}
