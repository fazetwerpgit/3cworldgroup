import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkFormFile, FormUploadError, isUploadCancelled, uploadFormAttachment } from './uploadFormAttachment';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubUpload(path = 'form-attachments/u/payroll-dispute/abc/') {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ path }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const png = () => new File([new Uint8Array([1, 2, 3])], 'proof.png', { type: 'image/png' });

describe('uploadFormAttachment', () => {
  it('sends the per-submission uploadId and form type as multipart fields', async () => {
    const fetchMock = stubUpload();
    const path = await uploadFormAttachment({
      file: png(),
      itemId: 'payroll-dispute',
      formType: 'payroll-dispute',
      fields: { uploadId: 'a'.repeat(32) },
    });
    expect(path).toBe('form-attachments/u/payroll-dispute/abc/');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/portal/forms/upload');
    const body = init.body as FormData;
    expect(body.get('uploadId')).toBe('a'.repeat(32));
    expect(body.get('formType')).toBe('payroll-dispute');
    expect(body.get('itemId')).toBe('payroll-dispute');
  });

  it('omits formType when a route does not take one', async () => {
    const fetchMock = stubUpload('onboarding/u/w9/');
    await uploadFormAttachment({
      file: png(),
      itemId: 'w9',
      uploadUrl: '/api/portal/onboarding/upload',
      fields: { userId: 'u' },
    });
    const body = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(body.get('formType')).toBeNull();
    expect(body.get('userId')).toBe('u');
  });

  it('rejects a type outside a narrower allowlist before uploading', async () => {
    const fetchMock = stubUpload();
    const pdf = new File([new Uint8Array([1])], 'license.pdf', { type: 'application/pdf' });
    await expect(
      uploadFormAttachment({ file: pdf, itemId: 'dl_photos', allowedTypes: ['image/png', 'image/jpeg'] })
    ).rejects.toThrow('Use a photo or a screenshot');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('checkFormFile', () => {
  it('accepts a PDF by default', () => {
    expect(checkFormFile(new File([''], 'a.pdf', { type: 'application/pdf' }))).toBeNull();
  });
});

describe('uploadFormAttachment timeout and cancel', () => {
  /** A fetch that never answers until its signal aborts, like a stalled upload on one bar. */
  function stubStalled() {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives up on a stalled upload after the timeout with a message fit for the rep', async () => {
    vi.useFakeTimers();
    const fetchMock = stubStalled();
    const result = uploadFormAttachment({ file: png(), itemId: 'sale-proof', timeoutMs: 60_000 });
    const settled = expect(result).rejects.toSatisfy(
      (error: unknown) => error instanceof FormUploadError && error.message === 'Upload timed out'
    );
    await vi.advanceTimersByTimeAsync(59_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await settled;
  });

  it('aborts the request when the caller cancels, as a cancel rather than a failure', async () => {
    const fetchMock = stubStalled();
    const controller = new AbortController();
    const result = uploadFormAttachment({ file: png(), itemId: 'sale-proof', signal: controller.signal });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort();
    const error = await result.catch((e: unknown) => e);
    expect(isUploadCancelled(error)).toBe(true);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal?.aborted).toBe(true);
  });

  it('never starts a request that was cancelled before it went out', async () => {
    const fetchMock = stubUpload();
    const controller = new AbortController();
    controller.abort();
    const error = await uploadFormAttachment({ file: png(), itemId: 'sale-proof', signal: controller.signal }).catch(
      (e: unknown) => e
    );
    expect(isUploadCancelled(error)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks only its own wording as fit to show', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Load failed'); }));
    const raw = await uploadFormAttachment({ file: png(), itemId: 'sale-proof' }).catch((e: unknown) => e);
    expect(raw).not.toBeInstanceOf(FormUploadError);
    const pdf = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' });
    const typed = await uploadFormAttachment({ file: pdf, itemId: 'x', allowedTypes: ['image/png'] }).catch(
      (e: unknown) => e
    );
    expect(typed).toBeInstanceOf(FormUploadError);
  });
});
