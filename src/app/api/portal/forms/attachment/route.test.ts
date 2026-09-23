import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const gate = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const bucket = vi.hoisted(() => ({ getFiles: vi.fn(), prefixes: [] as string[] }));

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedRequester: vi.fn(async () => gate.value),
}));
vi.mock('@/lib/firebase/admin', () => ({
  getOnboardingBucket: () => bucket,
}));

import { GET } from './route';
import { isCleanAttachmentPath } from '@/lib/forms/attachmentPath';

const OWN = 'form-attachments/rep1/sale-proof/slot_abcdef12/';

function get(path: string) {
  return new NextRequest(`http://localhost/api/portal/forms/attachment?path=${encodeURIComponent(path)}`);
}

beforeEach(() => {
  gate.value = { ok: true, uid: 'rep1', name: 'Devon', isManagement: false, isAdmin: false };
  bucket.prefixes = [];
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
