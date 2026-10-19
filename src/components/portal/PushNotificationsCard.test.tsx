// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  askResult: { result: 'enabled', permission: 'granted', detail: 'ok' } as Record<string, string>,
  ask: vi.fn(),
  report: vi.fn(async () => undefined),
}));

vi.mock('@/lib/firebase/messaging', () => ({ pushSupported: async () => true }));
vi.mock('@/lib/push/enablePushOnDevice', () => ({ askAndEnablePush: fake.ask }));
vi.mock('@/lib/push/reportPushHealth', () => ({ reportPushHealth: fake.report }));

import PushNotificationsCard from './PushNotificationsCard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function setPermission(perm: NotificationPermission) {
  const N = { permission: perm, requestPermission: vi.fn() };
  (window as unknown as { Notification: unknown }).Notification = N;
  (globalThis as unknown as { Notification: unknown }).Notification = N;
}

async function mount() {
  await act(async () => {
    root.render(<PushNotificationsCard />);
  });
  await act(async () => {});
}

const button = (label: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement | undefined;

beforeEach(() => {
  fake.askResult = { result: 'enabled', permission: 'granted', detail: 'ok' };
  fake.ask.mockReset();
  fake.ask.mockImplementation(async () => fake.askResult);
  fake.report.mockClear();
  setPermission('default');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PushNotificationsCard', () => {
  it('sends the push-health beacon after a failed "Turn on" tap', async () => {
    fake.askResult = { result: 'failed', permission: 'granted', detail: 'register-http-500' };
    await mount();
    await act(async () => {
      button('Turn on')!.click();
    });
    await act(async () => {});
    expect(fake.report).toHaveBeenCalledWith({
      supported: true,
      permission: 'granted',
      result: 'failed / register-http-500',
    });
    expect(document.body.textContent).toContain("Couldn't enable notifications");
  });

  it('sends the push-health beacon after a successful "Turn on" tap', async () => {
    await mount();
    await act(async () => {
      button('Turn on')!.click();
    });
    await act(async () => {});
    expect(fake.report).toHaveBeenCalledWith({ supported: true, permission: 'granted', result: 'enabled / ok' });
    expect(document.body.textContent).toContain('On');
  });
});
