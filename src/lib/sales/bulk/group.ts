// Putting a batch's screenshots together into sales. Reps take two (up to
// four) screenshots of one T-Fiber order, usually one after the other, so:
//
// - Each screenshot is read on its own. Screenshots that share an order number,
//   an address or a customer name are one sale (order number first).
// - A screenshot that shares none of those with any sale joins the sale of the
//   screenshot picked right before it, unless the two disagree: a different
//   order number, a different address or a different customer name. T-Fiber
//   shows the order number and the customer on separate screens, so the two
//   screenshots of one order often have no value in common, only no clash (a
//   sale nothing was read from yet has nothing to agree with, so it is not
//   joined this way). A screenshot the reader got none of those from (only the
//   plan or the install date) never disagrees, so it always joins the one
//   before it.
// - A sale holds at most BULK_MAX_SHOTS; one more starts a new sale.
// - The same picture picked twice (same bytes) is never put into a sale: it
//   stays on its own, flagged "Repeated: same screenshot".
// - Fields are merged across a sale's screenshots, first non-empty value in
//   pick order winning; two different order numbers are flagged, not chosen
//   between (orderConflict in ./batch).
//
// Grouping is redone whenever a reading comes in, but only for sales nobody has
// touched. A sale the rep edited, combined or split ("fixed"), or one already
// sent, keeps its screenshots and its id; a new screenshot may still join a
// fixed sale that is not sent yet, filling only its empty fields.
//
// Ids: an automatic sale keeps the id of the sale its first screenshot was in,
// unless an earlier sale took that id; a sale that is new gets a fresh id.
// None of them was sent (a sent sale is fixed), so no id the server has seen
// ever changes.

import { normalizeOrderNumber } from '@/lib/sales/orderNumber';
import type { SaleScanFields } from '@/lib/sales/scan/types';
import {
  BULK_MAX_SHOTS,
  applyScanToRow,
  emptyBulkFields,
  isSent,
  rowPhase,
  type BulkRow,
  type BulkSaleFields,
  type BulkShot,
} from './batch';

type KeyKind = 'order' | 'address' | 'name';
const KEY_KINDS: KeyKind[] = ['order', 'address', 'name'];
type Keys = Partial<Record<KeyKind, string>>;

/** "123 Main St., Apt 4, Austin TX" -> "123 main st apt 4 austin tx", for comparing. */
export function addressKey(value: string | undefined): string {
  const address = (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return /\d/.test(address) && /[a-z]/.test(address) ? address : '';
}

/**
 * The same address, one maybe written out further than the other ("123 main
 * st" and "123 main st austin tx"). "Apt 4" and "Apt 5" stay apart.
 */
export function sameAddress(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

/** "ANA  Ruiz" -> "ana ruiz"; a lone first name is too thin to tie two screenshots. */
export function nameKey(value: string | undefined): string {
  const name = (value ?? '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  return name.split(' ').length >= 2 ? name : '';
}

function scanKeys(scan: SaleScanFields | null): Keys {
  const keys: Keys = {};
  const order = normalizeOrderNumber(scan?.orderNumberOrBtn?.value);
  const address = addressKey(scan?.customerAddress?.value);
  const name = nameKey(scan?.customerName?.value);
  if (order) keys.order = order;
  if (address) keys.address = address;
  if (name) keys.name = name;
  return keys;
}

const bySeq = (a: BulkShot, b: BulkShot) => a.seq - b.seq;
const settled = (shot: BulkShot) => shot.phase === 'read' || shot.phase === 'read_failed';
const pickFields = (row: BulkSaleFields): BulkSaleFields => ({
  formData: row.formData,
  products: row.products,
  provider: row.provider,
  saleDateTouched: row.saleDateTouched,
  flags: row.flags,
});

/** A sale's fields from its screenshots' readings, in pick order (first non-empty wins). */
export function mergeShots(shots: BulkShot[]): BulkSaleFields {
  let fields = emptyBulkFields();
  for (const shot of [...shots].sort(bySeq)) fields = applyScanToRow(fields, shot.scan).row;
  return fields;
}

/** `a` with its empty fields filled from `b` (a's values win). */
function fillFields(a: BulkSaleFields, b: BulkSaleFields): BulkSaleFields {
  const formData = { ...a.formData };
  for (const key of Object.keys(formData) as (keyof typeof formData)[]) {
    if (key === 'saleDate' || key === 'saleType') continue;
    if (!String(formData[key]).trim() && String(b.formData[key]).trim()) {
      (formData as Record<string, string>)[key] = b.formData[key] as string;
    }
  }
  // The sale date goes with the install date it was worked out from.
  const tookInstall = !a.formData.installDate.trim() && b.formData.installDate.trim();
  if (tookInstall && !a.saleDateTouched) formData.saleDate = b.formData.saleDate;
  return {
    formData,
    products: a.products.length > 0 ? a.products : b.products,
    provider: a.provider ?? b.provider,
    saleDateTouched: a.saleDateTouched || (tookInstall ? b.saleDateTouched : false),
    flags: { ...b.flags, ...a.flags },
  };
}

type Group = { base: BulkRow | null; shots: BulkShot[]; joinable: boolean; keys: Record<KeyKind, Set<string>> };

const emptyKeySets = (): Record<KeyKind, Set<string>> => ({ order: new Set(), address: new Set(), name: new Set() });
function addKeys(group: Group, keys: Keys) {
  for (const kind of KEY_KINDS) if (keys[kind]) group.keys[kind].add(keys[kind] as string);
}

/**
 * The batch with its screenshots put together into sales, in pick order (a
 * sale sits where its first screenshot was picked). `newId` makes a fresh sale
 * id. Running it again on its own output changes nothing.
 */
export function regroup(rows: BulkRow[], newId: () => string): BulkRow[] {
  const isFixed = (row: BulkRow) => row.fixed === true || isSent(row);
  const owner = new Map<string, BulkRow>();
  for (const row of rows) for (const shot of row.shots) owner.set(shot.id, row);
  const all = rows.flatMap((row) => row.shots).sort(bySeq);

  // The first pick of each picture; any later pick of the same bytes is a copy.
  const firstByHash = new Map<string, number>();
  for (const shot of all) if (shot.hash && !firstByHash.has(shot.hash)) firstByHash.set(shot.hash, shot.seq);
  const isCopy = (shot: BulkShot) => shot.hash !== null && (firstByHash.get(shot.hash) as number) < shot.seq;

  const groups: Group[] = [];
  const groupOf = new Map<string, Group>();
  for (const row of rows) {
    if (!isFixed(row)) continue;
    const group: Group = {
      base: row,
      shots: [...row.shots],
      joinable: !isSent(row) && row.shots.every(settled),
      keys: emptyKeySets(),
    };
    for (const shot of row.shots) addKeys(group, scanKeys(shot.scan));
    addKeys(group, {
      order: normalizeOrderNumber(row.formData.orderNumberOrBtn) || undefined,
      address: addressKey(row.formData.customerAddress) || undefined,
      name: nameKey(row.formData.customerName) || undefined,
    });
    groups.push(group);
    for (const shot of row.shots) groupOf.set(shot.id, group);
  }

  const hasRoom = (group: Group) => group.joinable && group.shots.length < BULK_MAX_SHOTS;
  const findMatch = (keys: Keys) => {
    for (const kind of KEY_KINDS) {
      const key = keys[kind];
      if (!key) continue;
      for (let i = groups.length - 1; i >= 0; i -= 1) {
        if (!hasRoom(groups[i])) continue;
        const known = groups[i].keys[kind];
        if (kind === 'address' ? [...known].some((other) => sameAddress(key, other)) : known.has(key)) return groups[i];
      }
    }
    return undefined;
  };

  const hasKeys = (group: Group) => KEY_KINDS.some((kind) => group.keys[kind].size > 0);
  /** The sale already holds a different value of a kind this screenshot has (another order, address or name). */
  const disagrees = (group: Group, keys: Keys) =>
    KEY_KINDS.some((kind) => {
      const key = keys[kind];
      const known = group.keys[kind];
      if (!key || known.size === 0) return false;
      return kind === 'address' ? ![...known].some((other) => sameAddress(key, other)) : !known.has(key);
    });

  const absorbed = new Set<string>();
  let previous: BulkShot | null = null;
  for (const shot of all) {
    const copy = isCopy(shot);
    if (!groupOf.has(shot.id)) {
      const keys = scanKeys(shot.scan);
      let target: Group | undefined;
      if (settled(shot) && !copy) {
        const keyless = Object.keys(keys).length === 0;
        if (!keyless) target = findMatch(keys);
        if (!target && previous) {
          const before = groupOf.get(previous.id);
          // A screenshot with keys only joins a sale that has some of its own to agree with.
          if (before && hasRoom(before) && (keyless || (hasKeys(before) && !disagrees(before, keys)))) target = before;
        }
      }
      if (target) {
        target.shots.push(shot);
        if (target.base) absorbed.add(shot.id);
      } else {
        target = { base: null, shots: [shot], joinable: settled(shot) && !copy, keys: emptyKeySets() };
        groups.push(target);
      }
      addKeys(target, keys);
      groupOf.set(shot.id, target);
    }
    if (!copy) previous = shot;
  }

  const claimed = new Set(groups.flatMap((group) => (group.base ? [group.base.id] : [])));
  const out = groups.map((group): BulkRow => {
    const shots = [...group.shots].sort(bySeq);
    if (group.base) {
      // A fixed sale takes in readings it has not had yet, into empty fields only.
      let fields = pickFields(group.base);
      const taken = shots.map((shot) => {
        const fresh = absorbed.has(shot.id) || !shot.merged;
        if (!fresh || !settled(shot)) return shot;
        fields = applyScanToRow(fields, shot.scan).row;
        return { ...shot, merged: true, ...(absorbed.has(shot.id) ? { checked: false } : {}) };
      });
      return { ...group.base, ...fields, shots: taken };
    }
    const id = shots.map((shot) => (owner.get(shot.id) as BulkRow).id).find((candidate) => !claimed.has(candidate)) ?? newId();
    claimed.add(id);
    const before = rows.find((row) => row.id === id);
    return {
      id,
      shots: shots.map((shot) => (settled(shot) && !shot.merged ? { ...shot, merged: true } : shot)),
      ...mergeShots(shots),
      include: before?.include ?? null,
      result: null,
    };
  });
  return out.sort((a, b) => a.shots[0].seq - b.shots[0].seq);
}

/** "Combine with sale above": only for two unsent, fully read sales that fit in one. */
export function canCombine(upper: BulkRow | undefined, lower: BulkRow): boolean {
  if (!upper || isSent(upper) || isSent(lower)) return false;
  if (upper.shots.length + lower.shots.length > BULK_MAX_SHOTS) return false;
  const done = (row: BulkRow) => rowPhase(row) === 'read' || rowPhase(row) === 'read_failed';
  if (!done(upper) || !done(lower)) return false;
  const hashes = new Set(upper.shots.map((shot) => shot.hash).filter(Boolean));
  return !lower.shots.some((shot) => shot.hash && hashes.has(shot.hash));
}

/**
 * Put sale `id` into the sale above it. The upper sale keeps its id and its
 * values; the lower one's fill what the upper is missing. The order numbers are
 * looked at again (a mismatch is flagged until the rep saves the sale).
 */
export function combineWithAbove(rows: BulkRow[], id: string): BulkRow[] {
  const index = rows.findIndex((row) => row.id === id);
  const upper = rows[index - 1];
  const lower = rows[index];
  if (index < 1 || !canCombine(upper, lower)) return rows;
  const combined: BulkRow = {
    ...upper,
    ...fillFields(pickFields(upper), pickFields(lower)),
    shots: [...upper.shots, ...lower.shots].sort(bySeq).map((shot) => ({ ...shot, merged: true, checked: false })),
    fixed: true,
  };
  return rows.flatMap((row) => (row.id === upper.id ? [combined] : row.id === lower.id ? [] : [row]));
}

/** "Make its own sale": one screenshot out of an unsent sale, into a new sale (fresh id). */
export function splitShot(rows: BulkRow[], shotId: string, newId: () => string): BulkRow[] {
  const row = rows.find((r) => r.shots.some((shot) => shot.id === shotId));
  if (!row || isSent(row) || row.shots.length < 2) return rows;
  const shot = row.shots.find((s) => s.id === shotId) as BulkShot;
  const rest = row.shots.filter((s) => s.id !== shotId);
  const own: BulkRow = {
    id: newId(),
    shots: [{ ...shot, merged: true, checked: false }],
    ...mergeShots([shot]),
    include: null,
    result: null,
    fixed: true,
  };
  // A sale the rep already edited keeps their values; an untouched one is re-read from what is left.
  const left: BulkRow = { ...row, ...(row.fixed ? {} : mergeShots(rest)), shots: rest, fixed: true };
  return rows
    .flatMap((r) => (r.id === row.id ? [left, own] : [r]))
    .sort((a, b) => a.shots[0].seq - b.shots[0].seq);
}

/** Take one screenshot out of an unsent sale; the sale goes when it was the last one. */
export function removeShot(rows: BulkRow[], shotId: string): BulkRow[] {
  const row = rows.find((r) => r.shots.some((shot) => shot.id === shotId));
  if (!row || isSent(row)) return rows;
  const rest = row.shots.filter((s) => s.id !== shotId);
  if (rest.length === 0) return rows.filter((r) => r.id !== row.id);
  const left: BulkRow = { ...row, ...(row.fixed ? {} : mergeShots(rest)), shots: rest };
  return rows.map((r) => (r.id === row.id ? left : r)).sort((a, b) => a.shots[0].seq - b.shots[0].seq);
}
