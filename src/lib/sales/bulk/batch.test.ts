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
  type BulkRow,
} from './batch';

const PATH = (n: number) => `form-attachments/r1/sale-proof/${String(n).padStart(32, 'a')}_00000${n}/`;
const id = (n: number) => String(n).padStart(32, '0');
const gig = addPlanToProducts([], getPlanById('tfiber-1gig')!);

/** A row the server would take. */
function ready(n: number, over: Partial<BulkRow> = {}): BulkRow {
  const row = newBulkRow(id(n), `IMG_${n}.png`);
  return {
    ...row,
    phase: 'read',
    hash: `hash-${n}`,
    proofPath: PATH(n),
    products: gig,
    formData: {
      ...row.formData,
      customerName: `Customer ${n}`,
      customerAddress: `${n} Main St, Austin, TX`,
      orderNumberOrBtn: `ORD-${1000 + n}`,
      installDate: '2099-01-10',
    },
    ...over,
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

  it('matches order numbers however they were typed', () => {
    const second = ready(2);
    second.formData = { ...second.formData, orderNumberOrBtn: ' ord 1001 ' };
    const repeats = findRepeats([ready(1), second]);
    expect(repeats.get(id(2))).toEqual({ of: 1, by: 'order' });
  });

  it('leaves rows with no order number and no hash alone', () => {
    const a = ready(1, { hash: null });
    const b = ready(2, { hash: null });
    a.formData = { ...a.formData, orderNumberOrBtn: '' };
    b.formData = { ...b.formData, orderNumberOrBtn: '' };
    expect(findRepeats([a, b]).size).toBe(0);
  });
});

describe('rowStatus', () => {
  it('walks a row from upload to ready', () => {
    const row = newBulkRow(id(1), 'a.png');
    expect(rowStatus(row, undefined).kind).toBe('uploading');
    expect(rowStatus({ ...row, phase: 'reading' }, undefined).kind).toBe('reading');
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
    const blank = { ...newBulkRow(id(1), 'a.png'), phase: 'read_failed' as const, proofPath: PATH(1) };
    expect(rowStatus(blank, undefined).kind).toBe('read_failed');
    expect(rowStatus({ ...ready(1), phase: 'read_failed' }, undefined).kind).toBe('ready');
  });

  it('puts results and repeats ahead of the rest', () => {
    const dup = { existingSaleId: null, existingRepName: 'Dana W.', existingSaleDate: null, existingCustomerFirstName: null, existingIsMine: false };
    expect(rowStatus(ready(1, { result: { kind: 'logged', saleId: 's1' } }), undefined).kind).toBe('logged');
    expect(rowStatus(ready(1, { result: { kind: 'already', duplicate: dup } }), undefined).kind).toBe('already');
    expect(rowStatus(ready(1, { sending: true }), undefined).kind).toBe('sending');
    expect(rowStatus(ready(2), { of: 1, by: 'order' })).toEqual({ kind: 'repeat', repeat: { of: 1, by: 'order' }, problems: [] });
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
});

describe('applyScanToRow', () => {
  it('fills an empty row, picks the plan and dates a past install', () => {
    const row = { ...newBulkRow(id(1), 'a.png'), phase: 'reading' as const, proofPath: PATH(1) };
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

  it('drops screenshots that never got uploaded and counts them', () => {
    writeBulkBatch(KEY, [newBulkRow(id(1), 'a.png'), ready(2), { ...newBulkRow(id(3), 'c.png'), phase: 'upload_failed' }]);
    const saved = readBulkBatch(KEY);
    expect(saved?.rows.map((row) => row.id)).toEqual([id(2)]);
    expect(saved?.lost).toBe(2);
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
