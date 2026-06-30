import { getOnboardingBucket } from '@/lib/firebase/admin';
import {
  buildFolderPath,
  expectedFileBases,
  isStorageItem,
  type UploadScope,
} from '@/lib/onboarding/uploads';

export type VerifyStorageResult =
  | { ok: true }
  | { ok: false; error: string };

// Server-side guard for storage-kind onboarding items at submit time.
//
// Closes two gaps the upload routes alone cannot: (1) the submitted reference
// must be exactly the folder this scope (user or invite) owns — preventing a
// client from pointing a submission at another user's folder (IDOR/scope
// integrity); (2) the required file(s) must actually exist in that folder —
// front.* AND back.* for dl_photos, file.* otherwise — so empty or partial
// submissions cannot reach the review queue (spec 4.8).
//
// Non-storage items are not this function's concern; callers gate on
// isStorageItem before calling.
export async function verifyStorageReference(
  scope: UploadScope,
  itemId: string,
  reference: string | undefined
): Promise<VerifyStorageResult> {
  if (!isStorageItem(itemId)) return { ok: true };

  const expectedFolder = buildFolderPath(scope, itemId);
  const normalized = (reference ?? '').trim();
  if (normalized !== expectedFolder) {
    return { ok: false, error: 'Invalid file reference for this item' };
  }

  let names: string[];
  try {
    const bucket = getOnboardingBucket();
    const [files] = await bucket.getFiles({ prefix: expectedFolder });
    names = files.map((f) => f.name.split('/').pop() ?? f.name);
  } catch (error) {
    console.error('Failed to verify storage reference files:', error);
    return { ok: false, error: 'Could not verify uploaded files' };
  }

  const missing = expectedFileBases(itemId).filter(
    (base) => !names.some((n) => n === base || n.startsWith(`${base}.`))
  );
  if (missing.length > 0) {
    return { ok: false, error: 'Please upload the required file(s) before submitting' };
  }

  return { ok: true };
}
