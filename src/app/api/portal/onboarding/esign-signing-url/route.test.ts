import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireVerifiedUserMock,
  getMock,
  setMock,
  docMock,
  getEmbeddedSigningUrlMock,
  getEsignProviderMock,
  consoleErrorMock,
} = vi.hoisted(() => {
  const getMock = vi.fn();
  const setMock = vi.fn();
  const docMock = vi.fn((path: string) =>
    path.startsWith('userOnboarding/') ? { get: getMock } : { set: setMock }
  );
  const getEmbeddedSigningUrlMock = vi.fn();
  const getEsignProviderMock = vi.fn(() => ({
    id: 'signwell' as const,
    createEnvelope: vi.fn(),
    getEmbeddedSigningUrl: getEmbeddedSigningUrlMock,
    parseWebhook: vi.fn(),
  }));
  return {
    requireVerifiedUserMock: vi.fn(),
    getMock,
    setMock,
    docMock,
    getEmbeddedSigningUrlMock,
    getEsignProviderMock,
    consoleErrorMock: vi.spyOn(console, 'error').mockImplementation(() => undefined),
  };
});

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: requireVerifiedUserMock,
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { doc: docMock },
}));
vi.mock('@/lib/esign/provider', () => ({
  getEsignProvider: getEsignProviderMock,
}));

import { POST } from './route';

const VERIFIED = { ok: true, uid: 'u1', name: 'Rep One', email: 'rep@example.com' };

function req(body: unknown) {
  return new NextRequest('http://localhost/api/portal/onboarding/esign-signing-url', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireVerifiedUserMock.mockReset();
  getMock.mockReset();
  setMock.mockReset().mockResolvedValue(undefined);
  docMock.mockClear();
  getEmbeddedSigningUrlMock.mockReset();
  getEsignProviderMock.mockClear();
  consoleErrorMock.mockClear();
});

describe('POST /api/portal/onboarding/esign-signing-url', () => {
  it('returns the gate status when the caller is not verified', async () => {
    requireVerifiedUserMock.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });

    const res = await POST(req({ itemId: 'contract' }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(docMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-esign itemId', async () => {
    requireVerifiedUserMock.mockResolvedValue(VERIFIED);

    const res = await POST(req({ itemId: 'w9' }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'unknown item' });
    expect(docMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the owner has no envelope', async () => {
    requireVerifiedUserMock.mockResolvedValue(VERIFIED);
    getMock.mockResolvedValue({ exists: false, data: () => undefined });

    const res = await POST(req({ itemId: 'contract' }));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'no envelope' });
    expect(getEmbeddedSigningUrlMock).not.toHaveBeenCalled();
  });

  it('returns 502 and does not write the stored URL when the provider throws', async () => {
    requireVerifiedUserMock.mockResolvedValue(VERIFIED);
    getMock.mockResolvedValue({ exists: true, data: () => ({ esignEnvelopeId: 'env_1' }) });
    getEmbeddedSigningUrlMock.mockRejectedValue(new Error('SignWell unavailable'));

    const res = await POST(req({ itemId: 'contract' }));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: 'refresh failed' });
    expect(setMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign] signing url refresh failed for u1/contract',
      expect.any(Error)
    );
  });

  it('returns the fresh URL and persists it with merge', async () => {
    requireVerifiedUserMock.mockResolvedValue(VERIFIED);
    getMock.mockResolvedValue({ exists: true, data: () => ({ esignEnvelopeId: 'env_1' }) });
    getEmbeddedSigningUrlMock.mockResolvedValue('https://sign.example/fresh');

    const res = await POST(req({ itemId: 'contract' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: 'https://sign.example/fresh' });
    expect(docMock).toHaveBeenNthCalledWith(1, 'userOnboarding/u1_contract');
    expect(docMock).toHaveBeenNthCalledWith(2, 'esignSigningUrls/u1_contract');
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        itemId: 'contract',
        envelopeId: 'env_1',
        url: 'https://sign.example/fresh',
        updatedAt: expect.any(Date),
      }),
      { merge: true }
    );
  });

  it('still returns the fresh URL when persistence fails', async () => {
    requireVerifiedUserMock.mockResolvedValue(VERIFIED);
    getMock.mockResolvedValue({ exists: true, data: () => ({ esignEnvelopeId: 'env_1' }) });
    getEmbeddedSigningUrlMock.mockResolvedValue('https://sign.example/fresh');
    setMock.mockRejectedValue(new Error('Firestore unavailable'));

    const res = await POST(req({ itemId: 'contract' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: 'https://sign.example/fresh' });
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign] signing url refresh persistence failed for u1/contract',
      expect.any(Error)
    );
  });
});
