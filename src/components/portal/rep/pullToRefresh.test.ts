import { describe, expect, it } from 'vitest';
import { PULL_MAX, PULL_THRESHOLD, pullDistance, pullProgress, readPullIntent, shouldRefresh } from './pullToRefresh';

describe('pullDistance', () => {
  it('is 0 for no travel or an upward one', () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(-40)).toBe(0);
  });

  it('damps the travel and never passes the max', () => {
    expect(pullDistance(40)).toBeLessThan(40);
    expect(pullDistance(40)).toBeGreaterThan(25);
    expect(pullDistance(2000)).toBeLessThanOrEqual(PULL_MAX);
  });

  it('grows with the travel', () => {
    expect(pullDistance(120)).toBeGreaterThan(pullDistance(80));
  });
});

describe('the refresh threshold', () => {
  it('needs about 110px of finger travel', () => {
    expect(shouldRefresh(pullDistance(100))).toBe(false);
    expect(shouldRefresh(pullDistance(115))).toBe(true);
  });

  it('refreshes at the threshold and past it, not short of it', () => {
    expect(shouldRefresh(PULL_THRESHOLD - 1)).toBe(false);
    expect(shouldRefresh(PULL_THRESHOLD)).toBe(true);
  });

  it('reports progress toward it, capped at 1', () => {
    expect(pullProgress(0)).toBe(0);
    expect(pullProgress(PULL_THRESHOLD / 2)).toBe(0.5);
    expect(pullProgress(PULL_MAX)).toBe(1);
  });
});

describe('readPullIntent', () => {
  it('waits until the finger has travelled far enough', () => {
    expect(readPullIntent(2, 5)).toBeNull();
  });

  it('reads a mostly-downward move as a pull', () => {
    expect(readPullIntent(3, 12)).toBe('pull');
  });

  it('leaves upward and sideways moves to the scroller', () => {
    expect(readPullIntent(0, -12)).toBe('scroll');
    expect(readPullIntent(20, 10)).toBe('scroll');
  });
});
