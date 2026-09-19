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

const VALID_APPLICATION = {
  name: 'Jane Rep',
  phone: '555-0100',
  email: 'jane@example.com',
  city: 'Dallas',
  referredBy: 'Manager',
};

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/public/applications', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
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
});
