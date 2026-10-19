// @vitest-environment jsdom
//
// The 30s poll and an action's own reload can overlap. Only the most recently
// started load may write, so a slow pre-dismiss poll can't bring the task back.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A stable user, like the real context: a new object per render would re-run load().
const authState = vi.hoisted(() => ({ user: { uid: 'mgr-1' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'token' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import ActionQueue from './ActionQueue';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const task = {
  id: 't1',
  kind: 'onboarding_docs',
  subjectUserId: 'rep-1',
  subjectName: 'Rep One',
  title: 'Docs in',
  message: 'Docs ready for review',
  link: '/portal/admin/onboarding',
  status: 'open',
  createdAt: null,
};

type Pending = { url: string; resolve: (body: unknown, status?: number) => void };

let container: HTMLDivElement;
let root: Root;
let pending: Pending[];

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Each fetch waits until the test resolves it, so responses can arrive out of order.
function deferredFetch() {
  return vi.fn((url: string) => {
    return new Promise<Response>((resolve) => {
      pending.push({ url, resolve: (body, status) => resolve(respond(body, status)) });
    });
  });
}

const flush = () => act(async () => {
  for (let i = 0; i < 10; i += 1) await vi.advanceTimersByTimeAsync(0);
});

function take(url: string): Pending {
  const index = pending.findIndex((p) => p.url === url);
  if (index < 0) throw new Error(`no pending fetch for ${url}`);
  return pending.splice(index, 1)[0];
}

beforeEach(() => {
  vi.useFakeTimers();
  pending = [];
  vi.stubGlobal('fetch', deferredFetch());
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ActionQueue load ordering', () => {
  it('a stale poll that lands after the dismiss reload does not bring the task back', async () => {
    await act(async () => root.render(<ActionQueue />));
    await flush();
    take('/api/portal/alerts').resolve({ tasks: [task] });
    await flush();
    expect(container.textContent).toContain('Rep One');

    // The poll fires and its snapshot (taken before the dismiss) is slow.
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    await flush();
    const stalePoll = take('/api/portal/alerts');

    // The manager dismisses; the dismiss's own reload comes back first, task gone.
    const dismiss = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Dismiss'
    )!;
    await act(async () => dismiss.click());
    await flush();
    take('/api/portal/alerts/dismiss').resolve({ ok: true });
    await flush();
    take('/api/portal/alerts').resolve({ tasks: [] });
    await flush();
    expect(container.textContent).not.toContain('Rep One');

    // Then the slow poll lands with its pre-dismiss snapshot.
    stalePoll.resolve({ tasks: [task] });
    await flush();
    expect(container.textContent).not.toContain('Rep One');
    expect(pending).toHaveLength(0);
  });

  it('a stale failed load does not mark an empty queue as failed after a newer success', async () => {
    await act(async () => root.render(<ActionQueue />));
    await flush();
    const first = take('/api/portal/alerts');

    await act(async () => vi.advanceTimersByTimeAsync(30000));
    await flush();
    take('/api/portal/alerts').resolve({ tasks: [] });
    await flush();
    expect(container.textContent).not.toContain("Couldn't load");

    first.resolve({ error: 'boom' }, 500);
    await flush();
    expect(container.textContent).not.toContain("Couldn't load");
  });
});
