import { FORM_ATTACHMENT_TYPES, MAX_FORM_FILE_BYTES } from './formUploads';

// Client-side half of POST /api/portal/forms/upload, shared by FileUpload and the
// Log Sale proof capture so both shrink and send a file the same way.

/**
 * Weak signal can stall an upload forever. It is abandoned only when no bytes
 * have moved for this long: a slow upload that keeps moving is left to finish,
 * since a 1 to 3 MB photo on one bar can take minutes.
 */
export const UPLOAD_STALL_MS = 30_000;

/**
 * The hard cap on one upload, whatever its progress: a minute plus the time the
 * file takes at 8 KB/s, far below one bar of signal.
 */
export function uploadCapMs(bytes: number): number {
  return 60_000 + Math.ceil(bytes / 8);
}

/** Long edge and JPEG quality every photo is shrunk to before it goes out. */
const SHRINK_MAX_DIM = 2000;
const SHRINK_QUALITY = 0.8;

/**
 * An error whose message was written for the rep (a wrong type, too big, a
 * file the phone would not hand over, a timeout). Anything else, such as a
 * browser's "Load failed" or a server string, is not, and a caller may swap in
 * its own wording.
 */
export class FormUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormUploadError';
  }
}

/** True when the caller's own signal cancelled the upload (not a failure to show). */
export function isUploadCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

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

/** Re-encode an image at most SHRINK_MAX_DIM on its long edge, as JPEG. null when it can't be decoded. */
async function reencode(file: File, maxDim: number, quality: number): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    );
    if (!blob) return null;
    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return null;
  }
}

/**
 * Downscale a large image client-side so it fits under the body-size cap.
 * Returns the original file when it already fits or cannot be decoded.
 */
export async function maybeDownscale(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes || !DOWNSCALABLE.has(file.type)) return file;
  return (await reencode(file, SHRINK_MAX_DIM, 0.85)) ?? file;
}

/**
 * Shrink every photo before it goes out, whatever its size: an iPhone
 * screenshot is a 1 to 3 MB PNG, and on one bar every byte is seconds. A photo
 * whose re-encode comes out no smaller is sent as it is.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!DOWNSCALABLE.has(file.type)) return file;
  const shrunk = await reencode(file, SHRINK_MAX_DIM, SHRINK_QUALITY);
  return shrunk && shrunk.size < file.size ? shrunk : file;
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
    throw new FormUploadError('That file could not be read from your phone. Pick it again.');
  }
  return new File([bytes], file.name, { type: formFileMime(file), lastModified: file.lastModified });
}

/** Friendly pre-check before any work. Returns an error message or null. */
export function checkFormFile(file: File, allowedTypes: string[] = FORM_ATTACHMENT_TYPES): string | null {
  if (!allowedTypes.includes(formFileMime(file))) {
    return allowedTypes.includes('application/pdf')
      ? 'Use a photo, a screenshot or a PDF'
      : 'Use a photo or a screenshot';
  }
  return null;
}

/**
 * The file as it will be sent: its bytes copied into memory (snapshotFormFile)
 * and photos shrunk. A caller that may retry keeps this and passes it back with
 * `prepared: true`, so a retry never reads the picked file again (Android may
 * have let go of it by then) and never re-encodes an already shrunk photo.
 */
export async function prepareFormFile(
  file: File,
  { allowedTypes, maxBytes = MAX_FORM_FILE_BYTES }: { allowedTypes?: string[]; maxBytes?: number } = {}
): Promise<File> {
  const typeError = checkFormFile(file, allowedTypes);
  if (typeError) throw new FormUploadError(typeError);
  const prepared = await shrinkImage(await maybeDownscale(await snapshotFormFile(file), maxBytes));
  if (prepared.size > maxBytes) {
    throw new FormUploadError(`File must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller`);
  }
  return prepared;
}

/**
 * Snapshot, shrink and upload one file. Resolves to the storage folder path the
 * route returns; throws an Error with a message fit to show the rep.
 *
 * Sent over XMLHttpRequest, not fetch: fetch reports no upload progress, and
 * progress is what tells a slow upload from a dead one.
 */
export async function uploadFormAttachment({
  file,
  prepared: alreadyPrepared = false,
  itemId,
  formType,
  slot,
  fields,
  allowedTypes,
  getHeaders,
  uploadUrl = '/api/portal/forms/upload',
  maxBytes = MAX_FORM_FILE_BYTES,
  signal,
  stallMs = UPLOAD_STALL_MS,
  maxMs,
}: {
  file: File;
  /** `file` came from prepareFormFile: send it as it is. */
  prepared?: boolean;
  itemId: string;
  /** Omitted for routes that do not take one (onboarding uploads). */
  formType?: string;
  slot?: string;
  /** Extra multipart fields: the per-submission `uploadId`, onboarding's `userId`. */
  fields?: Record<string, string>;
  /** Narrower MIME allowlist than the form default (license photos are images only). */
  allowedTypes?: string[];
  getHeaders?: () => Promise<HeadersInit>;
  uploadUrl?: string;
  maxBytes?: number;
  /** Cancels the upload; it then rejects with an AbortError (see isUploadCancelled). */
  signal?: AbortSignal;
  /** Abandon the request when no bytes have moved for this long. */
  stallMs?: number;
  /** Abandon it after this long in any case. Defaults to uploadCapMs(size). */
  maxMs?: number;
}): Promise<string> {
  const typeError = checkFormFile(file, allowedTypes);
  if (typeError) throw new FormUploadError(typeError);

  const toSend = alreadyPrepared ? file : await prepareFormFile(file, { allowedTypes, maxBytes });
  if (toSend.size > maxBytes) {
    throw new FormUploadError(`File must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller`);
  }

  const body = new FormData();
  body.set('itemId', itemId);
  if (formType) body.set('formType', formType);
  if (slot) body.set('slot', slot);
  for (const [key, value] of Object.entries(fields ?? {})) body.set(key, value);
  body.set('file', toSend);

  const headers = getHeaders ? await getHeaders() : undefined;
  signal?.throwIfAborted();

  const { status, text } = await send({
    url: uploadUrl,
    body,
    headers,
    signal,
    stallMs,
    maxMs: maxMs ?? uploadCapMs(toSend.size),
  });
  let json: { path?: string; error?: string } | null = null;
  try {
    json = JSON.parse(text) as { path?: string; error?: string };
  } catch {
    json = null;
  }
  if (status < 200 || status >= 300 || !json?.path) throw new Error(json?.error || 'Upload failed');
  return json.path;
}

/**
 * One POST over XMLHttpRequest. The stall timer restarts whenever bytes move
 * either way; the cap does not. The caller's cancel rejects with an AbortError,
 * a timeout with "Upload timed out", a dropped connection with a TypeError
 * (a browser's own wording, like fetch's "Load failed").
 */
function send({
  url,
  body,
  headers,
  signal,
  stallMs,
  maxMs,
}: {
  url: string;
  body: FormData;
  headers?: HeadersInit;
  signal?: AbortSignal;
  stallMs: number;
  maxMs: number;
}): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(stallTimer);
      clearTimeout(capTimer);
      signal?.removeEventListener('abort', onCancel);
      outcome();
    };
    const timeOut = () =>
      finish(() => {
        xhr.abort();
        reject(new FormUploadError('Upload timed out'));
      });
    const armStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(timeOut, stallMs);
    };
    const onCancel = () =>
      finish(() => {
        xhr.abort();
        reject(new DOMException('Upload cancelled', 'AbortError'));
      });
    // Declared after finish, which reads it, but finish only ever runs from a
    // timer or an XHR event, after this line.
    const capTimer = setTimeout(timeOut, maxMs);

    xhr.open('POST', url);
    new Headers(headers).forEach((value, key) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = armStall;
    xhr.onprogress = armStall;
    xhr.onload = () => finish(() => resolve({ status: xhr.status, text: xhr.responseText }));
    xhr.onerror = () => finish(() => reject(new TypeError('Load failed')));
    xhr.onabort = () => finish(() => reject(new DOMException('Upload cancelled', 'AbortError')));
    signal?.addEventListener('abort', onCancel);
    armStall();
    xhr.send(body);
  });
}
