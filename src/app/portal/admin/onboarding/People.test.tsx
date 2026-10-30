// @vitest-environment jsdom
//
// People renders the actions each role may run (the routes check again), and
// an action refetches only the source it changed.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  role: 'admin' as string,
  user: { uid: 'viewer-1' },
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    isRole: (...roles: string[]) => roles.includes(authState.role),
  }),
}));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'token' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/portal/admin-d/AdminUi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/portal/admin-d/AdminUi')>()),
  AdminGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { People } from './People';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const APPLICATION = {
  id: 'a1',
  name: 'Ana Applicant',
  phone: '',
  email: 'ana@example.com',
  city: 'Austin, TX',
  interests: ['fiber'],
  status: 'applied',
  createdAt: daysAgo(2),
  updatedAt: daysAgo(2),
};

const INVITE = {
  id: 'i1',
  candidateName: 'Ivy Invited',
  candidateEmail: 'ivy@example.com',
  candidatePhone: '',
  candidateCity: '',
  intendedFieldRole: 'entry_level_rep',
  isIBO: false,
  status: 'invited',
  linkSaved: true,
  ownerName: 'Jacob Myers',
  applicationId: null,
  convertedUserId: null,
  expiresAt: daysAgo(-10),
  submittedAt: null,
  createdAt: daysAgo(1),
  updatedAt: daysAgo(1),
};

const REP = {
  uid: 'u1',
  displayName: 'Sam Seller',
  email: 'sam@example.com',
  fieldRole: 'entry_level_rep',
  isIBO: false,
  stage: 'active',
  onboarding: { approved: 7, total: 7 },
  channelsCleared: 1,
  channelsSubmitted: 0,
  approvedSales: 2,
  carrierOrders: 0,
  lastSignInAt: daysAgo(1),
  createdAt: daysAgo(30),
  activatedAt: daysAgo(3),
};

let container: HTMLDivElement;
let root: Root;
let calls: { url: string; method: string }[];

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function serverFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET' });
    if (url === '/api/portal/recruiting/invites') return respond({ invites: [INVITE], applications: [APPLICATION] });
    if (url === '/api/portal/pipeline') return respond({ reps: [REP] });
    if (url === '/api/portal/onboarding/review') return respond({ people: [] });
    if (url.startsWith('/api/portal/recruiting/applications/')) return respond({ ok: true });
    return respond({ error: 'unexpected' }, 500);
  });
}

const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });

const gets = (url: string) => calls.filter((call) => call.url === url && call.method === 'GET').length;

/** Every action button in the open person sheet (foot and More), by its text. */
function sheetButtons(): string[] {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) throw new Error('no sheet open');
  return Array.from(dialog.querySelectorAll('button'))
    .map((button) => button.textContent?.trim() ?? '')
    .filter(Boolean);
}

async function render(role: string) {
  authState.role = role;
  await act(async () => root.render(<People />));
  await flush();
}

async function openPerson(name: string) {
  const open = document.querySelector<HTMLButtonElement>(`button[aria-label="Open ${name}"]`);
  if (!open) throw new Error(`no row for ${name}`);
  await act(async () => open.click());
  await flush();
}

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', serverFetch());
  vi.stubGlobal('scrollTo', vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('People renders what each role may do', () => {
  it('field manager: recruiting only, no team, no Not a fit, no Decommission', async () => {
    await render('manager');
    expect(gets('/api/portal/pipeline')).toBe(0);
    expect(gets('/api/portal/onboarding/review')).toBe(0);
    // No accounts: the rep never shows.
    expect(document.querySelector('button[aria-label="Open Sam Seller"]')).toBeNull();

    await openPerson('Ana Applicant');
    expect(sheetButtons()).toContain('Invite');
    expect(sheetButtons()).not.toContain('Not a fit');
  });

  it('field manager: invite actions on an open invite', async () => {
    await render('manager');
    await openPerson('Ivy Invited');
    const buttons = sheetButtons();
    expect(buttons).toEqual(expect.arrayContaining(['Resend invite', 'Copy invite link', 'Cancel invite']));
    expect(buttons).not.toContain('Decommission');
  });

  it('management: the team, with Not a fit and Decommission', async () => {
    await render('admin');
    await openPerson('Ana Applicant');
    expect(sheetButtons()).toEqual(expect.arrayContaining(['Invite', 'Not a fit']));

    await act(async () => root.render(<People key="again" />));
    await flush();
    await openPerson('Sam Seller');
    expect(sheetButtons()).toEqual(expect.arrayContaining(['Request field training', 'Channels', 'Decommission']));
  });

  it('recruiter grant: the team and Not a fit, but never Decommission', async () => {
    await render('recruiter');
    await openPerson('Sam Seller');
    const buttons = sheetButtons();
    expect(buttons).toEqual(expect.arrayContaining(['Request field training', 'Channels']));
    expect(buttons).not.toContain('Decommission');
  });
});

describe('People reloads only what an action changed', () => {
  it('Not a fit refetches the applications, not the team', async () => {
    await render('admin');
    expect(gets('/api/portal/recruiting/invites')).toBe(1);
    expect(gets('/api/portal/pipeline')).toBe(1);
    expect(gets('/api/portal/onboarding/review')).toBe(1);

    await openPerson('Ana Applicant');
    const notFit = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
      (button) => button.textContent?.trim() === 'Not a fit'
    );
    await act(async () => notFit!.click());
    await flush();

    expect(calls.some((call) => call.method === 'PATCH')).toBe(true);
    expect(gets('/api/portal/recruiting/invites')).toBe(2);
    expect(gets('/api/portal/pipeline')).toBe(1);
    expect(gets('/api/portal/onboarding/review')).toBe(1);
  });

  it('a resume refetches everything once, unless something loaded in the last 30 seconds', async () => {
    vi.useFakeTimers();
    const tick = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    const resume = () =>
      act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(0);
      });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    try {
      authState.role = 'admin';
      await act(async () => root.render(<People />));
      await tick(0);
      await tick(0);
      expect(gets('/api/portal/pipeline')).toBe(1);

      // An action at 45s reloads the applications only.
      await tick(45_000);
      await act(async () => {
        document.querySelector<HTMLButtonElement>('button[aria-label="Open Ana Applicant"]')!.click();
      });
      const notFit = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
        (button) => button.textContent?.trim() === 'Not a fit'
      );
      await act(async () => notFit!.click());
      await tick(0);
      await tick(0);
      expect(gets('/api/portal/recruiting/invites')).toBe(2);

      // Back in the app at 61s: stale for the hook, but 16s after a load: skipped.
      await tick(16_000);
      await resume();
      expect(gets('/api/portal/pipeline')).toBe(1);

      // Two minutes later: one full refresh.
      await tick(120_000);
      await resume();
      await tick(0);
      expect(gets('/api/portal/recruiting/invites')).toBe(3);
      expect(gets('/api/portal/pipeline')).toBe(2);
      expect(gets('/api/portal/onboarding/review')).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
