import { describe, expect, it } from 'vitest';
import { isOlderReport, mailSentAt, reportAsOf } from './staleReport';

const order = (d: Partial<Record<'orderDate' | 'activationDate' | 'cancellationDate' | 'deactivationDate', string>>) => ({
  orderDate: null, activationDate: null, cancellationDate: null, deactivationDate: null, ...d,
});

describe('stale carrier reports', () => {
  it('dates a report by its latest activity, ignoring future dates', () => {
    const orders = [order({ orderDate: '2026-09-20' }), order({ activationDate: '2026-09-22' }), order({ cancellationDate: '2026-10-01' })];
    expect(reportAsOf(orders, '2026-09-24')).toBe('2026-09-22');
    expect(reportAsOf([], '2026-09-24')).toBeNull();
  });

  // 9/24: the burst re-sent 9/17-9/23 files before the new one.
  it('skips a file older than the loaded one by mail date or by content', () => {
    const loaded = { sentAt: '2026-09-24T11:00:00.000Z', asOf: '2026-09-23' };
    expect(isOlderReport({ sentAt: '2026-09-21T11:00:00.000Z', asOf: '2026-09-23' }, loaded)).toBe(true);
    expect(isOlderReport({ sentAt: null, asOf: '2026-09-20' }, loaded)).toBe(true);
    expect(isOlderReport({ sentAt: '2026-09-25T11:00:00.000Z', asOf: '2026-09-24' }, loaded)).toBe(false);
    // Same day re-sent: not provably older, so it loads (idempotent).
    expect(isOlderReport({ sentAt: null, asOf: '2026-09-23' }, loaded)).toBe(false);
    expect(isOlderReport({ sentAt: null, asOf: null }, undefined)).toBe(false);
  });

  it('reads the mail Date header', () => {
    expect(mailSentAt('Wed, 24 Sep 2026 06:05:00 -0500')).toBe('2026-09-24T11:05:00.000Z');
    expect(mailSentAt('garbage')).toBeNull();
    expect(mailSentAt(undefined)).toBeNull();
  });
});
