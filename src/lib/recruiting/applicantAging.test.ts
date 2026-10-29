import { describe, expect, it } from 'vitest';
import { countsAsWaitingApplicant, isFreshApplicant } from './applicantAging';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

describe('applicant aging', () => {
  it('counts applicants from the last 30 days, inclusive', () => {
    expect(isFreshApplicant(daysAgo(0), NOW)).toBe(true);
    expect(isFreshApplicant(daysAgo(30), NOW)).toBe(true);
    expect(isFreshApplicant(daysAgo(30.01), NOW)).toBe(false);
    expect(isFreshApplicant(daysAgo(115), NOW)).toBe(false);
  });

  it('treats a missing or unreadable date as older', () => {
    expect(isFreshApplicant(null, NOW)).toBe(false);
    expect(isFreshApplicant(undefined, NOW)).toBe(false);
    expect(isFreshApplicant('not a date', NOW)).toBe(false);
  });

  it('only waits on applicants nobody has handled', () => {
    expect(countsAsWaitingApplicant({ status: 'applied', createdAt: daysAgo(2) }, NOW)).toBe(true);
    expect(countsAsWaitingApplicant({ status: 'applied', createdAt: daysAgo(45) }, NOW)).toBe(false);
    for (const status of ['invited', 'not_selected', 'converted', 'contacted']) {
      expect(countsAsWaitingApplicant({ status, createdAt: daysAgo(2) }, NOW)).toBe(false);
    }
  });
});
