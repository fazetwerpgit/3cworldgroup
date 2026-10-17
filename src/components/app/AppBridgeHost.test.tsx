// @vitest-environment jsdom
//
// html[data-app] scopes the app-only touch CSS: set inside the 3C iOS app
// after hydration, never on the web.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ native: false }));
vi.mock('@/lib/app/isNativeApp', () => ({ isNativeApp: () => env.native }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, loading: true }) }));
vi.mock('@/lib/app/bridge', () => ({ installNativeReceiver: vi.fn(), onNativeMessage: vi.fn(() => () => {}) }));
vi.mock('@/lib/app/links', () => ({ installAppLinkHandling: vi.fn(() => () => {}) }));
vi.mock('@/lib/app/nativePush', () => ({ registerNativePushToken: vi.fn(), syncNativePush: vi.fn() }));

import AppBridgeHost from './AppBridgeHost';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
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
