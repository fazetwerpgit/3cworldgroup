import { ChatAttachment } from '@/types';

// Allowed image MIME types for chat uploads, mapped to the extension we store the
// object under. The extension is ALWAYS derived from the validated MIME type here —
// never from the client-supplied filename. NOTE: never index this with a
// client-supplied key directly — a Content-Type like `__proto__`/`constructor`
// resolves through the prototype chain. Use imageExtForMime / isAllowedImageMime.
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** True only for an EXACT allowed image MIME (own-property; prototype keys can't sneak in). */
export function isAllowedImageMime(mime: unknown): boolean {
  return typeof mime === 'string' && Object.prototype.hasOwnProperty.call(ALLOWED_IMAGE_TYPES, mime);
}

/** The stored file extension for an allowed image MIME, or null if not allowed. */
export function imageExtForMime(mime: string): string | null {
  return isAllowedImageMime(mime) ? ALLOWED_IMAGE_TYPES[mime] : null;
}

// Hard byte ceiling for an uploaded image. Enforced against the actual decoded
// byte length, not a client-supplied Content-Length header.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Sane upper bound for stored width/height. Anything outside (0, MAX] is dropped.
export const MAX_IMAGE_DIMENSION = 4096;

// The single configured Firebase Storage bucket name (same env getOnboardingBucket
// reads). Returned as null when unset so callers can fail with a clear 500.
export function getChatStorageBucketName(): string | null {
  return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || null;
}

/** Storage object path for a chat image: chat/{channelId}/{uuid}.{ext}. */
export function chatObjectPath(channelId: string, uuid: string, ext: string): string {
  return `chat/${channelId}/${uuid}.${ext}`;
}

/** The Firebase tokened download URL for an object (works while storage rules deny-all). */
export function buildTokenedDownloadUrl(
  bucketName: string,
  objectPath: string,
  token: string
): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    objectPath
  )}?alt=media&token=${token}`;
}

/**
 * The exact download-URL prefix for THIS channel's image folder. An image
 * attachment url must start with this to be accepted — it pins the URL to our
 * bucket AND to this channel's folder, blocking cross-channel or foreign URLs.
 */
export function chatImageUrlPrefix(bucketName: string, channelId: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    `chat/${channelId}/`
  )}`;
}

// Only keep a dimension when it is a finite positive number within bounds; else drop it.
function clampDimension(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value <= 0 || value > MAX_IMAGE_DIMENSION) return undefined;
  return Math.floor(value);
}

type AttachmentValidation =
  | { ok: true; attachment: ChatAttachment }
  | { ok: false; error: string };

/**
 * Validate a client-supplied attachment for a message POST. Image URLs must live
 * under this channel's storage folder; gif URLs must be https on media.tenor.com.
 * width/height are clamped (dropped if not finite/positive/≤4096). Returns a
 * sanitized attachment that is safe to persist.
 */
export function validateMessageAttachment(
  raw: unknown,
  channelId: string,
  bucketName: string
): AttachmentValidation {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Invalid attachment' };
  }
  const input = raw as Record<string, unknown>;
  const type = input.type;
  const url = typeof input.url === 'string' ? input.url : '';

  if (type !== 'image' && type !== 'gif') {
    return { ok: false, error: 'Unsupported attachment type' };
  }
  if (!url) {
    return { ok: false, error: 'Attachment url is required' };
  }

  if (type === 'image') {
    const prefix = chatImageUrlPrefix(bucketName, channelId);
    if (!url.startsWith(prefix)) {
      return { ok: false, error: 'Attachment url is not permitted for this channel' };
    }
  } else {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: 'Invalid gif url' };
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'media.tenor.com') {
      return { ok: false, error: 'Gif url is not permitted' };
    }
  }

  const attachment: ChatAttachment = { type, url };
  const width = clampDimension(input.width);
  const height = clampDimension(input.height);
  if (width !== undefined) attachment.width = width;
  if (height !== undefined) attachment.height = height;

  if (isAllowedImageMime(input.contentType)) {
    attachment.contentType = input.contentType as string;
  }

  return { ok: true, attachment };
}

/**
 * Read a stored attachment back out defensively for GET responses. The doc was
 * validated at write time, so this only shapes/guards the fields — malformed data
 * (from a manual edit or an older experiment) yields null rather than throwing.
 */
export function readStoredAttachment(raw: unknown): ChatAttachment | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if ((data.type !== 'image' && data.type !== 'gif') || typeof data.url !== 'string' || !data.url) {
    return null;
  }
  const attachment: ChatAttachment = { type: data.type, url: data.url };
  // Clamp dimensions on read too (mirror the write path) so a hand-edited/legacy doc
  // with a negative or huge value can't flow through to the response.
  const width = clampDimension(data.width);
  const height = clampDimension(data.height);
  if (width !== undefined) attachment.width = width;
  if (height !== undefined) attachment.height = height;
  // Only echo a contentType we recognize as an allowed image MIME.
  if (isAllowedImageMime(data.contentType)) {
    attachment.contentType = data.contentType as string;
  }
  return attachment;
}
