import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkFormFile,
  FormUploadError,
  isUploadCancelled,
  prepareFormFile,
  shrinkImage,
  uploadCapMs,
  uploadFormAttachment,
} from './uploadFormAttachment';

/**
 * A stand-in XMLHttpRequest: records what was sent, and lets a test move bytes
 * (progress), answer, drop the connection, or say nothing at all.
 */
class FakeXHR {
  static all: FakeXHR[] = [];
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: FormData | null = null;
  status = 0;
  responseText = '';
  aborted = false;
  upload: { onprogress: (() => void) | null } = { onprogress: null };
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXHR.all.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(key: string, value: string) {
    this.headers[key.toLowerCase()] = value;
  }
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  /** Bytes went out. */
  progress() {
    this.upload.onprogress?.();
  }
  respond(status: number, json: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(json);
    this.onload?.();
  }
}

/** The next XHR sent, once the async preparation has run. */
async function sent(index = 0): Promise<FakeXHR> {
  await vi.waitFor(() => expect(FakeXHR.all[index]?.body).toBeTruthy());
  return FakeXHR.all[index];
}

beforeEach(() => {
  FakeXHR.all = [];
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const png = () => new File([new Uint8Array([1, 2, 3])], 'proof.png', { type: 'image/png' });

describe('uploadFormAttachment', () => {
  it('sends the per-submission uploadId and form type as multipart fields', async () => {
    const result = uploadFormAttachment({
      file: png(),
      itemId: 'payroll-dispute',
      formType: 'payroll-dispute',
      fields: { uploadId: 'a'.repeat(32) },
      getHeaders: async () => ({ Authorization: 'Bearer t' }),
    });
    const xhr = await sent();
    xhr.respond(200, { path: 'form-attachments/u/payroll-dispute/abc/' });

    expect(await result).toBe('form-attachments/u/payroll-dispute/abc/');
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/portal/forms/upload');
    expect(xhr.headers.authorization).toBe('Bearer t');
    expect(xhr.body?.get('uploadId')).toBe('a'.repeat(32));
    expect(xhr.body?.get('formType')).toBe('payroll-dispute');
    expect(xhr.body?.get('itemId')).toBe('payroll-dispute');
  });

  it('omits formType when a route does not take one', async () => {
    const result = uploadFormAttachment({
      file: png(),
      itemId: 'w9',
      uploadUrl: '/api/portal/onboarding/upload',
      fields: { userId: 'u' },
    });
    const xhr = await sent();
    xhr.respond(200, { path: 'onboarding/u/w9/' });
    await result;
    expect(xhr.body?.get('formType')).toBeNull();
    expect(xhr.body?.get('userId')).toBe('u');
  });

  it('rejects a type outside a narrower allowlist before uploading', async () => {
    const pdf = new File([new Uint8Array([1])], 'license.pdf', { type: 'application/pdf' });
    await expect(
      uploadFormAttachment({ file: pdf, itemId: 'dl_photos', allowedTypes: ['image/png', 'image/jpeg'] })
    ).rejects.toThrow('Use a photo or a screenshot');
    expect(FakeXHR.all).toHaveLength(0);
  });

  it("passes the server's error through", async () => {
    const result = uploadFormAttachment({ file: png(), itemId: 'sale-proof' });
    (await sent()).respond(413, { error: 'File too large' });
    await expect(result).rejects.toThrow('File too large');
  });
});

describe('checkFormFile', () => {
  it('accepts a PDF by default', () => {
    expect(checkFormFile(new File([''], 'a.pdf', { type: 'application/pdf' }))).toBeNull();
  });
});

describe('uploadFormAttachment on weak signal', () => {
  it('keeps a slow upload going while bytes move, past the old one minute cap', async () => {
    vi.useFakeTimers();
    const result = uploadFormAttachment({ file: png(), itemId: 'sale-proof', maxMs: 10 * 60_000 });
    const xhr = await sent();
    for (let second = 0; second < 150; second += 20) {
      await vi.advanceTimersByTimeAsync(20_000);
      xhr.progress();
    }
    expect(xhr.aborted).toBe(false);
    xhr.respond(200, { path: 'form-attachments/u/sale-proof/s/' });
    expect(await result).toBe('form-attachments/u/sale-proof/s/');
  });

  it('gives up when no bytes move for 30 seconds, with a message fit for the rep', async () => {
    vi.useFakeTimers();
    const result = uploadFormAttachment({ file: png(), itemId: 'sale-proof' });
    const settled = expect(result).rejects.toSatisfy(
      (error: unknown) => error instanceof FormUploadError && error.message === 'Upload timed out'
    );
    const xhr = await sent();
    await vi.advanceTimersByTimeAsync(20_000);
    xhr.progress();
    await vi.advanceTimersByTimeAsync(29_000);
    expect(xhr.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    await settled;
    expect(xhr.aborted).toBe(true);
  });

  it('still stops at the overall cap, scaled by size', async () => {
    expect(uploadCapMs(0)).toBe(60_000);
    expect(uploadCapMs(1_600_000)).toBe(260_000);
    vi.useFakeTimers();
    const result = uploadFormAttachment({ file: png(), itemId: 'sale-proof', maxMs: 90_000 });
    const settled = expect(result).rejects.toThrow('Upload timed out');
    const xhr = await sent();
    for (let elapsed = 0; elapsed < 90_000; elapsed += 10_000) {
      xhr.progress();
      await vi.advanceTimersByTimeAsync(10_000);
    }
    await settled;
  });

  it('aborts the request when the caller cancels, as a cancel rather than a failure', async () => {
    const controller = new AbortController();
    const result = uploadFormAttachment({ file: png(), itemId: 'sale-proof', signal: controller.signal });
    const xhr = await sent();
    controller.abort();
    const error = await result.catch((e: unknown) => e);
    expect(isUploadCancelled(error)).toBe(true);
    expect(xhr.aborted).toBe(true);
  });

  it('never starts a request that was cancelled before it went out', async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await uploadFormAttachment({ file: png(), itemId: 'sale-proof', signal: controller.signal }).catch(
      (e: unknown) => e
    );
    expect(isUploadCancelled(error)).toBe(true);
    expect(FakeXHR.all).toHaveLength(0);
  });

  it('marks only its own wording as fit to show', async () => {
    const result = uploadFormAttachment({ file: png(), itemId: 'sale-proof' });
    (await sent()).onerror?.();
    const raw = await result.catch((e: unknown) => e);
    expect(raw).not.toBeInstanceOf(FormUploadError);
    const pdf = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' });
    const typed = await uploadFormAttachment({ file: pdf, itemId: 'x', allowedTypes: ['image/png'] }).catch(
      (e: unknown) => e
    );
    expect(typed).toBeInstanceOf(FormUploadError);
  });
});

describe('prepareFormFile', () => {
  it('copies the bytes once, so a retry never reads the picked file again', async () => {
    const picked = png();
    const read = vi.spyOn(picked, 'arrayBuffer');
    const prepared = await prepareFormFile(picked);
    expect(read).toHaveBeenCalledTimes(1);

    read.mockRejectedValue(new Error('NotReadableError'));
    const result = uploadFormAttachment({ file: prepared, prepared: true, itemId: 'sale-proof' });
    const xhr = await sent();
    expect(xhr.body?.get('file')).toBe(prepared);
    xhr.respond(200, { path: 'form-attachments/u/sale-proof/s/' });
    await expect(result).resolves.toBe('form-attachments/u/sale-proof/s/');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('says so in plain words when the phone will not hand the file over', async () => {
    const picked = png();
    vi.spyOn(picked, 'arrayBuffer').mockRejectedValue(new Error('NotReadableError'));
    await expect(prepareFormFile(picked)).rejects.toThrow(
      'That file could not be read from your phone. Pick it again.'
    );
  });
});

describe('shrinkImage', () => {
  /** A decodable 1170x2532 screenshot whose JPEG re-encode is `jpegBytes` long. */
  function stubCanvas(jpegBytes: number) {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1170, height: 2532, close: vi.fn() })));
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (done: (blob: Blob) => void, type: string, quality: number) => {
        canvas.encoded = { type, quality, size: [canvas.width, canvas.height] };
        done(new Blob([new Uint8Array(jpegBytes)], { type }));
      },
      encoded: null as { type: string; quality: number; size: number[] } | null,
    };
    vi.stubGlobal('document', { createElement: (tag: string) => (tag === 'canvas' ? canvas : null) });
    return canvas;
  }

  it('shrinks a small screenshot too, to 2000px on the long edge as JPEG 0.8', async () => {
    const canvas = stubCanvas(300);
    const screenshot = new File([new Uint8Array(900)], 'IMG_0412.PNG', { type: 'image/png' });

    const shrunk = await shrinkImage(screenshot);

    expect(shrunk.type).toBe('image/jpeg');
    expect(shrunk.name).toBe('IMG_0412.jpg');
    expect(shrunk.size).toBe(300);
    expect(canvas.encoded).toEqual({ type: 'image/jpeg', quality: 0.8, size: [924, 2000] });
    // The backing store is let go at once (iOS caps total canvas memory).
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it('sends the original when the re-encode is no smaller, or it is not a photo', async () => {
    stubCanvas(5000);
    const small = new File([new Uint8Array(900)], 'a.png', { type: 'image/png' });
    expect(await shrinkImage(small)).toBe(small);
    const pdf = new File([new Uint8Array(900)], 'a.pdf', { type: 'application/pdf' });
    expect(await shrinkImage(pdf)).toBe(pdf);
  });

  it('turns a HEIC the browser can decode into a JPEG, even when that is larger', async () => {
    stubCanvas(5000);
    const heic = new File([new Uint8Array(900)], 'IMG_0001.HEIC', { type: 'image/heic' });
    const out = await shrinkImage(heic);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('IMG_0001.jpg');
  });
});

describe('a photo this browser cannot decode', () => {
  const IPHONE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

  beforeEach(() => {
    // A HEIC outside Safari, or a canvas out of memory: the decode throws.
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
      })
    );
  });

  it('uploads the original bytes, typed from the extension when iOS gave none', async () => {
    const bytes = new Uint8Array([7, 8, 9, 10]);
    const heic = new File([bytes], 'IMG_0001.HEIC', { type: '' });

    const result = uploadFormAttachment({
      file: heic,
      itemId: 'dl_photos',
      slot: 'front',
      uploadUrl: '/api/public/onboarding/t/upload',
      allowedTypes: IPHONE_TYPES,
    });
    const xhr = await sent();
    const uploaded = xhr.body?.get('file') as File;
    expect(uploaded.name).toBe('IMG_0001.HEIC');
    expect(uploaded.type).toBe('image/heic');
    expect(new Uint8Array(await uploaded.arrayBuffer())).toEqual(bytes);
    xhr.respond(200, { path: 'onboarding/invite_i/dl_photos/' });
    await expect(result).resolves.toBe('onboarding/invite_i/dl_photos/');
  });

  it('says the file is too big, rather than failing quietly, when the original is over the cap', async () => {
    const heic = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'IMG_0002.HEIC', { type: 'image/heic' });
    await expect(
      uploadFormAttachment({ file: heic, itemId: 'dl_photos', slot: 'back', allowedTypes: IPHONE_TYPES })
    ).rejects.toThrow(new FormUploadError('File must be 4 MB or smaller'));
    expect(FakeXHR.all).toHaveLength(0);
  });
});
