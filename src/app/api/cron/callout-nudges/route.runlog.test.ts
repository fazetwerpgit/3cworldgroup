import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));

const nudges = vi.hoisted(() => ({
  isCalloutNudgeHour: vi.fn(() => true),
  runCalloutNudges: vi.fn(async () => ({ errors: 0 }) as Record<string, unknown>),
}));
vi.mock('@/lib/alerts/calloutNudges', () => nudges);

const recorded = vi.hoisted(() => ({ ok: [] as boolean[] }));
vi.mock('@/lib/cron/runLog', () => ({
  withCronRun: async <T,>(
    _db: unknown,
    _job: string,
    _request: Request,
    body: () => Promise<T>,
    okOf: (summary: T) => boolean = () => true
  ) => {
    const summary = await body();
    recorded.ok.push(okOf(summary));
    return summary;
  },
}));

import { GET } from './route';

const SECRET = 'test-cron-secret';

function request() {
  return new Request('http://localhost/api/cron/callout-nudges?slot=cdt', {
    headers: { authorization: `Bearer ${SECRET}` },
  });
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', SECRET);
  recorded.ok = [];
  nudges.runCalloutNudges.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/cron/callout-nudges run log', () => {
  it('records ok:true when the run had no errors', async () => {
    nudges.runCalloutNudges.mockResolvedValueOnce({ errors: 0, sent: 2 });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(recorded.ok).toEqual([true]);
  });

  it('records ok:false when a claim or push failed', async () => {
    nudges.runCalloutNudges.mockResolvedValueOnce({ errors: 1, sent: 1 });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ errors: 1 });
    expect(recorded.ok).toEqual([false]);
  });
});
