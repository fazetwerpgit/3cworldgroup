import { ONBOARDING_ITEMS } from '@/types';

// Items whose reference is a Firebase Storage folder path.
export const STORAGE_ITEM_IDS: string[] = ONBOARDING_ITEMS.filter(
  (i) => i.referenceKind === 'storage'
).map((i) => i.id);

const IMAGE_MIMES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
};
const PDF_MIME: Record<string, string> = { 'application/pdf': 'pdf' };

// Per-item allowlist. dl_photos is images only; the document items also allow PDF.
const ALLOWED_BY_ITEM: Record<string, Record<string, string>> = {
  dl_photos: { ...IMAGE_MIMES },
  w9: { ...IMAGE_MIMES, ...PDF_MIME },
  llc_sos: { ...IMAGE_MIMES, ...PDF_MIME },
  insurance: { ...IMAGE_MIMES, ...PDF_MIME },
};

// 4 MB: Vercel route handlers cap request bodies at ~4.5 MB; this leaves
// headroom for multipart framing. FileUpload downscales images client-side so
// phone photos fit under this ceiling.
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

// Client-side allowlists (mirror ALLOWED_BY_ITEM) shared with FileUpload.
export const IMAGE_TYPES = Object.keys(IMAGE_MIMES);
export const DOC_TYPES = [...IMAGE_TYPES, 'application/pdf'];

export function isStorageItem(itemId: string): boolean {
  return STORAGE_ITEM_IDS.includes(itemId);
}

// Filename bases that must exist in a storage item's folder for it to be
// complete. dl_photos needs both front+back; every other storage item needs one.
export function expectedFileBases(itemId: string): string[] {
  return itemId === 'dl_photos' ? ['front', 'back'] : ['file'];
}

export function extForMime(mime: string): string | null {
  return IMAGE_MIMES[mime] ?? PDF_MIME[mime] ?? null;
}

export type ValidateResult =
  | { ok: true; ext: string; fileBase: string }
  | { ok: false; error: string };

// Validates an upload request. dl_photos requires slot 'front'|'back' (and uses
// it as the filename base); every other storage item forbids slot and uses
// 'file'. Extension comes from the validated MIME, never the client filename.
export function validateUpload(input: {
  itemId: string;
  slot?: string | null;
  mime: string;
  size: number;
}): ValidateResult {
  const { itemId, slot, mime, size } = input;

  const allowed = ALLOWED_BY_ITEM[itemId];
  if (!allowed) {
    return { ok: false, error: 'This item does not accept file uploads' };
  }

  let fileBase: string;
  if (itemId === 'dl_photos') {
    if (slot !== 'front' && slot !== 'back') {
      return { ok: false, error: 'Driver\'s license uploads require a front or back slot' };
    }
    fileBase = slot;
  } else {
    if (slot) {
      return { ok: false, error: 'This item does not use upload slots' };
    }
    fileBase = 'file';
  }

  const ext = allowed[mime];
  if (!ext) {
    return { ok: false, error: 'Unsupported file type' };
  }

  if (size <= 0 || size > MAX_FILE_BYTES) {
    return { ok: false, error: 'File must be between 1 byte and 4 MB' };
  }

  return { ok: true, ext, fileBase };
}

export type UploadScope =
  | { kind: 'user'; userId: string }
  | { kind: 'invite'; inviteId: string };

// Returns the folder path (with trailing slash) stored as the item reference.
export function buildFolderPath(scope: UploadScope, itemId: string): string {
  const base =
    scope.kind === 'user'
      ? `onboarding/${scope.userId}`
      : `onboarding/invite_${scope.inviteId}`;
  return `${base}/${itemId}/`;
}
