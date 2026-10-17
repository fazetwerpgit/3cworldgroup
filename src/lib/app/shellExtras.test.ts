import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MoneySummary } from '@/lib/owner/companySummary';
import type { MarketsSummary } from '@/lib/owner/markets';
import {
  WIDGET_REFRESH_MS,
  __resetShellExtrasForTests,
  buildOwnerWidgetData,
  buildWidgetData,
  clearNativeExtras,
  countUnread,
  hashUid,
  sendNativeBadge,
  sendNativeWidgetData,
  signalAppReady,
} from './shellExtras';

const APP_UA = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 3CPortalApp/1.0.0';
let posted: Array<Record<string, unknown>>;

function stub({ app = true }: { app?: boolean } = {}) {
  posted = [];
  vi.stubGlobal('window', {
    navigator: { userAgent: app ? APP_UA : 'Mozilla/5.0 (iPhone) Safari' },
    ReactNativeWebView: { postMessage: (m: string) => posted.push(JSON.parse(m)) },
  });
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => {
    fn();
    return 0;
  });
}

beforeEach(() => {
  __resetShellExtrasForTests();
  stub();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('signalAppReady', () => {
  it('posts ready once per page load', () => {
    signalAppReady();
    signalAppReady();
    expect(posted).toEqual([{ type: 'ready' }]);
  });

  it('does nothing in a browser', () => {
    stub({ app: false });
    signalAppReady();
    expect(posted).toEqual([]);
  });
});

describe('badge', () => {
  it('counts unread channels', () => {
    expect(countUnread({ a: true, b: false, c: true })).toBe(2);
    expect(countUnread({})).toBe(0);
  });

  it('sends only when the count changes, as a whole number', () => {
    sendNativeBadge(2);
    sendNativeBadge(2);
    sendNativeBadge(3.7);
    sendNativeBadge(-1);
    expect(posted).toEqual([
      { type: 'badge', count: 2 },
      { type: 'badge', count: 3 },
      { type: 'badge', count: 0 },
    ]);
  });

  it('does nothing in a browser', () => {
    stub({ app: false });
    sendNativeBadge(4);
    expect(posted).toEqual([]);
  });
});

const now = new Date('2026-10-17T15:00:00Z');

describe('buildWidgetData', () => {
  it('maps the dashboard numbers to the shell contract (no pay date)', () => {
    const data = buildWidgetData({ uidHash: 'abc123abc123abc1', estThisMonth: 1234.6, hasPlan: true, monthCount: 9, standing: { rank: 3, of: 28 }, now });
    expect(data).toEqual({
      uidHash: 'abc123abc123abc1',
      estPayMtd: 1235,
      periodLabel: 'October',
      rank: 3,
      rankOf: 28,
      salesMtd: 9,
      updatedAt: '2026-10-17T15:00:00.000Z',
    });
    expect(Object.keys(data).some((k) => /date/i.test(k) && k !== 'updatedAt')).toBe(false);
  });

  it('no plan (management) sends estPayMtd null', () => {
    expect(buildWidgetData({ uidHash: 'abc123abc123abc1', estThisMonth: null, hasPlan: false, monthCount: 0, standing: null, now }).estPayMtd).toBeNull();
    expect(buildWidgetData({ uidHash: 'abc123abc123abc1', estThisMonth: 500, hasPlan: false, monthCount: 0, standing: null, now }).estPayMtd).toBeNull();
  });

  it('a month netted below zero by chargebacks sends the real negative estimate', () => {
    expect(buildWidgetData({ uidHash: 'abc123abc123abc1', estThisMonth: -320.4, hasPlan: true, monthCount: 1, standing: null, now }).estPayMtd).toBe(-320);
  });

  it('hashUid is the first 16 hex chars of SHA-256(uid)', async () => {
    // sha256("abc") = ba7816bf8f01cfea414140de5dae2223...
    await expect(hashUid('abc')).resolves.toBe('ba7816bf8f01cfea');
  });

  it('unranked or inconsistent standing sends null rank', () => {
    const unranked = buildWidgetData({ uidHash: 'abc123abc123abc1', estThisMonth: 0, hasPlan: true, monthCount: 0, standing: null, now });
    expect([unranked.rank, unranked.rankOf]).toEqual([null, null]);
    const bad = buildWidgetData({ uidHash: 'abc123abc123abc1', estThisMonth: 0, hasPlan: true, monthCount: 0, standing: { rank: 5, of: 2 }, now });
    expect([bad.rank, bad.rankOf]).toEqual([null, null]);
  });

  it('reads the month in America/Chicago', () => {
    const early = new Date('2026-11-01T03:00:00Z'); // Oct 31, 10pm in Chicago
    expect(buildWidgetData({ uidHash: 'abc123abc123abc1', estThisMonth: 0, hasPlan: true, monthCount: 0, standing: null, now: early }).periodLabel).toBe('October');
  });
});

describe('sendNativeWidgetData', () => {
  const base = buildWidgetData({ uidHash: 'abc123abc123abc1', estThisMonth: 100, hasPlan: true, monthCount: 2, standing: { rank: 1, of: 4 }, now });

  it('skips repeats that differ only in updatedAt, and resends them after the refresh window', () => {
    const t0 = 1_000_000;
    sendNativeWidgetData(base, t0);
    sendNativeWidgetData({ ...base, updatedAt: '2026-10-17T15:01:00.000Z' }, t0 + 60_000);
    expect(posted).toHaveLength(1);
    sendNativeWidgetData({ ...base, updatedAt: '2026-10-17T15:31:00.000Z' }, t0 + WIDGET_REFRESH_MS);
    expect(posted).toHaveLength(2);
  });

  it('sends when the numbers change', () => {
    sendNativeWidgetData(base);
    sendNativeWidgetData({ ...base, estPayMtd: 150 });
    expect(posted.map((m) => (m.data as { estPayMtd: number }).estPayMtd)).toEqual([100, 150]);
  });

  it('clearNativeExtras sends badge 0 and widget null once', () => {
    sendNativeBadge(3);
    sendNativeWidgetData(base);
    posted = [];
    clearNativeExtras();
    clearNativeExtras();
    expect(posted).toEqual([
      { type: 'badge', count: 0 },
      { type: 'widgetData', data: null },
    ]);
  });

  it('does nothing in a browser', () => {
    stub({ app: false });
    sendNativeWidgetData(base);
    clearNativeExtras();
    expect(posted).toEqual([]);
  });
});

describe('buildOwnerWidgetData', () => {
  const at = new Date('2026-10-17T15:00:00.000Z');
  const money = { month: { current: { installs: 31 } } } as unknown as MoneySummary;
  const markets: MarketsSummary = { markets: [], total: 46, placedByRep: 0, topRep: { name: 'Wil T.', sales: 9 } };

  it('sends the company numbers the owner dashboard loaded, with no money amounts', () => {
    const data = buildOwnerWidgetData({ uidHash: 'abc123abc123abc1', money, markets, now: at });
    expect(data).toEqual({
      kind: 'owner',
      uidHash: 'abc123abc123abc1',
      periodLabel: 'October',
      companySalesMtd: 46,
      companyInstallsMtd: 31,
      topRepName: 'Wil T.',
      topRepSalesMtd: 9,
      updatedAt: '2026-10-17T15:00:00.000Z',
    });
    sendNativeWidgetData(data);
    expect(posted).toEqual([{ type: 'widgetData', data }]);
  });

  it('a failed section, or no top rep yet, sends null for those figures', () => {
    expect(buildOwnerWidgetData({ uidHash: 'abc123abc123abc1', money: null, markets: null, now: at })).toMatchObject({
      companySalesMtd: null,
      companyInstallsMtd: null,
      topRepName: null,
      topRepSalesMtd: null,
    });
    const cached = { markets: [], total: 3, placedByRep: 0 }; // cached before topRep existed
    expect(buildOwnerWidgetData({ uidHash: 'abc123abc123abc1', money, markets: cached, now: at })).toMatchObject({
      companySalesMtd: 3,
      topRepName: null,
      topRepSalesMtd: null,
    });
  });
});
