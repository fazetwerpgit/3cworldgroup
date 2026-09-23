import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({ adminDb: null }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: vi.fn() }));

import { mergeReviewDocs } from './reviewQuery';

const doc = (id: string, status: string, day: number | null) => ({
  id,
  data: () => ({
    status,
    createdAt: day === null ? null : { toDate: () => new Date(Date.UTC(2026, 0, day)) },
  }),
});

describe('mergeReviewDocs', () => {
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
