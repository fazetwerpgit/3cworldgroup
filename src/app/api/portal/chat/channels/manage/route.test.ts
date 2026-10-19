import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const firestore = vi.hoisted(() => {
  type DocData = Record<string, unknown>;
  const channels = new Map<string, DocData>();
  const messages = new Map<string, Map<string, DocData>>();
  const writes: Array<{ id: string; data: DocData }> = [];
  const batchDeletes: string[] = [];

  const users = new Map<string, DocData>([
    ['admin-1', { status: 'active', role: 'admin' }],
    ['ops-1', { status: 'active', role: 'operations' }],
    ['rep-1', { status: 'active', role: 'entry_rep' }],
    ['manager-1', { status: 'active', role: 'entry_rep', fieldRole: 'l1_manager' }],
    ['inactive-1', { status: 'inactive', role: 'admin' }],
  ]);

  function makeDoc(id: string, data: DocData) {
    return {
      id,
      ref: { path: id },
      exists: true,
      data: (): DocData => data,
    };
  }

  function channelDoc(id: string) {
    return {
      get: vi.fn(async () => {
        const data = channels.get(id);
        return data ? makeDoc(id, data) : { id, exists: false, data: (): undefined => undefined };
      }),
      set: vi.fn(async (data: DocData, options?: { merge?: boolean }) => {
        const next = options?.merge ? { ...(channels.get(id) || {}), ...data } : data;
        channels.set(id, next);
        writes.push({ id, data });
      }),
      delete: vi.fn(async () => {
        channels.delete(id);
      }),
      collection: vi.fn((name: string) => {
        if (name !== 'messages') throw new Error(`Unexpected subcollection ${name}`);
        return {
          limit: vi.fn(() => ({
            get: vi.fn(async () => {
              const channelMessages = messages.get(id) || new Map<string, DocData>();
              const docs = [...channelMessages.entries()].slice(0, 400).map(([messageId, data]) => ({
                id: messageId,
                ref: { channelId: id, messageId },
                data: () => data,
              }));
              return { empty: docs.length === 0, docs };
            }),
          })),
        };
      }),
    };
  }

  const adminDb = {
    collection: vi.fn((name: string) => {
      if (name === 'users') {
        return {
          where: vi.fn((field: string, op: string, value: string) => ({
            get: vi.fn(async () => ({
              docs: [...users.entries()]
                .filter(([, data]) => data[field] === value && op === '==')
                .map(([id, data]) => makeDoc(id, data)),
            })),
          })),
        };
      }
      if (name === 'chatChannels') {
        return {
          orderBy: vi.fn(() => ({
            get: vi.fn(async () => ({
              docs: [...channels.entries()]
                .sort((a, b) => Number(a[1].order || 0) - Number(b[1].order || 0))
                .map(([id, data]) => makeDoc(id, data)),
            })),
          })),
          doc: vi.fn((id: string) => channelDoc(id)),
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    }),
    batch: vi.fn(() => ({
      delete: vi.fn((ref: { channelId: string; messageId: string }) => {
        messages.get(ref.channelId)?.delete(ref.messageId);
        batchDeletes.push(`${ref.channelId}/${ref.messageId}`);
      }),
      commit: vi.fn(async () => undefined),
    })),
  };

  function reset() {
    channels.clear();
    messages.clear();
    writes.length = 0;
    batchDeletes.length = 0;
    adminDb.collection.mockClear();
    adminDb.batch.mockClear();
  }

  return { adminDb, channels, messages, writes, batchDeletes, reset };
});

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedAdmin: vi.fn(),
}));

const storage = vi.hoisted(() => {
  const deleted: string[] = [];
  const getOnboardingBucket = vi.fn(() => ({
    file: (path: string) => ({
      delete: vi.fn(async () => {
        deleted.push(path);
      }),
    }),
  }));
  return { deleted, getOnboardingBucket };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: firestore.adminDb,
  getOnboardingBucket: storage.getOnboardingBucket,
}));

const preserveReportedEvidence = vi.hoisted(() =>
  vi.fn(async (_channelId: string, _messageId: string, _attachment: unknown): Promise<boolean> => true)
);
vi.mock('@/lib/chat/evidence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/chat/evidence')>()),
  preserveReportedEvidence,
}));

import { DELETE, GET, PATCH, POST } from './route';
import { requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';

const mockGate = requireVerifiedAdmin as unknown as ReturnType<typeof vi.fn>;

function req(method: string, body: unknown) {
  return new NextRequest('http://localhost/api/portal/chat/channels/manage', {
    method,
    body: JSON.stringify(body),
  });
}

const ADMIN = { ok: true, uid: 'admin-1', name: 'Admin One' };
const JACOB = { ok: true, uid: 'bQWKezQmd1P9Yf3GzOdXXBkDzj93', name: 'Jacob' };

const BUCKET = 'test-bucket';
function chatUrl(channelId: string, name: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(`chat/${channelId}/${name}`)}?alt=media&token=t`;
}

beforeEach(() => {
  firestore.reset();
  mockGate.mockReset();
  storage.deleted.length = 0;
  preserveReportedEvidence.mockReset();
  preserveReportedEvidence.mockResolvedValue(true);
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = BUCKET;
});

describe('/api/portal/chat/channels/manage', () => {
  it('POST rejects non-admin callers and does not write', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Forbidden: admin access required', status: 403 });

    const res = await POST(req('POST', { name: 'Ops', description: '', audience: 'platform' }));

    expect(res.status).toBe(403);
    expect(firestore.writes).toHaveLength(0);
  });

  it('POST creates a channel with computed memberIds and audience', async () => {
    mockGate.mockResolvedValue(ADMIN);
    firestore.channels.set('all-company', { id: 'all-company', name: 'All Company', audience: 'all', order: 1, active: true });

    const res = await POST(req('POST', { name: 'Ops Chat', description: 'Back office only', audience: 'platform' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ success: true, id: 'ops-chat' });
    expect(firestore.channels.get('ops-chat')).toMatchObject({
      id: 'ops-chat',
      name: 'Ops Chat',
      description: 'Back office only',
      audience: 'platform',
      order: 2,
      active: true,
      createdBy: 'admin-1',
      memberIds: ['admin-1', 'ops-1'],
    });
  });

  it('PATCH recomputes memberIds when audience changes', async () => {
    mockGate.mockResolvedValue(ADMIN);
    firestore.channels.set('training', {
      id: 'training',
      name: 'Training',
      description: '',
      audience: 'all',
      order: 1,
      active: true,
      memberIds: ['admin-1', 'ops-1', 'rep-1', 'manager-1'],
    });

    const res = await PATCH(req('PATCH', { id: 'training', audience: 'managers' }));

    expect(res.status).toBe(200);
    expect(firestore.channels.get('training')).toMatchObject({
      audience: 'managers',
      memberIds: ['admin-1', 'ops-1', 'manager-1'],
    });
  });

  it('PATCH refuses an audience change on the demo sandbox so real people never land in its memberIds', async () => {
    mockGate.mockResolvedValue(JACOB);
    firestore.channels.set('app-review', {
      id: 'app-review', name: 'App Review', description: '', audience: 'all', order: 99, active: true,
      demoSandbox: true, memberIds: ['demo', 'admin-1'],
    });

    const res = await PATCH(req('PATCH', { id: 'app-review', audience: 'all' }));

    expect(res.status).toBe(400);
    expect(firestore.channels.get('app-review')).toMatchObject({ memberIds: ['demo', 'admin-1'] });
  });

  it('GET lists the demo sandbox for Jacob only, never for another admin', async () => {
    firestore.channels.set('all-company', { id: 'all-company', name: 'All Company', description: '', audience: 'all', order: 1, active: true, memberIds: [] });
    firestore.channels.set('app-review', {
      id: 'app-review', name: 'Demo Team', description: '', audience: 'all', order: 99, active: true,
      demoSandbox: true, memberIds: ['demo', 'admin-1'],
    });

    mockGate.mockResolvedValue(ADMIN);
    const asAdmin = await (await GET(req('GET', undefined))).json();
    expect(asAdmin.channels.map((c: { id: string }) => c.id)).toEqual(['all-company']);

    mockGate.mockResolvedValue(JACOB);
    const asJacob = await (await GET(req('GET', undefined))).json();
    expect(asJacob.channels.map((c: { id: string }) => c.id)).toEqual(['all-company', 'app-review']);
  });

  it('GET, PATCH and DELETE let Jacob reach the demo sandbox by his email too, whatever his uid', async () => {
    firestore.channels.set('app-review', {
      id: 'app-review', name: 'Demo Team', description: '', audience: 'all', order: 99, active: true,
      demoSandbox: true, memberIds: ['demo'],
    });
    mockGate.mockResolvedValue({ ok: true, uid: 'jacob-other-uid', name: 'Jacob', data: { Email: ' JMyers@3cworldgroup.com ' } });

    const listed = await (await GET(req('GET', undefined))).json();
    expect(listed.channels.map((c: { id: string }) => c.id)).toEqual(['app-review']);
    expect((await PATCH(req('PATCH', { id: 'app-review', name: 'Demo Team 2' }))).status).toBe(200);
    expect(firestore.channels.get('app-review')).toMatchObject({ name: 'Demo Team 2' });

    // Another admin with some other email still never sees it.
    mockGate.mockResolvedValue({ ...ADMIN, data: { email: 'someone@3cworldgroup.com' } });
    const asAdmin = await (await GET(req('GET', undefined))).json();
    expect(asAdmin.channels).toEqual([]);
    expect((await DELETE(req('DELETE', { id: 'app-review' }))).status).toBe(404);
  });

  it('PATCH and DELETE treat the demo sandbox as missing for an admin who is not Jacob', async () => {
    firestore.channels.set('app-review', {
      id: 'app-review', name: 'Demo Team', description: '', audience: 'all', order: 99, active: true,
      demoSandbox: true, memberIds: ['demo'],
    });
    mockGate.mockResolvedValue(ADMIN);

    expect((await PATCH(req('PATCH', { id: 'app-review', name: 'Renamed' }))).status).toBe(404);
    expect((await DELETE(req('DELETE', { id: 'app-review' }))).status).toBe(404);
    expect(firestore.channels.get('app-review')).toMatchObject({ name: 'Demo Team' });
  });

  it('DELETE removes the channel doc and its messages', async () => {
    mockGate.mockResolvedValue(ADMIN);
    firestore.channels.set('old-channel', { id: 'old-channel', name: 'Old', audience: 'all', order: 1, active: true });
    firestore.messages.set('old-channel', new Map([
      ['m1', { text: 'one' }],
      ['m2', { text: 'two' }],
    ]));

    const res = await DELETE(req('DELETE', { id: 'old-channel' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ success: true, deletedMessages: 2 });
    expect(firestore.channels.has('old-channel')).toBe(false);
    expect(firestore.messages.get('old-channel')?.size).toBe(0);
  });

  it('PATCH keeps eligible manually added members in memberIds when the audience changes', async () => {
    mockGate.mockResolvedValue(ADMIN);
    firestore.channels.set('managers', {
      id: 'managers', name: 'Managers', description: '', audience: 'managers', order: 1, active: true,
      extraMemberIds: ['rep-1', 'inactive-1'],
      memberIds: ['admin-1', 'ops-1', 'manager-1', 'rep-1'],
    });

    const res = await PATCH(req('PATCH', { id: 'managers', audience: 'platform' }));

    expect(res.status).toBe(200);
    const memberIds = firestore.channels.get('managers')?.memberIds as string[];
    expect([...memberIds].sort()).toEqual(['admin-1', 'ops-1', 'rep-1']);
  });

  it('DELETE removes the channel uploads from Storage so their tokened URLs stop working', async () => {
    mockGate.mockResolvedValue(ADMIN);
    firestore.channels.set('old-channel', { id: 'old-channel', name: 'Old', audience: 'all', order: 1, active: true });
    firestore.messages.set('old-channel', new Map<string, Record<string, unknown>>([
      ['m1', { text: '', attachment: { type: 'image', url: chatUrl('old-channel', 'photo.jpg') } }],
      ['m2', { text: '', attachment: { type: 'file', url: chatUrl('old-channel', 'doc.pdf'), previewUrl: chatUrl('old-channel', 'doc.png') } }],
      ['m3', { text: '', attachment: { type: 'gif', url: 'https://media.giphy.com/x.gif' } }],
      ['m4', { text: 'plain' }],
    ]));

    const res = await DELETE(req('DELETE', { id: 'old-channel' }));

    expect(res.status).toBe(200);
    expect([...storage.deleted].sort()).toEqual([
      'chat/old-channel/doc.pdf',
      'chat/old-channel/doc.png',
      'chat/old-channel/photo.jpg',
    ]);
    expect(preserveReportedEvidence).toHaveBeenCalledTimes(2);
  });

  it('DELETE keeps a reported upload whose evidence copy failed', async () => {
    mockGate.mockResolvedValue(ADMIN);
    preserveReportedEvidence.mockImplementation(async (_c: string, messageId: string) => messageId !== 'm1');
    firestore.channels.set('old-channel', { id: 'old-channel', name: 'Old', audience: 'all', order: 1, active: true });
    firestore.messages.set('old-channel', new Map<string, Record<string, unknown>>([
      ['m1', { text: '', attachment: { type: 'image', url: chatUrl('old-channel', 'reported.jpg') } }],
      ['m2', { text: '', attachment: { type: 'image', url: chatUrl('old-channel', 'fine.jpg') } }],
    ]));

    const res = await DELETE(req('DELETE', { id: 'old-channel' }));

    expect(res.status).toBe(200);
    expect(storage.deleted).toEqual(['chat/old-channel/fine.jpg']);
  });
});
