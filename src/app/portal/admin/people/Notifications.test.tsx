// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'id-token' }));

import { Notifications, checkedLabel } from './Notifications';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.UTC(2026, 9, 9, 12);
const ROWS = [
  { uid: 'miles', name: 'Miles', email: 'm@x', state: 'not-installed', required: false, checkedAt: new Date(NOW - 5 * 60000).toISOString() },
  { uid: 'wil', name: 'Wil', email: 'w@x', state: 'never-allowed', required: true, checkedAt: null },
  { uid: 'ana', name: 'Ana', email: 'a@x', state: 'on', required: false, checkedAt: null },
];

let container: HTMLDivElement;
let root: Root;
let patchOk = true;
const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
  if (init?.method === 'PATCH') {
    return { ok: patchOk, status: patchOk ? 200 : 403, json: async () => (patchOk ? { success: true } : { error: 'Forbidden' }) };
  }
  return { ok: true, status: 200, json: async () => ({ users: ROWS }) };
});

beforeEach(() => {
  patchOk = true;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => {
    root.render(<Notifications />);
  });
  await act(async () => {});
}

const switchFor = (name: string) =>
  container.querySelector(`button[aria-label="Require notifications for ${name}"]`) as HTMLButtonElement;

describe('Notifications (People tab)', () => {
  it('shows the count and each person state', async () => {
    await mount();
    const text = container.textContent ?? '';
    expect(text).toContain("2 of 3 people can't get notifications");
    expect(text).toContain('Off – not installed');
    expect(text).toContain('Off – never allowed');
    expect(text).toContain('On');
    expect(text).toContain('not checked yet');
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/admin/push', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer id-token' }) }));
    expect(switchFor('Wil').getAttribute('aria-pressed')).toBe('true');
    expect(switchFor('Miles').getAttribute('aria-pressed')).toBe('false');
  });

  it('Require writes pushRequired through the admin route', async () => {
    await mount();
    await act(async () => {
      switchFor('Miles').click();
    });
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch?.[0]).toBe('/api/portal/admin/push');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ uid: 'miles', required: true });
    expect(switchFor('Miles').getAttribute('aria-pressed')).toBe('true');
  });

  it('puts the switch back and says so when the write fails', async () => {
    patchOk = false;
    await mount();
    await act(async () => {
      switchFor('Wil').click();
    });
    expect(switchFor('Wil').getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain("Couldn't change Wil. Forbidden");
  });
});

describe('checkedLabel', () => {
  it('reads plainly', () => {
    expect(checkedLabel(null, NOW)).toBe('not checked yet');
    expect(checkedLabel(new Date(NOW - 20_000).toISOString(), NOW)).toBe('checked just now');
    expect(checkedLabel(new Date(NOW - 5 * 60000).toISOString(), NOW)).toBe('checked 5 min ago');
    expect(checkedLabel(new Date(NOW - 3 * 3600000).toISOString(), NOW)).toBe('checked 3 h ago');
    expect(checkedLabel(new Date(NOW - 30 * 3600000).toISOString(), NOW)).toBe('checked yesterday');
    expect(checkedLabel('2026-10-02T12:00:00Z', NOW)).toBe('checked Oct 2');
  });
});
