// Validation for solar lead input (POST /api/portal/solar/leads and PATCH).
import { z } from 'zod';
import { isCleanAttachmentPath } from '@/lib/forms/attachmentPath';
import { buildSubmissionAttachmentFolder, isValidFormUploadId } from '@/lib/forms/formUploads';

export const CREDIT_TIERS = ['purchase_600', 'lease_ppa_680'] as const;
export type CreditTier = (typeof CREDIT_TIERS)[number];

export const CREDIT_TIER_LABELS: Record<CreditTier, string> = {
  purchase_600: 'Purchase (600+)',
  lease_ppa_680: 'Lease / PPA (680+)',
};

export function isCreditTier(value: unknown): value is CreditTier {
  return typeof value === 'string' && (CREDIT_TIERS as readonly string[]).includes(value);
}

/**
 * A lead's life: new (saved, no consultation), booked (a consultation is set),
 * sold or lost (an admin closed it). A demo account's lead is stored as 'demo'
 * and never listed to admins.
 */
export const SOLAR_LEAD_STATUSES = ['new', 'booked', 'sold', 'lost'] as const;
export type SolarLeadStatus = (typeof SOLAR_LEAD_STATUSES)[number];

export function isSolarLeadStatus(value: unknown): value is SolarLeadStatus {
  return typeof value === 'string' && (SOLAR_LEAD_STATUSES as readonly string[]).includes(value);
}

export const PHOTO_SLOTS = ['billPage1', 'billGraph', 'panel', 'meter'] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

/** Short photo names for the lead alert email. */
export const PHOTO_SLOT_LABELS: Record<PhotoSlot, string> = {
  billPage1: 'Bill (first page)',
  billGraph: 'Bill (bar graph)',
  panel: 'Electric panel',
  meter: 'Electric meter',
};

/** Roofs that qualify (the knock app's "asphalt" is shingle). */
export const ROOF_TYPES = ['concrete_tile', 'shingle', 'flat'] as const;
export type RoofType = (typeof ROOF_TYPES)[number];
/** Roofs that stop the lead: the deck and the app block them, the API refuses them. */
export const BLOCKED_ROOF_TYPES = ['metal', 'clay', 'wood_shingle'] as const;
export type BlockedRoofType = (typeof BLOCKED_ROOF_TYPES)[number];

export const ROOF_TYPE_LABELS: Record<RoofType | BlockedRoofType, string> = {
  concrete_tile: 'Concrete tile',
  shingle: 'Shingle (asphalt)',
  flat: 'Flat',
  metal: 'Metal',
  clay: 'Clay tile',
  wood_shingle: 'Wood shingle',
};

export const ROOF_NOT_QUALIFIED = "This roof type doesn't qualify for solar right now";

export function isRoofType(value: unknown): value is RoofType {
  return typeof value === 'string' && (ROOF_TYPES as readonly string[]).includes(value);
}

export function isBlockedRoofType(value: unknown): value is BlockedRoofType {
  return typeof value === 'string' && (BLOCKED_ROOF_TYPES as readonly string[]).includes(value);
}

/** Largest stored `usage` object (the deck's usage helper), as JSON. */
export const USAGE_MAX_BYTES = 4096;

/** The qualifying answers the app (and deck) send with a lead; every one optional. */
export type LeadExtras = {
  roofType?: RoofType;
  heavyShade?: boolean;
  needsReview?: boolean;
  monthlyKwh?: number;
  usage?: Record<string, unknown>;
};

const usageSchema = z
  .record(z.string(), z.unknown())
  .refine((v) => {
    try {
      return new TextEncoder().encode(JSON.stringify(v)).length <= USAGE_MAX_BYTES;
    } catch {
      return false;
    }
  }, 'usage is too large');

const extrasSchema = z.object({
  roofType: z
    .string()
    .refine((v) => !isBlockedRoofType(v), ROOF_NOT_QUALIFIED)
    .refine(isRoofType, 'Invalid roofType')
    .optional(),
  heavyShade: z.boolean().optional(),
  needsReview: z.boolean().optional(),
  monthlyKwh: z.number().min(0, 'Invalid monthlyKwh').max(100000, 'Invalid monthlyKwh').optional(),
  usage: usageSchema.optional(),
});

const EXTRA_KEYS = ['roofType', 'heavyShade', 'needsReview', 'monthlyKwh', 'usage'] as const;

/** Whether the body carries any of the extras (PATCH picks its branch on it). */
export function hasLeadExtras(body: Record<string, unknown>): boolean {
  return EXTRA_KEYS.some((k) => body[k] !== undefined && body[k] !== null);
}

/**
 * roofType, heavyShade, needsReview, monthlyKwh and usage, validated. Absent
 * or null fields are left out. A blocked roof (metal, clay, wood shingle) is
 * refused. Heavy shade always means needsReview (the closer looks first).
 */
export function parseLeadExtras(body: Record<string, unknown>): { ok: true; extras: LeadExtras } | { ok: false; error: string } {
  const picked: Record<string, unknown> = {};
  for (const k of EXTRA_KEYS) if (body[k] !== undefined && body[k] !== null) picked[k] = body[k];
  const res = extrasSchema.safeParse(picked);
  if (!res.success) {
    const issue = res.error.issues[0];
    const field = String(issue?.path?.[0] ?? '');
    const custom = issue?.message && !issue.message.startsWith('Invalid input') && !issue.message.startsWith('Too ')
      ? issue.message
      : '';
    return { ok: false, error: custom || `Invalid ${field || 'field'}` };
  }
  const extras: LeadExtras = {};
  const v = res.data;
  if (v.roofType !== undefined) extras.roofType = v.roofType as RoofType;
  if (v.heavyShade !== undefined) extras.heavyShade = v.heavyShade;
  if (v.needsReview !== undefined) extras.needsReview = v.needsReview;
  if (v.heavyShade === true) extras.needsReview = true;
  if (v.monthlyKwh !== undefined) extras.monthlyKwh = Math.round(v.monthlyKwh);
  // A JSON round trip keeps only plain data (no undefined, no prototypes).
  if (v.usage !== undefined) extras.usage = JSON.parse(JSON.stringify(v.usage)) as Record<string, unknown>;
  return { ok: true, extras };
}

export function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Storage folder the caller may reference: their own solar-lead uploads only. */
export function photoPrefix(uid: string): string {
  return `form-attachments/${uid}/solar-lead/`;
}

/** The upload id segment of a solar-lead photo path, or '' when there is none. */
function uploadIdOf(path: string, uid: string): string {
  const rest = path.startsWith(photoPrefix(uid)) ? path.slice(photoPrefix(uid).length) : '';
  const id = rest.split('/', 1)[0];
  return isValidFormUploadId(id) ? id : '';
}

export type LeadFields = {
  first: string;
  last: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  monthlyBill: number | null;
  creditTier: CreditTier | null;
  photos: Partial<Record<PhotoSlot, string>>;
  /**
   * The per-lead upload id its photos live under. Stored on the lead so the
   * upload route refuses to replace them once the lead is saved (same lock as
   * Leads Request). '' when the caller sent neither an id nor photos.
   */
  uploadId: string;
  doorId: string | null;
  campaignId: string | null;
  source: 'portal' | 'knock';
  /** False unless sent true (or heavyShade is true); every new lead stores it. */
  needsReview: boolean;
} & Omit<LeadExtras, 'needsReview'>;

/** The homeowner's contact fields: what the rep may still fix on an open lead. */
export const LEAD_CONTACT_KEYS = ['first', 'last', 'phone', 'email', 'address', 'city', 'state', 'zip'] as const;
export type LeadContact = Pick<LeadFields, (typeof LEAD_CONTACT_KEYS)[number]>;

export function hasLeadContact(body: Record<string, unknown>): boolean {
  return LEAD_CONTACT_KEYS.some((key) => body[key] !== undefined);
}

/**
 * Name, phone, email and address, validated as on create: first, last and a
 * valid email required; phone optional but phone-shaped; address parts
 * trimmed and capped. A missing key reads as ''.
 */
export function parseLeadContact(body: Record<string, unknown>): { ok: true; contact: LeadContact } | { ok: false; error: string } {
  const first = str(body.first, 80);
  const last = str(body.last, 80);
  const phone = str(body.phone, 40);
  const email = str(body.email, 200).toLowerCase();
  if (!first || !last) return { ok: false, error: 'First and last name are required' };
  if (!email) return { ok: false, error: 'Email is required' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email' };
  if (phone && !/^[\d\s()+.-]{7,40}$/.test(phone)) return { ok: false, error: 'Enter a valid phone number' };
  return {
    ok: true,
    contact: {
      first,
      last,
      address: str(body.address, 200),
      city: str(body.city, 80),
      state: str(body.state, 40),
      zip: str(body.zip, 20),
      phone,
      email,
    },
  };
}

export function parseLead(body: Record<string, unknown>, uid: string): { ok: true; fields: LeadFields } | { ok: false; error: string } {
  const parsedContact = parseLeadContact(body);
  if (!parsedContact.ok) return parsedContact;
  const { contact } = parsedContact;

  let monthlyBill: number | null = null;
  if (body.monthlyBill !== undefined && body.monthlyBill !== null && body.monthlyBill !== '') {
    const n = typeof body.monthlyBill === 'number' ? body.monthlyBill : Number(String(body.monthlyBill).replace(/[$,\s]/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > 100000) return { ok: false, error: 'Monthly bill must be a dollar amount' };
    monthlyBill = Math.round(n * 100) / 100;
  }

  let creditTier: CreditTier | null = null;
  if (body.creditTier !== undefined && body.creditTier !== null && body.creditTier !== '') {
    if (!isCreditTier(body.creditTier)) return { ok: false, error: 'Invalid creditTier' };
    creditTier = body.creditTier;
  }

  let uploadId = '';
  if (body.uploadId !== undefined && body.uploadId !== null && body.uploadId !== '') {
    if (!isValidFormUploadId(body.uploadId)) return { ok: false, error: 'Invalid uploadId' };
    uploadId = body.uploadId;
  }

  // Each photo must be exactly this caller's folder for this lead's upload id
  // and that slot: form-attachments/{uid}/solar-lead/{uploadId}/{slot}/. A
  // caller that sends photos without an uploadId (3C Doors) gets the id read
  // from the first photo, and every other photo must share it.
  const photos: Partial<Record<PhotoSlot, string>> = {};
  const rawPhotos = body.photos;
  if (rawPhotos !== undefined && rawPhotos !== null) {
    if (typeof rawPhotos !== 'object' || Array.isArray(rawPhotos)) return { ok: false, error: 'Invalid photos' };
    for (const slot of PHOTO_SLOTS) {
      const v = (rawPhotos as Record<string, unknown>)[slot];
      if (v === undefined || v === null || v === '') continue;
      if (typeof v !== 'string' || v.length > 300 || !isCleanAttachmentPath(v)) {
        return { ok: false, error: 'Invalid photo path' };
      }
      if (!uploadId) uploadId = uploadIdOf(v, uid);
      if (!uploadId || v !== buildSubmissionAttachmentFolder(uid, 'solar-lead', uploadId, slot)) {
        return { ok: false, error: 'Invalid photo path' };
      }
      photos[slot] = v;
    }
  }

  const parsedExtras = parseLeadExtras(body);
  if (!parsedExtras.ok) return parsedExtras;
  const { needsReview, ...extras } = parsedExtras.extras;

  const doorId = str(body.doorId, 128) || null;
  const campaignId = str(body.campaignId, 128) || null;
  const source = body.source === 'knock' || doorId || campaignId ? 'knock' : 'portal';

  return {
    ok: true,
    fields: {
      ...contact,
      monthlyBill,
      creditTier,
      photos,
      uploadId,
      doorId,
      campaignId,
      source,
      ...extras,
      needsReview: needsReview === true,
    },
  };
}
