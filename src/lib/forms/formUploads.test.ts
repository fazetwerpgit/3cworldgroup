import { describe, it, expect } from 'vitest';
import {
  validateFormUpload,
  buildFormAttachmentFolder,
  MAX_FORM_FILE_BYTES,
  isAllowedFormUpload,
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
  it('accepts the sale-proof single slot', () => {
    expect(isAllowedFormUpload('sale-proof', '')).toBe(true);
  });
  it('rejects an unknown slot for sale-proof', () => {
    expect(isAllowedFormUpload('sale-proof', 'nope')).toBe(false);
  });
});
