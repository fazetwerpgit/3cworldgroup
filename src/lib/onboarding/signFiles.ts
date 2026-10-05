import { getOnboardingBucket } from '@/lib/firebase/admin';

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

// For a storage-item reference (a folder path), list its files and mint a
// 15-minute signed read URL for each. Degrades to [] on any error so one bad
// reference never 500s the whole review queue.
export async function signFolderFiles(
  reference: string | null
): Promise<{ name: string; url: string; contentType: string }[]> {
  if (!reference) return [];
  try {
    const bucket = getOnboardingBucket();
    // Always list within the exact folder. A trailing slash prevents a legacy
    // reference like ".../dl_photos" from over-matching ".../dl_photos_x/...".
    const prefix = reference.endsWith('/') ? reference : `${reference}/`;
    const [files] = await bucket.getFiles({ prefix });
    const expires = Date.now() + SIGNED_URL_TTL_MS;
    return Promise.all(
      files.map(async (f) => {
        const [url] = await f.getSignedUrl({ action: 'read', expires });
        return {
          name: f.name.split('/').pop() ?? f.name,
          url,
          contentType: String(f.metadata.contentType ?? ''),
        };
      })
    );
  } catch (error) {
    console.error('Failed to sign storage files for review:', error);
    return [];
  }
}

/**
 * Downloads every file in a storage-item folder (for the owner's zip). Unlike
 * signFolderFiles this reports failures instead of hiding them: a folder that
 * cannot be listed, or a file that cannot be read, lands in `failed` so the
 * caller can say what is missing.
 */
export async function downloadFolderFiles(
  reference: string | null
): Promise<{ files: { name: string; data: Buffer }[]; failed: string[] }> {
  if (!reference) return { files: [], failed: [] };
  const prefix = reference.endsWith('/') ? reference : `${reference}/`;
  let listed: { name: string; download: () => Promise<[Buffer]> }[];
  try {
    [listed] = await getOnboardingBucket().getFiles({ prefix });
  } catch (error) {
    console.error('Failed to list onboarding files for download:', error instanceof Error ? error.message : 'unknown');
    return { files: [], failed: ['(folder)'] };
  }
  const files: { name: string; data: Buffer }[] = [];
  const failed: string[] = [];
  // Only files directly in the folder, as the upload route writes them.
  const direct = listed.filter((file) => {
    const name = file.name.split('/').pop() ?? '';
    return name !== '' && !file.name.slice(prefix.length).includes('/');
  });
  const results = await Promise.all(
    direct.map(async (file) => {
      const name = file.name.split('/').pop() ?? file.name;
      try {
        const [data] = await file.download();
        return { name, data };
      } catch (error) {
        console.error('Failed to download an onboarding file:', error instanceof Error ? error.message : 'unknown');
        return { name, data: null };
      }
    })
  );
  for (const result of results) {
    if (result.data) files.push({ name: result.name, data: result.data });
    else failed.push(result.name);
  }
  return { files, failed };
}
