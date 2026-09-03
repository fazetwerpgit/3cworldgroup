import { describe, expect, it } from 'vitest';
import type { FiberOrder, Sale } from '@/types';
import {
  buildMergedBook,
  bookForMonth,
  PORTAL_LOGGING_START,
  VALUE_GAP_MIN,
  type MergedBook,
  type MergedRow,
} from './mergeBook';

const NOW = new Date('2026-09-15T12:00:00');
const SEPTEMBER = { year: 2026, month: 8 };
const AUGUST = { year: 2026, month: 7 };

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 's1',
    salesRepId: 'rep1',
    salesRepName: 'Wil Teasdale',
    customerName: 'M. Garcia',
    customerAddress: '5780 Hall St SE',
    saleType: 'new_service',
    products: [],
    totalValue: 60,
    totalPoints: 0,
    status: 'approved',
    saleDate: new Date('2026-09-04T12:00:00'),
    installDate: new Date('2026-09-20T12:00:00'),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Sale;
}

function order(overrides: Partial<FiberOrder> = {}): FiberOrder {
  return {
    id: 'TMO20260824UZMTV',
    status: 'pending_install',
    rawStatus: 'Pending Installation',
    repDealerId: 'dealer-1',
    repName: 'Wil Teasdale',
    matchedUserId: 'rep1',
    orderDate: '2026-09-02',
    estInstallDate: '2026-09-20',
    activationDate: null,
    cancellationDate: null,
    deactivationDate: null,
    fiberPlan: 'TFiber 1 Gig',
    mrc: 60,
    address: '5780 Hall St SE',
    unit: null,
    city: 'Grand Rapids',
    state: 'MI',
    zip: '49546',
    breakageReason: null,
    breakageNotes: null,
    customerName: null,
    sourceSheet: 'Pending Installation',
    reportReceivedAt: '2026-09-03T00:00:00.000Z',
    updatedAt: '2026-09-03T00:00:00.000Z',
    ...overrides,
  };
}

function build(sales: Sale[], orders: FiberOrder[]): MergedBook {
  return buildMergedBook(sales, orders, { now: NOW });
}

function row(book: MergedBook, key: string): MergedRow {
  const found = book.rows.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`no row ${key} in ${book.rows.map((r) => r.key).join(', ')}`);
  return found;
}

// One test per row of the precedence matrix in the spec, top down.
describe('buildMergedBook row states', () => {
  it('1 — a sale cancelled by us is cancelled whatever the carrier says', () => {
    const book = build(
      [sale({ status: 'cancelled' })],
      [order({ status: 'active', activationDate: '2026-09-10' })]
    );

    expect(row(book, 's1').state).toBe('cancelled');
    expect(row(book, 's1').order).not.toBeNull();
    expect(book.cancelled.map((r) => r.key)).toEqual(['s1']);
    expect(book.neverLogged).toHaveLength(0);
  });

  it('2 — a sale with an order is agreed, taking status from the carrier and money from the sale', () => {
    const book = build([sale({ totalValue: 60 })], [order({ status: 'active', mrc: 60 })]);
    const merged = row(book, 's1');

    expect(merged.state).toBe('agreed');
    expect(merged.bucket).toBe('installed'); // carrier says active, sale's date is still future
    expect(merged.value).toBe(60);
    expect(merged.valueGap).toBeNull();
  });

  it('3 — a sale with no order is waiting on the report and keeps its own install date', () => {
    const book = build([sale()], []);
    const merged = row(book, 's1');

    expect(merged.state).toBe('waiting');
    expect(merged.order).toBeNull();
    expect(merged.bucket).toBe('scheduled');
  });

  it('4 — an order nobody logged, matched to a rep, is never_logged and worth nothing', () => {
    const book = build([], [order({ matchedUserId: 'rep1' })]);
    const merged = row(book, 'order:TMO20260824UZMTV');

    expect(merged.state).toBe('never_logged');
    expect(merged.repId).toBe('rep1');
    expect(merged.value).toBe(0);
    expect(merged.counted).toBe(false);
    expect(book.neverLogged).toHaveLength(1);
  });

  it('5 — an order with no matched rep is unassigned and cannot sit in a rep list', () => {
    const book = build([], [order({ matchedUserId: null })]);
    const merged = row(book, 'order:TMO20260824UZMTV');

    expect(merged.state).toBe('unassigned');
    expect(merged.repId).toBeNull();
    expect(book.unassigned).toHaveLength(1);
    expect(book.reps).toHaveLength(0);
  });
});

describe('CALL 1 — carrier-only rows never become money', () => {
  it('keeps never_logged and unassigned out of count, value and pay', () => {
    const book = build(
      [sale({ totalValue: 60 })],
      [
        order({ id: 'a', address: '9 Other Ave', matchedUserId: 'rep1', mrc: 45 }),
        order({ id: 'b', address: '77 Nobody Rd', matchedUserId: null, mrc: 55 }),
      ]
    );

    expect(book.rows.filter((r) => r.counted).map((r) => r.key)).toEqual(['s1']);
    expect(book.totalValue).toBe(60);
    expect(book.notLoggedCount).toBe(2);
  });

  it('counts a rejected or cancelled sale out of the money but keeps its row', () => {
    const book = build(
      [
        sale({ id: 'live' }),
        sale({ id: 'dead', status: 'cancelled', customerAddress: '9 Other Ave' }),
        sale({ id: 'gone', status: 'rejected', customerAddress: '77 Nobody Rd' }),
      ],
      []
    );

    expect(book.rows).toHaveLength(3);
    expect(book.totalValue).toBe(60);
    expect(row(book, 'dead').counted).toBe(false);
    expect(row(book, 'gone').counted).toBe(false);
  });
});

describe('CALL 2 — the carrier wins the status, the sale keeps the money', () => {
  it('flags a value gap when both sides carry a number and they differ materially', () => {
    const book = build([sale({ totalValue: 60 })], [order({ mrc: 30 })]);
    const merged = row(book, 's1');

    expect(merged.valueGap).toEqual({ saleValue: 60, carrierMrc: 30 });
    expect(merged.value).toBe(60); // the money never moves to the carrier's number
  });

  it('stays quiet below the material threshold and fires at it, either direction', () => {
    const gap = (saleValue: number, mrc: number) =>
      row(build([sale({ totalValue: saleValue })], [order({ mrc })]), 's1').valueGap;

    expect(VALUE_GAP_MIN).toBe(25);
    expect(gap(60, 50)).toBeNull(); // $10 — the noise that fired on 95% of rows
    expect(gap(60, 35.01)).toBeNull(); // a cent under the threshold
    expect(gap(60, 35)).toEqual({ saleValue: 60, carrierMrc: 35 }); // exactly $25 counts
    expect(gap(35, 60)).toEqual({ saleValue: 35, carrierMrc: 60 }); // sign does not matter
  });

  it('flags no gap on float noise between two identical dollar amounts', () => {
    // The same $89.99 reached from different arithmetic: 89.99 exactly, and
    // 89.98 + 0.01, which lands at 89.99000000000001.
    const drifted = 89.98 + 0.01;
    expect(drifted).not.toBe(89.99);
    expect(row(build([sale({ totalValue: 89.99 })], [order({ mrc: drifted })]), 's1').valueGap).toBeNull();
    // Rounding is applied to the threshold too, not just to equality.
    expect(row(build([sale({ totalValue: 89.99 })], [order({ mrc: 64.99 })]), 's1').valueGap).toEqual({
      saleValue: 89.99,
      carrierMrc: 64.99,
    });
  });

  it('flags no gap when either side lacks a number', () => {
    expect(row(build([sale({ totalValue: 60 })], [order({ mrc: null })]), 's1').valueGap).toBeNull();
    expect(
      row(build([sale({ totalValue: undefined as unknown as number })], [order({ mrc: 45 })]), 's1').valueGap
    ).toBeNull();
    expect(row(build([sale({ totalValue: 60 })], [order({ mrc: 60 })]), 's1').valueGap).toBeNull();
  });

  it('pulls an agreed row back to attention on a breakage', () => {
    expect(row(build([sale()], [order({ status: 'breakage' })]), 's1').bucket).toBe('attention');
  });

  it('buckets an order-only row off the carrier status', () => {
    const only = (o: Partial<FiberOrder>) =>
      row(build([], [order({ address: '9 Other Ave', ...o })]), 'order:TMO20260824UZMTV').bucket;

    expect(only({ status: 'active' })).toBe('installed');
    expect(only({ status: 'pending_install', estInstallDate: '2026-09-20' })).toBe('scheduled');
    expect(only({ status: 'pending_install', estInstallDate: '2026-09-01' })).toBe('attention');
    expect(only({ status: 'pending_install', estInstallDate: null })).toBe('attention');
    expect(only({ status: 'cancelled' })).toBe('attention');
  });
});

describe('join precedence', () => {
  it('lets a manual link beat a conflicting address match', () => {
    const linked = order({
      id: 'linked',
      address: '77 Nobody Rd',
      mrc: 45,
      saleLink: { saleId: 's1', by: 'admin1', byName: 'Jacob', at: '2026-09-03T00:00:00.000Z' },
    });
    const guessable = order({ id: 'guess', address: '5780 Hall St SE' });
    const book = build([sale()], [linked, guessable]);
    const merged = row(book, 's1');

    expect(merged.order?.id).toBe('linked');
    expect(merged.linkedManually).toBe(true);
    // The address-matched order lost the sale, so it stands as its own row
    // rather than silently disappearing.
    expect(row(book, 'order:guess').state).toBe('never_logged');
  });

  it('lets saleLink.saleId === null suppress the address match and dismiss the order', () => {
    const book = build(
      [sale()],
      [
        order({
          id: 'refused',
          saleLink: { saleId: null, by: 'admin1', byName: 'Jacob', at: '2026-09-03T00:00:00.000Z' },
        }),
      ]
    );

    expect(row(book, 's1').state).toBe('waiting');
    expect(row(book, 's1').order).toBeNull();
    expect(row(book, 'order:refused').state).toBe('dismissed');
  });

  it('gives a sale at most one order and never reuses a linked one', () => {
    const link = { by: 'admin1', byName: 'Jacob', at: '2026-09-03T00:00:00.000Z' };
    const book = build(
      [sale()],
      [
        order({ id: 'first', address: '77 Nobody Rd', saleLink: { saleId: 's1', ...link } }),
        order({ id: 'second', address: '9 Other Ave', saleLink: { saleId: 's1', ...link } }),
      ]
    );

    expect(row(book, 's1').order?.id).toBe('first');
    expect(row(book, 'order:second').state).toBe('never_logged');
    // The loser's link took no effect, so it reads as dangling rather than as
    // an order nobody ever logged.
    expect(row(book, 'order:second').linkBroken).toBe(true);
    expect(book.rows).toHaveLength(2);
  });

  it('gives one order to one sale: a second sale at the same address waits', () => {
    const first = sale({ id: 'first', customerAddress: '5780 Hall St SE' });
    const second = sale({ id: 'second', customerAddress: '5780 Hall St SE, Grand Rapids MI' });
    const book = build([first, second], [order({ id: 'one-install' })]);

    expect(row(book, 'first').order?.id).toBe('one-install');
    expect(row(book, 'first').state).toBe('agreed');
    expect(row(book, 'second').order).toBeNull();
    expect(row(book, 'second').state).toBe('waiting');
    // The order is spoken for, so it is not also a never_logged row.
    expect(book.neverLogged).toHaveLength(0);
    expect(book.rows).toHaveLength(2);
  });

  it('falls back to the address guess when there is no link', () => {
    const book = build([sale({ customerAddress: '5780 Hall St SE, Grand Rapids MI' })], [order()]);

    expect(row(book, 's1').order?.id).toBe('TMO20260824UZMTV');
    expect(row(book, 's1').linkedManually).toBe(false);
  });
});

describe('dismissed — "Not a sale" has to be visible', () => {
  const link = { by: 'admin1', byName: 'Jacob', at: '2026-09-03T00:00:00.000Z' };
  const stray = (id: string, address: string) => order({ id, address, matchedUserId: 'rep1' });
  const dismissedOrder = (id: string, address: string) =>
    order({ id, address, matchedUserId: 'rep1', saleLink: { saleId: null, ...link } });

  it('takes a dismissed order out of Not logged while keeping its row', () => {
    const before = build([], [stray('a', '9 Other Ave'), stray('b', '77 Nobody Rd')]);
    expect(before.notLoggedCount).toBe(2);

    const after = build([], [dismissedOrder('a', '9 Other Ave'), stray('b', '77 Nobody Rd')]);
    expect(after.notLoggedCount).toBe(1);
    expect(after.rows).toHaveLength(2);
    expect(after.dismissed.map((r) => r.key)).toEqual(['order:a']);
    expect(after.neverLogged.map((r) => r.key)).toEqual(['order:b']);
  });

  it('keeps a dismissed row out of the rep rollups, and its order for the undo', () => {
    const book = build([sale({ id: 'live' })], [dismissedOrder('a', '9 Other Ave')]);
    const dismissed = row(book, 'order:a');

    expect(dismissed.counted).toBe(false);
    expect(dismissed.value).toBe(0);
    expect(dismissed.order?.id).toBe('a'); // the undo needs the order it came from
    expect(dismissed.linkBroken).toBe(false); // a null link is deliberate, not broken
    expect(book.reps.find((r) => r.repId === 'rep1')?.rows.map((r) => r.key)).toEqual(['live']);
    expect(book.reps.find((r) => r.repId === 'rep1')?.notLogged).toBe(0);
  });

  it('dismisses an unmatched order too, out of Not logged and out of the unassigned drawer', () => {
    const book = build([], [order({ id: 'a', matchedUserId: null, saleLink: { saleId: null, ...link } })]);

    expect(row(book, 'order:a').state).toBe('dismissed');
    expect(book.unassigned).toHaveLength(0);
    expect(book.notLoggedCount).toBe(0);
    expect(book.rows).toHaveLength(1);
  });
});

describe('historic — carrier rows from before the portal are not accusations', () => {
  const carrier = (overrides: Partial<FiberOrder>) =>
    order({ id: 'old', address: '9 Other Ave', matchedUserId: 'rep1', ...overrides });

  it('starts counting on the cutoff day, not before it', () => {
    expect(PORTAL_LOGGING_START).toBe('2026-04-01');

    const before = build([], [carrier({ orderDate: '2026-03-31' })]);
    expect(row(before, 'order:old').state).toBe('historic');
    expect(before.notLoggedCount).toBe(0);
    expect(before.neverLogged).toHaveLength(0);
    expect(before.historic.map((r) => r.key)).toEqual(['order:old']);

    const on = build([], [carrier({ orderDate: '2026-04-01' })]);
    expect(row(on, 'order:old').state).toBe('never_logged');
    expect(on.notLoggedCount).toBe(1);
    expect(on.historic).toHaveLength(0);
  });

  it('falls back to estInstallDate and treats an undated order as unknown, not old', () => {
    const estimated = build([], [carrier({ orderDate: null, estInstallDate: '2025-11-20' })]);
    expect(row(estimated, 'order:old').state).toBe('historic');

    const undated = build([], [carrier({ orderDate: null, estInstallDate: null })]);
    expect(row(undated, 'order:old').state).toBe('never_logged');
    expect(undated.notLoggedCount).toBe(1);
  });

  it('leaves a row that HAS a sale alone however old the order is', () => {
    const old = sale({ saleDate: new Date('2025-11-20T12:00:00') });
    const book = build([old], [order({ orderDate: '2025-11-20', status: 'active' })]);

    expect(row(book, 's1').state).toBe('agreed');
    expect(row(book, 's1').counted).toBe(true);
    expect(book.historic).toHaveLength(0);
    expect(book.totalValue).toBe(60);
  });

  it('keeps historic rows in the book but out of every figure and rollup', () => {
    const book = build(
      [sale({ id: 'live' })],
      [
        carrier({ id: 'h1', orderDate: '2025-11-20', status: 'active' }),
        carrier({ id: 'h2', address: '77 Nobody Rd', orderDate: '2026-01-04' }),
      ]
    );

    expect(book.rows).toHaveLength(3);
    expect(book.historic.map((r) => r.key).sort()).toEqual(['order:h1', 'order:h2']);
    expect(book.notLoggedCount).toBe(0);
    expect(book.counts).toEqual({ attention: 0, scheduled: 1, installed: 0 });
    expect(book.reps.find((r) => r.repId === 'rep1')?.rows.map((r) => r.key)).toEqual(['live']);
    expect(book.reps.find((r) => r.repId === 'rep1')?.notLogged).toBe(0);
    expect(book.historic.every((r) => !r.counted && r.value === 0)).toBe(true);
  });

  it('lets an explicit dismissal outrank the cutoff, so the undo survives', () => {
    const book = build(
      [],
      [
        carrier({
          orderDate: '2025-11-20',
          saleLink: { saleId: null, by: 'admin1', byName: 'Jacob', at: '2026-09-03T00:00:00.000Z' },
        }),
      ]
    );

    expect(row(book, 'order:old').state).toBe('dismissed');
    expect(book.historic).toHaveLength(0);
  });
});

describe('linkBroken — a dangling link must not read as "nobody logged it"', () => {
  const link = { by: 'admin1', byName: 'Jacob', at: '2026-09-03T00:00:00.000Z' };

  it('flags an order whose linked sale is not in the book, and keeps the row visible', () => {
    const book = build(
      [],
      [order({ id: 'orphan', saleLink: { saleId: 'deleted-sale', ...link } })]
    );
    const orphan = row(book, 'order:orphan');

    expect(orphan.linkBroken).toBe(true);
    expect(orphan.state).toBe('never_logged'); // still visible, still in the rep's list
    expect(book.rows).toHaveLength(1);
  });

  it('flags nothing when the link resolves, or when there is no link at all', () => {
    const linked = build([sale()], [order({ id: 'ok', address: '77 Nobody Rd', saleLink: { saleId: 's1', ...link } })]);
    expect(row(linked, 's1').linkBroken).toBe(false);
    expect(row(linked, 's1').linkedManually).toBe(true);

    const guessed = build([sale()], [order({ id: 'guess' })]);
    expect(row(guessed, 's1').linkBroken).toBe(false);

    const plain = build([], [order({ id: 'plain', address: '9 Other Ave' })]);
    expect(row(plain, 'order:plain').linkBroken).toBe(false);
  });
});

describe('month attribution', () => {
  it('files a sale row by its sale date, not its install date', () => {
    const august = sale({ saleDate: new Date('2026-08-14T12:00:00'), installDate: new Date('2026-09-20T12:00:00') });
    expect(row(build([august], []), 's1').month).toEqual(AUGUST);
  });

  it('files an order-only row by orderDate, falling back to estInstallDate', () => {
    const dated = build([], [order({ orderDate: '2026-08-14', estInstallDate: '2026-09-20' })]);
    expect(row(dated, 'order:TMO20260824UZMTV').month).toEqual(AUGUST);

    const estimated = build([], [order({ orderDate: null, estInstallDate: '2026-09-01' })]);
    // Read at local noon: a bare yyyy-mm-dd must not slide into the previous month.
    expect(row(estimated, 'order:TMO20260824UZMTV').month).toEqual(SEPTEMBER);

    const undated = build([], [order({ orderDate: null, estInstallDate: null })]);
    expect(row(undated, 'order:TMO20260824UZMTV').month).toBeNull();
  });
});

describe('bookForMonth', () => {
  const september = sale({ id: 'sep', saleDate: new Date('2026-09-04T12:00:00') });
  const august = sale({ id: 'aug', saleDate: new Date('2026-08-14T12:00:00'), customerAddress: '9 Other Ave' });
  const july = sale({ id: 'jul', saleDate: new Date('2026-07-02T12:00:00'), customerAddress: '77 Nobody Rd' });
  const undated = order({ id: 'nodate', address: '31 Undated Ln', orderDate: null, estInstallDate: null });

  it('keeps the month plus every undated row, and counts the rest as older', () => {
    const { book, olderCount, newerCount } = bookForMonth(build([september, august, july], [undated]), SEPTEMBER);

    expect(book.rows.map((r) => r.key).sort()).toEqual(['order:nodate', 'sep']);
    expect(olderCount).toBe(2);
    expect(newerCount).toBe(0);
  });

  it('counts newer rows separately instead of calling them older', () => {
    const { book, olderCount, newerCount } = bookForMonth(build([september, august, july], [undated]), AUGUST);

    expect(book.rows.map((r) => r.key).sort()).toEqual(['aug', 'order:nodate']);
    expect(olderCount).toBe(1); // July
    expect(newerCount).toBe(1); // September — visible as "+1 newer", never silently gone
  });

  it('counts an undated row in neither direction, in every month', () => {
    const built = build([], [undated]);

    for (const month of [SEPTEMBER, AUGUST, { year: 2030, month: 0 }, { year: 2020, month: 11 }]) {
      const { book, olderCount, newerCount } = bookForMonth(built, month);
      expect(book.rows.map((r) => r.key)).toEqual(['order:nodate']);
      expect(olderCount).toBe(0);
      expect(newerCount).toBe(0);
    }
  });

  it('shows a row with no month in every month view', () => {
    const built = build([september, august, july], [undated]);

    for (const month of [SEPTEMBER, AUGUST, { year: 2026, month: 6 }, { year: 2025, month: 0 }]) {
      expect(bookForMonth(built, month).book.rows.some((r) => r.key === 'order:nodate')).toBe(true);
    }
  });

  it('does not count historic or dismissed rows as older, and still lists them', () => {
    const link = { by: 'admin1', byName: 'Jacob', at: '2026-09-03T00:00:00.000Z' };
    const built = build(
      [september],
      [
        order({ id: 'hist', address: '9 Other Ave', orderDate: '2025-11-20' }),
        order({ id: 'quiet', address: '77 Nobody Rd', orderDate: '2026-08-14', saleLink: { saleId: null, ...link } }),
      ]
    );
    const { book, olderCount, newerCount } = bookForMonth(built, SEPTEMBER);

    // Neither is work the month picker is hiding, so neither inflates "+N older"...
    expect(olderCount).toBe(0);
    expect(newerCount).toBe(0);
    // ...and both stay listed in their own drawer inside the month view.
    expect(book.historic.map((r) => r.key)).toEqual(['order:hist']);
    expect(book.dismissed.map((r) => r.key)).toEqual(['order:quiet']);
  });

  it('still counts a real out-of-month row as older', () => {
    const stray = order({ id: 'late', address: '9 Other Ave', orderDate: '2026-08-14' });
    const { book, olderCount } = bookForMonth(build([september], [stray]), SEPTEMBER);

    expect(row(book, 'sep')).toBeTruthy();
    expect(olderCount).toBe(1); // post-cutoff, never_logged, genuinely out of view
  });

  it('loses nothing: the month, the older rows and the whole book always reconcile', () => {
    const built = build([september, august, july], [undated]);
    const seen = new Set<string>();

    for (const month of [SEPTEMBER, AUGUST, { year: 2026, month: 6 }]) {
      const { book, olderCount, newerCount } = bookForMonth(built, month);
      // Every row is either kept or counted once — undated, historic and
      // dismissed rows are always kept rather than counted, so the identity
      // holds over the whole book, not just the month-axis rows.
      expect(book.rows.length + olderCount + newerCount).toBe(built.rows.length);
      for (const r of book.rows) seen.add(r.key);
    }

    expect(seen).toEqual(new Set(built.rows.map((r) => r.key)));
  });

  it('returns the whole book untouched for the all-time view', () => {
    const built = build([september, august, july], [undated]);
    const { book, olderCount, newerCount } = bookForMonth(built, null);

    expect(book).toBe(built);
    expect(olderCount).toBe(0);
    expect(newerCount).toBe(0);
  });

  it('re-derives the figures from the month it kept', () => {
    const { book } = bookForMonth(build([september, august, july], [undated]), SEPTEMBER);

    expect(book.totalValue).toBe(60);
    expect(book.counts.scheduled).toBe(1);
    expect(book.notLoggedCount).toBe(1);
  });
});

describe('rep rollups', () => {
  const two = sale({ id: 'two', salesRepId: 'rep2', salesRepName: 'Dana', customerAddress: '9 Other Ave', totalValue: 120 });
  const oneA = sale({ id: 'one-a', totalValue: 60 });
  const oneB = sale({ id: 'one-b', customerAddress: '77 Nobody Rd', totalValue: 60 });

  it('orders reps by value desc, then count desc', () => {
    const book = build([oneA, oneB, two], []);
    expect(book.reps.map((r) => [r.repId, r.value, r.count])).toEqual([
      ['rep1', 120, 2],
      ['rep2', 120, 1],
    ]);
  });

  it('holds never_logged rows in the rep list but out of the rep count and value', () => {
    const stray = order({ id: 'stray', address: '31 Undated Ln', matchedUserId: 'rep1', mrc: 45 });
    const book = build([oneA], [stray]);
    const rep = book.reps.find((r) => r.repId === 'rep1');

    expect(rep?.rows.map((r) => r.key).sort()).toEqual(['one-a', 'order:stray']);
    expect(rep?.count).toBe(1);
    expect(rep?.value).toBe(60);
    expect(rep?.notLogged).toBe(1);
  });

  it('keeps cancelled and unassigned rows out of every rep list', () => {
    const book = build(
      [sale({ id: 'dead', status: 'cancelled' })],
      [order({ id: 'nobody', address: '31 Undated Ln', matchedUserId: null })]
    );

    expect(book.reps).toHaveLength(0);
    expect(book.rows).toHaveLength(2);
  });
});
