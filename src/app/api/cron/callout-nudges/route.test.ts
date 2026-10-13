import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ db: {} as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return holder.db;
  },
}));

const runCalloutNudges = vi.hoisted(() => vi.fn(async () => ({ day: '2026-10-09', sent: 1 })));
vi.mock('@/lib/alerts/calloutNudges', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/alerts/calloutNudges')>()),
  runCalloutNudges,
}));

import { GET } from './route';

const SECRET = 'test-cron-secret';

function request(auth = `Bearer ${SECRET}`) {
  return new Request('http://localhost/api/cron/callout-nudges?slot=cdt', { headers: { authorization: auth } });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  holder.db = {};
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/cron/callout-nudges', () => {
  it('turns away a caller without the cron secret', async () => {
    const response = await GET(request('Bearer wrong'));
    expect(response.status).toBe(401);
    expect(runCalloutNudges).not.toHaveBeenCalled();
  });

  it('runs at 9 PM Chicago', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T02:00:00Z'));
    const response = await GET(request());
    expect(await response.json()).toEqual({ day: '2026-10-09', sent: 1 });
    expect(runCalloutNudges).toHaveBeenCalledWith({ db: holder.db, now: new Date('2026-10-10T02:00:00Z') });
  });

  it('skips the other UTC slot', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T03:00:00Z'));
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ skipped: 'not_send_hour' });
    expect(runCalloutNudges).not.toHaveBeenCalled();
  });
});
