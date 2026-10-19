import { beforeEach, describe, expect, it, vi } from 'vitest';

const rebuild = vi.hoisted(() => vi.fn());
const recorded = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('@/lib/firebase/admin', () => ({ adminDb: { marker: true } }));
vi.mock('@/lib/leaderboard/snapshotStore', () => ({ rebuildLeaderboardSnapshot: rebuild }));
vi.mock('@/lib/cron/runLog', () => ({
  withCronRun: async (_db: unknown, job: string, _req: Request, body: () => Promise<unknown>) => {
    try {
      const summary = await body();
      recorded.push({ job, ok: true, summary });
      return summary;
    } catch (error) {
      recorded.push({ job, ok: false });
      throw error;
    }
  },
}));

import { GET } from './route';

function call(auth = 'Bearer s3cret') {
  return GET(new Request('http://localhost/api/cron/leaderboard-snapshot', { headers: { authorization: auth } }));
}

beforeEach(() => {
  process.env.CRON_SECRET = 's3cret';
  rebuild.mockReset();
  recorded.length = 0;
});

describe('GET /api/cron/leaderboard-snapshot', () => {
  it('refuses without the cron secret', async () => {
    expect((await call('Bearer nope')).status).toBe(401);
    expect(rebuild).not.toHaveBeenCalled();
  });

  it('rebuilds the snapshot and records the run', async () => {
    rebuild.mockResolvedValue({ periods: { a: {}, b: {} }, months: ['2026-10'] });
    const res = await call();
    expect(await res.json()).toEqual({ ok: true, periods: 2, months: 1 });
    expect(recorded).toEqual([{ job: 'leaderboard-snapshot', ok: true, summary: { ok: true, periods: 2, months: 1 } }]);
  });

  it('answers 500 and records a failed run when the rebuild throws', async () => {
    rebuild.mockRejectedValue(new Error('boom'));
    const res = await call();
    expect(res.status).toBe(500);
    expect(recorded).toEqual([{ job: 'leaderboard-snapshot', ok: false }]);
  });
});
