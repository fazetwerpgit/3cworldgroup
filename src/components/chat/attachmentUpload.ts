import { SendRequestError } from '@/lib/chat/outbox';
import { chatPendingPath, uploadExtForMime } from '@/lib/chat/media';
import type { ChatAttachment } from '@/types';
import { renderPdfPreview, type PdfPreview } from './pdfPreview';

// Formats the picker may hand us. HEIC/HEIF are accepted at selection time and
// converted to JPEG before upload so photos taken on an iPhone render everywhere.
// `image/jpg` and an empty/octet-stream MIME also occur on some Android pickers;
// those are normalized from the file extension below.
export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
];
// Documents the picker may hand us. PDFs upload as-is (never decoded/resized).
export const PDF_MIME = 'application/pdf';
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // Prepared upload; same as the server.
export const MAX_SELECTED_IMAGE_BYTES = 30 * 1024 * 1024; // Original phone photo before compression.

// Long-edge threshold above which a still image is downscaled before upload.
const MAX_LONG_EDGE = 2000;

type AuthedFetch = (url: string, init?: RequestInit) => Promise<Response>;

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: PDF_MIME,
};

function selectedImageMime(file: File): string {
  const supplied = file.type.toLowerCase().split(';', 1)[0].trim();
  if (supplied === 'image/jpg') return 'image/jpeg';
  if (supplied && supplied !== 'application/octet-stream') return supplied;
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  return MIME_BY_EXTENSION[extension] ?? supplied;
}

/**
 * True when the picked file is a PDF: by MIME, or by a `.pdf` name when the
 * picker supplied no useful MIME (Android content URIs give '' or
 * application/octet-stream).
 */
export function isPdfFile(file: File): boolean {
  return selectedImageMime(file) === PDF_MIME;
}

function fileWithMime(file: File, mime: string): File {
  if (file.type === mime) return file;
  return new File([file], file.name, { type: mime, lastModified: file.lastModified });
}

// Copy the picked file's bytes into memory. Browsers (Android Chrome above all)
// otherwise read a picker File lazily when the multipart body is sent, and a
// content-URI photo whose backing file has since moved or changed aborts the
// request as a bare "Failed to fetch". An in-memory File cannot go stale, and a
// file that is already unreadable fails here with a message the user can act on.
async function snapshotFile(file: File, noun = 'photo'): Promise<File> {
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    throw new Error(`That ${noun} could not be read from your phone. Pick it again and resend.`);
  }
  return new File([bytes], file.name, { type: file.type, lastModified: file.lastModified });
}

function jpegName(name: string): string {
  return /\.[^.]+$/.test(name) ? name.replace(/\.[^.]+$/, '.jpg') : `${name || 'photo'}.jpg`;
}

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

// createImageBitmap is fast in Chromium, while the HTMLImageElement path covers
// Safari versions/device formats where createImageBitmap exists but rejects the
// selected photo. Both paths honor the phone photo's EXIF orientation.
async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall through to <img>, which supports more native photo formats on Safari.
    }
  }

  if (typeof Image === 'undefined') throw new Error('This browser could not read the selected photo.');
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  image.src = objectUrl;
  try {
    if (typeof image.decode === 'function') {
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Image decode failed'));
      });
    }
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/**
 * Friendly pre-check on the originally selected file (an image or a PDF).
 * Returns an error string or null.
 */
export function validateSelectedImage(file: File): string | null {
  const mime = selectedImageMime(file);
  if (mime === PDF_MIME) {
    if (file.size === 0) return 'That file is empty. Choose another PDF.';
    if (file.size > MAX_UPLOAD_BYTES) return 'File too large — PDFs up to 10 MB.';
    return null;
  }
  if (!ALLOWED_IMAGE_TYPES.includes(mime)) {
    return 'Unsupported file — use an image or PDF.';
  }
  if (file.size === 0) {
    return 'That image is empty. Choose another photo.';
  }
  if (file.size > MAX_SELECTED_IMAGE_BYTES) {
    return 'Image must be 30 MB or smaller.';
  }
  return null;
}

/** A picked file ready to upload; `preview` is a PDF's first-page thumbnail. */
export type PreparedUpload = { file: File; width?: number; height?: number; preview?: PdfPreview };

/**
 * Downscale a large still image to a JPEG (long edge ≤ 2000px, quality 0.85) so
 * big phone photos slim down before upload. HEIC/HEIF are always converted to a
 * broadly renderable JPEG. Animated GIFs are left untouched (canvas would
 * flatten them) — they must fit the server's 10 MB cap as-is. Returns the
 * prepared file plus its final pixel dimensions when known.
 */
export async function prepareImageForUpload(
  file: File
): Promise<PreparedUpload> {
  const mime = selectedImageMime(file);
  // PDFs go up untouched, labelled application/pdf even when the picker gave no
  // MIME, with a first-page thumbnail when this device can render one. The
  // preview is best-effort: any failure sends the PDF as a plain chip.
  if (mime === PDF_MIME) {
    const pdf = await snapshotFile(fileWithMime(file, mime), 'file');
    const preview = await renderPdfPreview(pdf).catch(() => undefined);
    return preview ? { file: pdf, preview } : { file: pdf };
  }
  const normalizedFile = await snapshotFile(fileWithMime(file, mime));
  if (mime === 'image/gif') return { file: normalizedFile };

  const needsUniversalJpeg = mime === 'image/heic' || mime === 'image/heif';
  const needsSizeReduction = file.size > MAX_UPLOAD_BYTES;
  let decoded: DecodedImage | null = null;
  try {
    decoded = await decodeImage(normalizedFile);
    const longEdge = Math.max(decoded.width, decoded.height);
    if (longEdge <= MAX_LONG_EDGE && !needsUniversalJpeg && !needsSizeReduction) {
      return { file: normalizedFile, width: decoded.width, height: decoded.height };
    }
    const scale = Math.min(1, MAX_LONG_EDGE / longEdge);
    const width = Math.round(decoded.width * scale);
    const height = Math.round(decoded.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser could not prepare the selected photo.');
    ctx.drawImage(decoded.source, 0, 0, width, height);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
    );
    if (!blob) throw new Error('This browser could not prepare the selected photo.');
    if (blob.size > MAX_UPLOAD_BYTES) {
      throw new Error('The photo is still too large after compression. Choose a smaller image.');
    }
    return {
      file: new File([blob], jpegName(file.name), {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      }),
      width,
      height,
    };
  } catch (error) {
    // A normal already-small browser image can still upload even when this
    // device cannot decode it for dimensions. HEIC/HEIF and oversized originals
    // must be converted, so surface a useful failure instead of uploading a file
    // that other phones cannot display (or that the server will reject).
    if (!needsUniversalJpeg && !needsSizeReduction) return { file: normalizedFile };
    if (needsUniversalJpeg) {
      throw new Error('This phone could not convert the HEIC photo. Try sharing it as a JPEG instead.');
    }
    throw error instanceof Error ? error : new Error('The selected photo could not be compressed.');
  } finally {
    decoded?.cleanup();
  }
}

/**
 * Upload a prepared image to /api/portal/chat/media and return an image
 * ChatAttachment ready to hand to the messages POST for THIS channel. Throws on
 * failure so the caller can surface it via the existing failed-send affordance.
 */
export async function uploadChatImage(
  authedFetch: AuthedFetch,
  channelId: string,
  file: File,
  width?: number,
  height?: number
): Promise<ChatAttachment> {
  const body = new FormData();
  body.set('channelId', channelId);
  body.set('file', file);
  // Note: no explicit Content-Type — the browser sets the multipart boundary.
  const response = await authedFetch('/api/portal/chat/media', { method: 'POST', body });
  return toUploadedAttachment(response.status, await response.text(), width, height);
}

// Shared by both uploaders: turn the media route's response into an attachment,
// or throw a SendRequestError carrying the status so the send path can tell a
// transient failure (retry) from a permanent one.
function toUploadedAttachment(
  status: number,
  responseText: string,
  width?: number,
  height?: number
): ChatAttachment {
  let json: Record<string, unknown> = {};
  try {
    json = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};
  } catch {
    // Proxies may return an HTML/plain-text body for request-size/network errors.
  }
  if (status < 200 || status >= 300) {
    throw new SendRequestError(
      typeof json.error === 'string' ? json.error : 'Photo upload failed. Please try again.',
      { kind: 'http', status }
    );
  }
  if (typeof json.url !== 'string' || !json.url) throw new Error('Photo upload returned no image.');
  if (json.contentType === PDF_MIME) {
    const file: ChatAttachment = {
      type: 'file',
      url: json.url,
      contentType: PDF_MIME,
      name: typeof json.name === 'string' && json.name ? json.name : 'document.pdf',
    };
    if (typeof json.size === 'number') file.size = json.size;
    return file;
  }
  const attachment: ChatAttachment = { type: 'image', url: json.url as string };
  if (typeof json.contentType === 'string') attachment.contentType = json.contentType;
  if (typeof width === 'number') attachment.width = width;
  if (typeof height === 'number') attachment.height = height;
  return attachment;
}

// A photo upload on bad signal can stall for minutes; give up and let the retry
// policy take over instead.
const UPLOAD_TIMEOUT_MS = 120_000;

// Above this, a file goes straight to Firebase Storage instead of through the
// API body: Vercel refuses request bodies over about 4.5 MB, and a multipart
// body adds a little on top of the file itself.
export const DIRECT_UPLOAD_THRESHOLD = 4 * 1024 * 1024;

/** The seams the direct upload needs, so tests can drive it without Firebase. */
export interface DirectUploadDeps {
  /** The signed-in Firebase uid (it names the pending folder storage.rules allows). */
  uid: () => Promise<string | null>;
  /** Stores `file` at `path` in Firebase Storage, reporting 0..1 progress. */
  putFile: (path: string, file: File, onProgress: (fraction: number) => void) => Promise<void>;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
}

function randomUploadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A Storage SDK failure as a send error: a rules refusal is permanent, anything else retries. */
export function storageUploadFailure(error: unknown): SendRequestError {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
    return new SendRequestError("That file couldn't be uploaded. Use an image or a PDF up to 10 MB.", {
      kind: 'http',
      status: 403,
    });
  }
  return new SendRequestError('Upload failed. Check your connection.', { kind: 'network' });
}

async function firebasePutFile(path: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
  const [{ ref, uploadBytesResumable }, { storage }] = await Promise.all([
    import('firebase/storage'),
    import('@/lib/firebase/config'),
  ]);
  if (!storage) throw new Error('Storage is not configured');
  const bucket = storage;
  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(ref(bucket, path), file, { contentType: file.type });
    // Same give-up point as the XHR path; a cancelled task rejects as retryable.
    const timer = setTimeout(() => task.cancel(), UPLOAD_TIMEOUT_MS);
    task.on(
      'state_changed',
      (snap) => {
        if (snap.totalBytes > 0) onProgress(Math.min(1, snap.bytesTransferred / snap.totalBytes));
      },
      (error) => {
        clearTimeout(timer);
        reject(storageUploadFailure(error));
      },
      () => {
        clearTimeout(timer);
        resolve();
      }
    );
  });
}

const firebaseDirectDeps: DirectUploadDeps = {
  uid: async () => (await import('@/lib/firebase/config')).auth?.currentUser?.uid ?? null,
  putFile: firebasePutFile,
  fetch: (url, init) => fetch(url, init),
};

/**
 * Uploads a prepared file straight to Firebase Storage under
 * chat-pending/{uid}/, then hands only that path to /api/portal/chat/media,
 * which checks the object and moves it into the channel's folder. Used for
 * files too big for a request body (PDFs up to 10 MB, large GIFs).
 */
export async function uploadChatFileDirect(
  deps: DirectUploadDeps,
  idToken: string,
  channelId: string,
  file: File,
  width: number | undefined,
  height: number | undefined,
  onProgress: (fraction: number) => void
): Promise<ChatAttachment> {
  const ext = uploadExtForMime(file.type);
  if (!ext) throw new Error('Unsupported file — use an image or PDF.');
  const uid = await deps.uid();
  if (!uid) {
    throw new SendRequestError('You are signed out. Sign in and resend.', { kind: 'http', status: 401 });
  }
  const pendingPath = chatPendingPath(uid, randomUploadId(), ext);
  // The bytes are nearly all of the work; the attach call is the last 5%.
  await deps.putFile(pendingPath, file, (fraction) => onProgress(fraction * 0.95));
  let response: Response;
  try {
    response = await deps.fetch('/api/portal/chat/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        channelId,
        pendingPath,
        ...(file.type === PDF_MIME ? { name: file.name } : {}),
      }),
    });
  } catch {
    throw new SendRequestError('Upload failed. Check your connection.', { kind: 'network' });
  }
  const attachment = toUploadedAttachment(response.status, await response.text(), width, height);
  onProgress(1);
  return attachment;
}

/**
 * Same upload as uploadChatImage, over XMLHttpRequest so the pending photo can
 * show real progress (fetch has no upload progress). `onProgress` receives 0..1.
 * Network errors and timeouts reject with a retryable SendRequestError. A file
 * over DIRECT_UPLOAD_THRESHOLD goes straight to Storage instead
 * (uploadChatFileDirect), since the API body cannot carry it.
 */
export function uploadChatImageWithProgress(
  idToken: string,
  channelId: string,
  file: File,
  width: number | undefined,
  height: number | undefined,
  onProgress: (fraction: number) => void,
  directDeps: DirectUploadDeps = firebaseDirectDeps
): Promise<ChatAttachment> {
  if (file.size > DIRECT_UPLOAD_THRESHOLD) {
    return uploadChatFileDirect(directDeps, idToken, channelId, file, width, height, onProgress);
  }
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.set('channelId', channelId);
    body.set('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/portal/chat/media');
    xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(1, event.loaded / event.total));
    };
    const networkFailure = () =>
      reject(new SendRequestError('Photo upload failed. Check your connection.', { kind: 'network' }));
    xhr.onerror = networkFailure;
    xhr.ontimeout = networkFailure;
    xhr.onabort = networkFailure;
    xhr.onload = () => {
      try {
        resolve(toUploadedAttachment(xhr.status, xhr.responseText, width, height));
      } catch (error) {
        reject(error);
      }
    };
    xhr.send(body);
  });
}

/**
 * A PDF attachment carrying its uploaded first-page thumbnail (an image
 * attachment from the same channel folder), with the thumbnail's dimensions.
 */
export function withPdfPreview(file: ChatAttachment, preview: ChatAttachment | undefined): ChatAttachment {
  if (file.type !== 'file' || !preview || preview.type !== 'image' || !preview.url) return file;
  const combined: ChatAttachment = { ...file, previewUrl: preview.url };
  if (typeof preview.width === 'number') combined.previewWidth = preview.width;
  if (typeof preview.height === 'number') combined.previewHeight = preview.height;
  return combined;
}
