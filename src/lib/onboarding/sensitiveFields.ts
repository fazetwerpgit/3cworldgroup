import { encryptField, decryptField, last4 } from '@/lib/security/fieldEncryption';
import type { SensitiveDoc } from '@/types/sensitive';

const SSN_DIGITS = /^\d{9}$/;
// US license numbers are 1-19 letters/digits; people type them with spaces or dashes.
const DL_CHARS = /^[A-Za-z0-9 -]+$/;

// The SSN as stored: 9 digits, separators stripped. '' when blank, null when
// it is not a valid SSN.
export function cleanSsn(raw: string | undefined): string | null {
  const ssn = (raw ?? '').replace(/[^0-9]/g, '');
  if (!ssn) return '';
  return SSN_DIGITS.test(ssn) ? ssn : null;
}

// The DL# as stored: as entered, trimmed. '' when blank, null when it is not a
// plausible license number.
export function cleanDlNumber(raw: string | undefined): string | null {
  const dl = (raw ?? '').trim();
  if (!dl) return '';
  const alnum = dl.replace(/[^A-Za-z0-9]/g, '').length;
  if (!DL_CHARS.test(dl) || alnum < 4 || alnum > 20 || dl.length > 40) return null;
  return dl;
}

// Validates and encrypts the sensitive onboarding fields. SSN is stored stripped
// of separators (9 digits); DL# stored as entered (trimmed). All optional here -
// callers decide which ones are required.
export function buildSensitiveDoc(input: {
  ssn?: string;
  dlNumber?: string;
  backgroundCheckAuth?: boolean;
}): { ok: true; doc: Partial<SensitiveDoc> } | { ok: false; error: string } {
  const doc: Partial<SensitiveDoc> = {};

  const ssn = cleanSsn(input.ssn);
  if (ssn === null) {
    return { ok: false, error: 'Enter a valid 9-digit Social Security Number' };
  }
  if (ssn) {
    doc.ssnEncrypted = encryptField(ssn);
    doc.ssnLast4 = last4(ssn);
  }

  const dl = cleanDlNumber(input.dlNumber);
  if (dl === null) {
    return { ok: false, error: "Enter a valid driver's license number" };
  }
  if (dl) {
    doc.dlNumberEncrypted = encryptField(dl);
    doc.dlLast4 = last4(dl);
  }

  if (typeof input.backgroundCheckAuth === 'boolean') {
    doc.backgroundCheckAuth = input.backgroundCheckAuth;
  }

  return { ok: true, doc };
}

// Decrypts the stored encrypted fields for an authorized reveal.
export function revealSensitive(
  doc: Pick<SensitiveDoc, 'ssnEncrypted' | 'dlNumberEncrypted'>
): { ssn?: string; dlNumber?: string } {
  return {
    ssn: doc.ssnEncrypted ? decryptField(doc.ssnEncrypted) : undefined,
    dlNumber: doc.dlNumberEncrypted ? decryptField(doc.dlNumberEncrypted) : undefined,
  };
}
