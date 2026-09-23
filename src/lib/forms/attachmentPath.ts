export const ATTACHMENT_ROOT = 'form-attachments/';

/**
 * A folder path under form-attachments/ made only of plain segments: no '.',
 * '..' or empty segments, no backslashes, percent-escapes or control
 * characters. Storage prefixes are literal, but a path that only resolves by
 * traversal is refused outright rather than trusted to the bucket.
 */
export function isCleanAttachmentPath(path: string): boolean {
  if (!path.startsWith(ATTACHMENT_ROOT)) return false;
  for (const char of path) {
    if (char === '\\' || char === '%' || char.charCodeAt(0) < 0x20) return false;
  }
  const segments = path.slice(ATTACHMENT_ROOT.length).replace(/\/$/, '').split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}
