import { describe, expect, it } from 'vitest';
import { countApplications, emptyCounts, serializeSearchStats } from './ownerSearchStats';

const NOW = new Date('2026-10-13T12:00:00Z');
const daysAgo = (n: number) => NOW.getTime() - n * 24 * 60 * 60 * 1000;
const source = (channel: string) => ({ referrerHost: '', landingPath: '/', utmSource: '', utmMedium: '', utmCampaign: '', channel });

describe('countApplications', () => {
  it('counts by channel over 7 and 30 days, with old sources as unknown', () => {
    const counts = countApplications(
      [
        { createdAtMs: daysAgo(1), source: source('google') },
        { createdAtMs: daysAgo(2), source: source('direct') },
        { createdAtMs: daysAgo(3), source: 'website' },
        { createdAtMs: daysAgo(4), source: undefined },
        { createdAtMs: daysAgo(10), source: source('indeed') },
        { createdAtMs: daysAgo(31), source: source('google') },
        { createdAtMs: null, source: source('google') },
      ],
      NOW
    );
    expect(counts.last7).toEqual({ ...emptyCounts(), google: 1, direct: 1, unknown: 2 });
    expect(counts.last30).toEqual({ ...emptyCounts(), google: 1, direct: 1, unknown: 2, indeed: 1 });
  });
});

describe('serializeSearchStats', () => {
  it('is null before the first run', () => {
    expect(serializeSearchStats(undefined)).toBeNull();
  });

  it('turns timestamps into ISO strings and drops junk', () => {
    const view = serializeSearchStats({
      ok: false,
      error: 'no_access',
      checkedAt: { toDate: () => NOW },
      clicks7: 'x',
      jobPages: [{ slug: 'dallas', indexed: true, coverage: 'Submitted and indexed' }, null],
    });
    expect(view).toEqual({
      ok: false,
      error: 'no_access',
      updatedAt: null,
      checkedAt: NOW.toISOString(),
      jobPages: [{ slug: 'dallas', indexed: true, coverage: 'Submitted and indexed', jobPostingValid: null }],
    });
  });
});
