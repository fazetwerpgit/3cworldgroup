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
//
// The value is also tagged with whose signature it is (a portal uid, or the
// invite token on the public hire page, which never signs anyone out). A load
// for anyone else returns nothing, so one tab never pre-applies one person's
// ink to another person's documents.

interface StoredRecord extends StoredSignature {
  owner: string;
}

function isStoredRecord(value: unknown): value is StoredRecord {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<StoredRecord>;
  return (
    typeof candidate.owner === 'string' &&
    typeof candidate.png === 'string' &&
    candidate.png.startsWith(PNG_DATA_URL_PREFIX) &&
    (candidate.method === 'draw' || candidate.method === 'type')
  );
}

/**
 * Reads the signature saved for `owner`. Returns null when nothing is stored,
 * when it belongs to someone else, when the stored value is not a signature we
 * recognise, or when storage is blocked (Safari private mode throws on access
 * rather than returning null).
 */
export function loadSignature(owner: string): StoredSignature | null {
  if (!owner) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredRecord(parsed) || parsed.owner !== owner) return null;
    return { png: parsed.png, method: parsed.method };
  } catch {
    return null;
  }
}

/** Best-effort save; full or blocked storage must never break signing. */
export function saveSignature(signature: StoredSignature, owner: string): void {
  if (!owner) return;
  try {
    const record: StoredRecord = { png: signature.png, method: signature.method, owner };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
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
