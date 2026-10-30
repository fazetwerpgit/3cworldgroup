import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getInviteByTokenMock = vi.hoisted(() => vi.fn());
const saveMock = vi.hoisted(() => vi.fn(async () => undefined));
const bucketMock = vi.hoisted(() => ({
  file: vi.fn((path: string) => ({ path, save: saveMock, delete: vi.fn(async () => undefined) })),
  getFiles: vi.fn(async () => [[]]),
}));

vi.mock('@/lib/recruiting/inviteLookup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/recruiting/inviteLookup')>()),
  getInviteByToken: getInviteByTokenMock,
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {},
  getOnboardingBucket: vi.fn(() => bucketMock),
}));

import { POST } from './route';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n');
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');

function upload(file: File, itemId = 'w9') {
  const form = new FormData();
  form.set('itemId', itemId);
  form.set('file', file);
  const request = new NextRequest('http://localhost/api/public/onboarding/tok/upload', {
    method: 'POST',
    body: form,
  });
  return POST(request, { params: Promise.resolve({ token: 'tok' }) });
}

beforeEach(() => {
  getInviteByTokenMock.mockReset();
  getInviteByTokenMock.mockResolvedValue({ id: 'inv1', data: { status: 'in_progress' } });
  saveMock.mockClear();
  bucketMock.file.mockClear();
});

describe('POST /api/public/onboarding/[token]/upload', () => {
  it('refuses files for a rejected invite without storing anything', async () => {
    getInviteByTokenMock.mockResolvedValue({ id: 'inv1', data: { status: 'rejected' } });
    const response = await upload(new File([PDF], 'w9.pdf', { type: 'application/pdf' }));
    expect(response.status).toBe(409);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('refuses files for a cancelled invite with the cancelled message', async () => {
    getInviteByTokenMock.mockResolvedValue({ id: 'inv1', data: { status: 'cancelled' } });
    const response = await upload(new File([PDF], 'w9.pdf', { type: 'application/pdf' }));
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('cancelled') });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('refuses a file declared as a PDF whose bytes are not an accepted type', async () => {
    const response = await upload(new File([HTML], 'w9.pdf', { type: 'application/pdf' }));
    expect(response.status).toBe(400);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('stores the sniffed type and extension, not the declared ones', async () => {
    const response = await upload(new File([PNG], 'w9.pdf', { type: 'application/pdf' }));
    expect(response.status).toBe(200);
    expect(bucketMock.file).toHaveBeenCalledWith('onboarding/invite_inv1/w9/file.png');
    expect(saveMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ contentType: 'image/png' }));
  });

  it('refuses a real PDF for an images-only item', async () => {
    const form = new FormData();
    form.set('itemId', 'dl_photos');
    form.set('slot', 'front');
    form.set('file', new File([PDF], 'front.jpg', { type: 'image/jpeg' }));
    const response = await POST(
      new NextRequest('http://localhost/api/public/onboarding/tok/upload', { method: 'POST', body: form }),
      { params: Promise.resolve({ token: 'tok' }) }
    );
    expect(response.status).toBe(400);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('accepts a real PDF for an open invite', async () => {
    const response = await upload(new File([PDF], 'w9.pdf', { type: 'application/pdf' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path: 'onboarding/invite_inv1/w9/' });
    expect(saveMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ contentType: 'application/pdf' }));
  });
});
