import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const gate = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const bucket = vi.hoisted(() => ({ getFiles: vi.fn(), prefixes: [] as string[] }));
const sales = vi.hoisted(() => ({ docs: {} as Record<string, Record<string, unknown>> }));

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedRequester: vi.fn(async () => gate.value),
}));
vi.mock('@/lib/firebase/admin', () => ({
  getOnboardingBucket: () => bucket,
  adminDb: {
    collection: () => ({
      doc: (id: string) => ({
        get: async () => ({ exists: id in sales.docs, data: () => sales.docs[id] }),
      }),
    }),
  },
}));

import { GET } from './route';
import { isCleanAttachmentPath } from '@/lib/forms/attachmentPath';

const OWN = 'form-attachments/rep1/sale-proof/slot_abcdef12/';

function get(path: string, saleId?: string) {
  const sale = saleId ? `&saleId=${encodeURIComponent(saleId)}` : '';
  return new NextRequest(`http://localhost/api/portal/forms/attachment?path=${encodeURIComponent(path)}${sale}`);
}

beforeEach(() => {
  gate.value = { ok: true, uid: 'rep1', name: 'Devon', isManagement: false, isAdmin: false };
  bucket.prefixes = [];
  sales.docs = {};
  bucket.getFiles.mockReset();
  bucket.getFiles.mockImplementation(async ({ prefix }: { prefix: string }) => {
    bucket.prefixes.push(prefix);
    return [[{ getSignedUrl: async () => ['https://signed.example/file'] }]];
  });
});

describe('GET /api/portal/forms/attachment', () => {
  it('signs a rep’s own upload', async () => {
    const response = await GET(get(OWN));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: 'https://signed.example/file' });
    expect(bucket.prefixes).toEqual([OWN]);
  });

  it('refuses a rep another user’s upload', async () => {
    const response = await GET(get('form-attachments/rep2/sale-proof/slot_abcdef12/'));

    expect(response.status).toBe(403);
    expect(bucket.getFiles).not.toHaveBeenCalled();
  });

  it('refuses a uid that only shares a prefix with the rep’s', async () => {
    const response = await GET(get('form-attachments/rep10/sale-proof/slot_abcdef12/'));

    expect(response.status).toBe(403);
  });

  it.each([
    'form-attachments/rep1/../rep2/sale-proof/slot_abcdef12/',
    'form-attachments/rep1/./sale-proof/',
    'form-attachments/rep1//sale-proof/',
    'form-attachments/rep1/sale-proof/%2e%2e/',
    'form-attachments/rep1\\..\\rep2/',
    'onboarding/rep1/',
  ])('400s a traversal or foreign path: %s', async (path) => {
    const response = await GET(get(path));

    expect(response.status).toBe(400);
    expect(bucket.getFiles).not.toHaveBeenCalled();
  });

  describe('proof an admin attached to the rep’s sale', () => {
    const ADMIN_PROOF = 'form-attachments/admin1/sale-proof/slot_ffffff12/';

    it('signs it for the rep who owns the sale', async () => {
      sales.docs.sale1 = { salesRepId: 'rep1', proofScreenshotPaths: [OWN, ADMIN_PROOF] };

      const response = await GET(get(ADMIN_PROOF, 'sale1'));

      expect(response.status).toBe(200);
      expect(bucket.prefixes).toEqual([ADMIN_PROOF]);
    });

    it('refuses it on a sale the rep does not own', async () => {
      sales.docs.sale1 = { salesRepId: 'rep2', proofScreenshotPaths: [ADMIN_PROOF] };

      const response = await GET(get(ADMIN_PROOF, 'sale1'));

      expect(response.status).toBe(403);
      expect(bucket.getFiles).not.toHaveBeenCalled();
    });

    it('refuses a path the sale does not store', async () => {
      sales.docs.sale1 = { salesRepId: 'rep1', proofScreenshotPaths: [OWN] };

      const response = await GET(get(ADMIN_PROOF, 'sale1'));

      expect(response.status).toBe(403);
    });

    it('refuses a non-proof upload even if the sale stores it', async () => {
      const dispute = 'form-attachments/admin1/payroll-dispute/u1/';
      sales.docs.sale1 = { salesRepId: 'rep1', proofScreenshotPaths: [dispute] };

      const response = await GET(get(dispute, 'sale1'));

      expect(response.status).toBe(403);
    });

    it('refuses it without a sale or for a missing sale', async () => {
      expect((await GET(get(ADMIN_PROOF))).status).toBe(403);
      expect((await GET(get(ADMIN_PROOF, 'nope'))).status).toBe(403);
    });
  });

  it('keeps management on any user’s uploads', async () => {
    gate.value = { ok: true, uid: 'ops1', name: 'Ops', isManagement: true, isAdmin: false };

    const response = await GET(get('form-attachments/rep2/payroll-dispute/u1/'));

    expect(response.status).toBe(200);
  });

  it('passes an auth failure through', async () => {
    gate.value = { ok: false, error: 'Unauthorized', status: 401 };

    const response = await GET(get(OWN));

    expect(response.status).toBe(401);
  });
});

describe('isCleanAttachmentPath', () => {
  it('accepts a plain folder with or without the trailing slash', () => {
    expect(isCleanAttachmentPath(OWN)).toBe(true);
    expect(isCleanAttachmentPath(OWN.slice(0, -1))).toBe(true);
  });

  it('rejects the bare root', () => {
    expect(isCleanAttachmentPath('form-attachments/')).toBe(false);
  });
});
