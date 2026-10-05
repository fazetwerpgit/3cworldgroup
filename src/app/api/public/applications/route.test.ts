import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  addApplicationMock,
  appendApplicationRowMock,
  findActivePortalAccountMock,
  notifySubmissionMock,
} = vi.hoisted(() => ({
  addApplicationMock: vi.fn(),
  appendApplicationRowMock: vi.fn(),
  findActivePortalAccountMock: vi.fn(),
  notifySubmissionMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ add: addApplicationMock })),
  },
}));
vi.mock('@/lib/auth/existingAccount', () => ({
  findActivePortalAccount: findActivePortalAccountMock,
}));
vi.mock('@/lib/forms/notifySubmission', () => ({
  notifySubmission: notifySubmissionMock,
}));
vi.mock('@/lib/sheets/applicationsSheet', () => ({
  appendApplicationRow: appendApplicationRowMock,
}));

import { POST } from './route';
import { applicationLimiter } from '@/lib/forms/publicLimiters';

const VALID_APPLICATION = {
  name: 'Jane Rep',
  phone: '(214) 555-0100',
  email: 'jane@example.com',
  city: 'Dallas',
  referredBy: 'Manager',
};

function request(body: unknown, ip = '203.0.113.1') {
  return new NextRequest('http://localhost/api/public/applications', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  applicationLimiter.reset();
  vi.clearAllMocks();
  findActivePortalAccountMock.mockResolvedValue(null);
  addApplicationMock.mockResolvedValue({ id: 'application-1' });
  appendApplicationRowMock.mockResolvedValue(undefined);
  notifySubmissionMock.mockResolvedValue(undefined);
});

describe('POST /api/public/applications', () => {
  it('rejects an active portal account without creating an application', async () => {
    findActivePortalAccountMock.mockResolvedValue({ uid: 'user-1' });

    const response = await POST(request(VALID_APPLICATION));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'You already have a 3C portal account. Sign in instead of re-applying.',
      code: 'account_exists',
    });
    expect(findActivePortalAccountMock).toHaveBeenCalledWith('jane@example.com');
    expect(addApplicationMock).not.toHaveBeenCalled();
    expect(appendApplicationRowMock).not.toHaveBeenCalled();
    expect(notifySubmissionMock).not.toHaveBeenCalled();
  });

  it('creates an application when no active portal account exists', async () => {
    const response = await POST(request(VALID_APPLICATION));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      applicationId: 'application-1',
    });
    expect(addApplicationMock).toHaveBeenCalledTimes(1);
    expect(appendApplicationRowMock).toHaveBeenCalledTimes(1);
    expect(notifySubmissionMock).toHaveBeenCalledWith('application', 'Jane Rep (Dallas)');
  });

  it('validates required fields before checking for an existing account', async () => {
    const response = await POST(request({ ...VALID_APPLICATION, email: '' }));

    expect(response.status).toBe(400);
    expect(findActivePortalAccountMock).not.toHaveBeenCalled();
    expect(addApplicationMock).not.toHaveBeenCalled();
  });

  it('rejects a phone that is not a US number with the field message', async () => {
    for (const phone of ['abc', '555-0100', '214-555-01000', '2-214-555-0100']) {
      const response = await POST(request({ ...VALID_APPLICATION, phone }));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Enter a valid phone number.' });
    }
    expect((await POST(request({ ...VALID_APPLICATION, phone: '+1 214.555.0100' }))).status).toBe(200);
    expect(addApplicationMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed or over-long email with 400 before the account lookup', async () => {
    for (const email of ['not-an-email', 'foo@bar', '@', `${'a'.repeat(175)}@example.com`]) {
      const response = await POST(request({ ...VALID_APPLICATION, email }));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Enter a valid email address.' });
    }
    expect(findActivePortalAccountMock).not.toHaveBeenCalled();
    expect(addApplicationMock).not.toHaveBeenCalled();
  });

  it('answers a null, array or non-JSON body with 400, not 500', async () => {
    for (const body of ['null', '[]', 'not json']) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'The application could not be read. Please try again.' });
    }
  });

  it('caps long values by code point without splitting an emoji', async () => {
    await POST(request({ ...VALID_APPLICATION, name: `${'A'.repeat(199)}😀😀` }));
    const stored = addApplicationMock.mock.calls[0][0].name as string;
    expect(stored).toBe(`${'A'.repeat(199)}😀`);
  });

  it('caps submissions per IP, including account_exists probes, before any lookup', async () => {
    findActivePortalAccountMock.mockResolvedValue({ uid: 'user-1' });
    for (let i = 0; i < 5; i++) {
      expect((await POST(request(VALID_APPLICATION))).status).toBe(409);
    }

    const limited = await POST(request(VALID_APPLICATION));

    expect(limited.status).toBe(429);
    expect(findActivePortalAccountMock).toHaveBeenCalledTimes(5);
    expect((await POST(request(VALID_APPLICATION, '198.51.100.9'))).status).toBe(409);
  });
});
