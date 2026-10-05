import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({ submitted: false }));
const save = vi.fn(async (_buffer: Buffer, _opts: { contentType: string }) => {});
const savedPaths: string[] = [];
const deleteFiles = vi.fn(async () => {});
const where = vi.fn(() => ({ limit: () => ({ get: async () => ({ empty: !state.submitted }) }) }));

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
  state.submitted = false;
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
});
