// @vitest-environment jsdom
//
// The bulk batch rules: repeats inside the batch (same picture or same order
// number), each row's status, the default include/skip pick, what the reader
// fills in, the summary line, and the saved copy.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPlanById } from '@/types';
import { addPlanToProducts } from '@/lib/sales/planSelection';
import { todaySaleDateInput } from '@/lib/sales/saleDate';
import {
  BULK_MAX_AGE_MS,
  applyScanToRow,
  batchSettled,
  batchSummary,
  findRepeats,
  hashBytes,
  isIncluded,
  newBulkRow,
  readBulkBatch,
  rowProblems,
  rowStatus,
  sendableRows,
  summaryText,
  writeBulkBatch,
  newBulkShot,
  orderConflict,
  rowProofPaths,
  type BulkRow,
  type BulkShot,
} from './batch';

const PATH = (n: number) => `form-attachments/r1/sale-proof/${String(n).padStart(32, 'a')}_00000${n}/`;
const id = (n: number) => String(n).padStart(32, '0');
const gig = addPlanToProducts([], getPlanById('tfiber-1gig')!);

type Over = Partial<BulkRow> & Partial<Pick<BulkShot, 'hash' | 'phase' | 'proofPath' | 'readBusy' | 'scan'>>;
const SHOT_KEYS = ['hash', 'phase', 'proofPath', 'readBusy', 'scan'] as const;

/** A sale of one screenshot; screenshot fields in `over` go on the screenshot. */
function blank(n: number, over: Over = {}): BulkRow {
  const shotOver: Partial<BulkShot> = {};
  const rowOver: Partial<BulkRow> = { ...over };
  for (const key of SHOT_KEYS) {
    if (key in over) {
      (shotOver as Record<string, unknown>)[key] = over[key];
      delete (rowOver as Record<string, unknown>)[key];
    }
  }
  const row = newBulkRow(id(n), { ...newBulkShot(id(100 + n), `IMG_${n}.png`, n), ...shotOver });
  return { ...row, ...rowOver };
}

/** A sale the server would take. */
function ready(n: number, over: Over = {}): BulkRow {
  const row = blank(n, { phase: 'read', hash: `hash-${n}`, proofPath: PATH(n), ...over });
  return {
    ...row,
    products: gig,
    formData: {
      ...row.formData,
      customerName: `Customer ${n}`,
      customerAddress: `${n} Main St, Austin, TX`,
      orderNumberOrBtn: `ORD-${1000 + n}`,
      installDate: '2099-01-10',
    },
    ...Object.fromEntries(Object.entries(over).filter(([key]) => !(SHOT_KEYS as readonly string[]).includes(key))),
  };
}

describe('findRepeats', () => {
  it('flags the later row with the same picture, pointing at the first', () => {
    const rows = [ready(1), ready(2, { hash: 'hash-1' }), ready(3, { hash: 'hash-1' })];
    const repeats = findRepeats(rows);
    expect(repeats.get(id(1))).toBeUndefined();
    expect(repeats.get(id(2))).toEqual({ of: 1, by: 'image' });
    expect(repeats.get(id(3))).toEqual({ of: 1, by: 'image' });
  });

  it('two different screenshots with the same order number are not a repeat (they are one sale)', () => {
    const second = ready(2);
    second.formData = { ...second.formData, orderNumberOrBtn: ' ord 1001 ' };
    expect(findRepeats([ready(1), second]).size).toBe(0);
  });

  it('leaves screenshots with no fingerprint alone', () => {
    expect(findRepeats([ready(1, { hash: null }), ready(2, { hash: null })]).size).toBe(0);
  });
});

describe('rowStatus', () => {
  it('walks a row from upload to ready', () => {
    expect(rowStatus(blank(1), undefined).kind).toBe('uploading');
    expect(rowStatus(blank(1, { phase: 'reading' }), undefined).kind).toBe('reading');
    expect(rowStatus(ready(1), undefined)).toEqual({ kind: 'ready' });
  });

  it('says what a row is missing, in the same rules as the Log Sale form', () => {
    const row = ready(1, { products: [] });
    row.formData = { ...row.formData, installDate: '', customerAddress: ' ' };
    expect(rowStatus(row, undefined)).toEqual({
      kind: 'needs_info',
      problems: ['No plan', 'No address', 'No install date'],
    });
  });

  it('flags a sale date after the install date', () => {
    const row = ready(1);
    row.formData = { ...row.formData, saleDate: '2099-02-01', installDate: '2099-01-10' };
    // A future sale date is caught first.
    expect(rowProblems(row)).toEqual(['Sale date cannot be in the future']);
    row.formData = { ...row.formData, saleDate: todaySaleDateInput(), installDate: '2000-01-01' };
    expect(rowProblems(row)).toEqual(['Sale date cannot be after the install date']);
  });

  it('a screenshot the reader could not make out says so until the row is complete', () => {
    const unread = blank(1, { phase: 'read_failed', proofPath: PATH(1) });
    expect(rowStatus(unread, undefined)).toMatchObject({ kind: 'read_failed', busy: false });
    expect(rowStatus(ready(1, { phase: 'read_failed' }), undefined).kind).toBe('ready');
  });

  it('flags two screenshots of one sale with different order numbers until the rep saves it', () => {
    const row = ready(1, { scan: { orderNumberOrBtn: { value: 'ORD-1001', confidence: 'high' } } });
    row.shots = [
      ...row.shots,
      { ...newBulkShot(id(201), 'b.png', 2), phase: 'read', proofPath: PATH(2), scan: { orderNumberOrBtn: { value: 'ORD-2002', confidence: 'high' } } },
    ];
    expect(orderConflict(row)).toEqual(['ORD-1001', 'ORD-2002']);
    expect(rowStatus(row, undefined)).toEqual({ kind: 'needs_info', problems: ["Order numbers don't match"] });
    const saved = { ...row, shots: row.shots.map((shot) => ({ ...shot, checked: true })) };
    expect(orderConflict(saved)).toEqual([]);
    expect(rowStatus(saved, undefined)).toEqual({ kind: 'ready' });
    // The same number however it was read is no conflict.
    row.shots[1] = { ...row.shots[1], scan: { orderNumberOrBtn: { value: 'ord 1001', confidence: 'medium' } } };
    expect(orderConflict(row)).toEqual([]);
  });

  it('tells a busy reader apart from one that could not read the picture', () => {
    const busy = blank(1, { phase: 'read_failed', proofPath: PATH(1), readBusy: true });
    expect(rowStatus(busy, undefined)).toMatchObject({ kind: 'read_failed', busy: true });
  });

  it('a logged sale whose later edit never reached the server says so', () => {
    expect(rowStatus(ready(1, { result: { kind: 'logged', saleId: 's1', editLost: true } }), undefined)).toEqual({
      kind: 'logged',
      editLost: true,
    });
    expect(rowStatus(ready(1, { result: { kind: 'logged', saleId: 's1' } }), undefined)).toEqual({
      kind: 'logged',
      editLost: false,
    });
  });

  it('puts results and repeats ahead of the rest', () => {
    const dup = { existingSaleId: null, existingRepName: 'Dana W.', existingSaleDate: null, existingCustomerFirstName: null, existingIsMine: false };
    expect(rowStatus(ready(1, { result: { kind: 'logged', saleId: 's1' } }), undefined).kind).toBe('logged');
    expect(rowStatus(ready(1, { result: { kind: 'already', duplicate: dup } }), undefined).kind).toBe('already');
    expect(rowStatus(ready(1, { sending: true }), undefined).kind).toBe('sending');
    expect(rowStatus(ready(2), { of: 1, by: 'image' })).toEqual({ kind: 'repeat', repeat: { of: 1, by: 'image' }, problems: [] });
    expect(rowStatus(ready(1, { result: { kind: 'failed', reason: 'No signal.' } }), undefined)).toEqual({
      kind: 'failed',
      reason: 'No signal.',
    });
  });
});

describe('include and send', () => {
  it('unticks a repeat by default and keeps the rep’s own pick', () => {
    expect(isIncluded({ include: null }, undefined)).toBe(true);
    expect(isIncluded({ include: null }, { of: 1, by: 'image' })).toBe(false);
    expect(isIncluded({ include: true }, { of: 1, by: 'image' })).toBe(true);
    expect(isIncluded({ include: false }, undefined)).toBe(false);
  });

  it('sends ticked, complete rows that are not logged yet, in order', () => {
    const needsInfo = ready(4, { products: [] });
    const rows = [
      ready(1),
      ready(2, { hash: 'hash-1' }), // repeat: unticked
      ready(3, { result: { kind: 'logged', saleId: 'x' } }),
      needsInfo,
      ready(5, { include: false }),
      ready(6, { result: { kind: 'failed', reason: 'x' } }),
      ready(7, { hash: 'hash-1', include: true }), // repeat the rep ticked
    ];
    expect(sendableRows(rows).map((row) => row.id)).toEqual([id(1), id(6), id(7)]);
  });

  it('is settled only when no ticked row is left unlogged', () => {
    const dup = { existingSaleId: null, existingRepName: 'Dana W.', existingSaleDate: null, existingCustomerFirstName: null, existingIsMine: false };
    const logged = ready(1, { result: { kind: 'logged', saleId: 's1' } });
    expect(batchSettled([logged, ready(2, { result: { kind: 'already', duplicate: dup } })])).toBe(true);
    expect(batchSettled([logged, ready(2, { include: false }), ready(3, { hash: 'hash-1' })])).toBe(true);
    expect(batchSettled([logged, ready(2, { result: { kind: 'failed', reason: 'No signal.' } })])).toBe(false);
    expect(batchSettled([logged, ready(2, { products: [] })])).toBe(false);
    expect(batchSettled([logged, ready(2)])).toBe(false);
  });
});

describe('applyScanToRow', () => {
  it('fills an empty row, picks the plan and dates a past install', () => {
    const row = blank(1, { phase: 'reading', proofPath: PATH(1) });
    const { row: next, filled } = applyScanToRow(row, {
      orderNumberOrBtn: { value: 'TMF-1', confidence: 'high' },
      customerAddress: { value: '1 Elm St', confidence: 'medium' },
      installDate: { value: '2020-03-04', confidence: 'high' },
      provider: { value: 'tfiber', confidence: 'high' },
      plan: { value: 'tfiber-1gig', confidence: 'high' },
    });
    expect(filled).toBe(true);
    expect(next.formData.orderNumberOrBtn).toBe('TMF-1');
    expect(next.formData.saleDate).toBe('2020-03-04');
    expect(next.products.map((p) => p.productId)).toEqual(['tfiber-1gig']);
    expect(next.provider).toBe('tfiber');
    expect(next.flags).toEqual({ customerAddress: 'medium' });
  });

  it('never overwrites what is already there, and reports nothing read', () => {
    const row = ready(1);
    const { row: next } = applyScanToRow(row, { customerAddress: { value: 'Other', confidence: 'high' } });
    expect(next.formData.customerAddress).toBe(row.formData.customerAddress);
    expect(applyScanToRow(row, null).filled).toBe(false);
  });
});

describe('summary', () => {
  it('counts the batch the way the rep reads it', () => {
    const dup = { existingSaleId: null, existingRepName: 'Dana W.', existingSaleDate: null, existingCustomerFirstName: null, existingIsMine: false };
    const rows = [
      ...Array.from({ length: 17 }, (_, i) => ready(i + 1, { result: { kind: 'logged', saleId: `s${i}` } })),
      ready(18, { result: { kind: 'already', duplicate: dup } }),
      ready(19, { result: { kind: 'already', duplicate: dup } }),
      ready(20, { products: [] }),
    ];
    const summary = batchSummary(rows);
    expect(summaryText(summary)).toBe('17 logged, 2 already logged, 1 needs info');
    expect(summaryText({ logged: 0, already: 0, needsInfo: 3, failed: 1, skipped: 2 })).toBe(
      '3 need info, 1 not sent, 2 skipped'
    );
  });
});

describe('saved batch', () => {
  const KEY = 'sale-bulk:v1:r1';
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('round-trips rows without the in-flight flag', () => {
    writeBulkBatch(KEY, [ready(1, { sending: true, result: { kind: 'logged', saleId: 's1' } }), ready(2)]);
    const saved = readBulkBatch(KEY);
    expect(saved?.lost).toBe(0);
    expect(saved?.rows.map((row) => row.id)).toEqual([id(1), id(2)]);
    expect(saved?.rows[0].sending).toBeUndefined();
    expect(saved?.rows[0].result).toEqual({ kind: 'logged', saleId: 's1' });
    expect(saved?.rows[1].products.map((p) => p.productId)).toEqual(['tfiber-1gig']);
  });

  it('keeps a lost edit and a busy reader across a reload', () => {
    writeBulkBatch(KEY, [
      ready(1, { result: { kind: 'logged', saleId: 's1', editLost: true } }),
      blank(2, { phase: 'read_failed', proofPath: PATH(2), readBusy: true }),
    ]);
    const saved = readBulkBatch(KEY);
    expect(saved?.rows[0].result).toEqual({ kind: 'logged', saleId: 's1', editLost: true });
    expect(saved?.rows[1].shots[0].readBusy).toBe(true);
  });

  it('drops screenshots that never got uploaded and counts them', () => {
    const pair = ready(4);
    pair.shots = [...pair.shots, { ...newBulkShot(id(140), 'IMG_4b.png', 40), phase: 'uploading' }];
    writeBulkBatch(KEY, [blank(1), ready(2), blank(3, { phase: 'upload_failed' }), pair]);
    const saved = readBulkBatch(KEY);
    expect(saved?.rows.map((row) => row.id)).toEqual([id(2), id(4)]);
    // The sale keeps the screenshot that made it up.
    expect(saved?.rows[1].shots.map((shot) => shot.id)).toEqual([id(104)]);
    expect(saved?.lost).toBe(3);
  });

  it('round-trips sales of several screenshots with their readings', () => {
    const pair = ready(1, { scan: { orderNumberOrBtn: { value: 'ORD-1001', confidence: 'high' } } });
    pair.shots = [
      { ...pair.shots[0], merged: true },
      { ...newBulkShot(id(201), 'IMG_1b.png', 2), phase: 'read', proofPath: PATH(9), checked: true },
    ];
    writeBulkBatch(KEY, [{ ...pair, fixed: true }]);
    const saved = readBulkBatch(KEY);
    expect(saved?.rows).toHaveLength(1);
    expect(saved?.rows[0].fixed).toBe(true);
    expect(saved?.rows[0].shots.map((shot) => [shot.id, shot.seq, shot.merged ?? false, shot.checked ?? false])).toEqual([
      [id(101), 1, true, false],
      [id(201), 2, false, true],
    ]);
    expect(saved?.rows[0].shots[0].scan).toEqual({ orderNumberOrBtn: { value: 'ORD-1001', confidence: 'high' } });
    expect(rowProofPaths(saved!.rows[0])).toEqual([PATH(1), PATH(9)]);
  });

  it('loads a batch saved before sales could hold several screenshots', () => {
    // One screenshot per row, its file fields on the row itself.
    const legacy = (n: number) => ({
      id: id(n),
      fileName: `IMG_${n}.png`,
      hash: `hash-${n}`,
      proofPath: PATH(n),
      phase: 'read',
      formData: { ...ready(n).formData },
      products: gig,
      provider: 'tfiber',
      saleDateTouched: false,
      flags: {},
      include: null,
      result: n === 1 ? { kind: 'logged', saleId: 's1' } : null,
    });
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ rows: [legacy(1), legacy(2), { ...legacy(3), phase: 'uploading', proofPath: null }], savedAt: Date.now() })
    );
    const saved = readBulkBatch(KEY);
    expect(saved?.lost).toBe(1);
    expect(saved?.rows.map((row) => row.id)).toEqual([id(1), id(2)]);
    const second = saved!.rows[1];
    expect(second.fixed).toBe(true);
    expect(second.shots).toEqual([
      { id: id(2), seq: 1, fileName: 'IMG_2.png', hash: 'hash-2', proofPath: PATH(2), phase: 'read', scan: null, merged: true },
    ]);
    expect(second.formData.customerName).toBe('Customer 2');
    expect(saved!.rows[0].result).toEqual({ kind: 'logged', saleId: 's1' });
  });

  it('forgets a batch from yesterday and anything damaged', () => {
    writeBulkBatch(KEY, [ready(1)], Date.now() - BULK_MAX_AGE_MS - 1);
    expect(readBulkBatch(KEY)).toBeNull();
    window.localStorage.setItem(KEY, '{"rows":[{"id":"nope"}],"savedAt":1}');
    expect(readBulkBatch(KEY, 2)).toBeNull();
    window.localStorage.setItem(KEY, 'not json');
    expect(readBulkBatch(KEY)).toBeNull();
  });

  it('clears on null', () => {
    writeBulkBatch(KEY, [ready(1)]);
    writeBulkBatch(KEY, null);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});

describe('hashBytes', () => {
  it('is the same for the same bytes and differs otherwise', async () => {
    const a = new TextEncoder().encode('screenshot one').buffer as ArrayBuffer;
    const a2 = new TextEncoder().encode('screenshot one').buffer as ArrayBuffer;
    const b = new TextEncoder().encode('screenshot two').buffer as ArrayBuffer;
    expect(await hashBytes(a)).toBe(await hashBytes(a2));
    expect(await hashBytes(a)).not.toBe(await hashBytes(b));
    expect(await hashBytes(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('falls back without crypto.subtle (plain-http dev server)', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      const a = new TextEncoder().encode('screenshot one').buffer as ArrayBuffer;
      const b = new TextEncoder().encode('screenshot two').buffer as ArrayBuffer;
      expect(await hashBytes(a)).toMatch(/^fnv-14-/);
      expect(await hashBytes(a)).not.toBe(await hashBytes(b));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
