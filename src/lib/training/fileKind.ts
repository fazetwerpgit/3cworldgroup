// Pure helpers for University file uploads — shared by the client upload hook,
// the admin form, and the create API (server derives type from MIME).
export const MAX_TRAINING_BYTES = 1024 * 1024 * 1024; // 1 GB
const ALLOWED_MIME = /^(application\/pdf|image\/.*|video\/.*)$/;

export function deriveResourceType(mime: string): 'video' | 'document' {
  return mime.startsWith('video/') ? 'video' : 'document';
}

export function sanitizeFileName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9._-]/g, '');
  return cleaned || 'file';
}

export function isAllowedTrainingUpload(
  mime: string,
  size: number
): { ok: true } | { ok: false; error: string } {
  if (!ALLOWED_MIME.test(mime)) {
    return { ok: false, error: 'Unsupported file type (use PDF, image, or video)' };
  }
  if (size <= 0 || size > MAX_TRAINING_BYTES) {
    return { ok: false, error: 'File must be between 1 byte and 1 GB' };
  }
  return { ok: true };
}
