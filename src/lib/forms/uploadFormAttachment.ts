import { FORM_ATTACHMENT_TYPES, MAX_FORM_FILE_BYTES } from './formUploads';

// Client-side half of POST /api/portal/forms/upload, shared by FileUpload and the
// Log Sale proof capture so both shrink and send a file the same way.

// MIME types we can safely re-encode on a canvas to shrink large phone photos.
const DOWNSCALABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
};

/** Some Android pickers hand over an empty or generic MIME; fall back to the extension. */
export function formFileMime(file: File): string {
  const supplied = file.type.toLowerCase().split(';', 1)[0].trim();
  if (supplied === 'image/jpg') return 'image/jpeg';
  if (supplied && supplied !== 'application/octet-stream') return supplied;
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  return MIME_BY_EXTENSION[extension] ?? supplied;
}

/**
 * Downscale a large image client-side so it fits under the body-size cap.
 * Returns the original file when it already fits or cannot be decoded.
 */
export async function maybeDownscale(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes || !DOWNSCALABLE.has(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 2000;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/**
 * Copy the picked file's bytes into memory with a usable MIME. Android Chrome
 * otherwise reads a picker File lazily when the multipart body is sent, and a
 * content-URI photo that has moved since aborts the request as a bare "Failed
 * to fetch" (same fix as the chat uploader).
 */
export async function snapshotFormFile(file: File): Promise<File> {
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    throw new Error('That file could not be read from your phone. Pick it again.');
  }
  return new File([bytes], file.name, { type: formFileMime(file), lastModified: file.lastModified });
}

/** Friendly pre-check before any work. Returns an error message or null. */
export function checkFormFile(file: File): string | null {
  if (!FORM_ATTACHMENT_TYPES.includes(formFileMime(file))) {
    return 'Use a photo, a screenshot or a PDF';
  }
  return null;
}

/**
 * Snapshot, shrink and upload one file. Resolves to the storage folder path the
 * route returns; throws an Error with a message fit to show the rep.
 */
export async function uploadFormAttachment({
  file,
  itemId,
  formType,
  slot,
  getHeaders,
  uploadUrl = '/api/portal/forms/upload',
  maxBytes = MAX_FORM_FILE_BYTES,
}: {
  file: File;
  itemId: string;
  formType: string;
  slot?: string;
  getHeaders?: () => Promise<HeadersInit>;
  uploadUrl?: string;
  maxBytes?: number;
}): Promise<string> {
  const typeError = checkFormFile(file);
  if (typeError) throw new Error(typeError);

  const prepared = await maybeDownscale(await snapshotFormFile(file), maxBytes);
  if (prepared.size > maxBytes) {
    throw new Error(`File must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller`);
  }

  const body = new FormData();
  body.set('itemId', itemId);
  body.set('formType', formType);
  if (slot) body.set('slot', slot);
  body.set('file', prepared);

  const headers = getHeaders ? await getHeaders() : undefined;
  const response = await fetch(uploadUrl, { method: 'POST', headers, body });
  const json = (await response.json().catch(() => null)) as { path?: string; error?: string } | null;
  if (!response.ok || !json?.path) throw new Error(json?.error || 'Upload failed');
  return json.path;
}
