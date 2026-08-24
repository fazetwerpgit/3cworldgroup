import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const gateMock = vi.hoisted(() => vi.fn());
const userDocGetMock = vi.hoisted(() => vi.fn());
const validateUploadMock = vi.hoisted(() => vi.fn());
const buildFolderPathMock = vi.hoisted(() => vi.fn());
const saveMock = vi.hoisted(() => vi.fn(async () => undefined));
const bucketMock = vi.hoisted(() => ({
  file: vi.fn((path: string) => ({ path, save: saveMock })),
}));

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: gateMock }));
vi.mock('@/lib/onboarding/uploads', () => ({
  validateUpload: validateUploadMock,
  buildFolderPath: buildFolderPathMock,
}));
vi.mock('@/lib/firebase/admin', () => ({
  getOnboardingBucket: vi.fn(() => bucketMock),
  adminDb: { collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: userDocGetMock })) })) },
}));

import { POST } from './route';

function requestWithForm(fields: Record<string, string>, file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set('file', file);
  return new NextRequest('http://localhost/api/portal/onboarding/upload', {
    method: 'POST',
    body: form,
  });
}

beforeEach(() => {
  gateMock.mockReset();
  validateUploadMock.mockReset();
  buildFolderPathMock.mockReset();
  saveMock.mockClear();
  bucketMock.file.mockClear();
  userDocGetMock.mockReset();
  userDocGetMock.mockResolvedValue({ exists: true, data: () => ({ status: 'pending' }) });
});

describe('POST /api/portal/onboarding/upload', () => {
  it('rejects before reading the multipart body when verification fails', async () => {
    gateMock.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    const request = requestWithForm({ userId: 'attacker', itemId: 'insurance' });
    const formData = vi.spyOn(request, 'formData');

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(formData).not.toHaveBeenCalled();
  });

  it('uses the verified UID for the folder instead of the body userId', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'verified-user', name: 'User', email: 'u@example.com' });
    validateUploadMock.mockReturnValue({ ok: true, fileBase: 'photo', ext: 'jpg' });
    buildFolderPathMock.mockReturnValue('onboarding/users/verified-user/insurance/');

    const response = await POST(requestWithForm({ userId: 'verified-user', itemId: 'insurance' }));

    expect(response.status).toBe(200);
    expect(validateUploadMock).toHaveBeenCalledWith({
      itemId: 'insurance',
      slot: null,
      mime: 'image/jpeg',
      size: 5,
    });
    expect(buildFolderPathMock).toHaveBeenCalledWith(
      { kind: 'user', userId: 'verified-user' },
      'insurance'
    );
    expect(bucketMock.file).toHaveBeenCalledWith('onboarding/users/verified-user/insurance/photo.jpg');
    expect(saveMock).toHaveBeenCalled();
  });

  it('rejects a mismatched body userId without upload or persistence side effects', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'verified-user', name: 'User', email: 'u@example.com' });

    const response = await POST(requestWithForm({ userId: 'someone-else', itemId: 'insurance' }));

    expect(response.status).toBe(400);
    expect(validateUploadMock).not.toHaveBeenCalled();
    expect(buildFolderPathMock).not.toHaveBeenCalled();
    expect(bucketMock.file).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('rejects an upload from a user who is no longer pending, before reading the body', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'verified-user', name: 'User', email: 'u@example.com' });
    userDocGetMock.mockResolvedValue({ exists: true, data: () => ({ status: 'active' }) });
    const request = requestWithForm({ userId: 'verified-user', itemId: 'insurance' });
    const formData = vi.spyOn(request, 'formData');

    const response = await POST(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Onboarding is closed for this user',
    });
    expect(formData).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });
});
