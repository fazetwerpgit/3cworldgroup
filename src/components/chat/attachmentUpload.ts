import type { ChatAttachment } from '@/types';

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
};

function selectedImageMime(file: File): string {
  const supplied = file.type.toLowerCase().split(';', 1)[0].trim();
  if (supplied === 'image/jpg') return 'image/jpeg';
  if (supplied && supplied !== 'application/octet-stream') return supplied;
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  return MIME_BY_EXTENSION[extension] ?? supplied;
}

function fileWithMime(file: File, mime: string): File {
  if (file.type === mime) return file;
  return new File([file], file.name, { type: mime, lastModified: file.lastModified });
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

/** Friendly pre-check on the originally selected file. Returns an error string or null. */
export function validateSelectedImage(file: File): string | null {
  const mime = selectedImageMime(file);
  if (!ALLOWED_IMAGE_TYPES.includes(mime)) {
    return 'Unsupported file — use a PNG, JPEG, WebP, GIF, HEIC, or HEIF image.';
  }
  if (file.size === 0) {
    return 'That image is empty. Choose another photo.';
  }
  if (file.size > MAX_SELECTED_IMAGE_BYTES) {
    return 'Image must be 30 MB or smaller.';
  }
  return null;
}

/**
 * Downscale a large still image to a JPEG (long edge ≤ 2000px, quality 0.85) so
 * big phone photos slim down before upload. HEIC/HEIF are always converted to a
 * broadly renderable JPEG. Animated GIFs are left untouched (canvas would
 * flatten them) — they must fit the server's 10 MB cap as-is. Returns the
 * prepared file plus its final pixel dimensions when known.
 */
export async function prepareImageForUpload(
  file: File
): Promise<{ file: File; width?: number; height?: number }> {
  const mime = selectedImageMime(file);
  const normalizedFile = fileWithMime(file, mime);
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
  const responseText = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};
  } catch {
    // Proxies may return an HTML/plain-text body for request-size/network errors.
  }
  if (!response.ok) {
    throw new Error(typeof json.error === 'string' ? json.error : 'Photo upload failed. Please try again.');
  }
  if (typeof json.url !== 'string' || !json.url) throw new Error('Photo upload returned no image.');
  const attachment: ChatAttachment = { type: 'image', url: json.url as string };
  if (typeof json.contentType === 'string') attachment.contentType = json.contentType;
  if (typeof width === 'number') attachment.width = width;
  if (typeof height === 'number') attachment.height = height;
  return attachment;
}
