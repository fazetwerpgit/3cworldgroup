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

  // Android Chrome reads a picker File lazily when the request body is sent; a
  // content-URI photo whose backing file has moved/changed by then aborts the
  // upload as a bare "Failed to fetch". The prepared file must be an in-memory
  // copy so the multipart body never touches the picker's file again.
  it('uploads an in-memory copy of a small picker file, never the lazy original', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1200, height: 800, close: vi.fn() }))
    );
    const original = new File([new Uint8Array([1, 2, 3, 4])], '1000006569.jpg', {
      type: 'image/jpeg',
      lastModified: 1700000000000,
    });

    const prepared = await prepareImageForUpload(original);

    expect(prepared.file).not.toBe(original);
    expect(prepared.file.name).toBe('1000006569.jpg');
    expect(prepared.file.type).toBe('image/jpeg');
    expect(prepared.file.lastModified).toBe(1700000000000);
    expect(new Uint8Array(await prepared.file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('asks for a re-pick when the picker file can no longer be read', async () => {
    const stale = new File([new Uint8Array([1, 2, 3])], 'gone.jpg', { type: 'image/jpeg' });
    stale.arrayBuffer = async () => {
      throw new DOMException('The requested file could not be read', 'NotReadableError');
    };

    await expect(prepareImageForUpload(stale)).rejects.toThrow(/pick it again/i);
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
