import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { announcementRecipients } = vi.hoisted(() => ({ announcementRecipients: vi.fn() }));

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: vi.fn() }));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: { fake: true } }));
vi.mock('@/lib/announcements/send', () => ({ announcementRecipients }));

import { GET } from './route';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';

const gate = requireVerifiedManagement as unknown as ReturnType<typeof vi.fn>;
const call = () => GET(new NextRequest('http://localhost/api/portal/announcements/recipients'));

beforeEach(() => {
  gate.mockReset();
  announcementRecipients.mockReset();
  announcementRecipients.mockResolvedValue([
    { uid: 'a', tokens: ['1'] },
    { uid: 'b', tokens: ['2', '3'] },
  ]);
});

describe('GET /api/portal/announcements/recipients', () => {
  it.each([
    ['anonymous', { ok: false, error: 'Missing authentication token', status: 401 }, 401],
    ['a rep', { ok: false, error: 'Forbidden: management access required', status: 403 }, 403],
    ['an admin', { ok: true, uid: 'a', name: 'A', isAdmin: true, isOwner: false }, 403],
  ])('refuses %s', async (_who, result, status) => {
    gate.mockResolvedValue(result);
    expect((await call()).status).toBe(status);
    expect(announcementRecipients).not.toHaveBeenCalled();
  });

  it('counts people, not devices', async () => {
    gate.mockResolvedValue({ ok: true, uid: 'w', name: 'Owner', isAdmin: true, isOwner: true });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 2 });
  });
});
