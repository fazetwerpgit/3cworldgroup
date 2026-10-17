import { describe, expect, it } from 'vitest';
import { ALERT_WINDOW_MS, BLOCKS_PER_DAY, blockQuotaDecision, throttleDecision } from './moderationLimits';

describe('throttleDecision', () => {
  it('sends the first alert, folds the next ones inside the window, then reports them', () => {
    const t0 = 1_000_000;
    const first = throttleDecision(undefined, t0);
    expect(first).toMatchObject({ send: true, folded: 0 });

    const second = throttleDecision(first.next, t0 + 60_000);
    expect(second.send).toBe(false);
    const third = throttleDecision(second.next, t0 + 120_000);
    expect(third.send).toBe(false);
    expect(third.next.alertSuppressed).toBe(2);

    const later = throttleDecision(third.next, t0 + ALERT_WINDOW_MS);
    expect(later).toMatchObject({ send: true, folded: 2, next: { alertLastSentAt: t0 + ALERT_WINDOW_MS, alertSuppressed: 0 } });
  });

  it('keeps the window anchored on the last sent alert, not the folded ones', () => {
    const t0 = 5_000_000;
    let state = throttleDecision(undefined, t0).next;
    state = throttleDecision(state, t0 + ALERT_WINDOW_MS - 1).next;
    expect(throttleDecision(state, t0 + ALERT_WINDOW_MS).send).toBe(true);
  });
});

describe('blockQuotaDecision', () => {
  const noon = Date.UTC(2026, 9, 17, 12);

  it(`allows ${BLOCKS_PER_DAY} blocks a day, then refuses until the next day`, () => {
    let state = undefined as ReturnType<typeof blockQuotaDecision>['next'] | undefined;
    for (let i = 0; i < BLOCKS_PER_DAY; i += 1) {
      const decision = blockQuotaDecision(state, noon);
      expect(decision.allowed).toBe(true);
      state = decision.next;
    }
    expect(blockQuotaDecision(state, noon).allowed).toBe(false);
    expect(blockQuotaDecision(state, noon + 24 * 3_600_000)).toEqual({ allowed: true, next: { blockDay: '2026-10-18', blockCount: 1 } });
  });
});
