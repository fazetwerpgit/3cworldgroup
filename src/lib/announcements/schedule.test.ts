import { describe, expect, it } from 'vitest';
import { announcementCreateSchema, nextSendDay, sendAtForDay, sendDayError } from './schedule';

describe('sendAtForDay', () => {
  it('is 8 AM Chicago: 13:00 UTC in daylight time', () => {
    expect(sendAtForDay('2026-09-24').toISOString()).toBe('2026-09-24T13:00:00.000Z');
  });

  it('is 8 AM Chicago: 14:00 UTC in standard time', () => {
    expect(sendAtForDay('2026-12-01').toISOString()).toBe('2026-12-01T14:00:00.000Z');
  });

  it('handles the DST change days', () => {
    expect(sendAtForDay('2026-03-08').toISOString()).toBe('2026-03-08T13:00:00.000Z');
    expect(sendAtForDay('2026-11-01').toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });
});

describe('nextSendDay', () => {
  it('is today before 8 AM Chicago', () => {
    expect(nextSendDay(new Date('2026-09-24T12:30:00Z'))).toBe('2026-09-24');
  });

  it('is tomorrow once 8 AM Chicago has passed', () => {
    expect(nextSendDay(new Date('2026-09-24T13:00:00Z'))).toBe('2026-09-25');
    expect(nextSendDay(new Date('2026-09-23T22:00:00Z'))).toBe('2026-09-24');
  });

  it('uses the Chicago day, not the UTC day, late in the evening', () => {
    // 04:00 UTC on the 24th is 11 PM on the 23rd in Chicago.
    expect(nextSendDay(new Date('2026-09-24T04:00:00Z'))).toBe('2026-09-24');
  });
});

describe('sendDayError', () => {
  const now = new Date('2026-09-23T20:00:00Z');

  it('accepts the next morning', () => {
    expect(sendDayError('2026-09-24', now)).toBeNull();
  });

  it("rejects a morning that's already gone", () => {
    expect(sendDayError('2026-09-23', now)).toMatch(/already gone/);
  });

  it('rejects a day too far ahead', () => {
    expect(sendDayError('2027-09-24', now)).toMatch(/within/);
  });
});

describe('announcementCreateSchema', () => {
  const valid = { title: 'Screenshot auto-fill', body: 'Log a sale from a screenshot.', sendDate: '2026-09-24' };

  it('accepts a valid announcement and trims it', () => {
    expect(announcementCreateSchema.parse({ ...valid, title: '  Hi  ' }).title).toBe('Hi');
  });

  it('rejects an empty title or message', () => {
    expect(announcementCreateSchema.safeParse({ ...valid, title: '   ' }).success).toBe(false);
    expect(announcementCreateSchema.safeParse({ ...valid, body: '' }).success).toBe(false);
  });

  it('rejects an over-long title or message', () => {
    expect(announcementCreateSchema.safeParse({ ...valid, title: 'x'.repeat(51) }).success).toBe(false);
    expect(announcementCreateSchema.safeParse({ ...valid, body: 'x'.repeat(181) }).success).toBe(false);
  });

  it('rejects a malformed or impossible date', () => {
    expect(announcementCreateSchema.safeParse({ ...valid, sendDate: '9/24/2026' }).success).toBe(false);
    expect(announcementCreateSchema.safeParse({ ...valid, sendDate: '2026-02-30' }).success).toBe(false);
  });
});
