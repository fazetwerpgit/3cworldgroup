// Putting screenshots together into sales: shared order number, address or
// name; a screenshot with none of those joins the one picked before it; four
// at most; the same picture twice stays out; and sale ids only ever change for
// sales that were never sent.
import { describe, expect, it } from 'vitest';
import type { SaleScanFields } from '@/lib/sales/scan/types';
import {
  findRepeats,
  isUnread,
  newBulkRow,
  newBulkShot,
  orderConflict,
  rowProofPaths,
  type BulkRow,
  type BulkShot,
} from './batch';
import {
  addressKey,
  canCombine,
  combineWithAbove,
  nameKey,
  regroup,
  removeShot,
  sameAddress,
  saveSale,
  splitShot,
} from './group';

const saleId = (n: number) => `${n}`.padStart(32, 'a');
const shotId = (n: number) => `${n}`.padStart(32, 'b');

const v = (value: string) => ({ value, confidence: 'high' as const });
/** What the reader got from one screenshot. */
const read = (fields: { order?: string; name?: string; address?: string; install?: string; plan?: boolean }): SaleScanFields => ({
  ...(fields.order ? { orderNumberOrBtn: v(fields.order) } : {}),
  ...(fields.name ? { customerName: v(fields.name) } : {}),
  ...(fields.address ? { customerAddress: v(fields.address) } : {}),
  ...(fields.install ? { installDate: v(fields.install) } : {}),
  ...(fields.plan ? { provider: v('tfiber'), plan: v('tfiber-1gig') } : {}),
});

function shot(n: number, scan: SaleScanFields | null, over: Partial<BulkShot> = {}): BulkShot {
  return {
    ...newBulkShot(shotId(n), `IMG_${n}.png`, n),
    hash: `hash-${n}`,
    proofPath: `form-attachments/r1/sale-proof/${shotId(n)}_00000${n % 10}/`,
    phase: scan ? 'read' : 'read_failed',
    scan,
    ...over,
  };
}

/** Each screenshot as picked: its own sale, ids 1, 2, 3… */
const picked = (...shots: BulkShot[]): BulkRow[] => shots.map((s) => newBulkRow(saleId(s.seq), s));

function ids() {
  let n = 900;
  return () => saleId((n += 1));
}

const shotIds = (rows: BulkRow[]) => rows.map((row) => row.shots.map((s) => s.seq));

describe('regroup', () => {
  it('puts a pair together when only the first shows the order number', () => {
    const rows = regroup(
      picked(
        shot(1, read({ order: 'TMF-1', name: 'Ana Ruiz' })),
        shot(2, read({ address: '', install: '2099-10-06', plan: true }))
      ),
      ids()
    );
    expect(shotIds(rows)).toEqual([[1, 2]]);
    expect(rows[0].id).toBe(saleId(1));
    expect(rows[0].formData).toMatchObject({ orderNumberOrBtn: 'TMF-1', customerName: 'Ana Ruiz', installDate: '2099-10-06' });
    expect(rows[0].products.map((p) => p.productId)).toEqual(['tfiber-1gig']);
    expect(rowProofPaths(rows[0])).toHaveLength(2);
  });

  it('takes the order number from whichever screenshot has it', () => {
    const rows = regroup(
      picked(shot(1, read({ name: 'Ana Ruiz', install: '2099-10-06' })), shot(2, read({ name: 'ana  RUIZ', order: 'TMF-1' }))),
      ids()
    );
    expect(shotIds(rows)).toEqual([[1, 2]]);
    expect(rows[0].formData.orderNumberOrBtn).toBe('TMF-1');
    expect(rows[0].formData.customerName).toBe('Ana Ruiz');
  });

  it('two pairs make two sales', () => {
    const rows = regroup(
      picked(
        shot(1, read({ order: 'TMF-1', name: 'Ana Ruiz' })),
        shot(2, read({ plan: true })),
        shot(3, read({ order: 'TMF-2', address: '9 Oak Ln, Austin, TX' })),
        shot(4, read({ address: '9 OAK LN.', install: '2099-11-01' }))
      ),
      ids()
    );
    expect(shotIds(rows)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(rows.map((row) => row.id)).toEqual([saleId(1), saleId(3)]);
    expect(rows[1].formData).toMatchObject({ orderNumberOrBtn: 'TMF-2', installDate: '2099-11-01' });
  });

  it('three in a row of one order are one sale', () => {
    const rows = regroup(
      picked(shot(1, read({ order: 'TMF-1' })), shot(2, read({ order: 'tmf 1' })), shot(3, read({ install: '2099-10-06' }))),
      ids()
    );
    expect(shotIds(rows)).toEqual([[1, 2, 3]]);
  });

  it('screenshots far apart still go together by order number', () => {
    const rows = regroup(
      picked(shot(1, read({ order: 'TMF-1' })), shot(2, read({ order: 'TMF-2' })), shot(3, read({ order: 'TMF-1', plan: true }))),
      ids()
    );
    expect(shotIds(rows)).toEqual([[1, 3], [2]]);
  });

  it('different order numbers with nothing else shared are two sales, not a repeat', () => {
    const rows = regroup(picked(shot(1, read({ order: 'TMF-1' })), shot(2, read({ order: 'TMF-2' }))), ids());
    expect(shotIds(rows)).toEqual([[1], [2]]);
    expect(findRepeats(rows).size).toBe(0);
    expect(rows.map(orderConflict)).toEqual([[], []]);
  });

  it('the same customer with two order numbers is two sales (a shared name is not enough when the orders differ)', () => {
    const rows = regroup(
      picked(shot(1, read({ order: 'TMF-1', name: 'Ana Ruiz' })), shot(2, read({ order: 'TMF-9', name: 'Ana Ruiz' }))),
      ids()
    );
    expect(shotIds(rows)).toEqual([[1], [2]]);
    expect(rows.map((row) => orderConflict(row))).toEqual([[], []]);
  });

  it('keeps the same picture picked twice out of the sale, flagged as a repeat', () => {
    const rows = regroup(
      picked(shot(1, read({ order: 'TMF-1' })), shot(2, read({ order: 'TMF-1' }), { hash: 'hash-1' }), shot(3, read({ plan: true }))),
      ids()
    );
    // The copy stays alone; the next screenshot still joins the first.
    expect(shotIds(rows)).toEqual([[1, 3], [2]]);
    expect(findRepeats(rows).get(rows[1].id)).toEqual({ of: 1, by: 'image' });
  });

  it('puts four in a sale at most', () => {
    const rows = regroup(picked(...[1, 2, 3, 4, 5].map((n) => shot(n, read({ order: 'TMF-1' })))), ids());
    expect(shotIds(rows)).toEqual([[1, 2, 3, 4], [5]]);
  });

  it('a screenshot with nothing to go on joins the one before it, and the first one stays alone', () => {
    const rows = regroup(picked(shot(1, null), shot(2, read({ order: 'TMF-1' })), shot(3, null)), ids());
    expect(shotIds(rows)).toEqual([[1], [2, 3]]);
  });

  it('leaves screenshots still uploading or being read on their own until read', () => {
    const rows = regroup(
      picked(shot(1, read({ order: 'TMF-1' })), shot(2, null, { phase: 'reading' }), shot(3, null, { phase: 'uploading' })),
      ids()
    );
    expect(shotIds(rows)).toEqual([[1], [2], [3]]);
    expect(rows.map((row) => row.id)).toEqual([saleId(1), saleId(2), saleId(3)]);
  });

  it('gives a sale that splits off a fresh id and changes nothing when run again', () => {
    const newId = ids();
    const together = regroup(picked(shot(1, read({ order: 'TMF-1' })), shot(2, null)), newId);
    expect(together.map((row) => row.id)).toEqual([saleId(1)]);
    // Read again, the second turns out to be another order.
    const reread = together.map((row) => ({
      ...row,
      shots: row.shots.map((s) => (s.seq === 2 ? { ...s, phase: 'read' as const, scan: read({ order: 'TMF-2' }) } : s)),
    }));
    const apart = regroup(reread, newId);
    expect(shotIds(apart)).toEqual([[1], [2]]);
    expect(apart.map((row) => row.id)).toEqual([saleId(1), saleId(901)]);
    expect(regroup(apart, newId)).toEqual(apart);
  });

  it('never moves a sent sale or changes its id; a new match makes its own sale', () => {
    const first = regroup(picked(shot(1, read({ order: 'TMF-1' }))), ids());
    const logged = [{ ...first[0], result: { kind: 'logged' as const, saleId: 's1' } }];
    const rows = regroup([...logged, ...picked(shot(2, read({ order: 'TMF-1', plan: true })))], ids());
    expect(shotIds(rows)).toEqual([[1], [2]]);
    expect(rows[0]).toEqual(logged[0]);
  });

  it('a sale the rep edited takes a new screenshot into its empty fields only', () => {
    const [sale] = regroup(picked(shot(1, read({ order: 'TMF-1', name: 'Ana Ruiz' }))), ids());
    const edited: BulkRow = {
      ...sale,
      formData: { ...sale.formData, customerName: 'Ana M. Ruiz' },
      shots: sale.shots.map((s) => ({ ...s, merged: true, checked: true })),
      fixed: true,
    };
    const rows = regroup(
      [edited, ...picked(shot(2, read({ order: 'TMF-1', name: 'Ana Ruiz', install: '2099-10-06' })))],
      ids()
    );
    expect(shotIds(rows)).toEqual([[1, 2]]);
    expect(rows[0].id).toBe(sale.id);
    expect(rows[0].formData).toMatchObject({ customerName: 'Ana M. Ruiz', installDate: '2099-10-06' });
    expect(regroup(rows, ids())).toEqual(rows);
    // The same order number under another customer's name clashes: it is a sale of its own.
    const other = regroup([edited, ...picked(shot(2, read({ order: 'TMF-1', name: 'Someone Else' })))], ids());
    expect(shotIds(other)).toEqual([[1], [2]]);
  });
});

// T-Fiber puts the order number (with the plan) on one screen and the customer
// (name, address, install date) on another: the two screenshots of one order
// often share no value at all.
describe('regroup: order screen and customer screen', () => {
  const orderScreen = (n: number, order: string) => shot(n, read({ order, plan: true }));
  const customerScreen = (n: number, name: string, address: string) =>
    shot(n, read({ name, address, install: '2099-10-06' }));

  it('an order-number-only screenshot and the customer screenshot after it are one sale', () => {
    const rows = regroup(picked(orderScreen(1, 'TMF-1'), customerScreen(2, 'Ana Ruiz', '9 Oak Ln, Austin, TX')), ids());
    expect(shotIds(rows)).toEqual([[1, 2]]);
    expect(rows[0].id).toBe(saleId(1));
    expect(rows[0].formData).toMatchObject({ orderNumberOrBtn: 'TMF-1', customerName: 'Ana Ruiz', installDate: '2099-10-06' });
    expect(rowProofPaths(rows[0])).toHaveLength(2);
  });

  it('the customer screenshot and the order-number-only screenshot after it are one sale', () => {
    const rows = regroup(picked(customerScreen(1, 'Ana Ruiz', '9 Oak Ln, Austin, TX'), orderScreen(2, 'TMF-1')), ids());
    expect(shotIds(rows)).toEqual([[1, 2]]);
    expect(rows[0].formData).toMatchObject({ orderNumberOrBtn: 'TMF-1', customerName: 'Ana Ruiz' });
  });

  it('two sales in a row make two sales, order screen first', () => {
    const rows = regroup(
      picked(
        orderScreen(1, 'TMF-1'),
        customerScreen(2, 'Ana Ruiz', '9 Oak Ln, Austin, TX'),
        orderScreen(3, 'TMF-2'),
        customerScreen(4, 'Bo Diaz', '12 Elm St, Austin, TX')
      ),
      ids()
    );
    expect(shotIds(rows)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(rows.map((row) => row.formData.orderNumberOrBtn)).toEqual(['TMF-1', 'TMF-2']);
    expect(rows.map((row) => row.formData.customerName)).toEqual(['Ana Ruiz', 'Bo Diaz']);
  });

  it('two sales in a row make two sales, customer screen first', () => {
    const rows = regroup(
      picked(
        customerScreen(1, 'Ana Ruiz', '9 Oak Ln, Austin, TX'),
        orderScreen(2, 'TMF-1'),
        customerScreen(3, 'Bo Diaz', '12 Elm St, Austin, TX'),
        orderScreen(4, 'TMF-2')
      ),
      ids()
    );
    expect(shotIds(rows)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(rows.map((row) => row.formData.orderNumberOrBtn)).toEqual(['TMF-1', 'TMF-2']);
    expect(rows.map((row) => row.formData.customerName)).toEqual(['Ana Ruiz', 'Bo Diaz']);
  });

  it('a neighbour with another order number, address or name starts its own sale', () => {
    const otherOrder = regroup(picked(shot(1, read({ order: 'TMF-1', name: 'Ana Ruiz' })), orderScreen(2, 'TMF-2')), ids());
    expect(shotIds(otherOrder)).toEqual([[1], [2]]);
    const otherAddress = regroup(
      picked(shot(1, read({ order: 'TMF-1', address: '9 Oak Ln Apt 1' })), shot(2, read({ address: '9 Oak Ln Apt 2' }))),
      ids()
    );
    expect(shotIds(otherAddress)).toEqual([[1], [2]]);
    const otherName = regroup(
      picked(shot(1, read({ order: 'TMF-1', name: 'Ana Ruiz' })), shot(2, read({ name: 'Bo Diaz', install: '2099-10-06' }))),
      ids()
    );
    expect(shotIds(otherName)).toEqual([[1], [2]]);
  });

  it('the same address written out further is no clash', () => {
    const rows = regroup(
      picked(shot(1, read({ order: 'TMF-1', address: '9 Oak Ln' })), shot(2, read({ name: 'Ana Ruiz', address: '9 Oak Ln, Austin, TX' }))),
      ids()
    );
    expect(shotIds(rows)).toEqual([[1, 2]]);
  });

  it('a full sale is not joined; the next screenshot starts a new one', () => {
    const rows = regroup(
      picked(...[1, 2, 3, 4].map((n) => orderScreen(n, 'TMF-1')), customerScreen(5, 'Ana Ruiz', '9 Oak Ln')),
      ids()
    );
    expect(shotIds(rows)).toEqual([[1, 2, 3, 4], [5]]);
  });

  it('a repeated picture is skipped over: the next screenshot joins the one before the copy', () => {
    const rows = regroup(
      picked(orderScreen(1, 'TMF-1'), orderScreen(2, 'TMF-1'), customerScreen(3, 'Ana Ruiz', '9 Oak Ln')).map((row) =>
        row.shots[0].seq === 2 ? { ...row, shots: [{ ...row.shots[0], hash: 'hash-1' }] } : row
      ),
      ids()
    );
    expect(shotIds(rows)).toEqual([[1, 3], [2]]);
  });

  it('a screenshot whose read failed joins the sale before it, and moves out once a re-read disagrees', () => {
    const failed = shot(2, null, { readError: true });
    const newId = ids();
    const together = regroup(picked(customerScreen(1, 'Ana Ruiz', '9 Oak Ln'), failed), newId);
    expect(shotIds(together)).toEqual([[1, 2]]);
    const reread = (rows: BulkRow[], scan: SaleScanFields) =>
      rows.map((row) => ({
        ...row,
        shots: row.shots.map((s) => (s.seq === 2 ? { ...s, phase: 'read' as const, readError: false, merged: false, scan } : s)),
      }));
    // Read again: its own order number fits; it stays.
    expect(shotIds(regroup(reread(together, read({ order: 'TMF-1', plan: true })), newId))).toEqual([[1, 2]]);
    // Read again: another customer; it leaves for a sale of its own.
    const apart = regroup(reread(together, read({ name: 'Bo Diaz', address: '12 Elm St' })), newId);
    expect(shotIds(apart)).toEqual([[1], [2]]);
    expect(apart[0].id).toBe(saleId(1));
    expect(regroup(apart, newId)).toEqual(apart);
    // A sale the rep already shaped keeps it whatever the re-read says.
    const fixed = together.map((row) => ({ ...row, fixed: true }));
    expect(shotIds(regroup(reread(fixed, read({ name: 'Bo Diaz', address: '12 Elm St' })), newId))).toEqual([[1, 2]]);
  });

  it('changes nothing when run again', () => {
    const newId = ids();
    const rows = regroup(
      picked(
        customerScreen(1, 'Ana Ruiz', '9 Oak Ln'),
        orderScreen(2, 'TMF-1'),
        orderScreen(3, 'TMF-2'),
        customerScreen(4, 'Bo Diaz', '12 Elm St')
      ),
      newId
    );
    expect(shotIds(rows)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(regroup(rows, newId)).toEqual(rows);
  });
});

describe('combine and split', () => {
  const base = () =>
    regroup(
      picked(shot(1, read({ order: 'TMF-1', name: 'Ana Ruiz' })), shot(2, read({ order: 'TMF-2', install: '2099-10-06' }))),
      ids()
    );

  it('"Combine with sale above" keeps the upper sale id and flags two order numbers', () => {
    const rows = base();
    expect(canCombine(rows[0], rows[1])).toBe(true);
    const combined = combineWithAbove(rows, rows[1].id);
    expect(shotIds(combined)).toEqual([[1, 2]]);
    expect(combined[0].id).toBe(saleId(1));
    expect(combined[0].fixed).toBe(true);
    expect(combined[0].formData).toMatchObject({ orderNumberOrBtn: 'TMF-1', customerName: 'Ana Ruiz', installDate: '2099-10-06' });
    expect(orderConflict(combined[0])).toEqual(['TMF-1', 'TMF-2']);
    // Grouping leaves the rep's combination alone.
    expect(regroup(combined, ids())).toEqual(combined);
  });

  it('will not combine a sent sale, a sale still reading, or more than four', () => {
    const rows = base();
    expect(canCombine(undefined, rows[0])).toBe(false);
    expect(canCombine({ ...rows[0], result: { kind: 'logged', saleId: 's' } }, rows[1])).toBe(false);
    expect(canCombine(rows[0], { ...rows[1], sending: true })).toBe(false);
    expect(canCombine(rows[0], { ...rows[1], shots: [{ ...rows[1].shots[0], phase: 'reading' }] })).toBe(false);
    const three = { ...rows[0], shots: [shot(1, null), shot(3, null), shot(4, null)] };
    expect(canCombine(three, rows[1])).toBe(true);
    expect(canCombine({ ...three, shots: [...three.shots, shot(5, null)] }, rows[1])).toBe(false);
    expect(combineWithAbove([{ ...rows[0], result: { kind: 'failed', reason: 'x' } }, rows[1]], rows[1].id)).toHaveLength(2);
  });

  it('"Make its own sale" gives the screenshot a new sale with a fresh id and keeps the old id', () => {
    const together = regroup(picked(shot(1, read({ order: 'TMF-1' })), shot(2, read({ install: '2099-10-06' }))), ids());
    const apart = splitShot(together, shotId(2), () => saleId(777));
    expect(shotIds(apart)).toEqual([[1], [2]]);
    expect(apart.map((row) => row.id)).toEqual([saleId(1), saleId(777)]);
    expect(apart[0].formData.installDate).toBe('');
    expect(apart[1].formData.installDate).toBe('2099-10-06');
    expect(apart.every((row) => row.fixed)).toBe(true);
    // It stays apart.
    expect(regroup(apart, ids())).toEqual(apart);
    // A sent sale is never split.
    const sent = [{ ...together[0], result: { kind: 'logged' as const, saleId: 's' } }];
    expect(splitShot(sent, shotId(2), () => saleId(778))).toBe(sent);
  });

  it('removing a screenshot keeps the sale and its id; the last one takes the sale with it', () => {
    const together = regroup(picked(shot(1, read({ order: 'TMF-1' })), shot(2, read({ install: '2099-10-06' }))), ids());
    const one = removeShot(together, shotId(2));
    expect(shotIds(one)).toEqual([[1]]);
    expect(one[0].id).toBe(saleId(1));
    expect(one[0].formData.installDate).toBe('');
    expect(removeShot(one, shotId(1))).toEqual([]);
  });

  it('removing a screenshot makes the sale the rep\'s: grouping does not put the screenshot back', () => {
    const together = regroup(picked(shot(1, read({ order: 'TMF-1' })), shot(2, read({ install: '2099-10-06' }))), ids());
    expect(together[0].fixed).toBeUndefined();
    const one = removeShot(together, shotId(2));
    expect(one[0].fixed).toBe(true);
    // The removed screenshot comes back as a new pick (picked again): it is a sale of its own.
    const again = regroup([...one, ...picked(shot(3, read({ install: '2099-10-06' })))], ids());
    expect(again.find((row) => row.id === saleId(1))?.shots.map((s) => s.seq)).toEqual([1, 3]);
    expect(regroup(one, ids())).toEqual(one);
  });
});

describe('include and the edit sheet follow the screenshots', () => {
  it('an unticked sale keeps its screenshots skipped when an earlier screenshot is read late', () => {
    // Screenshot 1 is still being read; the rep unticks the sale of screenshot 2 (setInclude fixes it).
    const start = regroup(
      picked(shot(1, null, { phase: 'reading' }), shot(2, read({ order: 'TMF-1', name: 'Ana Ruiz' }))),
      ids()
    );
    const unticked = start.map((row) => (row.id === saleId(2) ? { ...row, include: false, fixed: true } : row));
    // Screenshot 1 reads as the same order: without the fix the sale would take screenshot 1's id and come back ticked.
    const late = regroup(
      unticked.map((row) =>
        row.id === saleId(1) ? { ...row, shots: [{ ...row.shots[0], phase: 'read' as const, scan: read({ order: 'TMF-1' }) }] } : row
      ),
      ids()
    );
    const skipped = late.find((row) => row.shots.some((s) => s.seq === 2));
    expect(skipped?.id).toBe(saleId(2));
    expect(skipped?.include).toBe(false);
    expect(late.every((row) => row.include === false || !row.shots.some((s) => s.seq === 2))).toBe(true);
  });

  it('Save is refused when the sale\'s screenshots changed while the sheet was open', () => {
    const before = regroup(picked(shot(1, read({ order: 'TMF-1', name: 'Ana Ruiz' })), shot(2, null, { phase: 'reading' })), ids());
    const shown = before[0].shots.map((s) => s.id);
    // Screenshot 2 is read while the sheet is open and joins the sale.
    const after = regroup(
      before.map((row) =>
        row.id === saleId(2) ? { ...row, shots: [{ ...row.shots[0], phase: 'read' as const, scan: read({ install: '2099-10-06' }) }] } : row
      ),
      ids()
    );
    expect(shotIds(after)).toEqual([[1, 2]]);
    const change = { ...before[0], formData: { ...before[0].formData, customerName: 'Ana M. Ruiz' } };
    expect(saveSale(after, saleId(1), change, shown)).toBeNull();
    // Opened again on the sale as it is now, Save goes through.
    const saved = saveSale(after, saleId(1), change, after[0].shots.map((s) => s.id));
    expect(saved?.[0]).toMatchObject({ fixed: true, formData: { customerName: 'Ana M. Ruiz' } });
    expect(saveSale(after, saleId(99), change, shown)).toBeNull();
  });

  it('Save only clears the failed-read hold of screenshots the sheet showed', () => {
    const failed = (n: number) => shot(n, null, { phase: 'read_failed', readError: true });
    const row: BulkRow = { ...newBulkRow(saleId(1), failed(1)), shots: [failed(1), failed(2)], fixed: true };
    const saved = saveSale([row], saleId(1), row, [shotId(1), shotId(2)]) as BulkRow[];
    expect(saved[0].shots.filter(isUnread)).toHaveLength(0);
    // A pure check: a shot outside `shown` (refused as a whole here) is never marked looked at.
    expect(saveSale([row], saleId(1), row, [shotId(1)])).toBeNull();
  });
});

describe('a key match that clashes on another key', () => {
  it('the same street for two customers is two sales (order 111 Ana Ruiz Apt 101, then Bob Lee at the bare street)', () => {
    const rows = regroup(
      picked(
        shot(1, read({ order: '111', name: 'Ana Ruiz', address: '1200 Oak Ave Apt 101' })),
        shot(2, read({ name: 'Bob Lee', address: '1200 Oak Ave' }))
      ),
      ids()
    );
    expect(shotIds(rows)).toEqual([[1], [2]]);
    expect(rows[1].formData.customerName).toBe('Bob Lee');
  });

  it('the bare street with the same customer is still one sale', () => {
    const rows = regroup(
      picked(
        shot(1, read({ order: '111', name: 'Ana Ruiz', address: '1200 Oak Ave Apt 101' })),
        shot(2, read({ name: 'Ana Ruiz', address: '1200 Oak Ave', install: '2099-10-06' }))
      ),
      ids()
    );
    expect(shotIds(rows)).toEqual([[1, 2]]);
  });

  it('another unit is another sale, even after the bare street joined the first', () => {
    const rows = regroup(
      picked(
        shot(1, read({ order: '111', name: 'Ana Ruiz', address: '1200 Oak Ave Apt 101' })),
        shot(2, read({ name: 'Ana Ruiz', address: '1200 Oak Ave' })),
        shot(3, read({ address: '1200 Oak Ave Apt 102', install: '2099-10-06' }))
      ),
      ids()
    );
    expect(shotIds(rows)).toEqual([[1, 2], [3]]);
    expect(sameAddress(addressKey('1200 Oak Ave Apt 101'), addressKey('1200 Oak Ave Apt 102'))).toBe(false);
    expect(sameAddress(addressKey('12 Oak Ave Apt 1'), addressKey('12 Oak Ave Apt 10'))).toBe(false);
  });
});

describe('keys', () => {
  it('compares addresses however far they are written out, and full names only', () => {
    expect(addressKey('123 Main St., Apt 4, Austin TX')).toBe('123 main st apt 4 austin tx');
    expect(addressKey('Austin')).toBe('');
    expect(sameAddress(addressKey('123 Main St'), addressKey('123 MAIN ST, Austin, TX 78701'))).toBe(true);
    expect(sameAddress(addressKey('123 Main St Apt 4'), addressKey('123 Main St Apt 5'))).toBe(false);
    expect(sameAddress(addressKey('12 Main St'), addressKey('123 Main St'))).toBe(false);
    expect(nameKey('ANA  Ruiz')).toBe('ana ruiz');
    expect(nameKey('Ana')).toBe('');
  });
});
