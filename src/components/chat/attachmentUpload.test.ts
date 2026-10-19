import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DIRECT_UPLOAD_THRESHOLD,
  MAX_SELECTED_IMAGE_BYTES,
  UPLOAD_STALL_TIMEOUT_MS,
  isPdfFile,
  prepareImageForUpload,
  storageUploadFailure,
  uploadChatFileDirect,
  uploadChatImage,
  uploadChatImageWithProgress,
  validateSelectedImage,
  type DirectUploadDeps,
} from './attachmentUpload';
import { SendRequestError } from '@/lib/chat/outbox';

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

  it('accepts a PDF, including an Android content-URI PDF with no useful MIME', () => {
    expect(validateSelectedImage(imageFile('contract.pdf', 'application/pdf'))).toBeNull();
    expect(validateSelectedImage(imageFile('contract.pdf', ''))).toBeNull();
    expect(validateSelectedImage(imageFile('Contract.PDF', 'application/octet-stream'))).toBeNull();
    expect(isPdfFile(imageFile('contract.pdf', ''))).toBe(true);
    expect(isPdfFile(imageFile('photo.jpg', ''))).toBe(false);
  });

  it('rejects a GIF over the 10 MB server cap at pick time, since GIFs upload uncompressed', () => {
    expect(validateSelectedImage(imageFile('big.gif', 'image/gif', 15 * 1024 * 1024))).toBe(
      'GIF too large — GIFs up to 10 MB.'
    );
    expect(validateSelectedImage(imageFile('ok.gif', 'image/gif', 10 * 1024 * 1024))).toBeNull();
  });

  it('rejects an 11 MB PDF with the PDF size message', () => {
    expect(validateSelectedImage(imageFile('big.pdf', 'application/pdf', 11 * 1024 * 1024))).toBe(
      'File too large — PDFs up to 10 MB.'
    );
  });

  it('rejects other documents with the image-or-PDF copy', () => {
    expect(validateSelectedImage(imageFile('notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBe(
      'Unsupported file — use an image or PDF.'
    );
    expect(validateSelectedImage(imageFile('setup.exe', ''))).toBe('Unsupported file — use an image or PDF.');
  });

  it('keeps image rules unchanged', () => {
    expect(validateSelectedImage(imageFile('photo.png', 'image/png'))).toBeNull();
    expect(validateSelectedImage(imageFile('large.jpg', 'image/jpeg', 11 * 1024 * 1024))).toBeNull();
    expect(validateSelectedImage(imageFile('huge.jpg', 'image/jpeg', MAX_SELECTED_IMAGE_BYTES + 1))).toContain('30 MB');
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

describe('prepareImageForUpload (PDF)', () => {
  it('passes a typeless PDF through untouched, labelled application/pdf', async () => {
    const picked = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'scan.pdf', { type: '' });
    const prepared = await prepareImageForUpload(picked);
    expect(prepared.file.type).toBe('application/pdf');
    expect(prepared.file.name).toBe('scan.pdf');
    expect(prepared.width).toBeUndefined();
    expect(new Uint8Array(await prepared.file.arrayBuffer())).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]));
  });
});

describe('uploadChatImage', () => {
  it('returns a file attachment when the server stored a PDF', async () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/b/o/chat%2Fall-company%2Fx.pdf?alt=media&token=t';
    const authedFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ url, contentType: 'application/pdf', name: 'scan.pdf', size: 5 }), {
          status: 200,
        })
    );
    await expect(
      uploadChatImage(authedFetch, 'all-company', imageFile('scan.pdf', 'application/pdf'))
    ).resolves.toEqual({ type: 'file', url, contentType: 'application/pdf', name: 'scan.pdf', size: 5 });
  });

  it('surfaces a useful message when a proxy returns a non-JSON upload error', async () => {
    const authedFetch = vi.fn(async () => new Response('Request body too large', { status: 413 }));

    await expect(
      uploadChatImage(authedFetch, 'all-company', imageFile('photo.jpg', 'image/jpeg'))
    ).rejects.toThrow('Photo upload failed. Please try again.');
  });
});

describe('uploadChatFileDirect (straight to Storage, then attach by path)', () => {
  const URL_PDF = 'https://firebasestorage.googleapis.com/v0/b/b/o/chat%2Fall-company%2Fx.pdf?alt=media&token=t';

  function deps(response: Response | Error = new Response(
    JSON.stringify({ url: URL_PDF, contentType: 'application/pdf', name: 'Contract.pdf', size: 9 }),
    { status: 200 }
  )) {
    const puts: Array<{ path: string; file: File }> = [];
    const d = {
      uid: vi.fn(async () => 'rep1'),
      putFile: vi.fn(async (path: string, file: File, onProgress: (f: number) => void) => {
        puts.push({ path, file });
        onProgress(0.5);
        onProgress(1);
      }),
      fetch: vi.fn(async () => {
        if (response instanceof Error) throw response;
        return response;
      }),
    } satisfies DirectUploadDeps;
    return { d, puts };
  }

  it("writes to the caller's pending folder, then sends only the path and name", async () => {
    const { d, puts } = deps();
    const progress: number[] = [];
    const file = imageFile('Contract.pdf', 'application/pdf', 9);
    const attachment = await uploadChatFileDirect(d, 'id-tok', 'all-company', file, undefined, undefined, (f) => progress.push(f));

    expect(attachment).toEqual({ type: 'file', url: URL_PDF, contentType: 'application/pdf', name: 'Contract.pdf', size: 9 });
    expect(puts[0].path).toMatch(/^chat-pending\/rep1\/[0-9a-f-]{8,64}\.pdf$/);
    expect(puts[0].file).toBe(file);
    const [url, init] = d.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/portal/chat/media');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer id-tok');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ channelId: 'all-company', pendingPath: puts[0].path, name: 'Contract.pdf' });
    expect(progress).toEqual([0.475, 0.95, 1]);
  });

  it('sends no name for an image, and keeps its dimensions', async () => {
    const { d, puts } = deps(new Response(JSON.stringify({ url: 'u', contentType: 'image/gif' }), { status: 200 }));
    const attachment = await uploadChatFileDirect(d, 't', 'c', imageFile('a.gif', 'image/gif'), 300, 200, () => {});
    expect(puts[0].path).toMatch(/\.gif$/);
    expect(JSON.parse((d.fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).not.toHaveProperty('name');
    expect(attachment).toEqual({ type: 'image', url: 'u', contentType: 'image/gif', width: 300, height: 200 });
  });

  it('refuses an unsupported type and a signed-out caller before uploading', async () => {
    const { d } = deps();
    await expect(uploadChatFileDirect(d, 't', 'c', imageFile('a.docx', 'application/msword'), undefined, undefined, () => {})).rejects.toThrow('Unsupported');
    d.uid.mockResolvedValueOnce(null as unknown as string);
    await expect(uploadChatFileDirect(d, 't', 'c', imageFile('a.pdf', 'application/pdf'), undefined, undefined, () => {})).rejects.toBeInstanceOf(SendRequestError);
    expect(d.putFile).not.toHaveBeenCalled();
  });

  it('surfaces the route refusal with its status, and a lost attach call as retryable', async () => {
    const refused = deps(new Response(JSON.stringify({ error: 'That file is not a valid PDF.' }), { status: 400 }));
    const error = await uploadChatFileDirect(refused.d, 't', 'c', imageFile('a.pdf', 'application/pdf'), undefined, undefined, () => {}).catch((e) => e);
    expect(error).toBeInstanceOf(SendRequestError);
    expect(error.message).toBe('That file is not a valid PDF.');
    expect(error.failure).toEqual({ kind: 'http', status: 400 });

    const offline = deps(new TypeError('Failed to fetch'));
    const lost = await uploadChatFileDirect(offline.d, 't', 'c', imageFile('a.pdf', 'application/pdf'), undefined, undefined, () => {}).catch((e) => e);
    expect(lost.failure).toEqual({ kind: 'network' });
  });

  it('treats a connection dropped while reading the attach response as retryable', async () => {
    const dropped = new Response('{}', { status: 200 });
    vi.spyOn(dropped, 'text').mockRejectedValue(new TypeError('network error'));
    const { d } = deps(dropped);
    const error = await uploadChatFileDirect(d, 't', 'c', imageFile('a.pdf', 'application/pdf'), undefined, undefined, () => {}).catch((e) => e);
    expect(error).toBeInstanceOf(SendRequestError);
    expect(error.failure).toEqual({ kind: 'network' });
  });

  it('maps a rules refusal to a permanent error and anything else to a retry', () => {
    expect(storageUploadFailure({ code: 'storage/unauthorized' }).failure).toEqual({ kind: 'http', status: 403 });
    expect(storageUploadFailure({ code: 'storage/canceled' }).failure).toEqual({ kind: 'network' });
    expect(storageUploadFailure(new Error('x')).failure).toEqual({ kind: 'network' });
  });

  it('uploadChatImageWithProgress sends a file over the threshold straight to Storage', async () => {
    const { d, puts } = deps();
    const big = imageFile('Big.pdf', 'application/pdf', DIRECT_UPLOAD_THRESHOLD + 1);
    await uploadChatImageWithProgress('t', 'all-company', big, undefined, undefined, () => {}, d);
    expect(puts).toHaveLength(1);
    expect(DIRECT_UPLOAD_THRESHOLD).toBeLessThan(4.5 * 1024 * 1024);
  });

  it('uploadChatImageWithProgress keeps a small file on the multipart path', async () => {
    const { d } = deps();
    const sent: FormData[] = [];
    class FakeXhr {
      status = 200;
      responseText = JSON.stringify({ url: 'u', contentType: 'image/png' });
      upload = { onprogress: null };
      timeout = 0;
      onload: (() => void) | null = null;
      onerror = null;
      ontimeout = null;
      onabort = null;
      open() {}
      setRequestHeader() {}
      send(body: FormData) {
        sent.push(body);
        this.onload?.();
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    await uploadChatImageWithProgress('t', 'c', imageFile('a.png', 'image/png', 1024), 10, 10, () => {}, d);
    expect(sent).toHaveLength(1);
    expect(d.putFile).not.toHaveBeenCalled();
  });

  it('uploadChatImageWithProgress gives up on a stalled upload, not a slow but moving one', async () => {
    vi.useFakeTimers();
    try {
      const { d } = deps();
      const xhrs: StallXhr[] = [];
      class StallXhr {
        upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
        onload = null;
        onerror: (() => void) | null = null;
        ontimeout: (() => void) | null = null;
        onabort: (() => void) | null = null;
        aborted = false;
        constructor() {
          xhrs.push(this);
        }
        open() {}
        setRequestHeader() {}
        send() {}
        abort() {
          this.aborted = true;
          this.onabort?.();
        }
      }
      vi.stubGlobal('XMLHttpRequest', StallXhr);
      const pending = uploadChatImageWithProgress('t', 'c', imageFile('a.png', 'image/png', 1024), 10, 10, () => {}, d);
      const settled = pending.catch((e) => e);
      const xhr = xhrs[0];
      // Bytes keep trickling in for well past 120 s in total: no cut-off.
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(100_000);
        xhr.upload.onprogress?.({ lengthComputable: true, loaded: i + 1, total: 10 });
      }
      expect(xhr.aborted).toBe(false);
      // Then nothing moves for the stall limit: abort as a retryable failure.
      vi.advanceTimersByTime(UPLOAD_STALL_TIMEOUT_MS);
      expect(xhr.aborted).toBe(true);
      const error = await settled;
      expect(error).toBeInstanceOf(SendRequestError);
      expect(error.failure).toEqual({ kind: 'network' });
    } finally {
      vi.useRealTimers();
    }
  });
});
