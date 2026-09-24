import { randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { decryptField } from '@/lib/security/fieldEncryption';

const {
  userDocGetMock,
  progressGetMock,
  sensitiveGetMock,
  gateMock,
  batchSetMock,
  batchCommitMock,
  verifyStorageReferenceMock,
} = vi.hoisted(() => ({
  userDocGetMock: vi.fn(),
  progressGetMock: vi.fn(),
  sensitiveGetMock: vi.fn(),
  gateMock: vi.fn(),
  batchSetMock: vi.fn(),
  batchCommitMock: vi.fn(),
  verifyStorageReferenceMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => {
        if (name === 'users') return { get: userDocGetMock };
        const path = `${name}/${id}`;
        return { path, get: name === 'userSensitive' ? sensitiveGetMock : progressGetMock };
      }),
    })),
    batch: () => ({ set: batchSetMock, commit: batchCommitMock }),
  },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedSelfOrManagement: gateMock,
}));
vi.mock('@/lib/onboarding/verifyStorageReference', () => ({
  verifyStorageReference: verifyStorageReferenceMock,
}));

import { POST } from './route';

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/portal/onboarding/submit', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const DL_FOLDER = 'onboarding/u1/dl_photos/';

function writeTo(path: string) {
  return batchSetMock.mock.calls.find(([ref]) => ref?.path === path);
}

beforeAll(() => {
  process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam Rep', isAdmin: false });
  userDocGetMock.mockResolvedValue({
    exists: true,
    data: () => ({ fieldRole: 'entry_level_rep', isIBO: false, status: 'pending' }),
  });
  progressGetMock.mockResolvedValue({ exists: false, data: () => undefined });
  sensitiveGetMock.mockResolvedValue({ exists: false, data: () => undefined });
  verifyStorageReferenceMock.mockResolvedValue({ ok: true });
  batchCommitMock.mockResolvedValue(undefined);
});

describe('POST /api/portal/onboarding/submit', () => {
  it('rejects a typed reference for a signature item', async () => {
    const response = await POST(
      request({ userId: 'u1', itemId: 'contract', reference: 'typed fake signature' })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'E-signature items are completed by the e-sign provider and do not accept typed references',
    });
    expect(batchSetMock).not.toHaveBeenCalled();
  });

  it('rejects a submission for a user who is no longer pending', async () => {
    userDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ fieldRole: 'entry_rep', isIBO: false, status: 'active' }),
    });

    const response = await POST(request({ userId: 'u1', itemId: 'insurance', reference: 'onboarding/users/u1/insurance/' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Onboarding is closed for this user',
    });
    expect(batchSetMock).not.toHaveBeenCalled();
  });

  it('rejects a management submission on behalf of a user who is no longer pending', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'admin1', name: 'Admin', isAdmin: true });
    userDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ fieldRole: 'entry_rep', isIBO: false, status: 'active' }),
    });

    const response = await POST(request({ userId: 'u1', itemId: 'insurance', reference: 'onboarding/users/u1/insurance/' }));

    expect(response.status).toBe(403);
    expect(batchSetMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/portal/onboarding/submit - driver license', () => {
  it('rejects the license photos without a number when none is on file', async () => {
    const response = await POST(request({ userId: 'u1', itemId: 'dl_photos', reference: DL_FOLDER }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Enter your driver's license number" });
    expect(batchSetMock).not.toHaveBeenCalled();
  });

  it('rejects a number without both photos', async () => {
    verifyStorageReferenceMock.mockResolvedValue({ ok: false, error: 'Missing back.* in the upload folder' });

    const response = await POST(
      request({ userId: 'u1', itemId: 'dl_photos', reference: DL_FOLDER, dlNumber: 'D1234567' })
    );

    expect(response.status).toBe(400);
    expect(batchSetMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed number without writing anything', async () => {
    const response = await POST(
      request({ userId: 'u1', itemId: 'dl_photos', reference: DL_FOLDER, dlNumber: '12' })
    );

    expect(response.status).toBe(400);
    expect(batchSetMock).not.toHaveBeenCalled();
  });

  it('encrypts the number into userSensitive, merges it, and never echoes it', async () => {
    const response = await POST(
      request({ userId: 'u1', itemId: 'dl_photos', reference: DL_FOLDER, dlNumber: 'D1234567' })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('D1234567');

    const sensitiveWrite = writeTo('userSensitive/u1');
    expect(sensitiveWrite).toBeDefined();
    const [, stored, options] = sensitiveWrite!;
    expect(options).toEqual({ merge: true });
    expect(stored.dlNumberEncrypted).not.toContain('D1234567');
    expect(decryptField(stored.dlNumberEncrypted)).toBe('D1234567');
    expect(stored.dlLast4).toBe('4567');
    // A merge that carried SSN keys would clobber the one from the website form.
    expect(stored).not.toHaveProperty('ssnEncrypted');
    expect(stored).not.toHaveProperty('ssnLast4');

    const itemWrite = writeTo('userOnboarding/u1_dl_photos');
    expect(itemWrite?.[1]).toMatchObject({ status: 'submitted', reference: DL_FOLDER });
    expect(JSON.stringify(itemWrite?.[1])).not.toContain('D1234567');
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
  });

  it('accepts the photos alone when a number is already on file', async () => {
    sensitiveGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ dlNumberEncrypted: 'already.on.file', dlLast4: '4567' }),
    });

    const response = await POST(request({ userId: 'u1', itemId: 'dl_photos', reference: DL_FOLDER }));

    expect(response.status).toBe(200);
    expect(writeTo('userSensitive/u1')).toBeUndefined();
    expect(writeTo('userOnboarding/u1_dl_photos')).toBeDefined();
  });
});
