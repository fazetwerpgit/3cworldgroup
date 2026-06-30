// Generic form-attachment upload validation (NOT onboarding-coupled). Files for
// rep forms (e.g. Payroll Dispute screenshot) go to form-attachments/{uid}/{formType}/.
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'application/pdf': 'pdf',
};

export const FORM_ATTACHMENT_TYPES: string[] = Object.keys(EXT_BY_MIME);
export const MAX_FORM_FILE_BYTES = 4 * 1024 * 1024;

export function validateFormUpload(input: {
  mime: string;
  size: number;
}): { ok: true; ext: string } | { ok: false; error: string } {
  const ext = EXT_BY_MIME[input.mime];
  if (!ext) return { ok: false, error: 'Unsupported file type' };
  if (input.size <= 0 || input.size > MAX_FORM_FILE_BYTES) {
    return { ok: false, error: 'File must be between 1 byte and 4 MB' };
  }
  return { ok: true, ext };
}

export function buildFormAttachmentFolder(uid: string, formType: string): string {
  return `form-attachments/${uid}/${formType}/`;
}
