import { afterEach, describe, expect, it } from 'vitest';
import { requestedAgo } from './requestedAgo';

describe('requestedAgo (Chicago calendar days)', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('says yesterday for a 10 pm CT sign-up viewed 11 hours later the next morning', () => {
    const created = new Date('2026-10-18T03:00:00Z'); // Oct 17, 10:00 pm CT
    const now = new Date('2026-10-18T14:00:00Z'); // Oct 18, 9:00 am CT
    expect(requestedAgo(created, now)).toBe('yesterday');
  });

  it('counts calendar days, not 24-hour blocks, across three days', () => {
    const created = new Date('2026-10-16T05:30:00Z'); // Oct 16, 12:30 am CT
    const now = new Date('2026-10-18T04:30:00Z'); // Oct 17, 11:30 pm CT (47 h later)
    expect(requestedAgo(created, now)).toBe('yesterday');
    expect(requestedAgo(created, new Date('2026-10-18T05:30:00Z'))).toBe('2 days ago'); // Oct 18, 12:30 am CT
  });

  it('uses the Chicago day even when the device runs on UTC', () => {
    process.env.TZ = 'UTC';
    const created = new Date('2026-10-18T01:00:00Z'); // Oct 17, 8:00 pm CT (Oct 18 in UTC)
    const now = new Date('2026-10-18T04:00:00Z'); // Oct 17, 11:00 pm CT
    expect(requestedAgo(created, now)).toBe('today');
  });

  it('falls back to recently for missing or invalid dates', () => {
    expect(requestedAgo(undefined)).toBe('recently');
    expect(requestedAgo('not a date')).toBe('recently');
  });
});
