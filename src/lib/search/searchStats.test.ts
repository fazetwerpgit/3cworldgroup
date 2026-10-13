import { describe, expect, it, vi } from 'vitest';
import { jobPageTargets, runSearchStats } from './searchStats';
import { SearchConsoleError, URL_INSPECTION_URL, type FetchFn } from './searchConsole';

function fakeDb() {
  const set = vi.fn(async () => undefined);
  const doc = vi.fn(() => ({ set }));
  const collection = vi.fn(() => ({ doc }));
  return { db: { collection } as never, set, collection, doc };
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const fetchOk = vi.fn<FetchFn>(async (url) =>
  url === URL_INSPECTION_URL
    ? ok({ inspectionResult: { indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed' } } })
    : ok({ rows: [{ clicks: 4, impressions: 100 }] })
);

const NOW = new Date('2026-10-13T11:00:00Z');

describe('jobPageTargets', () => {
  it('lists the five job pages from the postings', () => {
    expect(jobPageTargets().map((p) => p.url)).toEqual([
      'https://www.3cworldgroup.com/opportunities/dallas',
      'https://www.3cworldgroup.com/opportunities/houston',
      'https://www.3cworldgroup.com/opportunities/southern-california',
      'https://www.3cworldgroup.com/opportunities/lansing',
      'https://www.3cworldgroup.com/opportunities/grand-rapids',
    ]);
  });
});

describe('runSearchStats', () => {
  it('replaces config/searchStats after a good run', async () => {
    const { db, set, collection, doc } = fakeDb();
    const run = await runSearchStats({ db, now: NOW, fetchFn: fetchOk, getToken: async () => 'tok', dryRun: false });
    expect(run.ok).toBe(true);
    expect(collection).toHaveBeenCalledWith('config');
    expect(doc).toHaveBeenCalledWith('searchStats');
    expect(set).toHaveBeenCalledTimes(1);
    const [written, options] = set.mock.calls[0] as unknown as [Record<string, unknown>, unknown];
    expect(options).toBeUndefined();
    expect(written).toMatchObject({ ok: true, updatedAt: NOW, checkedAt: NOW, clicks7: 4, impressions7: 100 });
    expect((written.jobPages as unknown[]).length).toBe(5);
    expect(written).not.toHaveProperty('error');
  });

  it('keeps the last good figures and records the error on a 403', async () => {
    const { db, set } = fakeDb();
    const fetchFn = vi.fn<FetchFn>(async () => {
      throw new SearchConsoleError(403, 'Search Console API has not been used in project 1 before or it is disabled.');
    });
    const run = await runSearchStats({ db, now: NOW, fetchFn, getToken: async () => 'tok', dryRun: false });
    expect(run).toEqual({ ok: false, error: 'api_disabled', dryRun: false });
    expect(set).toHaveBeenCalledWith({ ok: false, error: 'api_disabled', checkedAt: NOW }, { merge: true });
  });

  it('records a token failure without throwing', async () => {
    const { db, set } = fakeDb();
    const run = await runSearchStats({
      db,
      now: NOW,
      fetchFn: fetchOk,
      getToken: async () => {
        throw new Error('invalid_grant');
      },
      dryRun: false,
    });
    expect(run.error).toBe('invalid_grant');
    expect(set).toHaveBeenCalledWith({ ok: false, error: 'invalid_grant', checkedAt: NOW }, { merge: true });
  });

  it('writes nothing on a dry run', async () => {
    const { db, set } = fakeDb();
    const run = await runSearchStats({ db, now: NOW, fetchFn: fetchOk, getToken: async () => 'tok', dryRun: true });
    expect(run.ok).toBe(true);
    expect(set).not.toHaveBeenCalled();
  });
});
