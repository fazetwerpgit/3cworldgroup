import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkFormFile, uploadFormAttachment } from './uploadFormAttachment';

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
