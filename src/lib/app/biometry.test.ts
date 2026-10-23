import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null } }));

import { parseCapabilities } from './bridge';
import { biometryCopy } from './biometry';
import { __resetNativeChatForTests, readCapabilities } from './nativeChat';

describe('biometryCopy', () => {
  it('says Face ID when the shell sends nothing (older builds) or faceId', () => {
    for (const type of [undefined, null, 'faceId'] as const) {
      const copy = biometryCopy(type);
      expect(copy.title).toBe('Require Face ID or passcode to open the app');
      expect(copy.sub).toBe('Asks for Face ID or your passcode when you come back to the app.');
      expect(copy.unavailable).toBe('Set a passcode on this iPhone to use this.');
      expect(copy.canceled).toBe('The Face ID or passcode check was cancelled, so nothing changed.');
    }
  });

  it('says Touch ID and Optic ID on those devices, without naming the iPhone', () => {
    expect(biometryCopy('touchId').title).toBe('Require Touch ID or passcode to open the app');
    expect(biometryCopy('touchId').unavailable).toBe('Set a passcode on this device to use this.');
    expect(biometryCopy('opticId').sub).toBe('Asks for Optic ID or your passcode when you come back to the app.');
    expect(biometryCopy('opticId').canceled).toContain('Optic ID');
  });

  it('names only the passcode when the device has no biometrics', () => {
    const copy = biometryCopy('none');
    expect(copy.title).toBe('Require your passcode to open the app');
    expect(Object.values(copy).join(' ')).not.toMatch(/Face ID|Touch ID|Optic ID/);
  });
});

describe('biometryType capability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetNativeChatForTests();
  });

  it('keeps only the four known values', () => {
    expect(parseCapabilities({ biometryType: 'touchId' })).toEqual({ biometryType: 'touchId' });
    expect(parseCapabilities({ biometryType: 'none', nativeChat: true })).toEqual({ biometryType: 'none', nativeChat: true });
    expect(parseCapabilities({ biometryType: 'retina' })).toEqual({});
    expect(parseCapabilities({ biometryType: 1 })).toEqual({});
  });

  it('is read from the injected window.__3C_APP_CAPS__', () => {
    vi.stubGlobal('window', { __3C_APP_CAPS__: { biometryType: 'opticId' } });
    expect(readCapabilities().biometryType).toBe('opticId');
    vi.stubGlobal('window', {});
    expect(readCapabilities().biometryType).toBeUndefined();
  });
});
