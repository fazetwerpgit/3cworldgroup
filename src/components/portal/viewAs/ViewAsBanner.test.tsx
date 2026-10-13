// @vitest-environment jsdom
import { act, createContext, useContext, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  auth: { user: { uid: 'owner-1', role: 'owner', displayName: 'Jacob' } as Record<string, unknown> | null, loading: false },
  push: vi.fn(),
}));

// The real AuthContext pulls in Firebase; a stand-in keeps the same shape the
// view-as code uses (useAuth + AuthSubjectProvider swapping the user).
vi.mock('@/contexts/AuthContext', () => {
  const Ctx = createContext<Record<string, unknown> | null>(null);
  return {
    useAuth: () => useContext(Ctx) ?? fake.auth,
    AuthSubjectProvider: ({ user, children }: { user: Record<string, unknown>; children: ReactNode }) => (
      <Ctx.Provider value={{ ...fake.auth, user }}>{children}</Ctx.Provider>
    ),
  };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: fake.push, replace: vi.fn() }) }));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'owner-token' }));
vi.mock('@/components/portal/admin-d/AdminSheet', () => ({
  AdminSheet: ({ title, children }: { title: string; children: ReactNode }) => (
    <div data-sheet={title}>{children}</div>
  ),
}));

import { useAuth } from '@/contexts/AuthContext';
import { ViewAsProvider, ViewAsScope, useViewAs, useViewAsReadOnly } from '@/contexts/ViewAsContext';
import { VIEW_AS_STORAGE_KEY } from '@/lib/viewAs/storage';
import { ViewAsBanner } from './ViewAsBanner';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOAH = { uid: 'rep-noah', displayName: 'Noah Smith', email: 'noah@x.com', fieldRole: 'entry_rep', avatarUrl: null };

let container: HTMLDivElement;
let root: Root;
const realFetch = window.fetch;
let serverFetch: ReturnType<typeof vi.fn>;

function Probe() {
  const { user } = useAuth() as { user: { uid: string } | null };
  const readOnly = useViewAsReadOnly();
  return <p data-probe>{`${user?.uid}|${readOnly ? 'ro' : 'rw'}`}</p>;
}

function Starter() {
  const { start } = useViewAs();
  return (
    <button type="button" data-start onClick={() => start(NOAH)}>
      start
    </button>
  );
}

async function mount() {
  await act(async () => {
    root.render(
      <ViewAsProvider>
        <Starter />
        <ViewAsBanner />
        <ViewAsScope loading={<p data-probe>loading</p>}>
          <Probe />
        </ViewAsScope>
      </ViewAsProvider>
    );
  });
  await act(async () => {});
}

const probe = () => container.querySelector('[data-probe]')?.textContent;
const banner = () => container.querySelector('[data-slot="view-as-banner"]');
const click = async (el: Element | null | undefined) => {
  await act(async () => {
    (el as HTMLElement).click();
  });
  await act(async () => {});
};
const button = (label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

beforeEach(() => {
  sessionStorage.clear();
  fake.auth = { user: { uid: 'owner-1', role: 'owner', displayName: 'Jacob' }, loading: false };
  fake.push.mockReset();
  serverFetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/portal/view-as?uid=rep-noah')) return Response.json({ rep: NOAH });
    if (url.startsWith('/api/portal/view-as?uid=')) return Response.json({ error: 'Rep not found' }, { status: 404 });
    return Response.json({});
  });
  window.fetch = serverFetch as unknown as typeof fetch;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.fetch = realFetch;
});

describe('view as rep: banner, session and scope', () => {
  it('off by default: no banner, the owner’s own screen', async () => {
    await mount();
    expect(banner()).toBeNull();
    expect(probe()).toBe('owner-1|rw');
  });

  it('start: confirms the rep, shows the banner, renders the screen as the rep, read only', async () => {
    await mount();
    await click(container.querySelector('[data-start]'));

    expect(serverFetch).toHaveBeenCalledWith('/api/portal/view-as?uid=rep-noah', {
      headers: { Authorization: 'Bearer owner-token' },
    });
    expect(banner()?.textContent).toContain('Viewing as Noah S.');
    expect(banner()?.textContent).toContain('· read only');
    expect(button('Exit')).toBeTruthy();
    expect(button('Switch')).toBeTruthy();
    expect(probe()).toBe('rep-noah|ro');
    expect(JSON.parse(sessionStorage.getItem(VIEW_AS_STORAGE_KEY) ?? 'null')).toMatchObject({ uid: 'rep-noah' });

    // The scope tags the screen's reads and refuses its writes.
    await window.fetch('/api/portal/sales');
    const [, init] = serverFetch.mock.calls.at(-1) as [unknown, RequestInit];
    expect(new Headers(init.headers).get('x-view-as')).toBe('rep-noah');
    expect((await window.fetch('/api/portal/sales', { method: 'POST' })).status).toBe(403);
  });

  it('a reload restores the session from sessionStorage', async () => {
    sessionStorage.setItem(VIEW_AS_STORAGE_KEY, JSON.stringify(NOAH));
    await mount();
    expect(banner()?.textContent).toContain('Viewing as Noah S.');
    expect(probe()).toBe('rep-noah|ro');
  });

  it('Exit clears the session, restores fetch and goes back to People', async () => {
    sessionStorage.setItem(VIEW_AS_STORAGE_KEY, JSON.stringify(NOAH));
    await mount();
    await click(button('Exit'));

    expect(banner()).toBeNull();
    expect(sessionStorage.getItem(VIEW_AS_STORAGE_KEY)).toBeNull();
    expect(fake.push).toHaveBeenCalledWith('/portal/admin/people');
    expect(probe()).toBe('owner-1|rw');
    expect(window.fetch).toBe(serverFetch);
  });

  it('a stored session for a non-owner is dropped, with no request made', async () => {
    fake.auth = { user: { uid: 'admin-1', role: 'admin' }, loading: false };
    sessionStorage.setItem(VIEW_AS_STORAGE_KEY, JSON.stringify(NOAH));
    await mount();
    expect(banner()).toBeNull();
    expect(probe()).toBe('admin-1|rw');
    expect(sessionStorage.getItem(VIEW_AS_STORAGE_KEY)).toBeNull();
    expect(serverFetch).not.toHaveBeenCalled();
  });

  it('a rep the server refuses ends the session', async () => {
    sessionStorage.setItem(VIEW_AS_STORAGE_KEY, JSON.stringify({ ...NOAH, uid: 'rep-gone' }));
    await mount();
    expect(banner()).toBeNull();
    expect(sessionStorage.getItem(VIEW_AS_STORAGE_KEY)).toBeNull();
  });
});
