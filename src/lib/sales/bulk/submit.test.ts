// The bulk send loop: one sale at a time through createSale, each under its own
// row id as clientSaleId; a 409 order duplicate becomes "already logged",
// "Log anyway" resends with allowDuplicate under the same key, and a failure
// keeps the key so a retry lands on the sale if it was written.
import { describe, expect, it, vi } from 'vitest';
import { getPlanById, type CreateSaleData } from '@/types';
import { addPlanToProducts } from '@/lib/sales/planSelection';
import type { OrderDuplicate } from '@/lib/sales/orderNumber';
import type { CreateSaleResult } from '@/hooks/useSales';
import { newBulkRow, type BulkResult, type BulkRow } from './batch';
import { replayMatchesRow, submitBulkRows, toBulkResult, type CreateSaleFn } from './submit';

const id = (n: number) => String(n).padStart(32, 'b');
const USER = { uid: 'r1', displayName: 'Wil Teasdale', email: 'w@x.com', reportsToId: 'm1' };
const DUP: OrderDuplicate = {
  existingSaleId: null,
  existingRepName: 'Dana W.',
  existingSaleDate: '2026-09-14T12:00:00.000Z',
  existingCustomerFirstName: null,
  existingIsMine: false,
};

function row(n: number): BulkRow {
  const base = newBulkRow(id(n), `IMG_${n}.png`);
  return {
    ...base,
    phase: 'read',
    proofPath: `form-attachments/r1/sale-proof/${id(n)}_00000${n}/`,
    products: addPlanToProducts([], getPlanById('tfiber-1gig')!),
    formData: { ...base.formData, customerAddress: `${n} Main St`, orderNumberOrBtn: `ORD${n}`, installDate: '2099-01-10' },
  };
}

const sale = (saleId: string, duplicate = false): CreateSaleResult =>
  ({ sale: { id: saleId }, duplicate }) as unknown as CreateSaleResult;

async function run(rows: BulkRow[], create: CreateSaleFn, extra: { allowDuplicate?: boolean; shouldStop?: () => boolean } = {}) {
  const events: string[] = [];
  const results = new Map<string, BulkResult>();
  await submitBulkRows({
    rows,
    user: USER,
    create,
    onStart: (rowId) => events.push(`start ${rowId.slice(-1)}`),
    onResult: (rowId, result) => {
      events.push(`done ${rowId.slice(-1)} ${result.kind}`);
      results.set(rowId, result);
    },
    ...extra,
  });
  return { events, results };
}

describe('submitBulkRows', () => {
  it('sends one at a time, each under its own row id', async () => {
    const sent: CreateSaleData[] = [];
    let inFlight = 0;
    const create = vi.fn<CreateSaleFn>(async (data) => {
      inFlight += 1;
      expect(inFlight).toBe(1);
      sent.push(data);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return sale(`s-${data.clientSaleId}`);
    });
    const { events, results } = await run([row(1), row(2), row(3)], create);
    expect(events).toEqual(['start 1', 'done 1 logged', 'start 2', 'done 2 logged', 'start 3', 'done 3 logged']);
    expect(sent.map((d) => d.clientSaleId)).toEqual([id(1), id(2), id(3)]);
    expect(sent[0]).toMatchObject({
      salesRepId: 'r1',
      salesRepName: 'Wil Teasdale',
      managerId: 'm1',
      customerAddress: '1 Main St',
      orderNumberOrBtn: 'ORD1',
      productSold: 'TFiber 1 Gig (1 Gbps)',
      proofScreenshotPaths: [row(1).proofPath],
      proofScreenshotPath: row(1).proofPath,
    });
    expect(sent[0].allowDuplicate).toBeUndefined();
    expect(results.get(id(2))).toEqual({ kind: 'logged', saleId: `s-${id(2)}` });
  });

  it('turns a 409 order duplicate into "already logged" and keeps going', async () => {
    const create = vi.fn<CreateSaleFn>(async (data) =>
      data.clientSaleId === id(2) ? { orderDuplicate: DUP } : sale('s')
    );
    const { results } = await run([row(1), row(2), row(3)], create);
    expect(results.get(id(2))).toEqual({ kind: 'already', duplicate: DUP });
    expect(results.get(id(3))?.kind).toBe('logged');
  });

  it('"Log anyway" resends the same key with allowDuplicate', async () => {
    const create = vi.fn<CreateSaleFn>(async () => sale('s2'));
    const { results } = await run([row(2)], create, { allowDuplicate: true });
    expect(create.mock.calls[0][0]).toMatchObject({ clientSaleId: id(2), allowDuplicate: true });
    expect(results.get(id(2))?.kind).toBe('logged');
  });

  it('a failure says why, and the retry reuses the key; a replayed sale counts as logged', async () => {
    const keys: string[] = [];
    let call = 0;
    const create = vi.fn<CreateSaleFn>(async (data, { onError }) => {
      keys.push(data.clientSaleId!);
      call += 1;
      if (call === 1) {
        onError('No signal. Your entry is saved, tap Submit to retry.');
        return null;
      }
      // The first request did land: the server hands back that same sale.
      return { sale: { ...data, id: 's1' }, duplicate: true } as unknown as CreateSaleResult;
    });
    const first = await run([row(1)], create);
    expect(first.results.get(id(1))).toEqual({ kind: 'failed', reason: 'No signal. Tap Log again to retry.' });
    const second = await run([row(1)], create);
    expect(second.results.get(id(1))).toEqual({ kind: 'logged', saleId: 's1' });
    expect(keys).toEqual([id(1), id(1)]);
  });

  it('a replay of an earlier send is logged, but says when the edit since was not saved', async () => {
    let stored: CreateSaleData | null = null;
    const create = vi.fn<CreateSaleFn>(async (data, { onError }) => {
      if (!stored) {
        // The write landed; the answer never made it back.
        stored = data;
        onError('No signal. Your entry is saved, tap Submit to retry.');
        return null;
      }
      return { sale: { ...stored, id: 's1' }, duplicate: true } as unknown as CreateSaleResult;
    });
    const first = await run([row(1)], create);
    expect(first.results.get(id(1))?.kind).toBe('failed');

    const edited: BulkRow = { ...row(1), formData: { ...row(1).formData, customerAddress: '9 Oak Ln' } };
    const second = await run([edited], create);
    expect(second.results.get(id(1))).toEqual({ kind: 'logged', saleId: 's1', editLost: true });

    const renumbered: BulkRow = { ...row(1), formData: { ...row(1).formData, orderNumberOrBtn: 'ORD-99' } };
    expect((await run([renumbered], create)).results.get(id(1))).toEqual({ kind: 'logged', saleId: 's1', editLost: true });

    // Unchanged (case and spacing aside), it is simply logged.
    const same: BulkRow = { ...row(1), formData: { ...row(1).formData, customerAddress: ' 1  main st ' } };
    expect((await run([same], create)).results.get(id(1))).toEqual({ kind: 'logged', saleId: 's1' });
  });

  it('stops before the next sale once the page has gone', async () => {
    let stop = false;
    const create = vi.fn<CreateSaleFn>(async () => {
      stop = true;
      return sale('s');
    });
    const { events } = await run([row(1), row(2)], create, { shouldStop: () => stop });
    expect(events).toEqual(['start 1', 'done 1 logged']);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('a thrown error is a failed row, not a crash', async () => {
    const create = vi.fn<CreateSaleFn>(async () => {
      throw new Error('Boom');
    });
    const { results } = await run([row(1)], create);
    expect(results.get(id(1))).toEqual({ kind: 'failed', reason: 'Boom' });
  });
});

describe('replayMatchesRow', () => {
  it('compares customer, address, plan and order number', () => {
    const r = row(2);
    const stored = { customerName: r.formData.customerName, customerAddress: '2 Main St', products: r.products, orderNumberOrBtn: 'ord 2' };
    expect(replayMatchesRow(stored, r)).toBe(true);
    expect(replayMatchesRow({ ...stored, customerName: 'Someone Else' }, r)).toBe(false);
    expect(replayMatchesRow({ ...stored, products: [] }, r)).toBe(false);
    expect(replayMatchesRow({ ...stored, orderNumberOrBtn: 'ORD3' }, r)).toBe(false);
    expect(replayMatchesRow(null, r)).toBe(false);
  });
});

describe('toBulkResult', () => {
  it('falls back to a plain reason', () => {
    expect(toBulkResult(null, '')).toEqual({ kind: 'failed', reason: 'Something went wrong. Try again.' });
    expect(toBulkResult(null, 'Invalid proof screenshot path')).toEqual({
      kind: 'failed',
      reason: 'Invalid proof screenshot path',
    });
  });
});
