import { describe, expect, it } from 'vitest';
import { consultParts, consultTime } from './leadDisplay';

describe('consultParts', () => {
  it('splits the moment consultTime shows into the date figure and its words', () => {
    const at = { start: '2026-10-21T20:19:00.000Z', tz: 'America/Los_Angeles' };
    expect(consultTime(at)).toBe('Wed, Oct 21, 1:19 PM PDT');
    expect(consultParts(at)).toEqual({ month: 'Oct', day: '21', weekday: 'Wednesday', time: '1:19 PM PDT' });
  });

  it('reads the day in the given zone, not the device zone', () => {
    // 01:30 UTC on Oct 22 is still the evening of Oct 21 in Chicago.
    expect(consultParts({ start: '2026-10-22T01:30:00.000Z', tz: 'America/Chicago' })).toMatchObject({
      day: '21',
      weekday: 'Wednesday',
      time: '8:30 PM CDT',
    });
  });

  it('null for a zone it cannot read, so the block falls back to consultTime', () => {
    expect(consultParts({ start: '2026-10-21T20:19:00.000Z', tz: 'Not/AZone' })).toBeNull();
  });
});
