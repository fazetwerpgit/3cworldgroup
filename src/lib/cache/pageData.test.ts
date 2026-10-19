import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdPageData, isPageDataPending, resetPageData, waitForPageData } from './pageData';

beforeEach(() => {
  vi.useFakeTimers();
  resetPageData();
});
afterEach(() => vi.useRealTimers());

function settled(promise: Promise<void>) {
  let done = false;
  void promise.then(() => (done = true));
  return () => done;
}

describe('waitForPageData', () => {
  it('waits for a held page load, not the fallback timer', async () => {
    const release = holdPageData();
    const done = settled(waitForPageData({ fallbackMs: 2000 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(done()).toBe(false);
    expect(isPageDataPending()).toBe(true);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(true);
  });

  it('falls back to the timer on a page that never holds', async () => {
    const done = settled(waitForPageData({ fallbackMs: 2000 }));
    await vi.advanceTimersByTimeAsync(1999);
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done()).toBe(true);
  });

  it('never waits past maxMs', async () => {
    holdPageData();
    const done = settled(waitForPageData({ fallbackMs: 2000, maxMs: 8000 }));
    await vi.advanceTimersByTimeAsync(8000);
    expect(done()).toBe(true);
  });

  it('resolves at once when the page just landed, and release is idempotent', async () => {
    const release = holdPageData();
    holdPageData()();
    release();
    release();
    expect(isPageDataPending()).toBe(false);
    const done = settled(waitForPageData({ fallbackMs: 2000 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(true);
  });

  it('an aborted wait never resolves', async () => {
    const controller = new AbortController();
    const done = settled(waitForPageData({ fallbackMs: 100, signal: controller.signal }));
    controller.abort();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(done()).toBe(false);
  });
});
