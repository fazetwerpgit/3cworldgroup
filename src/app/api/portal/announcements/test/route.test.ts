import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { sendTestToSelf } = vi.hoisted(() => ({ sendTestToSelf: vi.fn() }));

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: vi.fn() }));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: { fake: true } }));
vi.mock('@/lib/announcements/send', () => ({ sendTestToSelf }));

import { POST } from './route';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';

const gate = requireVerifiedManagement as unknown as ReturnType<typeof vi.fn>;
const OWNER = { ok: true, uid: 'owner-1', name: 'Owner', isAdmin: true, isOwner: true };

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/portal/announcements/test', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  gate.mockReset();
  sendTestToSelf.mockReset();
  sendTestToSelf.mockResolvedValue({ devices: 2, delivered: 2 });
});

describe('POST /api/portal/announcements/test', () => {
  it.each([
    ['anonymous', { ok: false, error: 'Missing authentication token', status: 401 }, 401],
    ['a rep', { ok: false, error: 'Forbidden: management access required', status: 403 }, 403],
    ['an admin', { ok: true, uid: 'a', name: 'A', isAdmin: true, isOwner: false }, 403],
  ])('refuses %s', async (_who, result, status) => {
    gate.mockResolvedValue(result);
    expect((await post({ title: 'T', body: 'B' })).status).toBe(status);
    expect(sendTestToSelf).not.toHaveBeenCalled();
  });

  it("sends only to the verified caller's devices, whatever the body says", async () => {
    gate.mockResolvedValue(OWNER);
    const res = await post({ title: 'T', body: 'B', uid: 'rep-9', userIds: ['rep-9'] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ devices: 2, delivered: 2 });
    expect(sendTestToSelf).toHaveBeenCalledTimes(1);
    expect(sendTestToSelf).toHaveBeenCalledWith({ fake: true }, 'owner-1', { title: 'T', body: 'B' });
  });

  it('validates the message', async () => {
    gate.mockResolvedValue(OWNER);
    expect((await post({ title: '', body: 'B' })).status).toBe(400);
    expect((await post({ title: 'T', body: 'x'.repeat(181) })).status).toBe(400);
    expect(sendTestToSelf).not.toHaveBeenCalled();
  });

  it('says so when the owner has no devices with notifications on', async () => {
    gate.mockResolvedValue(OWNER);
    sendTestToSelf.mockResolvedValue({ devices: 0, delivered: 0 });
    expect((await post({ title: 'T', body: 'B' })).status).toBe(409);
  });
});
