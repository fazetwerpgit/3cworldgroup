// The bulk uploader's batch: one row per order screenshot, each its own sale.
// Pure, so the rules are testable alone: what each row's status is, which rows
// repeat another one in the same batch, what goes in from the screenshot
// reader, and how the batch is saved so an accidental close loses nothing.
//
// Each row's id is its sale's idempotency key (clientSaleId) and the stem of
// its proof upload slot, the same scheme as the single Log Sale form: a retry,
// or a second tap after the app was closed mid-send, lands on the sale already
// written instead of logging it twice.

import { getPlanById, type SaleProduct, type SaleType } from '@/types';
import { addPlanToProducts } from '@/lib/sales/planSelection';
import { normalizeOrderNumber, type OrderDuplicate } from '@/lib/sales/orderNumber';
import { planScanFills, type ScanFlag, type ScanTarget } from '@/lib/sales/scan/fills';
import type { SaleScanFields } from '@/lib/sales/scan/types';
import {
  emptySaleFields,
  inferSaleDate,
  validateSaleForm,
  type SaleFieldKey,
  type SaleFormFields,
} from '@/lib/sales/saleForm';

/** Screenshots per batch. */
export const BULK_MAX_FILES = 25;
/** Screenshots uploaded and read at the same time. */
export const BULK_CONCURRENCY = 3;
/** localStorage key stem; the rep's uid follows, so a shared phone never shows another rep's batch. */
export const BULK_KEY_PREFIX = 'sale-bulk:v1:';
/** A saved batch older than this is dropped: it is yesterday's, not an interruption. */
export const BULK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const ROW_ID_RE = /^[a-f0-9]{32}$/;

/** Where a row's screenshot is: on its way up, being read, or done. */
export type BulkPhase = 'uploading' | 'reading' | 'read' | 'upload_failed' | 'read_failed';

/** What happened when the row was sent. */
export type BulkResult =
  | {
      kind: 'logged';
      saleId: string | null;
      /**
       * A retry came back as the sale an earlier, unanswered send already
       * wrote, and the rep had edited the row since: the edit is not on it.
       */
      editLost?: boolean;
    }
  | { kind: 'already'; duplicate: OrderDuplicate }
  | { kind: 'failed'; reason: string };

export interface BulkRow {
  /** 32 hex: the sale's clientSaleId and its proof slot stem. */
  id: string;
  fileName: string;
  /** SHA-256 of the picked file's bytes; null when it could not be hashed. */
  hash: string | null;
  proofPath: string | null;
  phase: BulkPhase;
  formData: SaleFormFields;
  products: SaleProduct[];
  /** The provider the reader saw, for a row whose plan it could not match. */
  provider: string | null;
  saleDateTouched: boolean;
  /** Fields the reader filled without being sure ("Check this"). */
  flags: Partial<Record<ScanTarget, ScanFlag>>;
  /** The rep's include/skip pick; null is the default (in, unless it repeats another row). */
  include: boolean | null;
  result: BulkResult | null;
  /** The last read was turned away by the reader's rate limit. */
  readBusy?: boolean;
  /** On its way to the server now (never saved). */
  sending?: boolean;
}

export type BulkRepeat = { of: number; by: 'image' | 'order' };

export type BulkStatus =
  | { kind: 'uploading' }
  | { kind: 'reading' }
  | { kind: 'upload_failed' }
  | { kind: 'read_failed'; problems: string[]; busy: boolean }
  | { kind: 'needs_info'; problems: string[] }
  | { kind: 'repeat'; repeat: BulkRepeat; problems: string[] }
  | { kind: 'ready' }
  | { kind: 'sending' }
  | { kind: 'logged'; editLost: boolean }
  | { kind: 'already'; duplicate: OrderDuplicate }
  | { kind: 'failed'; reason: string };

export function newBulkRow(id: string, fileName: string): BulkRow {
  return {
    id,
    fileName,
    hash: null,
    proofPath: null,
    phase: 'uploading',
    formData: emptySaleFields(),
    products: [],
    provider: null,
    saleDateTouched: false,
    flags: {},
    include: null,
    result: null,
  };
}

const PROBLEM_LABELS: Record<Exclude<SaleFieldKey, 'saleDate'>, string> = {
  plan: 'No plan',
  customerAddress: 'No address',
  installDate: 'No install date',
  orderNumberOrBtn: 'No order number',
};
const PROBLEM_ORDER: SaleFieldKey[] = ['plan', 'customerAddress', 'installDate', 'saleDate', 'orderNumberOrBtn'];

/**
 * What the create-sale route would turn this row down for, in short words
 * ("No plan", "Sale date cannot be after the install date"). The same rules as
 * the Log Sale form (validateSaleForm). Empty when the row can be sent.
 */
export function rowProblems(row: Pick<BulkRow, 'formData' | 'products' | 'proofPath'>): string[] {
  const errors = validateSaleForm({
    formData: row.formData,
    products: row.products,
    proofPaths: row.proofPath ? [row.proofPath] : [],
  });
  return PROBLEM_ORDER.flatMap((key) => {
    const error = errors[key];
    if (!error) return [];
    if (key === 'saleDate') return [error === 'Pick the sale date' ? 'No sale date' : error];
    return [PROBLEM_LABELS[key]];
  });
}

/**
 * Rows that repeat an earlier row in the batch: the same picture (same bytes)
 * or the same order number once normalized. The earlier row is the original;
 * `of` is its 1-based position in the list.
 */
export function findRepeats(rows: Pick<BulkRow, 'id' | 'hash' | 'formData'>[]): Map<string, BulkRepeat> {
  const byHash = new Map<string, number>();
  const byOrder = new Map<string, number>();
  const repeats = new Map<string, BulkRepeat>();
  rows.forEach((row, index) => {
    const order = normalizeOrderNumber(row.formData.orderNumberOrBtn);
    const sameImage = row.hash ? byHash.get(row.hash) : undefined;
    const sameOrder = order ? byOrder.get(order) : undefined;
    if (sameImage !== undefined) repeats.set(row.id, { of: sameImage + 1, by: 'image' });
    else if (sameOrder !== undefined) repeats.set(row.id, { of: sameOrder + 1, by: 'order' });
    if (row.hash && !byHash.has(row.hash)) byHash.set(row.hash, index);
    if (order && !byOrder.has(order)) byOrder.set(order, index);
  });
  return repeats;
}

/** The row's status, most pressing first. */
export function rowStatus(row: BulkRow, repeat: BulkRepeat | undefined): BulkStatus {
  if (row.result?.kind === 'logged') return { kind: 'logged', editLost: row.result.editLost === true };
  if (row.sending) return { kind: 'sending' };
  if (row.phase === 'uploading') return { kind: 'uploading' };
  if (row.phase === 'reading') return { kind: 'reading' };
  if (row.phase === 'upload_failed') return { kind: 'upload_failed' };
  if (row.result?.kind === 'already') return { kind: 'already', duplicate: row.result.duplicate };
  const problems = rowProblems(row);
  if (repeat) return { kind: 'repeat', repeat, problems };
  if (problems.length > 0) {
    return row.phase === 'read_failed'
      ? { kind: 'read_failed', problems, busy: row.readBusy === true }
      : { kind: 'needs_info', problems };
  }
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
 * The reader's answer, put into a row. Only empty fields are filled (a re-read
 * never overwrites what the rep typed); the plan goes in when the reader
 * matched one, and an install date dates the sale the same way the form does.
 */
export function applyScanToRow(row: BulkRow, fields: SaleScanFields | null): { row: BulkRow; filled: boolean } {
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
const isFiniteNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

function isProduct(value: unknown): value is SaleProduct {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.productId === 'string' &&
    typeof p.productName === 'string' &&
    typeof p.company === 'string' &&
    [p.quantity, p.unitPrice, p.totalPrice, p.points].every(isFiniteNumber)
  );
}

function isOrderDuplicate(value: unknown): value is OrderDuplicate {
  if (!value || typeof value !== 'object') return false;
  const d = value as Record<string, unknown>;
  return typeof d.existingRepName === 'string' && typeof d.existingIsMine === 'boolean';
}

function readResult(value: unknown): BulkResult | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (r.kind === 'logged') {
    return {
      kind: 'logged',
      saleId: typeof r.saleId === 'string' ? r.saleId : null,
      ...(r.editLost === true ? { editLost: true } : {}),
    };
  }
  if (r.kind === 'already' && isOrderDuplicate(r.duplicate)) return { kind: 'already', duplicate: r.duplicate };
  if (r.kind === 'failed' && typeof r.reason === 'string') return { kind: 'failed', reason: r.reason };
  return null;
}

const PHASES: readonly unknown[] = ['uploading', 'reading', 'read', 'upload_failed', 'read_failed'] satisfies BulkPhase[];

/** One saved row, reduced to what the page can safely show; null when it is not whole. */
function readRow(value: unknown): BulkRow | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ROW_ID_RE.test(r.id) || !PHASES.includes(r.phase)) return null;
  const saved = (r.formData && typeof r.formData === 'object' ? r.formData : {}) as Record<string, unknown>;
  const formData = emptySaleFields();
  for (const name of TEXT_FIELDS) if (typeof saved[name] === 'string') formData[name] = saved[name];
  if (SALE_TYPES.includes(saved.saleType)) formData.saleType = saved.saleType as SaleType;
  const flags = (r.flags && typeof r.flags === 'object' ? r.flags : {}) as BulkRow['flags'];
  return {
    id: r.id,
    fileName: typeof r.fileName === 'string' ? r.fileName : '',
    hash: typeof r.hash === 'string' ? r.hash : null,
    proofPath: typeof r.proofPath === 'string' && r.proofPath ? r.proofPath : null,
    phase: r.phase as BulkPhase,
    formData,
    products: Array.isArray(r.products) ? r.products.filter(isProduct) : [],
    provider: typeof r.provider === 'string' ? r.provider : null,
    saleDateTouched: r.saleDateTouched === true,
    flags,
    include: typeof r.include === 'boolean' ? r.include : null,
    result: readResult(r.result),
    ...(r.readBusy === true ? { readBusy: true } : {}),
  };
}

/**
 * The saved batch. A row whose screenshot never got uploaded is dropped (the
 * picked file does not survive a close) and counted in `lost`; a row that
 * was being read comes back as `reading`, for the page to read again.
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
    for (const value of saved.rows) {
      const row = readRow(value);
      if (!row) continue;
      if (row.phase === 'uploading' || row.phase === 'upload_failed' || !row.proofPath) {
        lost += 1;
        continue;
      }
      rows.push(row);
    }
    if (rows.length === 0 && lost === 0) return null;
    return { rows: rows.slice(0, BULK_MAX_FILES), lost };
  } catch {
    return null;
  }
}

/** Save the batch (rows and proof paths, never the pictures); null removes it. */
export function writeBulkBatch(key: string, rows: BulkRow[] | null, now = Date.now()) {
  try {
    if (!rows || rows.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    const saved: SavedBatch = {
      rows: rows.map(({ sending: _sending, ...row }) => {
        void _sending;
        return row;
      }),
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
