import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { updateMock, gateMock } = vi.hoisted(() => ({
  updateMock: vi.fn(),
  gateMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: vi.fn(() => ({ doc: vi.fn(() => ({ update: updateMock })) })) },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: gateMock }));

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
