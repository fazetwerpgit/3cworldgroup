import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestNative = vi.fn();
const isNativeApp = vi.fn(() => true);

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null } }));
vi.mock('@/lib/push/reportPushHealth', () => ({ reportPushHealth: vi.fn() }));
vi.mock('./bridge', () => ({
  NativeBridgeError: class extends Error {},
  requestNative: (...args: unknown[]) => requestNative(...args),
}));
vi.mock('./isNativeApp', () => ({ isNativeApp: () => isNativeApp() }));

import { nativePushNotAskedYet } from './nativePush';

describe('nativePushNotAskedYet', () => {
  beforeEach(() => {
    requestNative.mockReset();
    isNativeApp.mockReturnValue(true);
  });

  it('is true only with no token and an undetermined permission, and never prompts', async () => {
    requestNative.mockResolvedValue({ permission: 'undetermined' });
    await expect(nativePushNotAskedYet()).resolves.toBe(true);
    expect(requestNative).toHaveBeenCalledWith({ type: 'pushToken', prompt: false });
  });

  it('is false when alerts are on or were refused', async () => {
    requestNative.mockResolvedValueOnce({ permission: 'granted', token: 't' });
    await expect(nativePushNotAskedYet()).resolves.toBe(false);
    requestNative.mockResolvedValueOnce({ permission: 'denied' });
    await expect(nativePushNotAskedYet()).resolves.toBe(false);
  });

  it('is false outside the app or when the bridge fails', async () => {
    requestNative.mockRejectedValue(new Error('timeout'));
    await expect(nativePushNotAskedYet()).resolves.toBe(false);
    isNativeApp.mockReturnValue(false);
    await expect(nativePushNotAskedYet()).resolves.toBe(false);
  });
});
