import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runDueAnnouncements } = vi.hoisted(() => ({ runDueAnnouncements: vi.fn() }));

vi.mock('@/lib/firebase/admin', () => ({ adminDb: { fake: true } }));
vi.mock('@/lib/announcements/send', () => ({ runDueAnnouncements }));

import { GET } from './route';

const call = (auth?: string) =>
  GET(new Request('http://localhost/api/cron/announcements', { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'shh');
  runDueAnnouncements.mockReset();
  runDueAnnouncements.mockResolvedValue({ due: 1, sent: ['a1'], skipped: [], failed: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/cron/announcements', () => {
  it('rejects a missing or wrong secret without sending', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Bearer nope')).status).toBe(401);
    expect(runDueAnnouncements).not.toHaveBeenCalled();
  });

  it('refuses to run when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer ')).status).toBe(500);
    expect(runDueAnnouncements).not.toHaveBeenCalled();
  });

  it('sends what is due with the cron secret', async () => {
    const res = await call('Bearer shh');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ due: 1, sent: ['a1'], skipped: [], failed: [] });
    expect(runDueAnnouncements).toHaveBeenCalledWith({ db: { fake: true }, now: expect.any(Date) });
  });
});
