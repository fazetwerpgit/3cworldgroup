import { describe, it, expect } from 'vitest';
import {
  validateFormUpload,
  buildFormAttachmentFolder,
  MAX_FORM_FILE_BYTES,
  isAllowedFormUpload,
  isValidFormUploadId,
  newFormUploadId,
  buildSubmissionAttachmentFolder,
  resolveFormUploadFolder,
  resolveUploadMime,
} from './formUploads';

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

describe('resolveUploadMime', () => {
  it('keeps a real type the picker supplied', () => {
    expect(resolveUploadMime('image/heic', 'IMG_0001.HEIC')).toBe('image/heic');
    expect(resolveUploadMime('image/png', 'odd-name.jpg')).toBe('image/png');
  });

  it.each([
    ['', 'IMG_0001.HEIC', 'image/heic'],
    ['', 'IMG_0001.heif', 'image/heif'],
    ['application/octet-stream', 'license.JPG', 'image/jpeg'],
    ['', 'insurance.pdf', 'application/pdf'],
  ])('falls back to the extension when the type is %j (%s)', (type, name, mime) => {
    expect(resolveUploadMime(type, name)).toBe(mime);
  });

  it('normalises image/jpg and a type with parameters', () => {
    expect(resolveUploadMime('image/jpg', 'a')).toBe('image/jpeg');
    expect(resolveUploadMime('Image/HEIC; charset=binary', 'a')).toBe('image/heic');
  });

  it('never invents a type for an unknown extension', () => {
    expect(resolveUploadMime('', 'notes.txt')).toBe('');
    expect(validateFormUpload({ mime: resolveUploadMime('', 'notes.txt'), size: 10 }).ok).toBe(false);
  });

  it('lets an iPhone HEIC with no type through validation', () => {
    expect(validateFormUpload({ mime: resolveUploadMime('', 'IMG_0001.HEIC'), size: 10 })).toEqual({
      ok: true,
      ext: 'heic',
    });
  });
});

describe('buildFormAttachmentFolder', () => {
  it('builds a per-user form folder', () => {
    expect(buildFormAttachmentFolder('abc', 'payroll-dispute')).toBe('form-attachments/abc/payroll-dispute/');
  });

  it('builds the unchanged payroll dispute folder without a slot', () => {
    expect(buildFormAttachmentFolder('u1', 'payroll-dispute')).toBe('form-attachments/u1/payroll-dispute/');
  });

  it('builds a per-user form slot folder', () => {
    expect(buildFormAttachmentFolder('u1', 'leads-request', 'hostile')).toBe(
      'form-attachments/u1/leads-request/hostile/'
    );
  });
});

describe('isAllowedFormUpload', () => {
  it('allows payroll dispute only without a slot', () => {
    expect(isAllowedFormUpload('payroll-dispute', '')).toBe(true);
    expect(isAllowedFormUpload('payroll-dispute', 'hostile')).toBe(false);
  });

  it('allows the three leads request slots only', () => {
    expect(isAllowedFormUpload('leads-request', 'hostile')).toBe(true);
    expect(isAllowedFormUpload('leads-request', 'blind-knock')).toBe(true);
    expect(isAllowedFormUpload('leads-request', 'lasso')).toBe(true);
    expect(isAllowedFormUpload('leads-request', 'bogus')).toBe(false);
    expect(isAllowedFormUpload('leads-request', '')).toBe(false);
  });

  it('rejects unknown forms', () => {
    expect(isAllowedFormUpload('unknown-form', '')).toBe(false);
  });
});

describe('sale-proof uploads', () => {
  it('accepts a valid unique slot id', () => {
    expect(isAllowedFormUpload('sale-proof', 'a1b2c3d4e5')).toBe(true);
  });
  it('rejects an empty slot (needs a unique id)', () => {
    expect(isAllowedFormUpload('sale-proof', '')).toBe(false);
  });
  it('rejects a slot with unsafe characters', () => {
    expect(isAllowedFormUpload('sale-proof', '../../etc')).toBe(false);
  });
  it('rejects a too-short slot', () => {
    expect(isAllowedFormUpload('sale-proof', 'abc')).toBe(false);
  });
});

describe('per-submission upload ids (payroll-dispute, leads-request)', () => {
  const id = 'a'.repeat(32);

  it('generates ids that pass validation', () => {
    const generated = newFormUploadId();
    expect(isValidFormUploadId(generated)).toBe(true);
    expect(newFormUploadId()).not.toBe(generated);
  });
  it('rejects malformed ids', () => {
    expect(isValidFormUploadId('')).toBe(false);
    expect(isValidFormUploadId('hostile')).toBe(false);
    expect(isValidFormUploadId('../../etc')).toBe(false);
    expect(isValidFormUploadId('A'.repeat(32))).toBe(false);
    expect(isValidFormUploadId('a'.repeat(33))).toBe(false);
    expect(isValidFormUploadId(123)).toBe(false);
  });
  it('builds a per-submission folder, keeping named slots under the id', () => {
    expect(buildSubmissionAttachmentFolder('u1', 'payroll-dispute', id)).toBe(
      `form-attachments/u1/payroll-dispute/${id}/`
    );
    expect(buildSubmissionAttachmentFolder('u1', 'leads-request', id, 'lasso')).toBe(
      `form-attachments/u1/leads-request/${id}/lasso/`
    );
  });
  it('requires a valid upload id for per-submission forms', () => {
    expect(resolveFormUploadFolder('u1', 'payroll-dispute', '', id)).toBe(
      `form-attachments/u1/payroll-dispute/${id}/`
    );
    expect(resolveFormUploadFolder('u1', 'leads-request', 'hostile', id)).toBe(
      `form-attachments/u1/leads-request/${id}/hostile/`
    );
    expect(resolveFormUploadFolder('u1', 'payroll-dispute', '', '')).toBeNull();
    expect(resolveFormUploadFolder('u1', 'leads-request', 'hostile', 'bad')).toBeNull();
    expect(resolveFormUploadFolder('u1', 'leads-request', 'bogus', id)).toBeNull();
  });
  it('leaves sale-proof on its per-sale slot folder', () => {
    expect(resolveFormUploadFolder('u1', 'sale-proof', 'a1b2c3d4e5', '')).toBe(
      'form-attachments/u1/sale-proof/a1b2c3d4e5/'
    );
    expect(resolveFormUploadFolder('u1', 'sale-proof', '', '')).toBeNull();
  });
});
