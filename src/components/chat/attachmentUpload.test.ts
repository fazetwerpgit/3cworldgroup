import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_SELECTED_IMAGE_BYTES,
  prepareImageForUpload,
  uploadChatImage,
  validateSelectedImage,
} from './attachmentUpload';

function imageFile(name: string, type: string, size = 16): File {
  return new File([new Uint8Array(size)], name, { type });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('validateSelectedImage', () => {
  it('accepts native iPhone formats for conversion', () => {
    expect(validateSelectedImage(imageFile('photo.heic', 'image/heic'))).toBeNull();
    expect(validateSelectedImage(imageFile('photo.heif', 'image/heif'))).toBeNull();
  });

  it('recovers a missing or generic mobile MIME from the file extension', () => {
    expect(validateSelectedImage(imageFile('camera.jpg', ''))).toBeNull();
    expect(validateSelectedImage(imageFile('camera.jpeg', 'application/octet-stream'))).toBeNull();
  });

  it('allows a compressible original above the prepared-upload limit', () => {
    expect(validateSelectedImage(imageFile('large.jpg', 'image/jpeg', 10 * 1024 * 1024 + 1))).toBeNull();
  });

  it('rejects empty, unsupported, and excessively large selections', () => {
    expect(validateSelectedImage(imageFile('empty.jpg', 'image/jpeg', 0))).toContain('empty');
    expect(validateSelectedImage(imageFile('raw.dng', 'image/x-adobe-dng'))).toContain('Unsupported');
    expect(
      validateSelectedImage(imageFile('huge.jpg', 'image/jpeg', MAX_SELECTED_IMAGE_BYTES + 1))
    ).toContain('30 MB');
  });
});

describe('prepareImageForUpload', () => {
  it('converts and downsizes HEIC to a universally renderable JPEG', async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4032, height: 3024, close }))
    );
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
      }),
    });

    const prepared = await prepareImageForUpload(imageFile('IMG_1234.HEIC', 'image/heic'));

    expect(prepared.file.name).toBe('IMG_1234.jpg');
    expect(prepared.file.type).toBe('image/jpeg');
    expect(prepared.width).toBe(2000);
    expect(prepared.height).toBe(1500);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2000, 1500);
    expect(close).toHaveBeenCalledOnce();
  });

  it('normalizes a typeless JPEG without re-encoding when already small', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1200, height: 800, close }))
    );

    const prepared = await prepareImageForUpload(imageFile('camera.jpg', ''));

    expect(prepared.file.type).toBe('image/jpeg');
    expect(prepared.width).toBe(1200);
    expect(prepared.height).toBe(800);
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('uploadChatImage', () => {
  it('surfaces a useful message when a proxy returns a non-JSON upload error', async () => {
    const authedFetch = vi.fn(async () => new Response('Request body too large', { status: 413 }));

    await expect(
      uploadChatImage(authedFetch, 'all-company', imageFile('photo.jpg', 'image/jpeg'))
    ).rejects.toThrow('Photo upload failed. Please try again.');
  });
});
