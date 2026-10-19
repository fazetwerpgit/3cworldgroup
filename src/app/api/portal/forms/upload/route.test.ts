import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({ submitted: false, saleFolders: [] as string[] }));
const save = vi.fn(async (_buffer: Buffer, _opts: { contentType: string }) => {});
const savedPaths: string[] = [];
const deleteFiles = vi.fn(async () => {});
const where = vi.fn((field: string, _op: string, value: unknown) => ({
  limit: () => ({
    get: async () => ({
      empty:
        field === 'proofScreenshotPaths' || field === 'proofScreenshotPath'
          ? !state.saleFolders.includes(String(value))
          : !state.submitted,
    }),
  }),
}));

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: vi.fn(async () => ({ ok: true, uid: 'u1', name: 'Rep One', email: 'rep@x.com' })),
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ where }) },
  getOnboardingBucket: () => ({
    deleteFiles,
    file: (path: string) => {
      savedPaths.push(path);
      return { save };
    },
  }),
}));

import { POST } from './route';
import { resetUserRateLimits } from '@/lib/userRateLimits';

const UPLOAD_ID = 'a'.repeat(32);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

function req(file: File, uploadId = UPLOAD_ID) {
  const form = new FormData();
  form.set('formType', 'payroll-dispute');
  form.set('slot', '');
  form.set('uploadId', uploadId);
  form.set('file', file);
  return new NextRequest('http://localhost/api/portal/forms/upload', { method: 'POST', body: form });
}

beforeEach(() => {
  resetUserRateLimits();
  state.submitted = false;
  state.saleFolders = [];
  save.mockClear();
  deleteFiles.mockClear();
  where.mockClear();
  savedPaths.length = 0;
});

describe('POST /api/portal/forms/upload', () => {
  it('stores the type the bytes show, not the declared one', async () => {
    const res = await POST(req(new File([PNG], 'proof.pdf', { type: 'application/pdf' })));
    expect(res.status).toBe(200);
    expect(savedPaths).toEqual([`form-attachments/u1/payroll-dispute/${UPLOAD_ID}/file.png`]);
    expect(save.mock.calls[0][1].contentType).toBe('image/png');
  });

  it('rejects a file whose bytes are not an accepted type', async () => {
    const res = await POST(req(new File(['<html></html>'], 'proof.png', { type: 'image/png' })));
    expect(res.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it("won't replace the proof of a request that was already sent", async () => {
    state.submitted = true;
    const res = await POST(req(new File([PNG], 'proof.png', { type: 'image/png' })));
    expect(res.status).toBe(409);
    expect(where).toHaveBeenCalledWith('uploadId', '==', UPLOAD_ID);
    expect(deleteFiles).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  describe('sale proof', () => {
    const SLOT = 'sale123_abcdef';
    const FOLDER = `form-attachments/u1/sale-proof/${SLOT}/`;
    function saleProofReq() {
      const form = new FormData();
      form.set('formType', 'sale-proof');
      form.set('slot', SLOT);
      form.set('file', new File([PNG], 'proof.png', { type: 'image/png' }));
      return new NextRequest('http://localhost/api/portal/forms/upload', { method: 'POST', body: form });
    }

    it('stores a new screenshot in a fresh slot', async () => {
      const res = await POST(saleProofReq());
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ path: FOLDER });
    });

    it("won't swap the screenshot of a logged (or approved) sale", async () => {
      state.saleFolders = [FOLDER];
      const res = await POST(saleProofReq());
      expect(res.status).toBe(409);
      expect(deleteFiles).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });
  });

  it('answers 429 once a caller passes the per-minute upload cap', async () => {
    let last = 200;
    for (let i = 0; i < 31; i += 1) {
      last = (await POST(req(new File([PNG], 'proof.png', { type: 'image/png' })))).status;
    }
    expect(last).toBe(429);
  });
});
