import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  RESUME_HIDDEN_THRESHOLD_MS,
  RESUME_MIN_INTERVAL_MS,
  STALE_LISTENER_MAX_MS,
  STALE_LISTENER_MS,
  STALE_LISTENER_NUDGE_GRACE_MS,
  connectionNotice,
  createStaleListenerWatchdog,
  staleListenerDelay,
  shouldCycleNetwork,
} from './reconnect';

const idle = { hiddenForMs: 0, sinceLastCycleMs: Number.POSITIVE_INFINITY, online: true };

describe('shouldCycleNetwork', () => {
  it('reconnects after a real suspension, not a quick glance away', () => {
    expect(shouldCycleNetwork({ ...idle, reason: 'visible', hiddenForMs: RESUME_HIDDEN_THRESHOLD_MS })).toBe(true);
    expect(shouldCycleNetwork({ ...idle, reason: 'visible', hiddenForMs: RESUME_HIDDEN_THRESHOLD_MS - 1 })).toBe(false);
  });

  it('always reconnects on a back/forward-cache restore', () => {
    expect(shouldCycleNetwork({ ...idle, reason: 'pageshow' })).toBe(true);
  });

  it('never cycles while offline or twice in quick succession', () => {
    expect(shouldCycleNetwork({ ...idle, reason: 'pageshow', online: false })).toBe(false);
    expect(
      shouldCycleNetwork({ ...idle, reason: 'pageshow', sinceLastCycleMs: RESUME_MIN_INTERVAL_MS - 1 })
    ).toBe(false);
  });
});

describe('connectionNotice', () => {
  it('says offline whenever the device is offline', () => {
    expect(connectionNotice({ online: false, fromCache: false, rendered: false })).toBe('offline');
  });

  it('says reconnecting only for a rendered, unconfirmed view', () => {
    expect(connectionNotice({ online: true, fromCache: true, rendered: true })).toBe('reconnecting');
    expect(connectionNotice({ online: true, fromCache: true, rendered: false })).toBeNull();
    expect(connectionNotice({ online: true, fromCache: false, rendered: true })).toBeNull();
  });
});

describe('createStaleListenerWatchdog', () => {
  let online = true;
  let visible = true;
  let resubscribe: ReturnType<typeof vi.fn<() => void>>;
  const make = () =>
    createStaleListenerWatchdog({ resubscribe, online: () => online, visible: () => visible });

  beforeEach(() => {
    vi.useFakeTimers();
    online = true;
    visible = true;
    resubscribe = vi.fn<() => void>();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resubscribes once a cache-only view outlasts STALE_LISTENER_MS', () => {
    const w = make();
    w.update(true);
    vi.advanceTimersByTime(STALE_LISTENER_MS - 1);
    expect(resubscribe).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(resubscribe).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the server confirms in time', () => {
    const w = make();
    w.update(true);
    vi.advanceTimersByTime(STALE_LISTENER_MS / 2);
    w.update(false);
    vi.advanceTimersByTime(STALE_LISTENER_MAX_MS * 4);
    expect(resubscribe).not.toHaveBeenCalled();
  });

  it('backs off between attempts while it stays stale, capped', () => {
    const w = make();
    w.update(true);
    vi.advanceTimersByTime(STALE_LISTENER_MS);
    expect(resubscribe).toHaveBeenCalledTimes(1);
    // The new listener's first snapshot is from the cache again: no reset.
    w.update(true);
    vi.advanceTimersByTime(STALE_LISTENER_MS * 2 - 1);
    expect(resubscribe).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(resubscribe).toHaveBeenCalledTimes(2);
    expect(staleListenerDelay(30)).toBe(STALE_LISTENER_MAX_MS);
    // An hour stale stays far from a tight loop.
    vi.advanceTimersByTime(60 * 60_000);
    expect(resubscribe.mock.calls.length).toBeLessThan(70);
  });

  it('resets the backoff once the server confirms', () => {
    const w = make();
    w.update(true);
    vi.advanceTimersByTime(STALE_LISTENER_MS);
    w.update(false);
    w.update(true);
    vi.advanceTimersByTime(STALE_LISTENER_MS);
    expect(resubscribe).toHaveBeenCalledTimes(2);
  });

  it('waits while offline or hidden, then recovers shortly after a nudge', () => {
    const w = make();
    online = false;
    w.update(true);
    vi.advanceTimersByTime(STALE_LISTENER_MAX_MS * 2);
    expect(resubscribe).not.toHaveBeenCalled();
    online = true;
    w.nudge();
    vi.advanceTimersByTime(STALE_LISTENER_NUDGE_GRACE_MS - 1);
    expect(resubscribe).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(resubscribe).toHaveBeenCalledTimes(1);

    visible = false;
    w.nudge();
    vi.advanceTimersByTime(STALE_LISTENER_MAX_MS * 2);
    // The scheduled backoff fired while hidden and did nothing.
    expect(resubscribe).toHaveBeenCalledTimes(1);
  });

  it('ignores nudges when not stale, and stops after dispose', () => {
    const w = make();
    w.nudge();
    vi.advanceTimersByTime(STALE_LISTENER_NUDGE_GRACE_MS);
    expect(resubscribe).not.toHaveBeenCalled();
    w.update(true);
    w.dispose();
    vi.advanceTimersByTime(STALE_LISTENER_MAX_MS);
    expect(resubscribe).not.toHaveBeenCalled();
  });
});
