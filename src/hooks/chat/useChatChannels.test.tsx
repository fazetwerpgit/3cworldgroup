// @vitest-environment jsdom
//
// useChatChannels must show a skeleton (loading) until the first snapshot, not
// a flash of "No channels yet", and a listener failure after channels loaded
// must surface as an error while keeping the stale list. retry() resubscribes.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SnapshotDoc = { id: string; data: () => Record<string, unknown> };
type Listener = { next: (snapshot: { docs: SnapshotDoc[] }) => void; fail: (error: Error) => void };

const listeners: Listener[] = [];
const auth: { user: { uid: string; status: string } | null; loading: boolean } = {
  user: { uid: 'me', status: 'active' },
  loading: false,
};

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  onSnapshot: vi.fn(
    (_q: unknown, next: Listener['next'], fail: Listener['fail']) => {
      listeners.push({ next, fail });
      return () => {};
    }
  ),
  Timestamp: class {},
}));

import { useChatChannels } from './useChatChannels';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const state = useChatChannels();
  return (
    <div>
      <span data-testid="loading">{String(state.loading)}</span>
      <span data-testid="count">{String(state.channels.length)}</span>
      <span data-testid="error">{state.error}</span>
      <button type="button" onClick={state.retry}>
        Retry
      </button>
    </div>
  );
}

function doc(id: string): SnapshotDoc {
  return { id, data: () => ({ name: id, order: 1, active: true, memberIds: ['me'] }) };
}

let container: HTMLDivElement;
let root: Root;

function read() {
  const text = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent;
  return { loading: text('loading'), count: text('count'), error: text('error') };
}

beforeEach(() => {
  listeners.length = 0;
  auth.user = { uid: 'me', status: 'active' };
  auth.loading = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('useChatChannels', () => {
  it('is loading until the first snapshot, then shows the list (or a real empty state)', () => {
    act(() => root.render(<Probe />));
    expect(read()).toEqual({ loading: 'true', count: '0', error: '' });

    act(() => listeners[0].next({ docs: [] }));
    expect(read()).toEqual({ loading: 'false', count: '0', error: '' });
  });

  it('stays loading while auth is still resolving', () => {
    auth.user = null;
    auth.loading = true;
    act(() => root.render(<Probe />));
    expect(read().loading).toBe('true');
    expect(listeners).toHaveLength(0);
  });

  it('keeps the stale list alongside the error when the listener fails', () => {
    act(() => root.render(<Probe />));
    act(() => listeners[0].next({ docs: [doc('all-company'), doc('sales')] }));
    act(() => listeners[0].fail(new Error('unavailable')));
    expect(read()).toEqual({ loading: 'false', count: '2', error: 'Failed to load live channels' });
  });

  it('retry resubscribes and clears the error without dropping the list', () => {
    act(() => root.render(<Probe />));
    act(() => listeners[0].next({ docs: [doc('all-company')] }));
    act(() => listeners[0].fail(new Error('unavailable')));

    act(() => container.querySelector('button')?.click());
    expect(listeners).toHaveLength(2);
    expect(read()).toEqual({ loading: 'false', count: '1', error: '' });

    act(() => listeners[1].next({ docs: [doc('all-company'), doc('sales')] }));
    expect(read().count).toBe('2');
  });

  it('a first-load failure is an error, not an endless skeleton', () => {
    act(() => root.render(<Probe />));
    act(() => listeners[0].fail(new Error('permission-denied')));
    expect(read()).toEqual({ loading: 'false', count: '0', error: 'Failed to load live channels' });
  });
});
