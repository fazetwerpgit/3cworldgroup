import { describe, expect, it } from 'vitest';
import { reportLinkExpired } from './moderationShared';

describe('reportLinkExpired', () => {
  const at = '2026-10-17T12:10:00.000Z';
  it('is false before the signed link expires and true from then on', () => {
    expect(reportLinkExpired(at, Date.parse('2026-10-17T12:09:59Z'))).toBe(false);
    expect(reportLinkExpired(at, Date.parse('2026-10-17T12:10:00Z'))).toBe(true);
  });

  it('never expires a link that is not signed (or a bad date)', () => {
    expect(reportLinkExpired(null)).toBe(false);
    expect(reportLinkExpired('not a date')).toBe(false);
  });
});
