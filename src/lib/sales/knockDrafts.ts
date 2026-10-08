import { FIBER_PLANS } from '@/types/sales';

// Sale drafts from 3C Doors (the knocking app). Every "Sold" a rep taps at a
// door creates one; the rep finishes it later on Log sale, which closes it.
// Stored in `saleDrafts`, server-only (firestore.rules): written and read
// through /api/portal/sales/drafts with the Admin SDK.
//
// The doc id is `${uid}_${clientId}`, so a repeat POST of the same Sold (the
// app's offline queue retrying, or "Add details" filling name and plan later)
// lands on the same draft instead of making a second one. A finished or
// dismissed draft stays as a tombstone, so a late repeat can never reopen it.

export const SALE_DRAFTS_COLLECTION = 'saleDrafts';

export type SaleDraftStatus = 'open' | 'submitted' | 'dismissed';

/** A draft as the API returns it. Dates are epoch ms. */
export interface KnockSaleDraft {
  id: string;
  clientId: string;
  address: string;
  soldAt: number;
  customerName: string | null;
  planId: string | null;
  status: SaleDraftStatus;
  source: 'knock';
  houseId: string | null;
  knockId: string | null;
  campaignId: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

/** The validated body of POST /api/portal/sales/drafts. */
export interface DraftInput {
  clientId: string;
  address: string;
  soldAt: number;
  /** undefined = not sent (leave the stored value alone); null = clear it. */
  customerName?: string | null;
  planId?: string | null;
  source: 'knock';
  houseId?: string;
  knockId?: string;
  campaignId?: string;
}

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const DRAFT_ID_RE = /^[A-Za-z0-9_-]{1,300}$/;
const MAX_ADDRESS = 300;
const MAX_NAME = 120;
// The phone's clock can run a little ahead of the server's.
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;
const MIN_SOLD_AT = Date.UTC(2024, 0, 1);
const STATUSES: readonly SaleDraftStatus[] = ['open', 'submitted', 'dismissed'];

/** The plans a draft may name: the internet plans of the sale form's catalog (no extras). */
export const DRAFT_PLANS = FIBER_PLANS.filter((plan) => plan.category !== 'extra');

/** Firestore doc id for a rep's draft. Both parts are [A-Za-z0-9_-]. */
export function draftDocId(uid: string, clientId: string): string {
  return `${uid}_${clientId}`;
}

/** A draft id from a URL or a sale body: the doc-id shape, nothing else. */
export function isDraftId(value: unknown): value is string {
  return typeof value === 'string' && DRAFT_ID_RE.test(value);
}

export function parseDraftInput(
  body: unknown,
  now = Date.now()
): { ok: true; draft: DraftInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request body' };
  }
  const b: Record<string, unknown> = { ...body };

  if (typeof b.clientId !== 'string' || !ID_RE.test(b.clientId)) {
    return { ok: false, error: 'Invalid clientId' };
  }
  if (b.source !== 'knock') return { ok: false, error: "source must be 'knock'" };

  const address = typeof b.address === 'string' ? b.address.trim().replace(/\s+/g, ' ') : '';
  if (!address) return { ok: false, error: 'Missing required field: address' };
  if (address.length > MAX_ADDRESS) return { ok: false, error: 'Address is too long' };

  if (typeof b.soldAt !== 'number' || !Number.isFinite(b.soldAt)) {
    return { ok: false, error: 'soldAt must be epoch milliseconds' };
  }
  if (b.soldAt < MIN_SOLD_AT || b.soldAt > now + MAX_FUTURE_MS) {
    return { ok: false, error: 'soldAt is out of range' };
  }

  const draft: DraftInput = { clientId: b.clientId, address, soldAt: Math.round(b.soldAt), source: 'knock' };

  if (b.customerName === null) {
    draft.customerName = null;
  } else if (b.customerName !== undefined) {
    if (typeof b.customerName !== 'string') return { ok: false, error: 'Invalid customerName' };
    const name = b.customerName.trim().replace(/\s+/g, ' ');
    if (name.length > MAX_NAME) return { ok: false, error: 'Customer name is too long' };
    draft.customerName = name || null;
  }

  if (b.planId === null || b.planId === '') {
    draft.planId = null;
  } else if (b.planId !== undefined) {
    const planId = b.planId;
    if (typeof planId !== 'string' || !DRAFT_PLANS.some((plan) => plan.id === planId)) {
      return { ok: false, error: 'Unknown planId' };
    }
    draft.planId = planId;
  }

  for (const field of ['houseId', 'knockId', 'campaignId'] as const) {
    const value = b[field];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string' || !ID_RE.test(value)) return { ok: false, error: `Invalid ${field}` };
    draft[field] = value;
  }

  return { ok: true, draft };
}

/** A Firestore Timestamp, Date or epoch ms as epoch ms; null when it is none of those. */
function epochMs(value: unknown): number | null {
  const date =
    value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function'
      ? value.toDate()
      : value;
  const ms = date instanceof Date ? date.getTime() : typeof date === 'number' ? date : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/** A stored draft doc in the API's shape. */
export function serializeDraft(id: string, data: Record<string, unknown>): KnockSaleDraft {
  const text = (key: string) => {
    const value = data[key];
    return typeof value === 'string' && value ? value : null;
  };
  const status = STATUSES.find((s) => s === data.status) ?? 'open';
  return {
    id,
    clientId: text('clientId') ?? '',
    address: text('address') ?? '',
    soldAt: epochMs(data.soldAt) ?? 0,
    customerName: text('customerName'),
    planId: text('planId'),
    status,
    source: 'knock',
    houseId: text('houseId'),
    knockId: text('knockId'),
    campaignId: text('campaignId'),
    createdAt: epochMs(data.createdAt),
    updatedAt: epochMs(data.updatedAt),
  };
}
