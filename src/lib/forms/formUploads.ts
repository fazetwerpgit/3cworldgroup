// Generic form-attachment upload validation (NOT onboarding-coupled). Files for
// rep forms (e.g. Payroll Dispute screenshot) go to
// form-attachments/{uid}/{formType}/{uploadId}/ (see resolveFormUploadFolder).

import { randomHex } from '@/lib/randomHex';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'application/pdf': 'pdf',
};

export const FORM_ATTACHMENT_TYPES: string[] = Object.keys(EXT_BY_MIME);
export const MAX_FORM_FILE_BYTES = 4 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
};

/**
 * The MIME an upload really is. Pickers do not always say: iOS can hand over a
 * HEIC from Files with an empty type, some Android pickers send
 * application/octet-stream, and a few send the non-standard image/jpg. Those
 * fall back to the file extension. Shared by the client (before sending) and
 * the upload routes (before validating), so both judge a file the same way.
 */
export function resolveUploadMime(type: string, name: string): string {
  const supplied = type.toLowerCase().split(';', 1)[0].trim();
  if (supplied === 'image/jpg' || supplied === 'image/pjpeg') return 'image/jpeg';
  if (supplied && supplied !== 'application/octet-stream') return supplied;
  const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  return MIME_BY_EXTENSION[extension] ?? supplied;
}

export function validateFormUpload(input: {
  mime: string;
  size: number;
}): { ok: true; ext: string } | { ok: false; error: string } {
  const ext = EXT_BY_MIME[input.mime];
  if (!ext) return { ok: false, error: 'Unsupported file type' };
  if (input.size <= 0 || input.size > MAX_FORM_FILE_BYTES) {
    return { ok: false, error: 'File must be between 1 byte and 4 MB' };
  }
  return { ok: true, ext };
}

// ISO-BMFF major brands of an iPhone/Android HEIC or generic HEIF photo.
const MIME_BY_HEIF_BRAND: Record<string, string> = {
  heic: 'image/heic', heix: 'image/heic', hevc: 'image/heic', hevx: 'image/heic',
  heim: 'image/heic', heis: 'image/heic', hevm: 'image/heic', hevs: 'image/heic',
  mif1: 'image/heif', msf1: 'image/heif',
};

/**
 * The type a file really is, read from its first bytes, or null when it is
 * none of the accepted types. The server stores this, never the declared type,
 * so a file can't be saved as a PDF when it is a PNG (or anything else).
 */
export function sniffUploadMime(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  // Readers accept a PDF header anywhere in the first 1 KB.
  if (ascii(0, 1024).includes('%PDF-')) return 'application/pdf';
  if (ascii(4, 8) === 'ftyp') return MIME_BY_HEIF_BRAND[ascii(8, 12)] ?? null;
  return null;
}

// Legacy layout (no per-submission id): form-attachments/{uid}/{formType}/[{slot}/].
// Still used by sale-proof (whose slot IS a per-sale id) and to read old records.
export function buildFormAttachmentFolder(uid: string, formType: string, slot?: string): string {
  const base = `form-attachments/${uid}/${formType}/`;
  return slot ? `${base}${slot}/` : base;
}

// Which slots each form's uploads may use. Empty string = the single-file forms
// (Payroll Dispute) that write straight into the submission folder. Leads Request
// uses three named slots so its attachments never collide.
export const FORM_UPLOAD_SLOTS: Record<string, string[]> = {
  'payroll-dispute': [''],
  'leads-request': ['hostile', 'blind-knock', 'lasso'],
};

// sale-proof uploads use a per-sale unique id as the slot, so one rep's sales
// never share (and overwrite) a screenshot folder. Other forms use fixed slots.
const SALE_PROOF_SLOT = /^[A-Za-z0-9_-]{8,64}$/;

export function isAllowedFormUpload(formType: string, slot: string): boolean {
  if (formType === 'sale-proof') return SALE_PROOF_SLOT.test(slot);
  const slots = FORM_UPLOAD_SLOTS[formType];
  return Array.isArray(slots) && slots.includes(slot);
}

// Payroll Dispute + Leads Request: every submission gets its own upload id
// (generated client-side when the form opens), so a rep's second dispute or an
// abandoned upload can never replace/delete the proof on an earlier submission.
// Format: 32 lowercase hex (randomHex, the dash-stripped randomUUID shape).
const FORM_UPLOAD_ID = /^[0-9a-f]{32}$/;
const PER_SUBMISSION_FORMS = new Set(['payroll-dispute', 'leads-request']);

// Where each per-submission form's records live: once a record carries an
// uploadId, that folder is that record's proof and can no longer be replaced.
export const SUBMISSION_COLLECTION: Record<string, string> = {
  'payroll-dispute': 'payrollDisputes',
  'leads-request': 'leadsRequests',
};

export function newFormUploadId(): string {
  return randomHex();
}

export function isValidFormUploadId(id: unknown): id is string {
  return typeof id === 'string' && FORM_UPLOAD_ID.test(id);
}

// form-attachments/{uid}/{formType}/{uploadId}/[{slot}/]
export function buildSubmissionAttachmentFolder(
  uid: string,
  formType: string,
  uploadId: string,
  slot?: string
): string {
  const base = `form-attachments/${uid}/${formType}/${uploadId}/`;
  return slot ? `${base}${slot}/` : base;
}

// The folder an upload may write to, or null if formType/slot/uploadId is invalid.
// Per-submission forms REQUIRE a valid upload id (no more shared legacy folders).
export function resolveFormUploadFolder(
  uid: string,
  formType: string,
  slot: string,
  uploadId: string
): string | null {
  if (!isAllowedFormUpload(formType, slot)) return null;
  if (PER_SUBMISSION_FORMS.has(formType)) {
    if (!isValidFormUploadId(uploadId)) return null;
    return buildSubmissionAttachmentFolder(uid, formType, uploadId, slot || undefined);
  }
  return buildFormAttachmentFolder(uid, formType, slot || undefined);
}
