import { describe, it, expect } from 'vitest';
import {
  STORAGE_ITEM_IDS,
  isStorageItem,
  extForMime,
  validateUpload,
  buildFolderPath,
} from './uploads';

describe('storage item identification', () => {
  it('lists the four storage items', () => {
    expect(new Set(STORAGE_ITEM_IDS)).toEqual(
      new Set(['w9', 'dl_photos', 'llc_sos', 'insurance'])
    );
  });

  it('recognizes storage vs non-storage items', () => {
    expect(isStorageItem('w9')).toBe(true);
    expect(isStorageItem('background_check')).toBe(false);
    expect(isStorageItem('contract')).toBe(false);
  });
});

describe('extForMime', () => {
  it('maps known mimes to extensions', () => {
    expect(extForMime('image/jpeg')).toBe('jpg');
    expect(extForMime('image/png')).toBe('png');
    expect(extForMime('image/webp')).toBe('webp');
    expect(extForMime('image/heic')).toBe('heic');
    expect(extForMime('image/heif')).toBe('heic');
    expect(extForMime('application/pdf')).toBe('pdf');
  });

  it('returns null for unknown mimes', () => {
    expect(extForMime('application/zip')).toBeNull();
    expect(extForMime('text/html')).toBeNull();
  });
});

describe('validateUpload', () => {
  it('accepts a valid DL front image', () => {
    const r = validateUpload({ itemId: 'dl_photos', slot: 'front', mime: 'image/jpeg', size: 1_000_000 });
    expect(r).toEqual({ ok: true, ext: 'jpg', fileBase: 'front' });
  });

  it('accepts a W-9 PDF with the default file base', () => {
    const r = validateUpload({ itemId: 'w9', mime: 'application/pdf', size: 500_000 });
    expect(r).toEqual({ ok: true, ext: 'pdf', fileBase: 'file' });
  });

  it('rejects a non-storage item', () => {
    const r = validateUpload({ itemId: 'contract', mime: 'application/pdf', size: 10 });
    expect(r.ok).toBe(false);
  });

  it('rejects a PDF for dl_photos (images only)', () => {
    const r = validateUpload({ itemId: 'dl_photos', slot: 'front', mime: 'application/pdf', size: 10 });
    expect(r.ok).toBe(false);
  });

  it('requires a valid slot for dl_photos', () => {
    expect(validateUpload({ itemId: 'dl_photos', mime: 'image/png', size: 10 }).ok).toBe(false);
    expect(validateUpload({ itemId: 'dl_photos', slot: 'side', mime: 'image/png', size: 10 }).ok).toBe(false);
  });

  it('rejects a slot on a single-file item', () => {
    const r = validateUpload({ itemId: 'w9', slot: 'front', mime: 'application/pdf', size: 10 });
    expect(r.ok).toBe(false);
  });

  it('rejects files over 4 MB', () => {
    const r = validateUpload({ itemId: 'w9', mime: 'application/pdf', size: 4 * 1024 * 1024 + 1 });
    expect(r.ok).toBe(false);
  });

  it('rejects an unknown mime', () => {
    const r = validateUpload({ itemId: 'insurance', mime: 'application/zip', size: 10 });
    expect(r.ok).toBe(false);
  });
});

describe('buildFolderPath', () => {
  it('builds a user-scoped folder', () => {
    expect(buildFolderPath({ kind: 'user', userId: 'abc' }, 'dl_photos')).toBe(
      'onboarding/abc/dl_photos/'
    );
  });

  it('builds an invite-scoped folder', () => {
    expect(buildFolderPath({ kind: 'invite', inviteId: 'inv1' }, 'w9')).toBe(
      'onboarding/invite_inv1/w9/'
    );
  });
});
