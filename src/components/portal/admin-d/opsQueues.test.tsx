// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TestUser = { uid: string; role?: string; fieldRole?: string };

const state = vi.hoisted(() => ({
  user: null as TestUser | null,
  failing: new Set<string>(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: state.user,
    // Mirrors AuthContext: an owner also satisfies 'admin'.
    isRole: (...roles: string[]) =>
      roles.some((r) => r === state.user?.role || r === state.user?.fieldRole) ||
      (state.user?.role === 'owner' && roles.includes('admin')),
    hasPermission: () => true,
  }),
}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: { getIdToken: async () => 'token' } } }));
vi.mock('@/hooks/admin/usePendingSignupsCount', () => ({
  usePendingSignupsCount: (enabled: boolean) => (enabled ? 4 : 0),
}));

import { useAdminNavCounts, useHubTabCounts, useOpsQueues, type OpsQueues } from './opsQueues';
import { ONBOARDING_HUB } from './adminHubs';

const HOUR = 1000 * 60 * 60;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function respond(url: string) {
  const path = url.split('?')[0];
  if (state.failing.has(path)) return { ok: false, body: { error: 'nope' } };
  // u1 has two uploads waiting, u2 one: two people.
  if (path === '/api/portal/onboarding/review')
    return {
      ok: true,
      body: {
        submissions: [
          { userId: 'u1', submittedAt: ago(30 * HOUR) },
          { userId: 'u1', submittedAt: ago(HOUR) },
          { userId: 'u2', submittedAt: ago(2 * HOUR) },
        ],
      },
    };
  if (path === '/api/portal/recruiting/invites')
    return {
      ok: true,
      body: {
        invites: [{ status: 'submitted', submittedAt: ago(3 * 24 * HOUR) }, { status: 'invited' }],
        applications: [
          { status: 'applied', createdAt: ago(HOUR) },
          { status: 'applied', createdAt: ago(2 * 24 * HOUR) },
          { status: 'invited', createdAt: ago(HOUR) },
        ],
      },
    };
  if (path === '/api/portal/pipeline') return { ok: true, body: { counts: { processing: 2, need_logins: 1 } } };
  // Every request type: one open item, one handled.
  return { ok: true, body: { submissions: [{ status: 'new', createdAt: ago(2 * HOUR) }, { status: 'handled' }] } };
}

const fetchMock = vi.fn(async (url: string) => {
  const { ok, body } = respond(url);
  return { ok, json: async () => body } as Response;
});

type Seen = { queues: OpsQueues; counts: Record<string, number>; tabs: Record<string, number> | undefined };
let seen: Seen | null = null;
function Probe({ onRender }: { onRender: (value: Seen) => void }) {
  onRender({ queues: useOpsQueues(), counts: useAdminNavCounts(), tabs: useHubTabCounts(ONBOARDING_HUB) });
  return null;
}

let container: HTMLDivElement;
let root: Root;
let uid = 0;

async function renderAs(user: Omit<TestUser, 'uid'>) {
  // A fresh uid per test: the queue cache is per viewer.
  state.user = { uid: `u${++uid}`, ...user };
  await act(async () => {
    root.render(<Probe onRender={(value) => (seen = value)} />);
  });
  await act(async () => {
    await vi.waitFor(() => expect(seen?.queues.loading).toBe(false));
  });
  return seen!;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  state.failing.clear();
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe('useOpsQueues', () => {
  it('gives an admin every queue in menu order, then sign-ups, each linking to its tab', async () => {
    const { queues, counts, tabs } = await renderAs({ role: 'admin' });
    expect(queues.cards?.map((card) => card.label)).toEqual([
      'Documents to check',
      'Ready to activate',
      'New website applicants',
      'Onboarding pipeline',
      'Payroll disputes',
      'Expedite orders',
      'Leads requests',
      'Fiber reports',
      'Manager interviews',
      'Bug reports',
      'Sign-ups waiting for a role',
    ]);
    const byKey = Object.fromEntries(queues.cards!.map((card) => [card.key, card]));
    // People, not uploads: u1's two uploads count once, aged by the older one.
    expect(byKey.onboarding).toMatchObject({ href: '/portal/admin/onboarding?tab=todo', count: 2, newToday: 1 });
    expect(byKey.onboarding.oldestWaitMs).toBeGreaterThan(29 * HOUR);
    expect(byKey.recruiting).toMatchObject({ href: '/portal/admin/onboarding?tab=todo', count: 1, newToday: 0 });
    expect(byKey.recruiting.oldestWaitMs).toBeGreaterThan(2 * 24 * HOUR);
    expect(byKey.applicants).toMatchObject({ href: '/portal/admin/onboarding?tab=todo', count: 2, newToday: 1 });
    expect(byKey.pipeline).toMatchObject({ count: 3, newToday: null, oldestWaitMs: null, badge: false });
    expect(byKey['bug-reports']).toMatchObject({ href: '/portal/admin/requests?type=bug-reports', count: 1, newToday: 1 });
    expect(byKey.signups).toMatchObject({ href: '/portal/admin/onboarding?tab=todo', count: 4 });
    // The two invites queues share one call.
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/portal/recruiting/invites')).toHaveLength(1);
    // Nav badge and To do tab: things waiting on you; the pipeline adds to neither.
    expect(counts).toEqual({
      '/portal/admin/onboarding': 2 + 1 + 2 + 4,
      '/portal/admin/requests': 6,
    });
    expect(tabs).toEqual({ todo: 2 + 1 + 2 + 4 });
  });

  it('asks a manager for nothing: their Recruits tab shows no count', async () => {
    const { queues, counts } = await renderAs({ fieldRole: 'l1_manager' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(queues.cards).toBeNull();
    expect(counts).toEqual({});
  });

  it('asks a rep for nothing', async () => {
    const { queues } = await renderAs({ fieldRole: 'entry_rep' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(queues.cards).toBeNull();
  });

  it('marks a queue that fails as failed and keeps the rest', async () => {
    state.failing.add('/api/portal/forms/leads-request/review');
    const { queues, counts } = await renderAs({ role: 'operations' });
    const leads = queues.cards?.find((card) => card.key === 'leads-requests');
    expect(leads).toMatchObject({ error: true, count: 0 });
    expect(queues.cards?.filter((card) => card.error)).toHaveLength(1);
    expect(counts['/portal/admin/requests']).toBe(5);
    // Operations do not approve signups.
    expect(queues.cards?.some((card) => card.key === 'signups')).toBe(false);
  });
});
