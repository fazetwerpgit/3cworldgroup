import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { add, listGet } = vi.hoisted(() => ({ add: vi.fn(), listGet: vi.fn() }));

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: vi.fn() }));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => {
      expect(name).toBe('announcements');
      return { add, orderBy: () => ({ limit: () => ({ get: listGet }) }) };
    },
  },
}));

import { GET, POST } from './route';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';

const gate = requireVerifiedManagement as unknown as ReturnType<typeof vi.fn>;
const OWNER = { ok: true, uid: 'owner-1', name: 'Owner', isAdmin: true, isOwner: true };
const ADMIN = { ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true, isOwner: false };
const OPS = { ok: true, uid: 'ops-1', name: 'Ops', isAdmin: false, isOwner: false };

const url = 'http://localhost/api/portal/announcements';
const post = (body: unknown) =>
  new NextRequest(url, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

// Far enough ahead to always be bookable, close enough to be within 90 days.
function dayFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
const valid = () => ({ title: 'Screenshot auto-fill', body: 'Log a sale from a screenshot.', sendDate: dayFromNow(3) });

beforeEach(() => {
  gate.mockReset();
  add.mockReset();
  add.mockResolvedValue({ id: 'new-1' });
  listGet.mockReset();
  listGet.mockResolvedValue({ docs: [] });
});

describe('announcements owner gate', () => {
  const cases: Array<[string, unknown, number]> = [
    ['anonymous', { ok: false, error: 'Missing authentication token', status: 401 }, 401],
    ['a rep', { ok: false, error: 'Forbidden: management access required', status: 403 }, 403],
    ['an admin', ADMIN, 403],
    ['operations', OPS, 403],
  ];

  it.each(cases)('refuses %s on GET', async (_who, result, status) => {
    gate.mockResolvedValue(result);
    expect((await GET(new NextRequest(url))).status).toBe(status);
    expect(listGet).not.toHaveBeenCalled();
  });

  it.each(cases)('refuses %s on POST', async (_who, result, status) => {
    gate.mockResolvedValue(result);
    expect((await POST(post(valid()))).status).toBe(status);
    expect(add).not.toHaveBeenCalled();
  });
});

describe('GET /api/portal/announcements', () => {
  it('lists announcements for the owner with the first bookable day', async () => {
    gate.mockResolvedValue(OWNER);
    listGet.mockResolvedValue({
      docs: [
        {
          id: 'a1',
          data: () => ({
            title: 'T',
            body: 'B',
            status: 'sent',
            sendAt: { toDate: () => new Date('2026-09-24T13:00:00Z') },
            sentCount: 41,
            failedCount: 2,
          }),
        },
      ],
    });
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.announcements[0]).toMatchObject({
      id: 'a1',
      status: 'sent',
      sendAt: '2026-09-24T13:00:00.000Z',
      sentCount: 41,
      failedCount: 2,
    });
    expect(json.nextSendDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('POST /api/portal/announcements', () => {
  it('schedules for 8 AM Chicago on the chosen day, stamped with the owner', async () => {
    gate.mockResolvedValue(OWNER);
    const input = valid();
    const res = await POST(post(input));
    expect(res.status).toBe(201);
    const doc = add.mock.calls[0][0];
    expect(doc).toMatchObject({
      title: input.title,
      body: input.body,
      status: 'scheduled',
      createdBy: 'owner-1',
      sentAt: null,
      sentCount: 0,
      failedCount: 0,
    });
    const sendAt = doc.sendAt as Date;
    expect(['13:00', '14:00']).toContain(sendAt.toISOString().slice(11, 16));
  });

  it.each([
    ['a missing title', { title: '' }],
    ['a title over 50', { title: 'x'.repeat(51) }],
    ['a message over 180', { body: 'x'.repeat(181) }],
    ['a bad date', { sendDate: 'tomorrow' }],
    ['a past date', { sendDate: '2020-01-01' }],
    ['a date too far out', { sendDate: dayFromNow(200) }],
  ])('rejects %s', async (_what, patch) => {
    gate.mockResolvedValue(OWNER);
    const res = await POST(post({ ...valid(), ...patch }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
    expect(add).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    gate.mockResolvedValue(OWNER);
    expect((await POST(post('not json'))).status).toBe(400);
  });

  it('ignores extra fields like a forged status or author', async () => {
    gate.mockResolvedValue(OWNER);
    await POST(post({ ...valid(), status: 'sent', createdBy: 'someone-else' }));
    expect(add.mock.calls[0][0]).toMatchObject({ status: 'scheduled', createdBy: 'owner-1' });
  });
});
