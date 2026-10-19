import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// takeAlertSlot / takeBlockSlot against an in-memory chatModerationLimits
// collection, run through a fake Firestore transaction.

const state = vi.hoisted(() => ({
  db: null as unknown,
  docs: new Map<string, Record<string, unknown>>(),
  failNext: false,
}));

vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return state.db;
  },
}));

import { ALERT_WINDOW_MS, BLOCKS_PER_DAY, takeAlertSlot, takeBlockSlot } from './moderationLimits';

const writes: Array<{ path: string; data: Record<string, unknown>; options: unknown }> = [];

function fakeDb() {
  return {
    collection: (name: string) => ({
      doc: (id: string) => ({ path: `${name}/${id}` }),
    }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      if (state.failNext) {
        state.failNext = false;
        throw new Error('ABORTED: too much contention');
      }
      const pending: typeof writes = [];
      const tx = {
        get: async (ref: { path: string }) => {
          const data = state.docs.get(ref.path);
          return { exists: data !== undefined, data: () => data };
        },
        set: (ref: { path: string }, data: Record<string, unknown>, options: unknown) => {
          pending.push({ path: ref.path, data, options });
        },
      };
      const result = await fn(tx);
      for (const w of pending) {
        state.docs.set(w.path, { ...(state.docs.get(w.path) ?? {}), ...w.data });
        writes.push(w);
      }
      return result;
    },
  };
}

beforeEach(() => {
  state.docs = new Map();
  state.failNext = false;
  state.db = fakeDb();
  writes.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('takeAlertSlot', () => {
  const t0 = Date.UTC(2026, 9, 17, 12);

  it('sends the first alert, folds the ones inside the window, and reports the fold on the next send', async () => {
    expect(await takeAlertSlot('a1', t0)).toEqual({ send: true, folded: 0 });
    expect(await takeAlertSlot('a1', t0 + 1_000)).toEqual({ send: false, folded: 0 });
    expect(await takeAlertSlot('a1', t0 + 2_000)).toEqual({ send: false, folded: 0 });
    expect(state.docs.get('chatModerationLimits/a1')).toEqual({ alertLastSentAt: t0, alertSuppressed: 2 });
    expect(await takeAlertSlot('a1', t0 + ALERT_WINDOW_MS)).toEqual({ send: true, folded: 2 });
    expect(state.docs.get('chatModerationLimits/a1')).toEqual({ alertLastSentAt: t0 + ALERT_WINDOW_MS, alertSuppressed: 0 });
  });

  it('keeps each actor on a window of their own, and merges into the doc (block fields kept)', async () => {
    state.docs.set('chatModerationLimits/a1', { blockDay: '2026-10-17', blockCount: 3 });
    await takeAlertSlot('a1', t0);
    expect(await takeAlertSlot('a2', t0 + 1)).toEqual({ send: true, folded: 0 });
    expect(writes.every((w) => (w.options as { merge?: boolean }).merge === true)).toBe(true);
    expect(state.docs.get('chatModerationLimits/a1')).toMatchObject({ blockDay: '2026-10-17', blockCount: 3, alertLastSentAt: t0 });
  });

  it('fails open: sends when there is no Admin SDK or the transaction fails', async () => {
    state.db = null;
    expect(await takeAlertSlot('a1', t0)).toEqual({ send: true, folded: 0 });
    state.db = fakeDb();
    await takeAlertSlot('a1', t0);
    state.failNext = true;
    expect(await takeAlertSlot('a1', t0 + 1)).toEqual({ send: true, folded: 0 });
    expect(console.error).toHaveBeenCalled();
  });
});

describe('takeBlockSlot', () => {
  const noon = Date.UTC(2026, 9, 17, 12);

  it(`allows ${BLOCKS_PER_DAY} blocks a UTC day, then refuses without writing, and resets the next day`, async () => {
    for (let i = 0; i < BLOCKS_PER_DAY; i += 1) expect(await takeBlockSlot('u1', noon + i)).toBe(true);
    expect(state.docs.get('chatModerationLimits/u1')).toEqual({ blockDay: '2026-10-17', blockCount: BLOCKS_PER_DAY });
    const writesBefore = writes.length;
    expect(await takeBlockSlot('u1', noon + 1_000)).toBe(false);
    expect(writes.length).toBe(writesBefore);
    expect(await takeBlockSlot('u1', Date.UTC(2026, 9, 18, 0, 0, 1))).toBe(true);
    expect(state.docs.get('chatModerationLimits/u1')).toEqual({ blockDay: '2026-10-18', blockCount: 1 });
  });

  it('fails open: allows the block when there is no Admin SDK or the transaction fails', async () => {
    state.docs.set('chatModerationLimits/u1', { blockDay: '2026-10-17', blockCount: BLOCKS_PER_DAY });
    state.failNext = true;
    expect(await takeBlockSlot('u1', noon)).toBe(true);
    state.db = null;
    expect(await takeBlockSlot('u1', noon)).toBe(true);
  });
});
