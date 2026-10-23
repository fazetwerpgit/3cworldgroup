import { useSyncExternalStore } from 'react';
import type { BiometryType } from './bridge';
import { readCapabilities, subscribeNativeChat } from './nativeChat';

// The app lock's wording follows the device's biometric hardware, which the
// shell advertises as window.__3C_APP_CAPS__.biometryType (read through
// readCapabilities, like nativeChat). Older builds do not send it: they only
// ran on Face ID iPhones, so a missing value reads as Face ID.

export interface BiometryCopy {
  /** The settings row's title. */
  title: string;
  /** The row's explainer while the lock can be used. */
  sub: string;
  /** The row's explainer when the device has no passcode. */
  unavailable: string;
  /** The error when the person cancels the check. */
  canceled: string;
}

const BIOMETRY_NAMES: Record<Exclude<BiometryType, 'none'>, string> = {
  faceId: 'Face ID',
  touchId: 'Touch ID',
  opticId: 'Optic ID',
};

/** The settings copy for a device's biometry (Face ID when unknown). */
export function biometryCopy(type: BiometryType | null | undefined): BiometryCopy {
  if (type === 'none') {
    return {
      title: 'Require your passcode to open the app',
      sub: 'Asks for your passcode when you come back to the app.',
      unavailable: 'Set a passcode on this device to use this.',
      canceled: 'The passcode check was cancelled, so nothing changed.',
    };
  }
  const known = type === 'touchId' || type === 'opticId';
  const name = BIOMETRY_NAMES[known ? type : 'faceId'];
  return {
    title: `Require ${name} or passcode to open the app`,
    sub: `Asks for ${name} or your passcode when you come back to the app.`,
    // Face ID (or an older build, which only ran on iPhones) keeps "iPhone".
    unavailable: `Set a passcode on this ${known ? 'device' : 'iPhone'} to use this.`,
    canceled: `The ${name} or passcode check was cancelled, so nothing changed.`,
  };
}

/** The shell's advertised biometry, live. Undefined during SSR, hydration and on older builds. */
export function useBiometryType(): BiometryType | undefined {
  return useSyncExternalStore(
    subscribeNativeChat,
    () => readCapabilities().biometryType,
    () => undefined
  );
}
