import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  gateMock,
  docGetMock,
  docSetMock,
  docMock,
  storageFileMock,
  storageDownloadMock,
  storageSaveMock,
  bucketMock,
  getCompletedPdfMock,
  getEsignProviderMock,
} = vi.hoisted(() => {
  const docGetMock = vi.fn();
  const docSetMock = vi.fn();
  const docMock = vi.fn(() => ({ get: docGetMock, set: docSetMock }));
  const storageDownloadMock = vi.fn();
  const storageSaveMock = vi.fn();
  const storageFileMock = vi.fn(() => ({ download: storageDownloadMock, save: storageSaveMock }));
  const bucketMock = { file: storageFileMock };
  const getCompletedPdfMock = vi.fn();
  const getEsignProviderMock = vi.fn(() => ({ getCompletedPdf: getCompletedPdfMock }));
  return {
    gateMock: vi.fn(),
    docGetMock,
    docSetMock,
    docMock,
    storageFileMock,
    storageDownloadMock,
    storageSaveMock,
    bucketMock,
    getCompletedPdfMock,
    getEsignProviderMock,
  };
});

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: gateMock }));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: vi.fn(() => ({ doc: docMock })) },
  adminStorage: { bucket: vi.fn(() => bucketMock) },
}));
vi.mock('@/lib/esign/provider', () => ({ getEsignProvider: getEsignProviderMock }));

import { GET } from './route';

const MANAGEMENT = { ok: true, uid: 'manager-1', name: 'Manager', isAdmin: true };

function request(userId = 'user-1', itemId = 'contract') {
  return new NextRequest(
    `http://localhost/api/portal/onboarding/signed-pdf?userId=${userId}&itemId=${itemId}`
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'bucket.example');
  gateMock.mockResolvedValue(MANAGEMENT);
  docGetMock.mockResolvedValue({ exists: false, data: () => undefined });
  docSetMock.mockResolvedValue(undefined);
  storageDownloadMock.mockResolvedValue([Buffer.from('%PDF-stored')]);
  storageSaveMock.mockResolvedValue(undefined);
  getCompletedPdfMock.mockResolvedValue(Buffer.from('%PDF-live'));
});

describe('GET /api/portal/onboarding/signed-pdf', () => {
  it.each([
    [{ ok: false, error: 'Unauthorized', status: 401 }, 401],
    [{ ok: false, error: 'Forbidden: management access required', status: 403 }, 403],
  ])('returns the management gate status', async (gate, status) => {
    gateMock.mockResolvedValue(gate);

    const response = await GET(request());

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: gate.error });
    expect(docMock).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown item', async () => {
    const response = await GET(request('user-1', 'not-an-item'));

    expect(response.status).toBe(404);
    expect(docMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-e-sign item', async () => {
    const response = await GET(request('user-1', 'onboarding_submission'));

    expect(response.status).toBe(404);
    expect(docMock).not.toHaveBeenCalled();
  });

  it('streams a PDF from the stored path', async () => {
    docGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ itemId: 'contract', completedPdfPath: 'esign-completed/user-1/contract.pdf' }),
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/pdf');
    expect(response.headers.get('content-disposition')).toBe('inline; filename="contract.pdf"');
    expect(storageFileMock).toHaveBeenCalledWith('esign-completed/user-1/contract.pdf');
    expect(await response.text()).toBe('%PDF-stored');
    expect(getCompletedPdfMock).not.toHaveBeenCalled();
  });

  it('fetches a live PDF and best-effort persists its storage path', async () => {
    docGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ itemId: 'contract', esignEnvelopeId: 'env-1' }),
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('%PDF-live');
    expect(getCompletedPdfMock).toHaveBeenCalledWith('env-1');
    expect(storageFileMock).toHaveBeenCalledWith('esign-completed/user-1/contract.pdf');
    expect(storageSaveMock).toHaveBeenCalledWith(Buffer.from('%PDF-live'), expect.objectContaining({
      contentType: 'application/pdf',
    }));
    expect(docSetMock).toHaveBeenCalledWith(
      { completedPdfPath: 'esign-completed/user-1/contract.pdf' },
      { merge: true }
    );
  });
});
