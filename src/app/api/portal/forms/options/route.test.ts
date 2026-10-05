import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { setMock } = vi.hoisted(() => ({ setMock: vi.fn(async () => undefined) }));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: vi.fn(() => ({ doc: vi.fn(() => ({ set: setMock })) })) },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: vi.fn(),
  requireVerifiedAdmin: vi.fn(async () => ({ ok: true, uid: 'admin-1', name: 'Admin' })),
}));
vi.mock('@/lib/forms/resolveFormOptions', () => ({ getResolvedFormOptions: vi.fn() }));

import { PUT } from './route';

function put(body: Record<string, unknown>) {
  return PUT(
    new NextRequest('http://localhost/api/portal/forms/options', { method: 'PUT', body: JSON.stringify(body) })
  );
}

beforeEach(() => vi.clearAllMocks());

describe('PUT /api/portal/forms/options', () => {
  it('refuses to save an empty list, which would block every submission of that form', async () => {
    const response = await put({ key: 'expediteReasons', values: [] });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/at least one option/);
    expect(setMock).not.toHaveBeenCalled();
  });

  it('saves a non-empty list', async () => {
    const response = await put({ key: 'expediteReasons', values: [' Medical ', 'Medical'] });

    expect(response.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ values: ['Medical'], updatedBy: 'admin-1' }));
  });
});
