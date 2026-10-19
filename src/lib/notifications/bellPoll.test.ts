import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BELL_MAX_POLL_MS, BELL_POLL_MS, startBellPoller } from './bellPoll';

function fakeDoc(initial: 'visible' | 'hidden' = 'visible') {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: initial as DocumentVisibilityState,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    set(state: 'visible' | 'hidden') {
      doc.visibilityState = state;
      listeners.forEach((fn) => fn());
    },
    listeners,
  };
  return doc;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('startBellPoller', () => {
  it('polls now, then every 90 s (not 30 s)', async () => {
    const tick = vi.fn(async () => true);
    const doc = fakeDoc();
    const stop = startBellPoller({ tick, doc: doc as never, now: () => Date.now() });
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(BELL_POLL_MS - 30_000);
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
  });

  it('does not poll while the page is hidden, and refreshes once on return', async () => {
    const tick = vi.fn(async () => true);
    const doc = fakeDoc();
    const stop = startBellPoller({ tick, doc: doc as never, now: () => Date.now() });
    await vi.advanceTimersByTimeAsync(0);
    doc.set('hidden');
    await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000); // a background tab all day
    expect(tick).toHaveBeenCalledTimes(1);
    doc.set('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(BELL_POLL_MS);
    expect(tick).toHaveBeenCalledTimes(3);
    stop();
  });

  it('starting hidden does not poll until visible', async () => {
    const tick = vi.fn(async () => true);
    const doc = fakeDoc('hidden');
    const stop = startBellPoller({ tick, doc: doc as never, now: () => Date.now() });
    await vi.advanceTimersByTimeAsync(10 * BELL_POLL_MS);
    expect(tick).not.toHaveBeenCalled();
    doc.set('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(1);
    stop();
  });

  it('backs off to 120 s after a failed poll', async () => {
    const tick = vi.fn(async () => false);
    const stop = startBellPoller({ tick, doc: fakeDoc() as never, now: () => Date.now() });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(BELL_POLL_MS);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(BELL_MAX_POLL_MS - BELL_POLL_MS);
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
  });

  it('a throwing tick backs off instead of stopping', async () => {
    const tick = vi.fn(async () => {
      throw new Error('offline');
    });
    const stop = startBellPoller({ tick, doc: fakeDoc() as never, now: () => Date.now() });
    await vi.advanceTimersByTimeAsync(BELL_MAX_POLL_MS);
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
  });

  it('stop() ends polling and removes the listener', async () => {
    const tick = vi.fn(async () => true);
    const doc = fakeDoc();
    const stop = startBellPoller({ tick, doc: doc as never, now: () => Date.now() });
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(10 * BELL_POLL_MS);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(doc.listeners.size).toBe(0);
  });
});
