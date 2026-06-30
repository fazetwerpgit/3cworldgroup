import { describe, it, expect } from 'vitest';
import { validateFormUpload, buildFormAttachmentFolder, MAX_FORM_FILE_BYTES } from './formUploads';

describe('validateFormUpload', () => {
  it('accepts an image and returns ext', () => {
    expect(validateFormUpload({ mime: 'image/jpeg', size: 1000 })).toEqual({ ok: true, ext: 'jpg' });
  });
  it('accepts a pdf', () => {
    expect(validateFormUpload({ mime: 'application/pdf', size: 1000 })).toEqual({ ok: true, ext: 'pdf' });
  });
  it('rejects an unsupported type', () => {
    expect(validateFormUpload({ mime: 'application/zip', size: 1000 }).ok).toBe(false);
  });
  it('rejects an oversize file', () => {
    expect(validateFormUpload({ mime: 'image/png', size: MAX_FORM_FILE_BYTES + 1 }).ok).toBe(false);
  });
  it('rejects a zero-byte file', () => {
    expect(validateFormUpload({ mime: 'image/png', size: 0 }).ok).toBe(false);
  });
});

describe('buildFormAttachmentFolder', () => {
  it('builds a per-user form folder', () => {
    expect(buildFormAttachmentFolder('abc', 'payroll-dispute')).toBe('form-attachments/abc/payroll-dispute/');
  });
});
