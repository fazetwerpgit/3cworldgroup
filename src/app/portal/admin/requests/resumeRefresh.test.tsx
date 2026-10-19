// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A resume or pull-to-refresh reload must be quiet: when it fails, the queue
// already on screen stays there instead of turning into "Couldn't load".

const state = vi.hoisted(() => ({
  failing: false,
  resume: null as null | (() => unknown),
  // One value for the whole test, like AuthContext: new ones per render would refetch forever.
  auth: {
    user: { uid: 'admin1', role: 'admin' },
    isRole: () => true,
    hasPermission: () => true,
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => state.auth,
}));
vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: { getIdToken: async () => 'token' } }, db: null }));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'token' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/portal/admin',
  useSearchParams: () => new URLSearchParams(),
}));
// Capture the resume refresh so the test can fire it like the hook would.
vi.mock('@/hooks/useRefreshOnResume', () => ({
  useRefreshOnResume: (refresh: () => unknown) => {
    state.resume = refresh;
  },
}));

import { BugReports } from './BugReports';
import { ExpediteOrders } from './ExpediteOrders';
import { FiberReports } from './FiberReports';
import { LeadsRequests } from './LeadsRequests';
import { ManagerInterviews } from './ManagerInterviews';
import { PayrollDisputes } from './PayrollDisputes';
import { Pipeline } from '../onboarding/Pipeline';

const submission = {
  id: 's1',
  status: 'open',
  submittedByName: 'Sam Queue',
  repName: 'Sam Queue',
  createdAt: '2026-10-01T15:00:00.000Z',
};

const pipelineRep = {
  uid: 'r1',
  displayName: 'Sam Queue',
  email: 'sam@example.com',
  fieldRole: 'rep',
  isIBO: false,
  stage: 'active',
  onboarding: null,
  channelsCleared: 0,
  channelsSubmitted: 0,
  approvedSales: 2,
  carrierOrders: 0,
  lastSignInAt: null,
};

const fetchMock = vi.fn(async (url: string) => {
  if (state.failing) return { ok: false, json: async () => ({ error: 'offline' }) } as Response;
  const body = url.startsWith('/api/portal/pipeline') ? { reps: [pipelineRep] } : { submissions: [submission] };
  return { ok: true, json: async () => body } as Response;
});

let container: HTMLDivElement;
let root: Root;

const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
};

async function mount(el: ReactElement) {
  await act(async () => { root.render(el); });
  await flush();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.failing = false;
  state.resume = null;
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

const screens: Array<[string, () => ReactElement]> = [
  ['Pipeline', () => <Pipeline />],
  ['PayrollDisputes', () => <PayrollDisputes />],
  ['ExpediteOrders', () => <ExpediteOrders />],
  ['FiberReports', () => <FiberReports />],
  ['LeadsRequests', () => <LeadsRequests />],
  ['ManagerInterviews', () => <ManagerInterviews />],
  ['BugReports', () => <BugReports />],
];

describe.each(screens)('%s resume refresh', (_name, render) => {
  it('keeps the loaded list when a background refresh fails', async () => {
    await mount(render());
    expect(container.textContent).toContain('Sam Queue');
    expect(container.textContent).not.toContain("Couldn't load");

    state.failing = true;
    const calls = fetchMock.mock.calls.length;
    await act(async () => { await state.resume?.(); });
    await flush();

    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
    expect(container.textContent).toContain('Sam Queue');
    expect(container.textContent).not.toContain("Couldn't load");
  });

  it('still shows the failure in place when the first load fails', async () => {
    state.failing = true;
    await mount(render());
    expect(container.textContent).toContain("Couldn't load");
  });
});
