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
type RawSnapshot = { docs: SnapshotDoc[]; metadata: { fromCache: boolean }; docChanges: () => SnapshotDoc[] };
type Listener = {
  limit: number;
  fail: (err: { code?: string }) => void;
  next: (snapshot: { docs: SnapshotDoc[] }) => void;
  raw: (snapshot: RawSnapshot) => void;
};

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
      _options: { includeMetadataChanges?: boolean },
      next: (snapshot: RawSnapshot) => void,
      error: (err: { code?: string }) => void
    ) => {
      // Tests hand over plain { docs }; every doc counts as a change.
      listeners.push({
        limit: q.__limit,
        fail: error,
        next: ({ docs }) => next({ docs, metadata: { fromCache: false }, docChanges: () => docs }),
        raw: next,
      });
      return () => {};
    }
  ),
  Timestamp: class {},
}));

import { MAX_WINDOW, RETRY_BASE_MS, messagesRetryDelay, useMessages } from './useMessages';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ channelId, followingLatest }: { channelId: string | null; followingLatest?: boolean }) {
  const { messages, loading, error, fromCache, snapshotVersion, historyCapped, loadOlder } = useMessages(channelId, {
    followingLatest,
  });
  return (
    <div>
      <span data-testid="error">{error}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="count">{String(messages.length)}</span>
      <span data-testid="fromCache">{String(fromCache)}</span>
      <span data-testid="version">{String(snapshotVersion)}</span>
      <span data-testid="capped">{String(historyCapped)}</span>
      <button type="button" onClick={loadOlder}>
        Older
      </button>
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
    // A reader scrolled up into history: the eviction guard widens the window.
    act(() => root.render(<Probe channelId="c1" followingLatest={false} />));
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

describe('useMessages connection metadata', () => {
  it('reports fromCache from metadata-only snapshots without re-committing the window', () => {
    act(() => root.render(<Probe channelId="c1" />));
    const docs = makeDocs(3, 10_000);
    act(() => listeners[0].next({ docs }));
    const text = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent;
    expect(text('version')).toBe('1');
    expect(text('fromCache')).toBe('false');

    // The app resumed and the stream is being rebuilt: same docs, no changes.
    act(() => listeners[0].raw({ docs, metadata: { fromCache: true }, docChanges: () => [] }));
    expect(text('fromCache')).toBe('true');
    expect(text('version')).toBe('1');
    expect(text('count')).toBe('3');

    act(() => listeners[0].raw({ docs, metadata: { fromCache: false }, docChanges: () => [] }));
    expect(text('fromCache')).toBe('false');
    expect(text('version')).toBe('1');
  });
});

describe('useMessages history cap', () => {
  it('flags when the window reaches MAX_WINDOW with older history left', () => {
    const text = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent;
    act(() => root.render(<Probe channelId="c1" />));
    // Each wider window reaches further back (older floor), so no eviction growth fires.
    const feed = () => {
      const latest = listeners[listeners.length - 1];
      act(() => latest.next({ docs: makeDocs(latest.limit, 1_000_000 - latest.limit * 1000) }));
    };
    feed();
    while (listeners[listeners.length - 1].limit < MAX_WINDOW) {
      expect(text('capped')).toBe('false');
      act(() => container.querySelector('button')?.click());
      feed();
    }
    expect(text('count')).toBe(String(MAX_WINDOW));
    expect(text('capped')).toBe('true');
  });
});

describe('useMessages eviction guard vs. a reader at the bottom', () => {
  const text = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent;
  const first = () => container.querySelector('[data-testid="first"]')?.textContent;

  function FirstProbe({ followingLatest }: { followingLatest: boolean }) {
    const { messages, snapshotVersion } = useMessages('c1', { followingLatest });
    return (
      <div>
        <span data-testid="count">{String(messages.length)}</span>
        <span data-testid="version">{String(snapshotVersion)}</span>
        <span data-testid="first">{messages[0]?.id ?? ''}</span>
      </div>
    );
  }

  it('commits a new message that slides the full window without re-subscribing', () => {
    act(() => root.render(<FirstProbe followingLatest />));
    act(() => listeners[0].next({ docs: makeDocs(75, 10_000) }));
    expect(first()).toBe('m10000');

    // One new message: the limit(75) window drops its oldest doc.
    act(() => listeners[0].next({ docs: makeDocs(75, 11_000) }));

    expect(listeners).toHaveLength(1);
    expect(text('count')).toBe('75');
    expect(text('version')).toBe('2');
    expect(first()).toBe('m11000');

    // And again: still the same listener, never widening.
    act(() => listeners[0].next({ docs: makeDocs(75, 12_000) }));
    expect(listeners).toHaveLength(1);
    expect(text('version')).toBe('3');
  });

  it('widens once the reader scrolls up, and slides again back at the bottom', () => {
    act(() => root.render(<FirstProbe followingLatest />));
    act(() => listeners[0].next({ docs: makeDocs(75, 10_000) }));

    act(() => root.render(<FirstProbe followingLatest={false} />));
    act(() => listeners[0].next({ docs: makeDocs(75, 11_000) }));
    // Skipped commit + wider resubscribe: the history they're reading stays.
    expect(listeners).toHaveLength(2);
    expect(listeners[1].limit).toBe(100);
    expect(text('version')).toBe('1');
    expect(first()).toBe('m10000');

    act(() => listeners[1].next({ docs: makeDocs(100, 10_000 - 24_000) }));
    expect(text('count')).toBe('100');

    act(() => root.render(<FirstProbe followingLatest />));
    act(() => listeners[1].next({ docs: makeDocs(100, 10_000 - 23_000) }));
    expect(listeners).toHaveLength(2);
    expect(text('count')).toBe('100');
  });
});

describe('useMessages deselect', () => {
  it('empties the thread when the channel is cleared', () => {
    act(() => root.render(<Probe channelId="c1" />));
    act(() => listeners[0].next({ docs: makeDocs(5, 10_000) }));
    expect(readProbe()).toEqual({ loading: 'false', count: '5' });

    act(() => root.render(<Probe channelId={null} />));
    expect(readProbe()).toEqual({ loading: 'false', count: '0' });
  });
});

describe('useMessages listener recovery', () => {
  const errorText = () => container.querySelector('[data-testid="error"]')?.textContent;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resubscribes with backoff after a failure and clears the error once it recovers', () => {
    act(() => root.render(<Probe channelId="c1" />));
    act(() => listeners[0].fail({ code: 'unavailable' }));
    expect(errorText()).toBe('Failed to load live messages');

    act(() => vi.advanceTimersByTime(RETRY_BASE_MS - 1));
    expect(listeners).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(listeners).toHaveLength(2);

    // A second failure waits twice as long.
    act(() => listeners[1].fail({ code: 'unavailable' }));
    act(() => vi.advanceTimersByTime(RETRY_BASE_MS * 2 - 1));
    expect(listeners).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(listeners).toHaveLength(3);

    act(() => listeners[2].next({ docs: makeDocs(3, 10_000) }));
    expect(errorText()).toBe('');
    expect(readProbe()).toEqual({ loading: 'false', count: '3' });
  });

  it('resubscribes at once when the device comes back online', () => {
    act(() => root.render(<Probe channelId="c1" />));
    act(() => listeners[0].fail({ code: 'unavailable' }));
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(listeners).toHaveLength(2);
    // The pending backoff timer was dropped with the old listener.
    act(() => vi.advanceTimersByTime(RETRY_BASE_MS * 4));
    expect(listeners).toHaveLength(2);
  });

  it('waits out the slower backoff on permission-denied, even when back in the foreground', () => {
    act(() => root.render(<Probe channelId="c1" />));
    act(() => listeners[0].fail({ code: 'permission-denied' }));
    act(() => {
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(listeners).toHaveLength(1);
    act(() => vi.advanceTimersByTime(messagesRetryDelay(0, true)));
    expect(listeners).toHaveLength(2);
  });

  it('caps the backoff', () => {
    expect(messagesRetryDelay(20, false)).toBe(30000);
    expect(messagesRetryDelay(20, true)).toBe(30000);
  });
});
