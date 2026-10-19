import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return db.current;
  },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(async () => ({ ok: true, uid: 'ops1' })),
}));

import { markHandled, mergeReviewDocs, reviewField, reviewQuery } from './reviewQuery';

const doc = (id: string, status: string, day: number | null) => ({
  id,
  data: () => ({
    status,
    createdAt: day === null ? null : { toDate: () => new Date(Date.UTC(2026, 0, day)) },
  }),
});

describe('mergeReviewDocs', () => {
  it('drops a demo-account submission from the review list', () => {
    const demo = { id: 'demo1', data: () => ({ status: 'demo', demoAccount: true, createdAt: null }) };
    const rows = mergeReviewDocs([doc('r1', 'new', 10), demo], [doc('r1', 'new', 10)]);
    expect(rows.map((r) => r.id)).toEqual(['r1']);
  });

  it('keeps an unhandled item older than the newest-N page', () => {
    const recent = [doc('r2', 'handled', 20), doc('r1', 'new', 10)];
    const unhandled = [doc('r1', 'new', 10), doc('old', 'new', 1)];
    const rows = mergeReviewDocs(recent, unhandled);
    expect(rows.map((r) => r.id)).toEqual(['r2', 'r1', 'old']);
    // Every status == 'new' doc is present, so the New count matches the owner card.
    expect(rows.filter((r) => r.status === 'new')).toHaveLength(unhandled.length);
  });

  it('dedupes by id and sorts newest first, undated last', () => {
    const rows = mergeReviewDocs(
      [doc('a', 'handled', 5), doc('b', 'new', 9)],
      [doc('b', 'new', 9), doc('c', 'new', null)]
    );
    expect(rows.map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });
});

describe('markHandled', () => {
  const withDoc = (status: string) => {
    const update = vi.fn();
    db.current = {
      collection: () => ({ doc: () => ({}) }),
      runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({ get: async () => ({ exists: true, data: () => ({ status }) }), update }),
    };
    return update;
  };
  const req = () => new NextRequest('http://localhost/api/x', { method: 'POST' });

  it('flips a new item to handled', async () => {
    const update = withDoc('new');
    expect(await markHandled('fiberReports', req(), 'a')).toEqual({ ok: true });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('answers 409 when someone else already handled it, so the queue can treat it as done', async () => {
    const update = withDoc('handled');
    expect(await markHandled('fiberReports', req(), 'a')).toEqual({ ok: false, error: 'Already handled', status: 409 });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('reviewQuery withheld fields', () => {
  // A max-size signature (200 KB decoded) is ~270 KB of base64.
  const BIG_SIG = `data:image/png;base64,${'A'.repeat(270_000)}`;
  const sigDoc = (id: string, sig: string | undefined) => ({
    id,
    data: () => ({
      status: 'handled',
      repName: 'Rep',
      createdAt: { toDate: () => new Date(Date.UTC(2026, 0, 1)) },
      ...(sig === undefined ? {} : { signatureDataUrl: sig }),
    }),
  });
  const withDocs = (docs: ReturnType<typeof sigDoc>[]) => {
    const snap = { docs };
    db.current = {
      collection: () => ({
        orderBy: () => ({ limit: () => ({ get: async () => snap }) }),
        where: () => ({ get: async () => ({ docs: [] }) }),
        doc: (id: string) => ({
          get: async () => {
            const d = docs.find((x) => x.id === id);
            return { exists: Boolean(d), data: () => d?.data() };
          },
        }),
      }),
    };
  };
  const req = () => new NextRequest('http://localhost/api/x');

  it('keeps a full page of max-size signatures under the 4.5 MB response limit', async () => {
    withDocs(Array.from({ length: 200 }, (_, i) => sigDoc(`d${i}`, BIG_SIG)));
    const result = await reviewQuery('managerInterviews', req(), ['signatureDataUrl']);
    if (!result.ok) throw new Error('expected ok');
    expect(result.submissions).toHaveLength(200);
    expect(JSON.stringify(result.submissions).length).toBeLessThan(4.5 * 1024 * 1024);
    expect(result.submissions[0]).not.toHaveProperty('signatureDataUrl');
    expect(result.submissions[0].withheld).toEqual(['signatureDataUrl']);
    expect(result.submissions[0].repName).toBe('Rep');
  });

  it('only flags a withheld field the doc actually has', () => {
    const [none, blank] = mergeReviewDocs([sigDoc('a', undefined), sigDoc('b', '')], [], ['signatureDataUrl']);
    expect(none.withheld).toEqual([]);
    expect(blank.withheld).toEqual([]);
    expect(blank).not.toHaveProperty('signatureDataUrl');
  });

  it('leaves rows untouched (no withheld key) when nothing is omitted', () => {
    const [row] = mergeReviewDocs([sigDoc('a', 'data:x')], []);
    expect(row.signatureDataUrl).toBe('data:x');
    expect(row).not.toHaveProperty('withheld');
  });

  it('reviewField returns one row\'s withheld field, 404 for unknown ids, 400 without an id', async () => {
    withDocs([sigDoc('a', BIG_SIG)]);
    expect(await reviewField('managerInterviews', req(), 'a', 'signatureDataUrl')).toEqual({ ok: true, value: BIG_SIG });
    expect(await reviewField('managerInterviews', req(), 'zz', 'signatureDataUrl')).toEqual({
      ok: false,
      error: 'Not found',
      status: 404,
    });
    expect(await reviewField('managerInterviews', req(), '', 'signatureDataUrl')).toMatchObject({ status: 400 });
  });
});
