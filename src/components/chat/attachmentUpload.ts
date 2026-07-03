import type { ChatAttachment } from '@/types';

// Client-side mirror of the upload route's allow-list + size cap so the composer
// can reject bad files instantly (the server re-validates on its own).
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB, same as the server.

// Long-edge threshold above which a still image is downscaled before upload.
const MAX_LONG_EDGE = 2000;

type AuthedFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Friendly pre-check on the originally selected file. Returns an error string or null. */
export function validateSelectedImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'Unsupported file — use a PNG, JPEG, WebP, or GIF image.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'Image must be 10 MB or smaller.';
  }
  return null;
}

/**
 * Downscale a large still image to a JPEG (long edge ≤ 2000px, quality 0.85) so
 * big phone photos slim down before upload. Animated GIFs are left untouched
 * (canvas would flatten them) — they must fit the 10 MB cap as-is. Returns the
 * prepared file plus its final pixel dimensions when known. Falls back to the
 * original file if the image can't be decoded. Mirrors the onboarding
 * FileUpload approach without importing it — chat keeps its own tiny helper.
 */
export async function prepareImageForUpload(
  file: File
): Promise<{ file: File; width?: number; height?: number }> {
  if (file.type === 'image/gif') return { file };
  try {
    const bitmap = await createImageBitmap(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (longEdge <= MAX_LONG_EDGE) {
      const dims = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return { file, ...dims };
    }
    const scale = MAX_LONG_EDGE / longEdge;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return { file };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
    );
    if (!blob) return { file };
    return {
      file: new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }),
      width,
      height,
    };
  } catch {
    return { file };
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
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Upload failed');
  const attachment: ChatAttachment = { type: 'image', url: json.url as string };
  if (typeof json.contentType === 'string') attachment.contentType = json.contentType;
  if (typeof width === 'number') attachment.width = width;
  if (typeof height === 'number') attachment.height = height;
  return attachment;
}
