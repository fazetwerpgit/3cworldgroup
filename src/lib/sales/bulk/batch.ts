// The bulk uploader's batch: a list of sales, each made of 1 to 4 order
// screenshots (a T-Fiber order is often two screens). Pure, so the rules are
// testable alone: each sale's status, which sale repeats another one's
// screenshot, what goes in from the screenshot reader, and how the batch is
// saved so an accidental close loses nothing. How screenshots are put together
// into sales lives in ./group.
//
// Each sale's id is its idempotency key (clientSaleId), the same scheme as the
// single Log Sale form: a retry, or a second tap after the app was closed
// mid-send, lands on the sale already written instead of logging it twice.
// Each screenshot has its own id, the stem of its upload slot, so a
// screenshot can move between sales before they are sent.

import { getPlanById, type SaleProduct, type SaleType } from '@/types';
import { addPlanToProducts } from '@/lib/sales/planSelection';
import { normalizeOrderNumber, type OrderDuplicate } from '@/lib/sales/orderNumber';
import { MAX_PROOF_SCREENSHOTS } from '@/lib/sales/proofPaths';
import { planScanFills, type ScanFlag, type ScanTarget } from '@/lib/sales/scan/fills';
import { SCAN_FIELD_KEYS, type SaleScanFields } from '@/lib/sales/scan/types';
import {
  emptySaleFields,
  inferSaleDate,
  validateSaleForm,
  type SaleFieldKey,
  type SaleFormFields,
} from '@/lib/sales/saleForm';

/** Screenshots per batch. */
export const BULK_MAX_FILES = 50;
/** Screenshots in one sale: the same cap as the Log Sale form. */
export const BULK_MAX_SHOTS = MAX_PROOF_SCREENSHOTS;
/** Screenshots uploaded and read at the same time. */
export const BULK_CONCURRENCY = 3;
/** localStorage key stem; the rep's uid follows, so a shared phone never shows another rep's batch. */
export const BULK_KEY_PREFIX = 'sale-bulk:v1:';
/** A saved batch older than this is dropped: it is yesterday's, not an interruption. */
export const BULK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const ID_RE = /^[a-f0-9]{32}$/;

/** Where a screenshot is: on its way up, being read, or done. */
export type BulkPhase = 'uploading' | 'reading' | 'read' | 'upload_failed' | 'read_failed';

/** What happened when the sale was sent. */
export type BulkResult =
  | {
      kind: 'logged';
      saleId: string | null;
      /**
       * A retry came back as the sale an earlier, unanswered send already
       * wrote, and the rep had edited the sale since: the edit is not on it.
       */
      editLost?: boolean;
    }
  | { kind: 'already'; duplicate: OrderDuplicate }
  | { kind: 'failed'; reason: string };

/** One picked screenshot. */
export interface BulkShot {
  /** 32 hex: the stem of its upload slot (never a sale id). */
  id: string;
  /** Pick order across the whole batch (the camera roll order). */
  seq: number;
  fileName: string;
  /** SHA-256 of the picked file's bytes; null when it could not be hashed. */
  hash: string | null;
  proofPath: string | null;
  phase: BulkPhase;
  /** What the reader made of this screenshot on its own; null until read, or when nothing was read. */
  scan: SaleScanFields | null;
  /** The last read was turned away by the reader's rate limit. */
  readBusy?: boolean;
  /**
   * The last read failed (rate limit, timeout, reader or network error), as
   * against a read that went through and found nothing. Until it is read again,
   * removed, or the rep saves the sale with it, its sale is not ready.
   */
  readError?: boolean;
  /** Its reading is already in its sale's fields (a sale the rep has edited only takes empty fields). */
  merged?: boolean;
  /** The rep saved the sale with this screenshot in it: its order number was looked at. */
  checked?: boolean;
}

/** One sale: its screenshots and its fields. */
export interface BulkRow {
  /** 32 hex: the sale's clientSaleId. */
  id: string;
  /** In pick order, 1 to BULK_MAX_SHOTS. */
  shots: BulkShot[];
  formData: SaleFormFields;
  products: SaleProduct[];
  /** The provider the reader saw, for a sale whose plan it could not match. */
  provider: string | null;
  saleDateTouched: boolean;
  /** Fields the reader filled without being sure ("Check this"). */
  flags: Partial<Record<ScanTarget, ScanFlag>>;
  /** The rep's include/skip pick; null is the default (in, unless it repeats another sale). */
  include: boolean | null;
  result: BulkResult | null;
  /**
   * The rep shaped this sale (edited it, ticked or unticked it, combined it,
   * split or removed a screenshot), or it was sent: automatic grouping no
   * longer moves its screenshots, rewrites its fields or changes its id.
   */
  fixed?: boolean;
  /** On its way to the server now (saved as fixed, never as sending). */
  sending?: boolean;
  /**
   * Screenshots were put together only for being picked one after the other,
   * with a status-bar clock missing: the rep checks they belong together. Only
   * Save in the sheet answers it (or the sale being down to one screenshot);
   * Combine and Split do not. See ./group.
   */
  checkJoin?: boolean;
}

export type BulkRepeat = { of: number; by: 'image' };

export type BulkStatus =
  | { kind: 'uploading' }
  | { kind: 'reading' }
  | { kind: 'upload_failed' }
  /** `unread`: screenshots whose read failed and are still waiting on "Read again"; `shots`: how many the sale has. */
  | { kind: 'read_failed'; problems: string[]; busy: boolean; unread: number; shots: number }
  | { kind: 'needs_info'; problems: string[] }
  | { kind: 'repeat'; repeat: BulkRepeat; problems: string[] }
  | { kind: 'ready' }
  | { kind: 'sending' }
  | { kind: 'logged'; editLost: boolean }
  | { kind: 'already'; duplicate: OrderDuplicate }
  | { kind: 'failed'; reason: string };

/** The parts of a sale the reader and the edit sheet fill in. */
export type BulkSaleFields = Pick<BulkRow, 'formData' | 'products' | 'provider' | 'saleDateTouched' | 'flags'>;

export function emptyBulkFields(): BulkSaleFields {
  return { formData: emptySaleFields(), products: [], provider: null, saleDateTouched: false, flags: {} };
}

export function newBulkShot(id: string, fileName: string, seq: number): BulkShot {
  return { id, seq, fileName, hash: null, proofPath: null, phase: 'uploading', scan: null };
}

/** A sale of one screenshot, as a picked file starts out. */
export function newBulkRow(id: string, shot: BulkShot): BulkRow {
  return { id, shots: [shot], ...emptyBulkFields(), include: null, result: null };
}

/** Every uploaded screenshot of the sale: its proof. */
export function rowProofPaths(row: Pick<BulkRow, 'shots'>): string[] {
  return row.shots.flatMap((shot) => (shot.proofPath ? [shot.proofPath] : []));
}

/** Sent, or being sent: its id and screenshots never change again. */
export function isSent(row: Pick<BulkRow, 'result' | 'sending'>): boolean {
  return row.result !== null || row.sending === true;
}

/** Where the sale's screenshots are, taken together. */
export function rowPhase(row: Pick<BulkRow, 'shots'>): BulkPhase {
  const phases = row.shots.map((shot) => shot.phase);
  if (phases.includes('uploading')) return 'uploading';
  if (phases.includes('reading')) return 'reading';
  if (phases.includes('upload_failed')) return 'upload_failed';
  if (phases.length > 0 && phases.every((phase) => phase === 'read_failed')) return 'read_failed';
  return 'read';
}

const PROBLEM_LABELS: Record<Exclude<SaleFieldKey, 'saleDate'>, string> = {
  plan: 'No plan',
  customerAddress: 'No address',
  installDate: 'No install date',
  orderNumberOrBtn: 'No order number',
};
const PROBLEM_ORDER: SaleFieldKey[] = ['plan', 'customerAddress', 'installDate', 'saleDate', 'orderNumberOrBtn'];

/** "Order numbers don't match": two screenshots of one sale show different order numbers. */
export const ORDER_CONFLICT_PROBLEM = "Order numbers don't match";

/** Screenshots joined without a key or both clocks to go on (BulkRow.checkJoin). */
export const CHECK_JOIN_PROBLEM = 'Check these screenshots belong together';

/**
 * What the create-sale route would turn this sale down for, in short words
 * ("No plan", "Sale date cannot be after the install date"). The same rules as
 * the Log Sale form (validateSaleForm), plus one of the bulk log's own: a sale
 * needs its order number even with a screenshot attached (a bulk sale nobody
 * typed in is matched to T-Fiber's records by it). Empty when the sale can be
 * sent.
 */
export function rowProblems(row: Pick<BulkRow, 'formData' | 'products' | 'shots'>): string[] {
  const errors: Partial<Record<SaleFieldKey, string>> = validateSaleForm({
    formData: row.formData,
    products: row.products,
    proofPaths: rowProofPaths(row),
  });
  if (!normalizeOrderNumber(row.formData.orderNumberOrBtn)) errors.orderNumberOrBtn ??= PROBLEM_LABELS.orderNumberOrBtn;
  return PROBLEM_ORDER.flatMap((key) => {
    const error = errors[key];
    if (!error) return [];
    if (key === 'saleDate') return [error === 'Pick the sale date' ? 'No sale date' : error];
    return [PROBLEM_LABELS[key]];
  });
}

/**
 * The order numbers the sale's screenshots disagree on, as read; empty when
 * they agree. Only screenshots the rep has not saved the sale with count: once
 * the rep has looked at the sale and saved it, the order number is theirs.
 */
export function orderConflict(row: Pick<BulkRow, 'formData' | 'shots'>): string[] {
  const kept = normalizeOrderNumber(row.formData.orderNumberOrBtn);
  const seen = new Map<string, string>();
  for (const shot of row.shots) {
    const value = shot.scan?.orderNumberOrBtn?.value?.trim();
    const key = normalizeOrderNumber(value);
    if (key && !seen.has(key)) seen.set(key, value as string);
  }
  const unchecked = row.shots.some((shot) => {
    const key = normalizeOrderNumber(shot.scan?.orderNumberOrBtn?.value);
    return !shot.checked && key && key !== kept;
  });
  return unchecked && seen.size > 1 ? [...seen.values()] : [];
}

/**
 * Sales that are only a copy of a screenshot already in an earlier sale (the
 * same bytes picked twice). `of` is the earlier sale's 1-based position. Two
 * different screenshots with the same order number are one sale, not a repeat
 * (./group puts them together).
 */
export function findRepeats(rows: Pick<BulkRow, 'id' | 'shots'>[]): Map<string, BulkRepeat> {
  const byHash = new Map<string, number>();
  const repeats = new Map<string, BulkRepeat>();
  rows.forEach((row, index) => {
    const hashes = row.shots.map((shot) => shot.hash);
    const earlier = hashes.map((hash) => (hash ? byHash.get(hash) : undefined));
    if (earlier.length > 0 && earlier.every((of) => of !== undefined)) {
      repeats.set(row.id, { of: (earlier[0] as number) + 1, by: 'image' });
    }
    for (const hash of hashes) if (hash && !byHash.has(hash)) byHash.set(hash, index);
  });
  return repeats;
}

/** A screenshot whose read failed, not read again since, that the rep has not saved the sale with. */
export const isUnread = (shot: BulkShot) => shot.phase === 'read_failed' && shot.readError === true && !shot.checked;

/** The sale's status, most pressing first. */
export function rowStatus(row: BulkRow, repeat: BulkRepeat | undefined): BulkStatus {
  if (row.result?.kind === 'logged') return { kind: 'logged', editLost: row.result.editLost === true };
  if (row.sending) return { kind: 'sending' };
  const phase = rowPhase(row);
  if (phase === 'uploading') return { kind: 'uploading' };
  if (phase === 'reading') return { kind: 'reading' };
  if (phase === 'upload_failed') return { kind: 'upload_failed' };
  if (row.result?.kind === 'already') return { kind: 'already', duplicate: row.result.duplicate };
  const problems = [
    ...(orderConflict(row).length > 0 ? [ORDER_CONFLICT_PROBLEM] : []),
    ...(row.checkJoin && row.shots.length > 1 ? [CHECK_JOIN_PROBLEM] : []),
    ...rowProblems(row),
  ];
  if (repeat) return { kind: 'repeat', repeat, problems };
  // One screenshot whose read failed holds the whole sale back: it is often the
  // screen with the order number or the plan.
  const unread = row.shots.filter(isUnread).length;
  if (unread > 0 || (problems.length > 0 && phase === 'read_failed')) {
    const busy = row.shots.some((shot) => shot.readBusy === true && (unread === 0 || isUnread(shot)));
    return { kind: 'read_failed', problems, busy, unread, shots: row.shots.length };
  }
  if (problems.length > 0) return { kind: 'needs_info', problems };
  if (row.result?.kind === 'failed') return { kind: 'failed', reason: row.result.reason };
  return { kind: 'ready' };
}

/** The checkbox: the rep's pick, else in unless the row repeats another. */
export function isIncluded(row: Pick<BulkRow, 'include'>, repeat: BulkRepeat | undefined): boolean {
  return row.include ?? !repeat;
}

/** Ticked, and something "Log N sales" can send: complete and not yet logged. */
export function isSendable(row: BulkRow, repeat: BulkRepeat | undefined): boolean {
  if (!isIncluded(row, repeat)) return false;
  const status = rowStatus(row, repeat);
  return (
    status.kind === 'ready' ||
    status.kind === 'failed' ||
    (status.kind === 'repeat' && status.problems.length === 0)
  );
}

/**
 * Nothing left to do: every ticked row is logged or was already on the books.
 * Until then the batch stays saved, so a rep can close the app and retry.
 */
export function batchSettled(rows: BulkRow[]): boolean {
  const repeats = findRepeats(rows);
  return rows.every((row) => {
    if (row.result?.kind === 'logged' || row.result?.kind === 'already') return true;
    return !isIncluded(row, repeats.get(row.id));
  });
}

/** Rows to send for "Log N sales", in list order. */
export function sendableRows(rows: BulkRow[]): BulkRow[] {
  const repeats = findRepeats(rows);
  return rows.filter((row) => isSendable(row, repeats.get(row.id)));
}

/**
 * One screenshot's reading, put into a sale. Only empty fields are filled (a
 * re-read or a second screenshot never overwrites what is there: the first
 * screenshot with a value wins); the plan goes in when the reader matched one,
 * and an install date dates the sale the same way the form does.
 */
export function applyScanToRow<T extends BulkSaleFields>(row: T, fields: SaleScanFields | null): { row: T; filled: boolean } {
  if (!fields) return { row, filled: false };
  const hasPlan = row.products.length > 0;
  const { fills, flags } = planScanFills(fields, (target) =>
    target === 'plan' ? !hasPlan : !row.formData[target].trim()
  );
  if (fills.length === 0) return { row, filled: false };
  const formData = { ...row.formData };
  let products = row.products;
  let provider = row.provider;
  for (const fill of fills) {
    if (fill.target === 'plan') {
      provider = fill.provider;
      const plan = fill.planId ? getPlanById(fill.planId) : undefined;
      if (plan) products = addPlanToProducts(products, plan);
    } else {
      formData[fill.target] = fill.value;
    }
  }
  if (!row.saleDateTouched && formData.installDate !== row.formData.installDate) {
    formData.saleDate = inferSaleDate(formData.installDate).saleDate;
  }
  return { row: { ...row, formData, products, provider, flags: { ...row.flags, ...flags } }, filled: true };
}

export type BulkSummary = {
  logged: number;
  already: number;
  needsInfo: number;
  failed: number;
  skipped: number;
};

export function batchSummary(rows: BulkRow[]): BulkSummary {
  const repeats = findRepeats(rows);
  const summary: BulkSummary = { logged: 0, already: 0, needsInfo: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    const repeat = repeats.get(row.id);
    const status = rowStatus(row, repeat);
    if (status.kind === 'logged') summary.logged += 1;
    else if (status.kind === 'already') summary.already += 1;
    else if (!isIncluded(row, repeat)) summary.skipped += 1;
    else if (status.kind === 'failed') summary.failed += 1;
    else if (status.kind === 'needs_info' || status.kind === 'read_failed' || status.kind === 'upload_failed') {
      summary.needsInfo += 1;
    } else if (status.kind === 'repeat' && status.problems.length > 0) summary.needsInfo += 1;
  }
  return summary;
}

/** "17 logged, 2 already logged, 1 needs info". */
export function summaryText(summary: BulkSummary): string {
  const parts = [
    summary.logged > 0 || (summary.already === 0 && summary.needsInfo === 0 && summary.failed === 0)
      ? `${summary.logged} logged`
      : null,
    summary.already > 0 ? `${summary.already} already logged` : null,
    summary.needsInfo > 0 ? `${summary.needsInfo} ${summary.needsInfo === 1 ? 'needs' : 'need'} info` : null,
    summary.failed > 0 ? `${summary.failed} not sent` : null,
    summary.skipped > 0 ? `${summary.skipped} skipped` : null,
  ];
  return parts.filter(Boolean).join(', ');
}

// ---------- saved batch ----------

type SavedBatch = { rows: BulkRow[]; savedAt: number };

const SALE_TYPES: readonly unknown[] = ['new_service', 'upgrade', 'add_on', 'renewal'] satisfies SaleType[];
const TEXT_FIELDS = [
  'customerName',
  'customerPhone',
  'customerEmail',
  'customerAddress',
  'saleDate',
  'installDate',
  'notes',
  'orderNumberOrBtn',
] as const;
const CONFIDENCES: readonly unknown[] = ['high', 'medium', 'low'];
const isFiniteNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

function isProduct(value: unknown): value is SaleProduct {
  if (!isObject(value)) return false;
  return (
    typeof value.productId === 'string' &&
    typeof value.productName === 'string' &&
    typeof value.company === 'string' &&
    [value.quantity, value.unitPrice, value.totalPrice, value.points].every(isFiniteNumber)
  );
}

function isOrderDuplicate(value: unknown): value is OrderDuplicate {
  return isObject(value) && typeof value.existingRepName === 'string' && typeof value.existingIsMine === 'boolean';
}

function readResult(value: unknown): BulkResult | null {
  if (!isObject(value)) return null;
  if (value.kind === 'logged') {
    return {
      kind: 'logged',
      saleId: typeof value.saleId === 'string' ? value.saleId : null,
      ...(value.editLost === true ? { editLost: true } : {}),
    };
  }
  if (value.kind === 'already' && isOrderDuplicate(value.duplicate)) return { kind: 'already', duplicate: value.duplicate };
  if (value.kind === 'failed' && typeof value.reason === 'string') return { kind: 'failed', reason: value.reason };
  return null;
}

/** A saved reading, keeping only well-formed fields. */
function readScan(value: unknown): SaleScanFields | null {
  if (!isObject(value)) return null;
  const scan: SaleScanFields = {};
  for (const key of SCAN_FIELD_KEYS) {
    const field = value[key];
    if (isObject(field) && typeof field.value === 'string' && CONFIDENCES.includes(field.confidence)) {
      scan[key] = { value: field.value, confidence: field.confidence as 'high' | 'medium' | 'low' };
    }
  }
  return Object.keys(scan).length > 0 ? scan : null;
}

const PHASES: readonly unknown[] = ['uploading', 'reading', 'read', 'upload_failed', 'read_failed'] satisfies BulkPhase[];

function readShot(value: unknown, fallbackSeq: number): BulkShot | null {
  if (!isObject(value) || typeof value.id !== 'string' || !ID_RE.test(value.id) || !PHASES.includes(value.phase)) {
    return null;
  }
  return {
    id: value.id,
    seq: isFiniteNumber(value.seq) ? (value.seq as number) : fallbackSeq,
    fileName: typeof value.fileName === 'string' ? value.fileName : '',
    hash: typeof value.hash === 'string' ? value.hash : null,
    proofPath: typeof value.proofPath === 'string' && value.proofPath ? value.proofPath : null,
    phase: value.phase as BulkPhase,
    scan: readScan(value.scan),
    ...(value.readBusy === true ? { readBusy: true } : {}),
    ...(value.readError === true ? { readError: true } : {}),
    ...(value.merged === true ? { merged: true } : {}),
    ...(value.checked === true ? { checked: true } : {}),
  };
}

/**
 * One saved sale, reduced to what the page can safely show; null when it is
 * not whole. A batch saved before sales could hold several screenshots has one
 * screenshot per row (its file fields on the row itself): that row comes back
 * as a sale of one screenshot, kept as it is (its reading is already in it).
 */
function readSale(value: unknown, index: number): BulkRow | null {
  if (!isObject(value) || typeof value.id !== 'string' || !ID_RE.test(value.id)) return null;
  const legacy = !Array.isArray(value.shots);
  const shots = legacy
    ? [readShot({ ...value, seq: index, merged: true }, index)]
    : (value.shots as unknown[]).map((shot, i) => readShot(shot, index * BULK_MAX_SHOTS + i));
  if (shots.length === 0 || shots.some((shot) => !shot)) return null;
  const saved = (isObject(value.formData) ? value.formData : {}) as Record<string, unknown>;
  const formData = emptySaleFields();
  for (const name of TEXT_FIELDS) if (typeof saved[name] === 'string') formData[name] = saved[name];
  if (SALE_TYPES.includes(saved.saleType)) formData.saleType = saved.saleType as SaleType;
  const flags = (isObject(value.flags) ? value.flags : {}) as BulkRow['flags'];
  return {
    id: value.id,
    shots: (shots as BulkShot[]).slice(0, BULK_MAX_SHOTS),
    formData,
    products: Array.isArray(value.products) ? value.products.filter(isProduct) : [],
    provider: typeof value.provider === 'string' ? value.provider : null,
    saleDateTouched: value.saleDateTouched === true,
    flags,
    include: typeof value.include === 'boolean' ? value.include : null,
    result: readResult(value.result),
    ...(legacy || value.fixed === true ? { fixed: true } : {}),
    ...(value.checkJoin === true ? { checkJoin: true } : {}),
  };
}

const notUploaded = (shot: BulkShot) => shot.phase === 'uploading' || shot.phase === 'upload_failed' || !shot.proofPath;

/**
 * The saved batch. A screenshot that never got uploaded is dropped (the
 * picked file does not survive a close) and counted in `lost`; a sale left
 * with none is dropped. A screenshot that was being read comes back as
 * `reading`, for the page to read again.
 */
export function readBulkBatch(key: string, now = Date.now()): { rows: BulkRow[]; lost: number } | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedBatch> | null;
    if (!saved || !Array.isArray(saved.rows)) return null;
    if (isFiniteNumber(saved.savedAt) && now - (saved.savedAt as number) > BULK_MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    const rows: BulkRow[] = [];
    let lost = 0;
    let shotCount = 0;
    saved.rows.forEach((value, index) => {
      const row = readSale(value, index);
      if (!row) return;
      const shots = row.shots.filter((shot) => !notUploaded(shot));
      lost += row.shots.length - shots.length;
      if (shots.length === 0 || shotCount + shots.length > BULK_MAX_FILES) return;
      shotCount += shots.length;
      rows.push({ ...row, shots });
    });
    if (rows.length === 0 && lost === 0) return null;
    return { rows, lost };
  } catch {
    return null;
  }
}

/** Save the batch (sales, readings and proof paths, never the pictures); null removes it. */
export function writeBulkBatch(key: string, rows: BulkRow[] | null, now = Date.now()) {
  try {
    if (!rows || rows.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    const saved: SavedBatch = {
      // A sale on its way out comes back fixed: the server may already hold it
      // under its id, so after a kill it is resent as it is (the server replays
      // it), never regrouped under another id.
      rows: rows.map(({ sending, ...row }) => (sending ? { ...row, fixed: true } : row)),
      savedAt: now,
    };
    window.localStorage.setItem(key, JSON.stringify(saved));
  } catch {
    // Storage full or blocked (private mode): the saved batch is a convenience only.
  }
}

// ---------- duplicate pictures ----------

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * A fingerprint of a file's bytes: SHA-256 where the browser has it. A phone
 * on the plain-http LAN dev server has no crypto.subtle (it needs a secure
 * context), so there it falls back to FNV-1a plus the length, which is plenty
 * to tell "the same screenshot picked twice".
 */
export async function hashBytes(buffer: ArrayBuffer): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (subtle) return toHex(new Uint8Array(await subtle.digest('SHA-256', buffer)));
  const bytes = new Uint8Array(buffer);
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv-${bytes.length}-${hash.toString(16)}`;
}
