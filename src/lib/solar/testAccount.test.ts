import { describe, expect, it } from 'vitest';
import { bookingAudience, solarRecordVisibleTo } from './testAccount';

describe('solarRecordVisibleTo', () => {
  it('shows every unstamped record, and a stamped one only to its own test account', () => {
    expect(solarRecordVisibleTo({ repUid: 'r1' }, 'someone')).toBe(true);
    expect(solarRecordVisibleTo({ repUid: 'r1' })).toBe(true);
    expect(solarRecordVisibleTo({ repUid: 'qa', testAccount: true }, 'qa')).toBe(true);
    expect(solarRecordVisibleTo({ repUid: 'qa', testAccount: true }, 'r1')).toBe(false);
    expect(solarRecordVisibleTo({ repUid: 'qa', testAccount: true })).toBe(false);
    expect(solarRecordVisibleTo({ testAccount: true }, '')).toBe(false);
    expect(solarRecordVisibleTo({ repUid: 'r1', testAccount: 'true' }, 'x')).toBe(true);
  });
});

describe('bookingAudience', () => {
  it('a real booking reaches everyone as before', () => {
    expect(bookingAudience(false, false)).toEqual({ homeowner: true, google: true, consultant: 'normal' });
    expect(bookingAudience(false, true)).toEqual({ homeowner: true, google: true, consultant: 'normal' });
  });

  it('a test booking reaches no homeowner and no Google; the consultant only when a test account', () => {
    expect(bookingAudience(true, false)).toEqual({ homeowner: false, google: false, consultant: 'none' });
    expect(bookingAudience(true, true)).toEqual({ homeowner: false, google: false, consultant: 'consultant' });
  });
});
