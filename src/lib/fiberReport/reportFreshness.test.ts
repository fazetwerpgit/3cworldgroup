import { describe, expect, it } from 'vitest';
import { carrierStaleLine, formatReportAsOf, isCarrierReportStale } from './reportFreshness';

// Sat 10/10/2026 9:00 AM Central (CDT, UTC-5).
const NOW = new Date('2026-10-10T14:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const H = 60 * 60 * 1000;
const M = 60 * 1000;

describe('isCarrierReportStale', () => {
  it('is fresh at 29h59m since the report landed', () => {
    expect(isCarrierReportStale(ago(29 * H + 59 * M), NOW)).toBe(false);
  });

  it('is fresh at exactly 30h', () => {
    expect(isCarrierReportStale(ago(30 * H), NOW)).toBe(false);
  });

  it('is stale at 30h01m', () => {
    expect(isCarrierReportStale(ago(30 * H + 1 * M), NOW)).toBe(true);
  });

  it('is stale when no report is on record or the stamp is unreadable', () => {
    expect(isCarrierReportStale(null, NOW)).toBe(true);
    expect(isCarrierReportStale(undefined, NOW)).toBe(true);
    expect(isCarrierReportStale('', NOW)).toBe(true);
    expect(isCarrierReportStale('not a date', NOW)).toBe(true);
  });

  it('reads a serialized Firestore Timestamp', () => {
    const seconds = (NOW.getTime() - 2 * H) / 1000;
    expect(isCarrierReportStale({ _seconds: seconds, _nanoseconds: 0 }, NOW)).toBe(false);
    expect(isCarrierReportStale({ seconds: seconds - 40 * 3600 }, NOW)).toBe(true);
  });
});

describe('formatReportAsOf', () => {
  it('formats the covered day as short weekday + M/D', () => {
    expect(formatReportAsOf('2026-10-08')).toBe('Thu 10/8');
    expect(formatReportAsOf('2026-01-04')).toBe('Sun 1/4');
  });

  it('does not shift the calendar day by time zone', () => {
    expect(formatReportAsOf('2026-11-01')).toBe('Sun 11/1');
  });

  it('is null for a missing or malformed day', () => {
    expect(formatReportAsOf(null)).toBeNull();
    expect(formatReportAsOf(undefined)).toBeNull();
    expect(formatReportAsOf('10/8/2026')).toBeNull();
    expect(formatReportAsOf('2026-02-30')).toBeNull();
  });
});

describe('carrierStaleLine', () => {
  it('says nothing while the status has not loaded', () => {
    expect(carrierStaleLine(null, NOW)).toBeNull();
    expect(carrierStaleLine(undefined, NOW)).toBeNull();
  });

  it('says nothing when the report is fresh', () => {
    expect(carrierStaleLine({ lastReportAt: ago(5 * H), lastReportAsOf: '2026-10-09' }, NOW)).toBeNull();
  });

  it('names the covered day when the report is late', () => {
    expect(carrierStaleLine({ lastReportAt: ago(40 * H), lastReportAsOf: '2026-10-08' }, NOW)).toBe(
      'Carrier update delayed · install info as of Thu 10/8'
    );
  });

  it('falls back to a dateless line when the covered day is unknown', () => {
    expect(carrierStaleLine({ lastReportAt: null }, NOW)).toBe(
      'Carrier update delayed · install info may be behind'
    );
  });
});
