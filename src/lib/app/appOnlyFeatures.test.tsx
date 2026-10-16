import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetBridgeForTests, nativeHaptic, receiveNativeMessage } from './bridge';
import { BIOMETRIC_LOCK_KEY, fetchBiometricLock, readStoredBiometricLock, setBiometricLock } from './biometricLock';

const APP_UA = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 3CPortalApp/1.0.0';
const WEB_UA = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

const mockIsApp = vi.hoisted(() => ({ value: false }));
vi.mock('./isNativeApp', async (importOriginal) => {
  const real = await importOriginal<typeof import('./isNativeApp')>();
  return { ...real, useIsNativeApp: () => mockIsApp.value };
});

let posted: string[];
let store: Map<string, string>;

function stubWindow(inApp: boolean) {
  posted = [];
  store = new Map();
  const win: Record<string, unknown> = {
    navigator: { userAgent: inApp ? APP_UA : WEB_UA },
    addEventListener: vi.fn(),
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
  // The web has no ReactNativeWebView; give it one anyway for the web case to
  // prove the UA/flag gate, not a missing transport, is what blocks the send.
  win.ReactNativeWebView = { postMessage: (m: string) => posted.push(m) };
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', { addEventListener: vi.fn() });
}

/** Answer the last request the web sent to the shell. */
function replyToLast(result: unknown) {
  const { id } = JSON.parse(posted[posted.length - 1]);
  receiveNativeMessage({ source: '3c-shell', type: 'reply', id, ok: true, result });
}

beforeEach(() => {
  __resetBridgeForTests();
  mockIsApp.value = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Settings app-only cards (web unchanged)', () => {
  it('AppOnly renders nothing on the web', async () => {
    const { default: AppOnly } = await import('@/components/app/AppOnly');
    mockIsApp.value = false;
    expect(renderToString(<AppOnly><p>Delete account</p></AppOnly>)).toBe('');
  });

  it('AppOnly renders its children in the app', async () => {
    const { default: AppOnly } = await import('@/components/app/AppOnly');
    mockIsApp.value = true;
    expect(renderToString(<AppOnly><p>Delete account</p></AppOnly>)).toContain('Delete account');
  });

  it('Settings renders the delete card and linked sign-in methods only inside AppOnly', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/portal/settings/page.tsx'), 'utf8');
    const outsideAppOnly = src.replace(/<AppOnly>[\s\S]*?<\/AppOnly>/g, '');
    expect(src).toMatch(/<AppOnly>\s*<DeleteAccountCard \/>\s*<\/AppOnly>/);
    expect(outsideAppOnly).not.toContain('<DeleteAccountCard');
    expect(outsideAppOnly).not.toContain('<LinkedSignInMethods');
    // Face ID toggle lives in the in-app branch next to the native push card.
    expect(src).toMatch(/inApp \? \(\s*<>\s*<NativePushCard \/>\s*<FaceIdLockCard \/>/);
  });
});

describe('Face ID lock bridge message', () => {
  it('is not sent on the web, and nothing is stored', async () => {
    stubWindow(false);
    await expect(setBiometricLock(true)).resolves.toBeNull();
    await expect(fetchBiometricLock()).resolves.toBeNull();
    expect(posted).toEqual([]);
    expect(store.size).toBe(0);
  });

  it('is sent in the app with enabled, and the reply is mirrored to localStorage', async () => {
    stubWindow(true);
    const pending = setBiometricLock(true);
    const msg = JSON.parse(posted[0]);
    expect(msg).toMatchObject({ type: 'biometricLock', enabled: true });
    expect(typeof msg.id).toBe('string');
    replyToLast({ enabled: true, available: true });
    await expect(pending).resolves.toEqual({ enabled: true, available: true });
    expect(store.get(BIOMETRIC_LOCK_KEY)).toBe('on');
    expect(readStoredBiometricLock()).toBe(true);

    const off = setBiometricLock(false);
    expect(JSON.parse(posted[1])).toMatchObject({ type: 'biometricLock', enabled: false });
    replyToLast({ enabled: false, available: true });
    await off;
    expect(readStoredBiometricLock()).toBe(false);
  });

  it('reading the setting sends no enabled field', async () => {
    stubWindow(true);
    const pending = fetchBiometricLock();
    expect(JSON.parse(posted[0])).not.toHaveProperty('enabled');
    replyToLast({ enabled: false, available: false });
    await expect(pending).resolves.toEqual({ enabled: false, available: false });
  });

  it('is off by default and survives blocked storage', () => {
    stubWindow(true);
    expect(readStoredBiometricLock()).toBe(false);
    vi.stubGlobal('window', {
      navigator: { userAgent: APP_UA },
      get localStorage(): Storage {
        throw new Error('SecurityError');
      },
    });
    expect(readStoredBiometricLock()).toBe(false);
  });
});

describe('haptics', () => {
  it('send nothing on the web', () => {
    stubWindow(false);
    nativeHaptic('success');
    nativeHaptic('error');
    expect(posted).toEqual([]);
  });

  it('send success and error in the app', () => {
    stubWindow(true);
    nativeHaptic('success');
    nativeHaptic('error');
    expect(posted.map((m) => JSON.parse(m))).toEqual([
      { type: 'haptic', style: 'success' },
      { type: 'haptic', style: 'error' },
    ]);
  });

  it('are wired to sale submit, sale edit save, and self-delete success', () => {
    const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
    const form = read('src/hooks/useSaleFormState.ts');
    expect(form).toContain("nativeHaptic('success')");
    expect(form).toContain("nativeHaptic('error')");
    expect(read('src/components/portal/rep/RepSaleEdit.tsx')).toContain("nativeHaptic(success ? 'success' : 'error')");
    expect(read('src/components/portal/DeleteAccountCard.tsx')).toContain("nativeHaptic('success')");
  });
});
