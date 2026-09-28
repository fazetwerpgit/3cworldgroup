import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { gateMock, docGetMock, logAddMock, signMock } = vi.hoisted(() => ({
  gateMock: vi.fn(),
  docGetMock: vi.fn(),
  logAddMock: vi.fn(async () => undefined),
  signMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => ({
      doc: (id: string) => ({ get: () => docGetMock(name, id) }),
      add: logAddMock,
    })),
  },
}));
vi.mock('@/types', () => ({
  ONBOARDING_ITEMS: [
    { id: 'dl_photos', label: "Driver's License", sensitive: true, referenceKind: 'storage' },
    { id: 'id_card', label: 'ID card', sensitive: false, referenceKind: 'storage' },
    { id: 'contract', label: 'Contract', sensitive: false, referenceKind: 'esign' },
  ],
}));
vi.mock('@/lib/onboarding/uploads', () => ({ isStorageItem: (id: string) => id !== 'contract' }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: gateMock }));
vi.mock('@/lib/onboarding/signFiles', () => ({ signFolderFiles: signMock }));

import { GET } from './route';

const FILE = { name: 'front.jpg', url: 'https://signed/front.jpg', contentType: 'image/jpeg' };
const get = (userId: string, itemId: string) =>
  GET(new NextRequest(`http://localhost/api/portal/onboarding/files?userId=${userId}&itemId=${itemId}`));

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockResolvedValue({ ok: true, uid: 'owner1', name: 'Jacob', isAdmin: true });
  docGetMock.mockResolvedValue({ exists: true, data: () => ({ reference: 'onboarding/u1/dl_photos' }) });
  signMock.mockResolvedValue([FILE]);
});

describe('GET /api/portal/onboarding/files', () => {
  it("opens a reviewed item's files for an admin and audits the sensitive opening", async () => {
    const res = await get('u1', 'dl_photos');
    expect(res.status).toBe(200);
    expect((await res.json()).files).toEqual([FILE]);
    expect(docGetMock).toHaveBeenCalledWith('userOnboarding', 'u1_dl_photos');
    expect(signMock).toHaveBeenCalledWith('onboarding/u1/dl_photos');
    expect(logAddMock).toHaveBeenCalledWith(
      expect.objectContaining({ targetUid: 'u1', itemId: 'dl_photos', revealedBy: 'owner1', source: 'onboarding-files' })
    );
  });

  it('refuses sensitive files to operations without signing anything', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'ops1', name: 'Ops', isAdmin: false });
    expect((await get('u1', 'dl_photos')).status).toBe(403);
    expect(signMock).not.toHaveBeenCalled();
    expect((await get('u1', 'id_card')).status).toBe(200);
    expect(logAddMock).not.toHaveBeenCalled();
  });

  it('withholds the files when the audit write fails', async () => {
    logAddMock.mockRejectedValueOnce(new Error('down'));
    const res = await get('u1', 'dl_photos');
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('signed');
  });

  it('404s an unknown or non-file item and a bad user id', async () => {
    expect((await get('u1', 'contract')).status).toBe(404);
    expect((await get('u1', 'nope')).status).toBe(404);
    expect((await get('../x', 'dl_photos')).status).toBe(404);
  });

  it('passes on an auth failure', async () => {
    gateMock.mockResolvedValue({ ok: false, error: 'Forbidden', status: 403 });
    expect((await get('u1', 'dl_photos')).status).toBe(403);
    expect(docGetMock).not.toHaveBeenCalled();
  });
});
