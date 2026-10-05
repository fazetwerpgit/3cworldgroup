import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { create, sendAnnouncement, docIds, stored, txUpdate } = vi.hoisted(() => ({
  create: vi.fn(),
  sendAnnouncement: vi.fn(),
  docIds: [] as string[],
  // Status of the doc an ALREADY_EXISTS retry reads.
  stored: { status: 'sent' } as Record<string, unknown>,
  txUpdate: vi.fn(),
}));

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: vi.fn() }));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => {
      expect(name).toBe('announcements');
      return {
        doc: (id: string) => {
          docIds.push(id);
          return { create };
        },
      };
    },
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ get: async () => ({ get: (field: string) => stored[field] }), update: txUpdate }),
  },
}));
vi.mock('@/lib/announcements/send', () => ({ ANNOUNCEMENTS: 'announcements', sendAnnouncement }));

import { POST } from './route';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { adminDb } from '@/lib/firebase/admin';

const gate = requireVerifiedManagement as unknown as ReturnType<typeof vi.fn>;
const OWNER = { ok: true, uid: 'owner-1', name: 'Owner', isAdmin: true, isOwner: true };
const REQUEST_ID = '6f1c1c9e-2a8b-4d3e-9f10-0a1b2c3d4e5f';
const valid = { title: 'Screenshot auto-fill', body: 'Log a sale from a screenshot.', requestId: REQUEST_ID };

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/portal/announcements/send-now', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  gate.mockReset();
  create.mockReset();
  create.mockResolvedValue(undefined);
  sendAnnouncement.mockReset();
  sendAnnouncement.mockResolvedValue({ status: 'sent', sentCount: 42, failedCount: 1 });
  docIds.length = 0;
});

describe('POST /api/portal/announcements/send-now', () => {
  it.each([
    ['anonymous', { ok: false, error: 'Missing authentication token', status: 401 }, 401],
    ['a rep', { ok: false, error: 'Forbidden: management access required', status: 403 }, 403],
    ['an admin', { ok: true, uid: 'a', name: 'A', isAdmin: true, isOwner: false }, 403],
    ['operations', { ok: true, uid: 'o', name: 'O', isAdmin: false, isOwner: false }, 403],
  ])('refuses %s', async (_who, result, status) => {
    gate.mockResolvedValue(result);
    expect((await post(valid)).status).toBe(status);
    expect(create).not.toHaveBeenCalled();
    expect(sendAnnouncement).not.toHaveBeenCalled();
  });

  it.each([
    ['no requestId', { requestId: undefined }],
    ['a malformed requestId', { requestId: '../x' }],
    ['an empty title', { title: '' }],
    ['a message over 180', { body: 'x'.repeat(181) }],
  ])('rejects %s', async (_what, patch) => {
    gate.mockResolvedValue(OWNER);
    expect((await post({ ...valid, ...patch })).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('stores it as due now under the requestId, then sends through the shared path', async () => {
    gate.mockResolvedValue(OWNER);
    const before = Date.now();
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: REQUEST_ID, sentCount: 42, failedCount: 1 });

    expect(docIds).toEqual([REQUEST_ID]);
    const doc = create.mock.calls[0][0];
    expect(doc).toMatchObject({ title: valid.title, body: valid.body, status: 'scheduled', createdBy: 'owner-1' });
    expect((doc.sendAt as Date).getTime()).toBeGreaterThanOrEqual(before);

    const [db, id, now] = sendAnnouncement.mock.calls[0];
    expect(db).toBe(adminDb);
    expect(id).toBe(REQUEST_ID);
    expect(now).toEqual(doc.sendAt);
  });

  it('never sends twice for a repeated requestId', async () => {
    gate.mockResolvedValue(OWNER);
    stored.status = 'sent';
    create.mockRejectedValue(Object.assign(new Error('ALREADY_EXISTS'), { code: 6 }));
    const res = await post(valid);
    expect(res.status).toBe(409);
    expect(sendAnnouncement).not.toHaveBeenCalled();
  });

  it('retries a send that failed, under the same requestId', async () => {
    gate.mockResolvedValue(OWNER);
    stored.status = 'failed';
    txUpdate.mockClear();
    create.mockRejectedValue(Object.assign(new Error('ALREADY_EXISTS'), { code: 6 }));
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(txUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'scheduled' }));
    expect(sendAnnouncement).toHaveBeenCalledTimes(1);
  });

  it('refuses to retry a failed send whose pushes had already started', async () => {
    gate.mockResolvedValue(OWNER);
    stored.status = 'failed';
    stored.fanOutStarted = true;
    create.mockRejectedValue(Object.assign(new Error('ALREADY_EXISTS'), { code: 6 }));
    const res = await post(valid);
    expect(res.status).toBe(409);
    expect(sendAnnouncement).not.toHaveBeenCalled();
    delete stored.fanOutStarted;
  });

  it('409s when the claim was lost to another run', async () => {
    gate.mockResolvedValue(OWNER);
    sendAnnouncement.mockResolvedValue({ status: 'skipped' });
    expect((await post(valid)).status).toBe(409);
  });

  it('500s when the send fails', async () => {
    gate.mockResolvedValue(OWNER);
    sendAnnouncement.mockResolvedValue({ status: 'failed', error: 'FCM down' });
    expect((await post(valid)).status).toBe(500);
  });
});
