import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  isNativeApp: vi.fn(() => true),
  hasNativeBridge: vi.fn(() => true),
  requestNative: vi.fn(),
}));

vi.mock('./isNativeApp', () => ({ isNativeApp: () => fake.isNativeApp() }));
vi.mock('./bridge', () => ({
  hasNativeBridge: () => fake.hasNativeBridge(),
  requestNative: (...args: unknown[]) => fake.requestNative(...args),
}));

import { shareLinkViaApp, shouldShareViaApp } from './shareLink';

beforeEach(() => {
  fake.isNativeApp.mockReturnValue(true);
  fake.hasNativeBridge.mockReturnValue(true);
  fake.requestNative.mockReset();
});

describe('shouldShareViaApp', () => {
  it('is true only in the app with a bridge to talk to', () => {
    expect(shouldShareViaApp()).toBe(true);
    fake.hasNativeBridge.mockReturnValue(false);
    expect(shouldShareViaApp()).toBe(false);
    fake.hasNativeBridge.mockReturnValue(true);
    fake.isNativeApp.mockReturnValue(false);
    expect(shouldShareViaApp()).toBe(false);
  });
});

describe('shareLinkViaApp', () => {
  it('opens the share sheet with the url and title, and resolves whether it was used', async () => {
    fake.requestNative.mockResolvedValueOnce({ completed: true });
    await expect(shareLinkViaApp('https://3cworldgroup.com/x', 'A job')).resolves.toBe(true);
    expect(fake.requestNative).toHaveBeenCalledWith({ type: 'share', url: 'https://3cworldgroup.com/x', title: 'A job' });

    fake.requestNative.mockResolvedValueOnce({ completed: false });
    await expect(shareLinkViaApp('https://3cworldgroup.com/x')).resolves.toBe(false);
  });

  it('sends no title key when there is none (or it is empty)', async () => {
    fake.requestNative.mockResolvedValue({ completed: true });
    await shareLinkViaApp('https://3cworldgroup.com/a');
    await shareLinkViaApp('https://3cworldgroup.com/b', '');
    expect(fake.requestNative.mock.calls[0][0]).toEqual({ type: 'share', url: 'https://3cworldgroup.com/a' });
    expect(fake.requestNative.mock.calls[1][0]).toEqual({ type: 'share', url: 'https://3cworldgroup.com/b' });
  });

  it('passes a bridge failure on to the caller (who falls back to the clipboard)', async () => {
    fake.requestNative.mockRejectedValueOnce(new Error('timeout'));
    await expect(shareLinkViaApp('https://3cworldgroup.com/x')).rejects.toThrow('timeout');
  });
});
