// @vitest-environment jsdom
//
// Covers the loading/blank behavior of useMessages' sliding window. The
// original bug: EVERY resubscribe (including silent eviction growths, which
// fire on each new incoming message once a channel holds a full window) set
// loading=true, and both thread UIs unmount the entire message list while
// loading — collapsing the scroller and clamping scrollTop to 0. On an
// iPhone with the keyboard open the reader is not "pinned", so nothing
// scrolls back down: the chat jumps to the top mid-typing. The fix keeps the
// current list rendered across same-channel growths; only a channel switch
// may blank the thread.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SnapshotDoc = { id: string; data: () => Record<string, unknown> };
type Listener = { limit: number; next: (snapshot: { docs: SnapshotDoc[] }) => void };

const listeners: Listener[] = [];

vi.mock('@/lib/firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'me' } },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn((n: number) => ({ __limit: n })),
  query: vi.fn((_c: unknown, _o: unknown, l: { __limit: number }) => ({ __limit: l.__limit })),
  onSnapshot: vi.fn(
    (
      q: { __limit: number },
      next: Listener['next']
    ) => {
      listeners.push({ limit: q.__limit, next });
      return () => {};
    }
  ),
  Timestamp: class {},
}));

import { useMessages } from './useMessages';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ channelId }: { channelId: string | null }) {
  const { messages, loading } = useMessages(channelId);
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="count">{String(messages.length)}</span>
    </div>
  );
}

// Docs arrive newest-first (orderBy createdAt desc). oldestMs anchors the
// oldest doc; each doc is 1s apart.
function makeDocs(count: number, oldestMs: number): SnapshotDoc[] {
  return Array.from({ length: count }, (_, i) => {
    const ms = oldestMs + (count - 1 - i) * 1000;
    return {
      id: `m${ms}`,
      data: () => ({
        text: `msg ${ms}`,
        authorId: 'a1',
        authorName: 'A',
        createdAt: { toDate: () => new Date(ms) },
      }),
    };
  });
}

let container: HTMLDivElement;
let root: Root;

function readProbe() {
  return {
    loading: container.querySelector('[data-testid="loading"]')?.textContent,
    count: container.querySelector('[data-testid="count"]')?.textContent,
  };
}

beforeEach(() => {
  listeners.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useMessages loading behavior', () => {
  it('shows loading only until the first snapshot of a channel commits', () => {
    act(() => root.render(<Probe channelId="c1" />));
    expect(listeners).toHaveLength(1);
    expect(listeners[0].limit).toBe(75);
    expect(readProbe().loading).toBe('true');

    act(() => listeners[0].next({ docs: makeDocs(75, 10_000) }));
    expect(readProbe()).toEqual({ loading: 'false', count: '75' });
  });

  it('keeps the current list rendered (loading=false) across an eviction growth', () => {
    act(() => root.render(<Probe channelId="c1" />));
    act(() => listeners[0].next({ docs: makeDocs(75, 10_000) }));
    expect(readProbe()).toEqual({ loading: 'false', count: '75' });

    // A new message slides the limit(75) window: its oldest doc is now NEWER
    // than the previously delivered floor -> the eviction guard grows the
    // window and skips the commit, triggering a resubscribe at limit 100.
    act(() => listeners[0].next({ docs: makeDocs(75, 11_000) }));
    expect(listeners).toHaveLength(2);
    expect(listeners[1].limit).toBe(100);

    // THE BUG: this gap between resubscribe and the wider snapshot used to
    // blank the thread (loading=true unmounts the list, scrollTop clamps to 0).
    expect(readProbe()).toEqual({ loading: 'false', count: '75' });

    // The wider snapshot commits normally.
    act(() => listeners[1].next({ docs: makeDocs(100, 9_000) }));
    expect(readProbe()).toEqual({ loading: 'false', count: '100' });
  });

  it('shows loading again on a channel switch', () => {
    act(() => root.render(<Probe channelId="c1" />));
    act(() => listeners[0].next({ docs: makeDocs(75, 10_000) }));
    expect(readProbe()).toEqual({ loading: 'false', count: '75' });

    act(() => root.render(<Probe channelId="c2" />));
    const latest = listeners[listeners.length - 1];
    expect(latest.limit).toBe(75);
    expect(readProbe().loading).toBe('true');

    act(() => latest.next({ docs: makeDocs(10, 50_000) }));
    expect(readProbe()).toEqual({ loading: 'false', count: '10' });
  });
});
