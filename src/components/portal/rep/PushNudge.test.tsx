// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';

const fake = vi.hoisted(() => ({
  user: { uid: 'u1', status: 'active', pushRequired: false } as Record<string, unknown> | null,
  supported: true,
  configured: true,
  askResult: { result: 'enabled', permission: 'granted', detail: 'ok' } as Record<string, string>,
  ask: vi.fn(),
  enable: vi.fn(async () => ({ result: 'enabled', detail: 'ok' })),
  report: vi.fn(async () => undefined),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: fake.user, loading: false }) }));
vi.mock('@/lib/firebase/messaging', () => ({
  pushSupported: async () => fake.supported,
  pushConfigured: () => fake.configured,
}));
vi.mock('@/lib/push/enablePushOnDevice', () => ({
  askAndEnablePush: fake.ask,
  enablePushOnDeviceDetailed: fake.enable,
}));
vi.mock('@/lib/push/reportPushHealth', () => ({
  reportPushHealth: fake.report,
  currentPermission: () => (typeof Notification !== 'undefined' ? Notification.permission : 'no-api'),
}));

import { PushNudge } from './PushNudge';
import { NUDGE_SNOOZE_KEY, REQUIRED_SNOOZE_KEY } from '@/lib/push/pushNudge';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let permission: NotificationPermission | null;

function setDevice({ standalone, perm, ua = IPHONE_SAFARI }: { standalone: boolean; perm: NotificationPermission | null; ua?: string }) {
  permission = perm;
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'standalone', { value: standalone, configurable: true });
  if (perm === null) {
    delete (window as unknown as { Notification?: unknown }).Notification;
    delete (globalThis as unknown as { Notification?: unknown }).Notification;
  } else {
    const N = { get permission() { return permission; }, requestPermission: vi.fn() };
    (window as unknown as { Notification: unknown }).Notification = N;
    (globalThis as unknown as { Notification: unknown }).Notification = N;
  }
}

async function mount() {
  await act(async () => {
    root.render(<PushNudge />);
  });
  await act(async () => {});
}

async function foreground() {
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await act(async () => {});
}

const text = () => document.body.textContent ?? '';
const button = (label: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement | undefined;

beforeEach(() => {
  window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;
  window.localStorage.clear();
  fake.user = { uid: 'u1', status: 'active', pushRequired: false };
  fake.supported = true;
  fake.configured = true;
  fake.askResult = { result: 'enabled', permission: 'granted', detail: 'ok' };
  fake.ask.mockReset().mockImplementation(async () => fake.askResult);
  fake.enable.mockClear();
  fake.report.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('PushNudge banner', () => {
  it('tells an iPhone Safari tab to add the app to the Home Screen', async () => {
    fake.supported = false;
    setDevice({ standalone: false, perm: null });
    await mount();
    expect(text()).toContain('Get chat and sale alerts: add the 3C app to your Home Screen');
    expect(text()).toContain('Add to Home Screen');
    expect(text()).toContain('3C Console');
    expect(button('Turn on notifications')).toBeUndefined();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('turns notifications on from the tap, then confirms and goes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setDevice({ standalone: true, perm: 'default' });
    await mount();
    expect(text()).toContain('Get chat and sale alerts on this phone');
    await act(async () => {
      button('Turn on notifications')!.click();
    });
    expect(fake.ask).toHaveBeenCalledTimes(1);
    expect(fake.report).toHaveBeenCalledWith({ supported: true, permission: 'granted', result: 'enabled / ok' });
    expect(text()).toContain('Notifications are on.');
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(text()).toBe('');
  });

  it('moves to the Settings steps when the phone says no', async () => {
    setDevice({ standalone: true, perm: 'default' });
    fake.askResult = { result: 'blocked', permission: 'denied', detail: 'permission-denied' };
    await mount();
    await act(async () => {
      button('Turn on notifications')!.click();
    });
    expect(text()).toContain('Notifications are off for 3C on this phone');
    expect(text()).toContain('Settings');
    expect(text()).toContain('Allow Notifications');
  });

  it('keeps the button after a failed registration and says so', async () => {
    setDevice({ standalone: true, perm: 'default' });
    fake.askResult = { result: 'failed', permission: 'granted', detail: 'register-http-500' };
    await mount();
    await act(async () => {
      button('Turn on notifications')!.click();
    });
    expect(text()).toContain("That didn't go through. Try again.");
    expect(button('Turn on notifications')).toBeDefined();
  });

  it('re-checks a blocked phone on return and registers once it is allowed', async () => {
    setDevice({ standalone: true, perm: 'denied' });
    await mount();
    expect(text()).toContain('Notifications are off');
    permission = 'granted';
    await foreground();
    expect(fake.enable).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Notifications are on.');
  });

  it('shows nothing once push works, or when push is not configured', async () => {
    setDevice({ standalone: true, perm: 'granted' });
    await mount();
    expect(text()).toBe('');
    fake.configured = false;
    setDevice({ standalone: false, perm: null });
    await foreground();
    expect(text()).toBe('');
  });

  it('"Not now" hides it for 24 hours', async () => {
    setDevice({ standalone: true, perm: 'default' });
    await mount();
    await act(async () => {
      button('Not now')!.click();
    });
    expect(text()).toBe('');
    const stored = Number(window.localStorage.getItem(NUDGE_SNOOZE_KEY));
    expect(stored).toBeGreaterThan(0);
    await foreground();
    expect(text()).toBe('');
    window.localStorage.setItem(NUDGE_SNOOZE_KEY, String(Date.now() - 25 * 60 * 60 * 1000));
    await foreground();
    expect(text()).toContain('Get chat and sale alerts on this phone');
  });

  it('still works when storage throws', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    setDevice({ standalone: true, perm: 'default' });
    await mount();
    expect(text()).toContain('Get chat and sale alerts');
    await act(async () => {
      button('Not now')!.click();
    });
    expect(text()).toBe('');
    get.mockRestore();
    set.mockRestore();
  });
});

describe('PushNudge required sheet', () => {
  it('shows a full-screen sheet on body for a required person, and "Not now" holds only an hour', async () => {
    fake.user = { uid: 'u1', status: 'active', pushRequired: true };
    setDevice({ standalone: true, perm: 'default' });
    await mount();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(container.contains(dialog)).toBe(false);
    expect(text()).toContain('Your account needs notifications on');
    await act(async () => {
      button('Not now')!.click();
    });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(window.localStorage.getItem(REQUIRED_SNOOZE_KEY)).not.toBeNull();
    await foreground();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    window.localStorage.setItem(REQUIRED_SNOOZE_KEY, String(Date.now() - 61 * 60 * 1000));
    await foreground();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('ignores the banner snooze', async () => {
    fake.user = { uid: 'u1', status: 'active', pushRequired: true };
    window.localStorage.setItem(NUDGE_SNOOZE_KEY, String(Date.now()));
    fake.supported = false;
    setDevice({ standalone: false, perm: null });
    await mount();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(text()).toContain('Add 3C to your Home Screen');
  });

  it('is gone for good once the device is registered', async () => {
    fake.user = { uid: 'u1', status: 'active', pushRequired: true };
    setDevice({ standalone: true, perm: 'granted' });
    await mount();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('PushNudge eligibility', () => {
  it('shows nothing to a signed-out or inactive user', async () => {
    setDevice({ standalone: true, perm: 'default' });
    fake.user = null;
    await mount();
    expect(text()).toBe('');
    fake.user = { uid: 'u1', status: 'inactive' };
    await mount();
    expect(text()).toBe('');
  });
});
