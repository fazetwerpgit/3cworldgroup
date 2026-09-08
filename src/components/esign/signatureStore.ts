export type SignatureMethod = 'draw' | 'type';

export interface StoredSignature {
  /** `data:image/png;base64,...` produced by the signature pad. */
  png: string;
  method: SignatureMethod;
}

const STORAGE_KEY = 'esign.signature';
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

// The rep signs five documents in a row. Keeping the signature for the tab's
// lifetime means they draw it once instead of five times. sessionStorage (not
// localStorage) so it dies with the tab, and AuthContext.signOut clears it
// explicitly so a shared phone never hands one rep's signature to the next.

function isStoredSignature(value: unknown): value is StoredSignature {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<StoredSignature>;
  return (
    typeof candidate.png === 'string' &&
    candidate.png.startsWith(PNG_DATA_URL_PREFIX) &&
    (candidate.method === 'draw' || candidate.method === 'type')
  );
}

/**
 * Reads the saved signature. Returns null when nothing is stored, when the
 * stored value is not a signature we recognise, or when storage is blocked
 * (Safari private mode throws on access rather than returning null).
 */
export function loadSignature(): StoredSignature | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredSignature(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Best-effort save; full or blocked storage must never break signing. */
export function saveSignature(signature: StoredSignature): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(signature));
  } catch {
    // Signing continues with the in-memory signature; only the reuse is lost.
  }
}

export function clearSignature(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do - the value is unreachable either way.
  }
}
