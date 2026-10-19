import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { updateMock, gateMock, getMock, updateUserMock, restampAuthorMock, restampDisplayNameMock } = vi.hoisted(
  () => ({
    updateMock: vi.fn(),
    gateMock: vi.fn(),
    getMock: vi.fn(),
    updateUserMock: vi.fn(),
    restampAuthorMock: vi.fn(),
    restampDisplayNameMock: vi.fn(),
  })
);

const nameTaken = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/users/displayNameTaken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/users/displayNameTaken')>()),
  isDisplayNameTaken: vi.fn(async () => nameTaken.value),
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: vi.fn(() => ({ doc: vi.fn(() => ({ update: updateMock, get: getMock })) })) },
  adminAuth: { updateUser: updateUserMock },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: gateMock }));
vi.mock('@/lib/chat/restampAuthor', () => ({ restampAuthor: restampAuthorMock }));
vi.mock('@/lib/users/restampDisplayName', () => ({ restampDisplayName: restampDisplayNameMock }));

import { PUT } from './route';

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/portal/profile', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockResolvedValue({ ok: true, uid: 'u1' });
  updateMock.mockResolvedValue(undefined);
  getMock.mockResolvedValue({ get: (key: string) => (key === 'displayName' ? 'Sam' : undefined) });
  updateUserMock.mockResolvedValue(undefined);
  restampAuthorMock.mockResolvedValue(undefined);
  restampDisplayNameMock.mockResolvedValue(undefined);
});

describe('PUT /api/portal/profile shirt size', () => {
  it('rejects a size that is not on the list', async () => {
    for (const shirtSize of ['XXL', 'l', '', 5]) {
      const response = await PUT(request({ displayName: 'Sam', shirtSize }));
      expect(response.status).toBe(400);
    }
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('saves a listed size', async () => {
    const response = await PUT(request({ displayName: 'Sam', shirtSize: '3XL' }));

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ shirtSize: '3XL' }));
  });

  it('leaves the size alone when it is not sent', async () => {
    const response = await PUT(request({ displayName: 'Sam', phone: '555' }));

    expect(response.status).toBe(200);
    expect(updateMock.mock.calls[0][0]).not.toHaveProperty('shirtSize');
  });
});

describe('PUT /api/portal/profile display name', () => {
  it('rejects a blank or non-string name without saving', async () => {
    for (const displayName of ['   ', '', 123, null]) {
      const response = await PUT(request({ displayName }));
      expect(response.status).toBe(400);
    }
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('carries a changed name to Auth, chat and denormalized copies', async () => {
    const response = await PUT(request({ displayName: '  Samantha Tester ' }));

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Samantha Tester' }));
    expect(updateUserMock).toHaveBeenCalledWith('u1', { displayName: 'Samantha Tester' });
    expect(restampAuthorMock).toHaveBeenCalledWith('u1', { authorName: 'Samantha Tester' });
    expect(restampDisplayNameMock).toHaveBeenCalledWith('u1', 'Samantha Tester');
  });

  it("refuses an exact copy of another user's name, and writes nothing", async () => {
    nameTaken.value = true;
    try {
      const response = await PUT(request({ displayName: 'Jacob Myers' }));
      expect(response.status).toBe(400);
      expect(updateMock).not.toHaveBeenCalled();
    } finally {
      nameTaken.value = false;
    }
  });

  it('skips the restamps when the name is unchanged', async () => {
    const response = await PUT(request({ displayName: 'Sam', phone: '555' }));

    expect(response.status).toBe(200);
    expect(updateUserMock).not.toHaveBeenCalled();
    expect(restampAuthorMock).not.toHaveBeenCalled();
    expect(restampDisplayNameMock).not.toHaveBeenCalled();
  });
});

describe('PUT /api/portal/profile input limits', () => {
  it('rejects a name over 100 characters without saving or restamping', async () => {
    const response = await PUT(request({ displayName: 'A'.repeat(101) }));

    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
    expect(restampAuthorMock).not.toHaveBeenCalled();
    expect(restampDisplayNameMock).not.toHaveBeenCalled();
  });

  it('accepts a 100-character name', async () => {
    const response = await PUT(request({ displayName: 'A'.repeat(100) }));

    expect(response.status).toBe(200);
  });

  it('rejects a name the chat filter would refuse or mask', async () => {
    const response = await PUT(request({ displayName: 'fuck you' }));

    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
    expect(restampAuthorMock).not.toHaveBeenCalled();
  });

  it('returns 400, not 500, for a non-string or oversized phone', async () => {
    for (const phone of [null, 5, { a: 1 }, '5'.repeat(41)]) {
      const response = await PUT(request({ displayName: 'Sam', phone }));
      expect(response.status).toBe(400);
    }
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('still saves a normal phone', async () => {
    const response = await PUT(request({ displayName: 'Sam', phone: ' (555) 010-0100 ' }));

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ phone: '(555) 010-0100' }));
  });
});
