// Validation for solar lead input (POST /api/portal/solar/leads and PATCH).
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

export const PHOTO_SLOTS = ['billPage1', 'billGraph', 'panel'] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

/** Short photo names for the lead alert email. */
export const PHOTO_SLOT_LABELS: Record<PhotoSlot, string> = {
  billPage1: 'Bill (first page)',
  billGraph: 'Bill (bar graph)',
  panel: 'Electric panel',
};

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
};

export function parseLead(body: Record<string, unknown>, uid: string): { ok: true; fields: LeadFields } | { ok: false; error: string } {
  const first = str(body.first, 80);
  const last = str(body.last, 80);
  const phone = str(body.phone, 40);
  const email = str(body.email, 200).toLowerCase();
  if (!first || !last) return { ok: false, error: 'First and last name are required' };
  if (!email) return { ok: false, error: 'Email is required' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email' };
  if (phone && !/^[\d\s()+.-]{7,40}$/.test(phone)) return { ok: false, error: 'Enter a valid phone number' };

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

  const doorId = str(body.doorId, 128) || null;
  const campaignId = str(body.campaignId, 128) || null;
  const source = body.source === 'knock' || doorId || campaignId ? 'knock' : 'portal';

  return {
    ok: true,
    fields: {
      first,
      last,
      address: str(body.address, 200),
      city: str(body.city, 80),
      state: str(body.state, 40),
      zip: str(body.zip, 20),
      phone,
      email,
      monthlyBill,
      creditTier,
      photos,
      uploadId,
      doorId,
      campaignId,
      source,
    },
  };
}
