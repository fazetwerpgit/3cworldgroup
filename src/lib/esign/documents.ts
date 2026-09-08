import type { EsignDocKey } from './provider';

/**
 * Shared description of the five onboarding documents: which PDF, where every
 * field sits on it, and the rules for what a rep must fill in.
 *
 * This lives outside `signwell.ts` because both the SignWell provider (which
 * posts these boxes to the vendor) and the in-house provider (which stamps them
 * with pdf-lib) need the same coordinates.
 */

export type EsignFieldType = 'text' | 'checkbox';

/**
 * A field box in 96-DPI pixels measured from the page's TOP-LEFT corner, the
 * coordinate system SignWell uses. PDF points are 72 DPI from the BOTTOM-LEFT,
 * so `boxToPdfRect` converts before anything is drawn with pdf-lib.
 *
 * `page` is 1-based.
 */
export interface EsignBox {
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  required: boolean;
  date_format?: 'MM/DD/YYYY';
  lock_sign_date?: boolean;
}

export interface EsignExtraField extends EsignBox {
  key: string;
  type: EsignFieldType;
}

export interface EsignDocumentConfig {
  /** File name under `assets/esign/`. */
  file: string;
  name: string;
  /** Page count of the source PDF, so field pages can be bounds-checked. */
  pages: number;
  signature: EsignBox;
  date: EsignBox;
  /** Additional fill-in fields (text/checkbox) keyed by api_id suffix. */
  extra?: EsignExtraField[];
}

// Positions below are visually verified against the assets/esign PDFs.
export const DOCUMENTS: Record<EsignDocKey, EsignDocumentConfig> = {
  contract: {
    file: 'contract.pdf',
    name: 'Independent Agent Agreement',
    pages: 3,
    signature: { x: 184, y: 584, page: 3, required: true, width: 312, height: 34 },
    date: { x: 534, y: 584, page: 3, required: true, width: 148, height: 34, date_format: 'MM/DD/YYYY', lock_sign_date: true },
    extra: [
      { key: 'agent_name', type: 'text', x: 168, y: 636, page: 3, required: true, width: 532, height: 30 },
      { key: 'business_name', type: 'text', x: 184, y: 684, page: 3, required: false, width: 516, height: 30 },
      { key: 'ein', type: 'text', x: 132, y: 728, page: 3, required: false, width: 564, height: 30 },
      { key: 'street_address', type: 'text', x: 180, y: 772, page: 3, required: true, width: 520, height: 34 },
      { key: 'city_state_zip', type: 'text', x: 212, y: 820, page: 3, required: true, width: 488, height: 32 },
      { key: 'office_phone', type: 'text', x: 168, y: 868, page: 3, required: false, width: 224, height: 32 },
      { key: 'cell_phone', type: 'text', x: 460, y: 868, page: 3, required: true, width: 236, height: 32 },
      { key: 'email', type: 'text', x: 180, y: 916, page: 3, required: true, width: 212, height: 32 },
      { key: 'website', type: 'text', x: 452, y: 916, page: 3, required: false, width: 244, height: 32 },
    ],
  },
  direct_deposit: {
    file: 'direct_deposit.pdf',
    name: 'Direct Deposit Authorization',
    pages: 2,
    signature: { x: 112, y: 576, page: 1, required: true, width: 500, height: 34 },
    date: { x: 676, y: 576, page: 1, required: true, width: 100, height: 34, date_format: 'MM/DD/YYYY', lock_sign_date: true },
    extra: [
      { key: 'legal_name', type: 'text', x: 132, y: 536, page: 1, required: true, width: 644, height: 34 },
      { key: 'bank_name', type: 'text', x: 128, y: 164, page: 2, required: true, width: 644, height: 26 },
      { key: 'routing_number', type: 'text', x: 124, y: 192, page: 2, required: true, width: 252, height: 26 },
      { key: 'account_number', type: 'text', x: 468, y: 192, page: 2, required: true, width: 304, height: 26 },
      { key: 'checking', type: 'checkbox', x: 43, y: 259, page: 2, required: false, width: 22, height: 22 },
      { key: 'savings', type: 'checkbox', x: 197, y: 259, page: 2, required: false, width: 22, height: 22 },
      { key: 'deposit_amount', type: 'text', x: 404, y: 258, page: 2, required: false, width: 120, height: 20 },
      { key: 'full_net_amount', type: 'checkbox', x: 566, y: 262, page: 2, required: false, width: 16, height: 16 },
    ],
  },
  pay_structure: {
    file: 'pay_structure.pdf',
    name: 'Pay Structure Acknowledgment',
    pages: 1,
    signature: { x: 187, y: 827, page: 1, required: true, width: 253, height: 42 },
    date: { x: 573, y: 841, page: 1, required: true, width: 147, height: 28, date_format: 'MM/DD/YYYY', lock_sign_date: true },
  },
  w9: {
    file: 'w9.pdf',
    name: 'Form W-9 (Request for Taxpayer Identification Number)',
    pages: 6,
    signature: { x: 200, y: 770, page: 1, required: true, width: 304, height: 32 },
    date: { x: 552, y: 770, page: 1, required: true, width: 208, height: 32, date_format: 'MM/DD/YYYY', lock_sign_date: true },
    extra: [
      { key: 'name', type: 'text', x: 98, y: 152, page: 1, required: true, width: 640, height: 18 },
      { key: 'business_name', type: 'text', x: 98, y: 187, page: 1, required: false, width: 640, height: 18 },
      { key: 'individual_sole_prop', type: 'checkbox', x: 93, y: 236, page: 1, required: false, width: 22, height: 22 },
      { key: 'llc', type: 'checkbox', x: 93, y: 255, page: 1, required: false, width: 22, height: 22 },
      { key: 'llc_classification', type: 'text', x: 512, y: 254, page: 1, required: false, width: 80, height: 16 },
      { key: 'address', type: 'text', x: 84, y: 383, page: 1, required: true, width: 424, height: 20 },
      { key: 'city_state_zip', type: 'text', x: 84, y: 417, page: 1, required: true, width: 424, height: 20 },
      // TIN is one-of SSN/EIN — SignWell cannot express either/or, so both stay
      // optional here and `validateFields` enforces the choice instead.
      { key: 'ssn', type: 'text', x: 560, y: 498, page: 1, required: false, width: 200, height: 24 },
      { key: 'ein', type: 'text', x: 560, y: 562, page: 1, required: false, width: 200, height: 24 },
    ],
  },
  fcra_auth: {
    file: 'fcra_auth.pdf',
    name: 'FCRA Background Check Authorization',
    pages: 1,
    signature: { x: 187, y: 827, page: 1, required: true, width: 253, height: 42 },
    date: { x: 573, y: 841, page: 1, required: true, width: 147, height: 28, date_format: 'MM/DD/YYYY', lock_sign_date: true },
  },
};

/**
 * Values that may only ever reach the stamped PDF. They are never written to
 * Firestore, logs, or notifications, so anything that echoes a rep's answers
 * back (envelope records, API responses) must consult this first.
 */
export const SENSITIVE_FIELD_KEYS = ['ssn', 'ein', 'routing_number', 'account_number'] as const;

export function isSensitiveFieldKey(key: string): boolean {
  return (SENSITIVE_FIELD_KEYS as readonly string[]).includes(key);
}

/** Rep-facing labels, also used in the `Missing required field: …` errors. */
export const FIELD_LABELS: Record<string, string> = {
  agent_name: 'Agent name',
  business_name: 'Business name',
  ein: 'EIN',
  street_address: 'Street address',
  city_state_zip: 'City, State ZIP',
  office_phone: 'Office phone',
  cell_phone: 'Cell phone',
  email: 'Email',
  website: 'Website',
  legal_name: 'Legal name',
  bank_name: 'Bank name',
  routing_number: 'Routing number',
  account_number: 'Account number',
  checking: 'Checking',
  savings: 'Savings',
  deposit_amount: 'Deposit amount',
  full_net_amount: 'Deposit full net amount',
  name: 'Name (as shown on your tax return)',
  individual_sole_prop: 'Individual / sole proprietor',
  llc: 'LLC',
  llc_classification: 'LLC tax classification (C, S, or P)',
  address: 'Address',
  ssn: 'Social Security number',
};

/** Consent statement shown to the rep and printed verbatim on the audit page. */
export const ESIGN_CONSENT_TEXT =
  'I agree that my electronic signature is the legal equivalent of my handwritten signature, and I consent to sign and receive this document electronically.';

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 96-DPI top-left pixels -> 72-DPI bottom-left points for the given page height. */
export function boxToPdfRect(
  box: Pick<EsignBox, 'x' | 'y' | 'width' | 'height'>,
  pageHeightPt: number
): PdfRect {
  return {
    x: box.x * 0.75,
    y: pageHeightPt - (box.y + box.height) * 0.75,
    width: box.width * 0.75,
    height: box.height * 0.75,
  };
}

/**
 * The one checkbox the rep already answered earlier in onboarding, so it can be
 * pre-ticked instead of asked again. Documents with no stored choice, and
 * unrecognised choices, return undefined.
 */
export function selectedCheckboxKey(
  docKey: EsignDocKey,
  prefill?: Record<string, string>
): string | undefined {
  if (docKey === 'direct_deposit') {
    if (prefill?.accountType === 'checking') return 'checking';
    if (prefill?.accountType === 'savings') return 'savings';
    return undefined;
  }
  if (docKey === 'w9') {
    if (prefill?.taxClassification === 'individual') return 'individual_sole_prop';
    if (prefill?.taxClassification === 'llc') return 'llc';
    return undefined;
  }
  return undefined;
}

export type EsignFieldValues = Record<string, string | boolean>;

export type FieldValidation =
  | { ok: true; fields: EsignFieldValues }
  | { ok: false; error: string };

const MAX_TEXT_LENGTH = 200;

function labelFor(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/** True when exactly one of the two keys is set (checkbox ticked / text non-empty). */
function exactlyOne(fields: EsignFieldValues, a: string, b: string): boolean {
  return Boolean(fields[a]) !== Boolean(fields[b]);
}

/**
 * Server-side validation of what a rep submitted for one document. Unknown keys
 * are dropped rather than rejected so a stale or hostile client cannot inject
 * fields, and keys the rep never sent stay absent so callers can tell
 * "not answered" apart from "answered no".
 */
export function validateFields(docKey: EsignDocKey, input: unknown): FieldValidation {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Invalid fields' };
  }

  const submitted = input as Record<string, unknown>;
  const config = DOCUMENTS[docKey];
  const fields: EsignFieldValues = {};

  for (const field of config.extra ?? []) {
    const raw = submitted[field.key];
    if (raw === undefined || raw === null) continue;
    fields[field.key] =
      field.type === 'checkbox' ? raw === true : String(raw).trim().slice(0, MAX_TEXT_LENGTH);
  }

  for (const field of config.extra ?? []) {
    if (field.required && field.type === 'text' && !fields[field.key]) {
      return { ok: false, error: `Missing required field: ${labelFor(field.key)}` };
    }
  }

  if (docKey === 'w9') {
    if (!exactlyOne(fields, 'ssn', 'ein')) {
      return { ok: false, error: 'Provide either an SSN or an EIN' };
    }
    if (!exactlyOne(fields, 'individual_sole_prop', 'llc')) {
      return { ok: false, error: 'Choose a tax classification' };
    }
  }

  if (docKey === 'direct_deposit' && !exactlyOne(fields, 'checking', 'savings')) {
    return { ok: false, error: 'Choose checking or savings' };
  }

  return { ok: true, fields };
}
