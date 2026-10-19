// @vitest-environment jsdom
//
// html[data-app] scopes the app-only touch CSS: set inside the 3C iOS app
// after hydration, never on the web.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  native: false,
  auth: { user: null as { uid: string } | null, loading: true },
  firebase: { currentUser: null as { uid: string } | null },
}));
vi.mock('@/lib/app/isNativeApp', () => ({ isNativeApp: () => env.native, useIsNativeApp: () => env.native }));
vi.mock('next/navigation', () => ({ usePathname: () => '/portal/sales', useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => env.auth }));
vi.mock('@/lib/firebase/config', () => ({ auth: env.firebase }));
vi.mock('@/lib/cache/pageData', () => ({ PAGE_DATA_FALLBACK_MS: 0, waitForPageData: () => Promise.resolve() }));
vi.mock('@/lib/app/bridge', () => ({
  installNativeReceiver: vi.fn(),
  onNativeMessage: vi.fn(() => () => {}),
  advertiseBridgeFeature: vi.fn(() => () => {}),
}));
vi.mock('@/lib/app/links', () => ({
  installAppLinkHandling: vi.fn(() => () => {}),
  inAppRoute: vi.fn(() => null),
  APP_NAVIGATE_EVENT: '3c:app-navigate',
}));
vi.mock('@/lib/app/nativePush', () => ({ registerNativePushToken: vi.fn(), syncNativePush: vi.fn() }));
vi.mock('@/lib/app/statusBar', () => ({ installStatusBarSync: vi.fn(() => () => {}) }));
vi.mock('@/lib/app/appVisibility', () => ({ installResumeMotionReset: vi.fn(() => () => {}) }));
vi.mock('@/lib/app/nativeAuthSync', () => ({ startNativeAuthSync: vi.fn(() => () => {}) }));
vi.mock('@/lib/app/shellExtras', () => ({ clearNativeExtras: vi.fn(), signalAppReady: vi.fn() }));
vi.mock('@/lib/app/nativeChat', () => ({
  CHAT_PATH: '/portal/chat',
  handleChatDeepLink: vi.fn(),
  installCapabilityListener: vi.fn(() => () => {}),
  setChatNavigate: vi.fn(),
  useNativeChatPending: () => false,
  useSupportsNativeChat: () => false,
}));
vi.mock('./AppNotice', () => ({ default: () => null }));
vi.mock('./NativeBadgeSync', () => ({ default: () => null }));

import AppBridgeHost from './AppBridgeHost';
import { syncNativePush } from '@/lib/app/nativePush';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  env.auth = { user: null, loading: true };
  env.firebase.currentUser = null;
  vi.mocked(syncNativePush).mockClear();
  container.remove();
  document.documentElement.removeAttribute('data-app');
});

describe('AppBridgeHost html[data-app]', () => {
  it('marks <html> inside the app and clears it on unmount', () => {
    env.native = true;
    act(() => root.render(<AppBridgeHost />));
    expect(document.documentElement.hasAttribute('data-app')).toBe(true);
    act(() => root.unmount());
    expect(document.documentElement.hasAttribute('data-app')).toBe(false);
  });

  it('leaves <html> alone on the web', () => {
    env.native = false;
    act(() => root.render(<AppBridgeHost />));
    expect(document.documentElement.hasAttribute('data-app')).toBe(false);
    act(() => root.unmount());
  });
});

describe('AppBridgeHost silent push sync', () => {
  const signIn = async (uid: string) => {
    env.auth = { user: { uid }, loading: false };
    env.firebase.currentUser = { uid };
    await act(async () => root.render(<AppBridgeHost />));
  };
  const signOut = async () => {
    env.auth = { user: null, loading: false };
    env.firebase.currentUser = null;
    await act(async () => root.render(<AppBridgeHost />));
  };

  it('registers the push token again when the same user signs back in', async () => {
    env.native = true;
    await signIn('rep-1');
    expect(syncNativePush).toHaveBeenCalledTimes(1);
    // Sign-out deletes this phone's token without reloading the page.
    await signOut();
    await signIn('rep-1');
    expect(syncNativePush).toHaveBeenCalledTimes(2);
    expect(syncNativePush).toHaveBeenLastCalledWith({ prompt: false });
    act(() => root.unmount());
  });

  it('syncs once per signed-in user while the session lasts', async () => {
    env.native = true;
    await signIn('rep-1');
    await act(async () => root.render(<AppBridgeHost />));
    expect(syncNativePush).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
