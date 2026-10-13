import { beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ db: {} as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return holder.db;
  },
}));

const runSearchStats = vi.hoisted(() => vi.fn(async () => ({ ok: false, error: 'no_access', dryRun: false })));
vi.mock('@/lib/search/searchStats', () => ({ runSearchStats }));

import { GET } from './route';

const SECRET = 'test-cron-secret';
const request = (auth = `Bearer ${SECRET}`) =>
  new Request('http://localhost/api/cron/search-stats', { headers: { authorization: auth } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  holder.db = {};
});

describe('GET /api/cron/search-stats', () => {
  it('turns away a caller without the cron secret', async () => {
    const response = await GET(request('Bearer wrong'));
    expect(response.status).toBe(401);
    expect(runSearchStats).not.toHaveBeenCalled();
  });

  it('runs and reports the outcome', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: false, error: 'no_access', dryRun: false });
    expect(runSearchStats).toHaveBeenCalledWith(expect.objectContaining({ db: holder.db }));
  });
});
