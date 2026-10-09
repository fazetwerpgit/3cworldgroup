// Putting a batch's screenshots together into sales. Reps take two (up to
// four) screenshots of one T-Fiber order, usually one after the other, so:
//
// - Each screenshot is read on its own. Screenshots that share an order number,
//   an address or a customer name are one sale (order number first), unless
//   another of those disagrees ("1200 Oak Ave" for Ana Ruiz and for Bob Lee is
//   two sales: one is likely an apartment the other screen left off).
// - A screenshot that shares none of those with any sale joins the sale of the
//   screenshot picked right before it, unless the two disagree: a different
//   order number, a different address or a different customer name. T-Fiber
//   shows the order number and the customer on separate screens, so the two
//   screenshots of one order often have no value in common, only no clash (a
//   sale nothing was read from yet has nothing to agree with, so it is not
//   joined this way). A screenshot the reader got none of those from (only the
//   plan or the install date) never disagrees, so it may join the one before.
// - Such a join, with no key to go on, also needs the phone's status-bar clock:
//   the two screens of one sale are taken minutes apart (0-9 in real batches),
//   neighbouring sales a quarter of an hour or more. Clocks more than
//   JOIN_CLOCK_MINUTES apart keep the two screenshots apart. When either clock
//   could not be read the join still happens, but the sale asks the rep to
//   check (checkJoin: "Check these screenshots belong together") until they
//   save it in the sheet, or it is down to one screenshot. The clock never orders anything: it has no
//   date, and reps log several days at once. Pick order comes first.
// - A sale holds at most BULK_MAX_SHOTS; one more starts a new sale.
// - The same picture picked twice (same bytes) is never put into a sale: it
//   stays on its own, flagged "Repeated: same screenshot".
// - Fields are merged across a sale's screenshots, first non-empty value in
//   pick order winning; two different order numbers are flagged, not chosen
//   between (orderConflict in ./batch).
//
// Grouping is redone whenever a reading comes in, but only for sales nobody has
// touched. A sale the rep edited, ticked or unticked, combined, or split or
// removed a screenshot from ("fixed"), or one sent or on its way out, keeps its
// screenshots and its id; a new screenshot may still join a fixed sale that is
// not sent yet, filling only its empty fields.
//
// Ids: an automatic sale keeps the id of the sale its first screenshot was in,
// unless an earlier sale took that id; a sale that is new gets a fresh id.
// None of them was sent (a sent sale is fixed), so no id the server has seen
// ever changes.

import { normalizeOrderNumber } from '@/lib/sales/orderNumber';
import { clockGap } from '@/lib/sales/scan/normalize';
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

/** Two screenshots joined only for being picked one after the other must have clocks at most this far apart. */
export const JOIN_CLOCK_MINUTES = 12;

/** The screenshot's status-bar clock (minutes past midnight), or null when it was not read. */
export function shotClock(shot: Pick<BulkShot, 'scan'>): number | null {
  const value = shot.scan?.statusBarTime?.value;
  const minutes = value ? Number(value) : NaN;
  return Number.isInteger(minutes) && minutes >= 0 && minutes < 1440 ? minutes : null;
}

/** A row without its "check these belong together" question (the rep answered it). */
function answered(row: BulkRow): BulkRow {
  const next = { ...row };
  delete next.checkJoin;
  return next;
}

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

type Group = {
  base: BulkRow | null;
  shots: BulkShot[];
  joinable: boolean;
  keys: Record<KeyKind, Set<string>>;
  /** A screenshot joined it next to another without a key or both clocks to go on. */
  unsure: boolean;
};

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
      unsure: row.checkJoin === true,
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
  const hasKeys = (group: Group) => KEY_KINDS.some((kind) => group.keys[kind].size > 0);
  /**
   * The sale already holds a different value of a kind this screenshot has
   * (another order, address or name). Every address the sale holds must be
   * the same as this one: "1200 Oak Ave" next to "1200 Oak Ave Apt 101" does
   * not make "1200 Oak Ave Apt 102" the same place.
   */
  const disagrees = (group: Group, keys: Keys) =>
    KEY_KINDS.some((kind) => {
      const key = keys[kind];
      const known = group.keys[kind];
      if (!key || known.size === 0) return false;
      return kind === 'address' ? ![...known].every((other) => sameAddress(key, other)) : !known.has(key);
    });
  /** A sale sharing one of these keys, and clashing on none (one shared value is not enough on its own). */
  const findMatch = (keys: Keys) => {
    for (const kind of KEY_KINDS) {
      const key = keys[kind];
      if (!key) continue;
      for (let i = groups.length - 1; i >= 0; i -= 1) {
        if (!hasRoom(groups[i]) || disagrees(groups[i], keys)) continue;
        const known = groups[i].keys[kind];
        if (kind === 'address' ? [...known].some((other) => sameAddress(key, other)) : known.has(key)) return groups[i];
      }
    }
    return undefined;
  };

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
          const agrees = keyless || (before !== undefined && hasKeys(before) && !disagrees(before, keys));
          // And only when taken at about the same time; with a clock missing, the rep is asked.
          const [mine, theirs] = [shotClock(shot), shotClock(previous)];
          const clocksKnown = mine !== null && theirs !== null;
          const together = !clocksKnown || clockGap(mine, theirs) <= JOIN_CLOCK_MINUTES;
          if (before && hasRoom(before) && agrees && together) {
            target = before;
            if (!clocksKnown) target.unsure = true;
          }
        }
      }
      if (target) {
        target.shots.push(shot);
        if (target.base) absorbed.add(shot.id);
      } else {
        target = { base: null, shots: [shot], joinable: settled(shot) && !copy, keys: emptyKeySets(), unsure: false };
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
      return { ...group.base, ...fields, shots: taken, ...(group.unsure ? { checkJoin: true } : {}) };
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
      ...(group.unsure ? { checkJoin: true } : {}),
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
  // The upper sale's own "check these belong together" stays: combining is no answer to it.
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
  // Those left behind still need the rep's check, unless only one is left.
  const kept = rest.length === 1 ? answered(row) : row;
  const left: BulkRow = { ...kept, ...(row.fixed ? {} : mergeShots(rest)), shots: rest, fixed: true };
  return rows
    .flatMap((r) => (r.id === row.id ? [left, own] : [r]))
    .sort((a, b) => a.shots[0].seq - b.shots[0].seq);
}

/**
 * Take one screenshot out of an unsent sale; the sale goes when it was the
 * last one. What is left is the rep's from then on (grouping would otherwise
 * put the screenshots back as they were).
 */
export function removeShot(rows: BulkRow[], shotId: string): BulkRow[] {
  const row = rows.find((r) => r.shots.some((shot) => shot.id === shotId));
  if (!row || isSent(row)) return rows;
  const rest = row.shots.filter((s) => s.id !== shotId);
  if (rest.length === 0) return rows.filter((r) => r.id !== row.id);
  const kept = rest.length === 1 ? answered(row) : row;
  const left: BulkRow = { ...kept, ...(row.fixed ? {} : mergeShots(rest)), shots: rest, fixed: true };
  return rows.map((r) => (r.id === row.id ? left : r)).sort((a, b) => a.shots[0].seq - b.shots[0].seq);
}

/** The edit sheet's Save refused: the sale's screenshots changed while it was open. */
export const SALE_CHANGED_MESSAGE = 'This sale changed while you were editing. Check it again.';

/**
 * The edit sheet's values put on sale `id`. `shown` is the screenshots the
 * sheet showed: when the sale's screenshots are no longer exactly those (a
 * late reading moved one in or out while the sheet was open), nothing is saved
 * and null comes back, so old values never land on a different set of
 * screenshots. The sale is the rep's from now on (fixed); only the screenshots
 * the sheet showed count as looked at (their failed read no longer holds the
 * sale back), and saving answers "Check these screenshots belong together".
 * An edit clears a "Not sent" reason, never a logged result.
 */
export function saveSale(rows: BulkRow[], id: string, change: BulkSaleFields, shown: readonly string[]): BulkRow[] | null {
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  const seen = new Set(shown);
  if (row.shots.length !== seen.size || row.shots.some((shot) => !seen.has(shot.id))) return null;
  const orderChanged = row.formData.orderNumberOrBtn.trim() !== change.formData.orderNumberOrBtn.trim();
  const stale = row.result?.kind === 'failed' || (row.result?.kind === 'already' && orderChanged);
  const saved: BulkRow = {
    ...answered(row),
    ...pickFields(change),
    shots: row.shots.map((shot) => (seen.has(shot.id) ? { ...shot, merged: true, checked: true } : shot)),
    fixed: true,
    result: stale ? null : row.result,
  };
  return rows.map((r) => (r.id === id ? saved : r));
}
