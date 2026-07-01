// The only non-promotion job position; everything else (manager tiers and any
// future GM/Director/etc.) is treated as a promotion, which reveals the three
// "For Promotion Only" questions. Kept as a single rule because job positions are
// admin-editable (see the editable-form-options design).
const ENTRY_ROLE = 'Account Executive';

export function isPromotionRole(jobPosition: string): boolean {
  return jobPosition.trim() !== '' && jobPosition.trim() !== ENTRY_ROLE;
}

const SIGNATURE_PREFIX = 'data:image/png;base64,';
const MAX_SIGNATURE_BYTES = 200 * 1024;

// A drawn signature arrives as a PNG data URL. Accept only that shape and cap the
// size so a crafted request can't store an arbitrary/huge blob. The cap is on the
// decoded PNG byte count (base64 encodes 3 bytes per 4 chars), not the raw string
// length, so a legitimately-sized PNG isn't rejected once base64-expanded.
export function validateSignatureDataUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!value.startsWith(SIGNATURE_PREFIX)) return false;
  const base64 = value.slice(SIGNATURE_PREFIX.length);
  if (base64.length === 0) return false;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const byteLength = Math.floor((base64.length * 3) / 4) - padding;
  if (byteLength > MAX_SIGNATURE_BYTES) return false;
  return true;
}

// Lightweight email-shape check for required email fields. Not RFC-exhaustive —
// just enough to reject obvious non-emails ("x", "not-an-email") server-side.
export function isEmailShaped(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
