import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONSULTANT_TZ,
  LEGACY_TZ,
  SOLAR_MAX_DAYS_OUT,
  US_STATE_TZ,
  bookingWindowEnd,
  bookingZones,
  customerZone,
  dayKeyIn,
  dayLabelIn,
  formatWhen,
  formatWhenForConsultant,
  isUsTimeZone,
  isValidTimeZone,
  timeIn,
  withinBookingWindow,
  zoneAbbr,
  zoneForState,
  zoneName,
} from './timezones';
import { zonedToUtc } from './availability';

const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];

describe('state -> zone map', () => {
  it('covers all 50 states and DC with real zones', () => {
    for (const st of STATES) {
      expect(US_STATE_TZ[st], st).toBeTruthy();
      expect(isValidTimeZone(US_STATE_TZ[st]), st).toBe(true);
    }
    for (const tz of Object.values(US_STATE_TZ)) expect(isValidTimeZone(tz), tz).toBe(true);
  });

  it('maps the states we sell in, and split states to their main zone', () => {
    expect(zoneForState('FL')).toBe('America/New_York');
    expect(zoneForState('CA')).toBe('America/Los_Angeles');
    expect(zoneForState('TX')).toBe('America/Chicago');
    expect(zoneForState('IA')).toBe('America/Chicago');
    expect(zoneForState('AZ')).toBe('America/Phoenix');
    expect(zoneForState('HI')).toBe('Pacific/Honolulu');
    expect(zoneForState('ID')).toBe('America/Denver');
    expect(zoneForState('OR')).toBe('America/Los_Angeles');
    expect(zoneForState('TN')).toBe('America/Chicago');
    expect(zoneForState('IN')).toBe('America/New_York');
  });

  it('is case and space tolerant, and null when unknown', () => {
    expect(zoneForState(' fl ')).toBe('America/New_York');
    expect(zoneForState('')).toBeNull();
    expect(zoneForState('ZZ')).toBeNull();
    expect(zoneForState(undefined)).toBeNull();
    expect(zoneForState(12)).toBeNull();
  });

  it("customer zone: the state's, else the device's, else Central", () => {
    expect(customerZone('FL', 'America/Los_Angeles')).toBe('America/New_York');
    expect(customerZone('', 'America/Los_Angeles')).toBe('America/Los_Angeles');
    expect(customerZone('', null)).toBe(DEFAULT_CONSULTANT_TZ);
    expect(DEFAULT_CONSULTANT_TZ).toBe('America/Chicago');
  });
});

describe('zones', () => {
  it('validates IANA zones', () => {
    expect(isValidTimeZone('America/Detroit')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(5)).toBe(false);
    expect(isUsTimeZone('America/Chicago')).toBe(true);
    expect(isUsTimeZone('Europe/London')).toBe(false);
  });

  it('labels US zones DST-neutrally, and others by Intl', () => {
    expect(zoneAbbr('America/New_York')).toBe('ET');
    expect(zoneAbbr('America/Chicago')).toBe('CT');
    expect(zoneAbbr('America/Los_Angeles')).toBe('PT');
    expect(zoneAbbr('America/Detroit', '2026-07-01T12:00:00Z')).toBe('EDT');
    expect(zoneName('America/New_York')).toBe('Eastern Time (ET)');
  });
});

describe('conversions', () => {
  // Monday Oct 26 2026, 15:00Z (all US zones on daylight time).
  const ISO = '2026-10-26T15:00:00.000Z';

  it('shows one instant in each reader zone', () => {
    expect(timeIn(ISO, 'America/New_York')).toBe('11:00 AM');
    expect(timeIn(ISO, 'America/Chicago')).toBe('10:00 AM');
    expect(timeIn(ISO, 'America/Los_Angeles')).toBe('8:00 AM');
    expect(timeIn(ISO, 'America/Phoenix')).toBe('8:00 AM');
    expect(formatWhen(ISO, 'America/New_York')).toBe('Monday, October 26 at 11:00 AM ET');
  });

  it("converts Jacob's Central hours to a Florida and a California customer", () => {
    const tenCentral = new Date(zonedToUtc(2026, 10, 26, 10, 0, 'America/Chicago')!).toISOString();
    expect(tenCentral).toBe(ISO);
    expect(timeIn(tenCentral, zoneForState('FL')!)).toBe('11:00 AM');
    expect(timeIn(tenCentral, zoneForState('CA')!)).toBe('8:00 AM');
  });

  it('is DST-safe across the fall-back boundary (Nov 1 2026)', () => {
    // 10 AM Central: CDT (UTC-5) on Oct 30, CST (UTC-6) on Nov 2.
    const before = new Date(zonedToUtc(2026, 10, 30, 10, 0, 'America/Chicago')!).toISOString();
    const after = new Date(zonedToUtc(2026, 11, 2, 10, 0, 'America/Chicago')!).toISOString();
    expect(before).toBe('2026-10-30T15:00:00.000Z');
    expect(after).toBe('2026-11-02T16:00:00.000Z');
    // Florida still reads 11 AM both days; Arizona (no DST) moves an hour.
    expect(timeIn(before, 'America/New_York')).toBe('11:00 AM');
    expect(timeIn(after, 'America/New_York')).toBe('11:00 AM');
    expect(timeIn(before, 'America/Phoenix')).toBe('8:00 AM');
    expect(timeIn(after, 'America/Phoenix')).toBe('9:00 AM');
  });

  it('is DST-safe across spring-forward (Mar 8 2026)', () => {
    expect(new Date(zonedToUtc(2026, 3, 6, 9, 0, 'America/New_York')!).toISOString()).toBe('2026-03-06T14:00:00.000Z');
    expect(new Date(zonedToUtc(2026, 3, 9, 9, 0, 'America/New_York')!).toISOString()).toBe('2026-03-09T13:00:00.000Z');
    expect(zonedToUtc(2026, 3, 8, 2, 30, 'America/New_York')).toBeNull();
  });

  it('puts a late slot on the right calendar day for the reader', () => {
    // 9 PM Pacific Monday is Tuesday in Florida.
    const iso = '2026-10-27T04:00:00.000Z';
    expect(dayKeyIn(iso, 'America/Los_Angeles')).toBe('2026-10-26');
    expect(dayKeyIn(iso, 'America/New_York')).toBe('2026-10-27');
    expect(dayLabelIn(iso, 'America/New_York')).toBe('Tuesday, Oct 27');
  });

  it("words a consultant's notice in their zone, with the customer's when it differs", () => {
    expect(formatWhenForConsultant(ISO, 'America/Chicago', 'America/New_York')).toBe(
      'Monday, October 26 at 10:00 AM CT (11:00 AM ET for the customer)'
    );
    expect(formatWhenForConsultant(ISO, 'America/Chicago', 'America/Chicago')).toBe('Monday, October 26 at 10:00 AM CT');
    expect(formatWhenForConsultant(ISO, 'America/Chicago', null)).toBe('Monday, October 26 at 10:00 AM CT');
  });

  it('reads older bookings (no zones stored) in Pacific, as the old code showed them', () => {
    expect(LEGACY_TZ).toBe('America/Los_Angeles');
    expect(bookingZones({ start: ISO })).toEqual({ consultantTz: 'America/Los_Angeles', customerTz: 'America/Los_Angeles' });
    expect(bookingZones(undefined)).toEqual({ consultantTz: 'America/Los_Angeles', customerTz: 'America/Los_Angeles' });
    expect(bookingZones({ consultantTz: 'America/Los_Angeles', customerTz: 'America/New_York' })).toEqual({
      consultantTz: 'America/Los_Angeles',
      customerTz: 'America/New_York',
    });
    expect(bookingZones({ consultantTz: 'Mars/Olympus' }, 'America/Denver').consultantTz).toBe('America/Denver');
  });
});

describe('booking window', () => {
  it("runs through the end of the 14th calendar day in the customer's zone", () => {
    expect(SOLAR_MAX_DAYS_OUT).toBe(14);
    // Tue Oct 20, 10 AM ET: day 14 is Tue Nov 3, which ends Nov 4 00:00 EST (05:00Z).
    const now = new Date('2026-10-20T14:00:00Z');
    expect(bookingWindowEnd(now, 'America/New_York').toISOString()).toBe('2026-11-04T05:00:00.000Z');
    expect(bookingWindowEnd(now, 'America/Los_Angeles').toISOString()).toBe('2026-11-04T08:00:00.000Z');
    expect(withinBookingWindow(new Date('2026-11-04T04:59:00Z'), now, 'America/New_York')).toBe(true);
    expect(withinBookingWindow(new Date('2026-11-04T05:00:00Z'), now, 'America/New_York')).toBe(false);
    expect(withinBookingWindow(new Date('2026-12-01T00:00:00Z'), now, 'America/New_York')).toBe(false);
  });

  it('counts days from the customer\'s today, not UTC', () => {
    // 11 PM Mon Oct 19 Pacific is already Tue Oct 20 in UTC and in Florida.
    const now = new Date('2026-10-20T06:00:00Z');
    expect(bookingWindowEnd(now, 'America/Los_Angeles').toISOString()).toBe('2026-11-03T08:00:00.000Z');
    expect(bookingWindowEnd(now, 'America/New_York').toISOString()).toBe('2026-11-04T05:00:00.000Z');
  });

  it('crosses the fall-back change and a month end without drifting', () => {
    // Oct 25 noon CT (CDT); day 14 is Sun Nov 8, ending Nov 9 00:00 CST (06:00Z).
    expect(bookingWindowEnd(new Date('2026-10-25T17:00:00Z'), 'America/Chicago').toISOString()).toBe('2026-11-09T06:00:00.000Z');
  });
});
