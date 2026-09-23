import { describe, expect, it } from 'vitest';
import { carrierReportStamp } from './reportFreshness';

const NOW = Date.parse('2026-09-23T18:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe('carrierReportStamp', () => {
  it('reads plain minutes or hours while the report is fresh', () => {
    expect(carrierReportStamp(hoursAgo(0), NOW)).toEqual({ text: 'Carrier report just now', stale: false });
    expect(carrierReportStamp(hoursAgo(0.2), NOW)).toEqual({ text: 'Carrier report 12m ago', stale: false });
    expect(carrierReportStamp(hoursAgo(2.5), NOW)).toEqual({ text: 'Carrier report 2h ago', stale: false });
    // A day and a half is still hours, not a weekday.
    expect(carrierReportStamp(hoursAgo(35.9), NOW)).toEqual({ text: 'Carrier report 35h ago', stale: false });
  });

  it('turns stale at 36 hours and counts days from there', () => {
    expect(carrierReportStamp(hoursAgo(36), NOW)).toEqual({ text: 'Carrier report 2 days old', stale: true });
    expect(carrierReportStamp(hoursAgo(80), NOW)).toEqual({ text: 'Carrier report 3 days old', stale: true });
  });

  it('shows nothing when no report has arrived', () => {
    expect(carrierReportStamp(null, NOW)).toBeNull();
    expect(carrierReportStamp('', NOW)).toBeNull();
    expect(carrierReportStamp('not a date', NOW)).toBeNull();
  });

  it('treats a stamp slightly ahead of this clock as just now', () => {
    expect(carrierReportStamp(hoursAgo(-0.1), NOW)).toEqual({ text: 'Carrier report just now', stale: false });
  });
});
