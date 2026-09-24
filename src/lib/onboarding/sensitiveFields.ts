import { encryptField, decryptField, last4 } from '@/lib/security/fieldEncryption';
import type { SensitiveDoc } from '@/types/sensitive';

const SSN_DIGITS = /^\d{9}$/;
// US license numbers are 1-19 letters/digits; people type them with spaces or dashes.
const DL_CHARS = /^[A-Za-z0-9 -]+$/;

// Validates and encrypts the sensitive onboarding fields. SSN is stored stripped
// of separators (9 digits); DL# stored as entered (trimmed). All optional here -
// callers decide which ones are required.
export function buildSensitiveDoc(input: {
  ssn?: string;
  dlNumber?: string;
  backgroundCheckAuth?: boolean;
}): { ok: true; doc: Partial<SensitiveDoc> } | { ok: false; error: string } {
  const doc: Partial<SensitiveDoc> = {};

  const ssn = (input.ssn ?? '').replace(/[^0-9]/g, '');
  if (ssn) {
    if (!SSN_DIGITS.test(ssn)) {
      return { ok: false, error: 'Enter a valid 9-digit Social Security Number' };
    }
    doc.ssnEncrypted = encryptField(ssn);
    doc.ssnLast4 = last4(ssn);
  }

  const dl = (input.dlNumber ?? '').trim();
  if (dl) {
    const alnum = dl.replace(/[^A-Za-z0-9]/g, '').length;
    if (!DL_CHARS.test(dl) || alnum < 4 || alnum > 20 || dl.length > 40) {
      return { ok: false, error: "Enter a valid driver's license number" };
    }
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
