import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM field-level encryption for onboarding PII (SSN, DL#). Server-only.
// The key lives in ONBOARDING_FIELD_ENCRYPTION_KEY (32 bytes, base64). If it is
// missing or the wrong length we throw — we never silently store plaintext.

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

function getKey(): Buffer {
  const raw = process.env.ONBOARDING_FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('ONBOARDING_FIELD_ENCRYPTION_KEY is not set');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('ONBOARDING_FIELD_ENCRYPTION_KEY must decode to 32 bytes');
  }
  return key;
}

// Returns base64(iv).base64(authTag).base64(ciphertext)
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptField(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted payload');
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

// Last 4 of the alphanumeric value (separators stripped) for masked display.
export function last4(value: string): string {
  const stripped = value.replace(/[^A-Za-z0-9]/g, '');
  return stripped.slice(-4);
}
