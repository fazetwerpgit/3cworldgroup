import { ChatAttachment } from '@/types';
import { isFilteredLabel } from './contentFilter';

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

// Allowed document MIME types (shown as a file chip, never decoded). Same
// own-property rule as ALLOWED_IMAGE_TYPES: go through uploadExtForMime.
export const PDF_MIME = 'application/pdf';
export const ALLOWED_FILE_TYPES: Record<string, string> = {
  [PDF_MIME]: 'pdf',
};

/** The stored extension for an allowed upload MIME (image or document), or null. */
export function uploadExtForMime(mime: string): string | null {
  const image = imageExtForMime(mime);
  if (image) return image;
  return typeof mime === 'string' && Object.prototype.hasOwnProperty.call(ALLOWED_FILE_TYPES, mime)
    ? ALLOWED_FILE_TYPES[mime]
    : null;
}

/** True when the bytes start with the PDF magic header `%PDF-`. */
export function hasPdfMagic(bytes: Uint8Array): boolean {
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  if (bytes.length < magic.length) return false;
  return magic.every((byte, index) => bytes[index] === byte);
}

// Longest stored file name; longer names are cut, keeping the extension.
export const MAX_ATTACHMENT_NAME_LENGTH = 120;

/**
 * A display-safe file name: the last path segment only, control characters and
 * slashes removed, whitespace collapsed, capped at 120 chars (extension kept).
 * Falls back to `fallback` when nothing usable is left, or when the chat
 * content filter would refuse or mask the name (it is shown to the channel).
 */
export function sanitizeAttachmentFileName(raw: unknown, fallback = 'document.pdf'): string {
  if (typeof raw !== 'string') return fallback;
  const lastSegment = raw.split(/[\\/]/).pop() ?? '';
  let name = lastSegment.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim();
  if (!name || name === '.' || name === '..') return fallback;
  if (isFilteredLabel(name)) return fallback;
  if (name.length > MAX_ATTACHMENT_NAME_LENGTH) {
    const ext = name.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? '';
    name = `${name.slice(0, MAX_ATTACHMENT_NAME_LENGTH - ext.length - 1).trimEnd()}…${ext}`;
  }
  return name;
}

/** "PDF: name.pdf" / "GIF" / "Photo" — the attachment-only text for snippets, pins and pushes. */
export function attachmentSnippet(attachment: { type?: unknown; name?: unknown } | null | undefined): string {
  if (!attachment) return '';
  if (attachment.type === 'gif') return 'GIF';
  if (attachment.type === 'file') {
    return typeof attachment.name === 'string' && attachment.name ? `PDF: ${attachment.name}` : 'PDF';
  }
  return 'Photo';
}

/** Human byte size: "820 KB", "1.2 MB". */
export function formatFileSize(bytes: number | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

// Hard byte ceiling for an uploaded image or PDF. Enforced against the actual decoded
// byte length, not a client-supplied Content-Length header.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Sane upper bound for stored width/height. Anything outside (0, MAX] is dropped.
export const MAX_IMAGE_DIMENSION = 4096;

// The single configured Firebase Storage bucket name (same env getOnboardingBucket
// reads). Returned as null when unset so callers can fail with a clear 500.
export function getChatStorageBucketName(): string | null {
  return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || null;
}

// Direct-to-Storage uploads (files too big for a Vercel request body, which is
// capped near 4.5 MB). The client writes chat-pending/{uid}/{id}.{ext} itself;
// storage.rules lets only that uid create it (once, never overwrite or read),
// at most MAX_UPLOAD_BYTES, with a content type that matches the extension.
// POST /api/portal/chat/media then validates it and moves it into chat/.
export const CHAT_PENDING_PREFIX = 'chat-pending';
const CHAT_PENDING_NAME = /^([A-Za-z0-9-]{8,64})\.(pdf|png|jpg|webp|gif)$/;

/** The pending path a client uploads to: chat-pending/{uid}/{id}.{ext}. */
export function chatPendingPath(uid: string, id: string, ext: string): string {
  return `${CHAT_PENDING_PREFIX}/${uid}/${id}.${ext}`;
}

/**
 * The extension of a pending upload path, only when the path is exactly
 * chat-pending/{uid}/{id}.{ext} for THIS uid (no other user's folder, no nesting
 * or traversal). Null otherwise.
 */
export function parseChatPendingPath(path: unknown, uid: string): { ext: string } | null {
  if (typeof path !== 'string' || !uid || uid.includes('/')) return null;
  const parts = path.split('/');
  if (parts.length !== 3 || parts[0] !== CHAT_PENDING_PREFIX || parts[1] !== uid) return null;
  const match = CHAT_PENDING_NAME.exec(parts[2]);
  return match ? { ext: match[2] } : null;
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

// A stored chat object's file name as the upload route writes it ({uuid}.{ext}):
// one path segment of safe characters that does not start with a dot (so never
// '.' or '..'), and never anything with a slash.
const CHAT_OBJECT_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/**
 * The Storage object path behind a chat image download URL — only when the URL is
 * a tokened download URL for THIS bucket whose object sits directly in THIS
 * channel's folder (chat/{channelId}/{name}). Anything else (another bucket or
 * channel, a nested or traversing path, a malformed URL) yields null, so a caller
 * deleting by this path can never reach an object outside the channel's folder.
 */
export function chatObjectPathFromUrl(url: unknown, bucketName: string, channelId: string): string | null {
  if (typeof url !== 'string' || !bucketName || !channelId || channelId.includes('/')) return null;
  if (!url.startsWith(chatImageUrlPrefix(bucketName, channelId))) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'firebasestorage.googleapis.com') return null;
  const base = `/v0/b/${bucketName}/o/`;
  if (!parsed.pathname.startsWith(base)) return null;
  const encoded = parsed.pathname.slice(base.length);
  // The object path is ONE encoded segment; a raw slash means a different route.
  if (!encoded || encoded.includes('/')) return null;
  let objectPath: string;
  try {
    objectPath = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  const folder = `chat/${channelId}/`;
  if (!objectPath.startsWith(folder)) return null;
  if (!CHAT_OBJECT_NAME.test(objectPath.slice(folder.length))) return null;
  return objectPath;
}

/**
 * The download-URL prefix shared by every tokened URL of one chat object (the
 * part before ?alt=media&token=…), for finding other messages that point at it.
 */
export function chatObjectUrlBase(bucketName: string, objectPath: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}`;
}

// Only keep a byte size when it is a finite positive number within the upload cap.
function clampFileSize(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value <= 0 || value > MAX_UPLOAD_BYTES) return undefined;
  return Math.floor(value);
}

// Only keep a dimension when it is a finite positive number within bounds; else drop it.
function clampDimension(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value <= 0 || value > MAX_IMAGE_DIMENSION) return undefined;
  return Math.floor(value);
}

// A PDF's preview URL: a tokened download URL for an image object ({uuid}.png/
// .jpg/.webp/.gif) sitting directly in THIS channel's folder of THIS bucket.
function isChatPreviewImageUrl(url: unknown, bucketName: string, channelId: string): boolean {
  if (typeof url !== 'string' || !url.startsWith(chatImageUrlPrefix(bucketName, channelId))) return false;
  const objectPath = chatObjectPathFromUrl(url, bucketName, channelId);
  if (!objectPath) return false;
  const ext = objectPath.slice(objectPath.lastIndexOf('.') + 1);
  return Object.values(ALLOWED_IMAGE_TYPES).includes(ext);
}

type AttachmentValidation =
  | { ok: true; attachment: ChatAttachment }
  | { ok: false; error: string };

/**
 * Validate a client-supplied attachment for a message POST. Image URLs must live
 * under this channel's storage folder; file (PDF) URLs must name a .pdf object
 * directly in that folder and carry contentType application/pdf (name is
 * sanitized, size kept only within the upload cap, and an optional previewUrl
 * must be an image object in that same folder); gif URLs must be https on a
 * giphy.com host.
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

  if (type !== 'image' && type !== 'gif' && type !== 'file') {
    return { ok: false, error: 'Unsupported attachment type' };
  }
  if (!url) {
    return { ok: false, error: 'Attachment url is required' };
  }

  if (type === 'file') {
    // A PDF the upload route stored in THIS channel's folder (as {uuid}.pdf).
    const objectPath = chatObjectPathFromUrl(url, bucketName, channelId);
    if (!objectPath || !objectPath.endsWith('.pdf')) {
      return { ok: false, error: 'Attachment url is not permitted for this channel' };
    }
    if (input.contentType !== PDF_MIME) {
      return { ok: false, error: 'Unsupported attachment type' };
    }
    const file: ChatAttachment = {
      type: 'file',
      url,
      contentType: PDF_MIME,
      name: sanitizeAttachmentFileName(input.name),
    };
    const size = clampFileSize(input.size);
    if (size !== undefined) file.size = size;
    // Optional first-page thumbnail: an image object the upload route stored in
    // THIS channel's folder (same origin rule as an image attachment). Present
    // but not permitted rejects the message, never silently dropped.
    if (input.previewUrl !== undefined && input.previewUrl !== null) {
      if (!isChatPreviewImageUrl(input.previewUrl, bucketName, channelId)) {
        return { ok: false, error: 'Attachment preview is not permitted for this channel' };
      }
      file.previewUrl = input.previewUrl as string;
      const previewWidth = clampDimension(input.previewWidth);
      const previewHeight = clampDimension(input.previewHeight);
      if (previewWidth !== undefined) file.previewWidth = previewWidth;
      if (previewHeight !== undefined) file.previewHeight = previewHeight;
    }
    return { ok: true, attachment: file };
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
    // Require https AND a giphy.com host. Exact-suffix match so 'evilgiphy.com' is
    // rejected while 'media.giphy.com'/'media3.giphy.com' are accepted.
    const isGiphyHost =
      parsed.hostname === 'giphy.com' || parsed.hostname.endsWith('.giphy.com');
    if (parsed.protocol !== 'https:' || !isGiphyHost) {
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
  if (
    (data.type !== 'image' && data.type !== 'gif' && data.type !== 'file') ||
    typeof data.url !== 'string' ||
    !data.url
  ) {
    return null;
  }
  if (data.type === 'file') {
    const file: ChatAttachment = {
      type: 'file',
      url: data.url,
      contentType: PDF_MIME,
      name: sanitizeAttachmentFileName(data.name),
    };
    const size = clampFileSize(data.size);
    if (size !== undefined) file.size = size;
    // The preview was origin-checked at write time; only shape it here.
    if (typeof data.previewUrl === 'string' && data.previewUrl.startsWith('https://')) {
      file.previewUrl = data.previewUrl;
      const previewWidth = clampDimension(data.previewWidth);
      const previewHeight = clampDimension(data.previewHeight);
      if (previewWidth !== undefined) file.previewWidth = previewWidth;
      if (previewHeight !== undefined) file.previewHeight = previewHeight;
    }
    return file;
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
