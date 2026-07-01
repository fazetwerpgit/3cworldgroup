// The only non-promotion job position; everything else (manager tiers and any
// future GM/Director/etc.) is treated as a promotion, which reveals the three
// "For Promotion Only" questions. Kept as a single rule because job positions are
// admin-editable (see the editable-form-options design).
const ENTRY_ROLE = 'Account Executive';

export function isPromotionRole(jobPosition: string): boolean {
  return jobPosition.trim() !== '' && jobPosition.trim() !== ENTRY_ROLE;
}

const MAX_SIGNATURE_BYTES = 200 * 1024;

// A drawn signature arrives as a PNG data URL. Accept only that shape and cap the
// size so a crafted request can't store an arbitrary/huge blob.
export function validateSignatureDataUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('data:image/png;base64,')) return false;
  if (value.length > MAX_SIGNATURE_BYTES) return false;
  return true;
}
