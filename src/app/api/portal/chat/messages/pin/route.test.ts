import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// A combined Firestore mock: channel docs (for the access gate), per-message docs
// addressed by messages.doc(id) (POST target), and a per-channel ordered message
// list returned by the chained query (GET). set() calls are recorded so the pin
// payload can be asserted.
const firestore = vi.hoisted(() => {
  type DocData = Record<string, unknown>;
  const channels = new Map<string, DocData>();
  const messageDocs = new Map<string, Map<string, DocData>>();
  const messageLists = new Map<string, Array<{ id: string; data: DocData }>>();
  const setCalls: Array<{
    channelId: string;
    messageId: string;
    payload: DocData;
    options?: { merge?: boolean };
  }> = [];

  function messagesCollection(channelId: string) {
    const query = {
      where: vi.fn(() => query),
      orderBy: vi.fn(() => query),
      limit: vi.fn(() => query),
      get: vi.fn(async () => ({
        docs: (messageLists.get(channelId) ?? []).map((m) => ({
          id: m.id,
          data: (): DocData => m.data,
        })),
      })),
      doc: vi.fn((messageId: string) => ({
        get: vi.fn(async () => {
          const data = messageDocs.get(channelId)?.get(messageId);
          return { id: messageId, exists: !!data, data: (): DocData | undefined => data };
        }),
        set: vi.fn(async (payload: DocData, options?: { merge?: boolean }) => {
          setCalls.push({ channelId, messageId, payload, options });
        }),
      })),
    };
    return query;
  }

  const adminDb = {
    collection: vi.fn((name: string) => {
      if (name !== 'chatChannels') throw new Error(`Unexpected collection ${name}`);
      return {
        doc: vi.fn((channelId: string) => ({
          get: vi.fn(async () => {
            const data = channels.get(channelId);
            return { id: channelId, exists: !!data, data: (): DocData | undefined => data };
          }),
          collection: vi.fn((sub: string) => {
            if (sub === 'messages') return messagesCollection(channelId);
            throw new Error(`Unexpected subcollection ${sub}`);
          }),
        })),
      };
    }),
  };

  function reset() {
    channels.clear();
    messageDocs.clear();
    messageLists.clear();
    setCalls.length = 0;
    adminDb.collection.mockClear();
  }

  return { adminDb, channels, messageDocs, messageLists, setCalls, reset };
});

vi.mock('@/lib/chat/access', () => ({ getVerifiedChatUser: vi.fn() }));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: firestore.adminDb }));

import { POST, GET } from './route';
import { getVerifiedChatUser } from '@/lib/chat/access';

const mockGate = getVerifiedChatUser as unknown as ReturnType<typeof vi.fn>;

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/portal/chat/messages/pin', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
function getReq(channelId: string) {
  return new NextRequest(
    `http://localhost/api/portal/chat/messages/pin?channelId=${encodeURIComponent(channelId)}`,
    { method: 'GET' }
  );
}

// A field manager (l1) — eligible to pin, but NOT a moderator.
const MANAGER = {
  ok: true as const,
  user: {
    uid: 'mgr-uid',
    displayName: 'Manager One',
    role: undefined,
    fieldRole: 'l1_manager' as const,
    effectiveRole: 'l1_manager' as const,
    canModerate: false,
  },
};

// A rep — can access all-audience channels but may not pin.
const REP = {
  ok: true as const,
  user: {
    uid: 'rep-uid',
    displayName: 'Rep One',
    role: undefined,
    fieldRole: 'entry_rep' as const,
    effectiveRole: 'entry_rep' as const,
    canModerate: false,
  },
};

beforeEach(() => {
  firestore.reset();
  mockGate.mockReset();
  firestore.channels.set('all-company', {
    id: 'all-company',
    name: 'All Company',
    audience: 'all',
    order: 1,
    active: true,
  });
  firestore.channels.set('managers', {
    id: 'managers',
    name: 'Managers',
    audience: 'managers',
    order: 4,
    active: true,
  });
  firestore.messageDocs.set(
    'all-company',
    new Map<string, Record<string, unknown>>([
      ['msg-1', { authorId: 'someone', authorName: 'Someone', text: 'pin me', deletedAt: null }],
      ['msg-deleted', { authorId: 'someone', authorName: 'Someone', text: 'gone', deletedAt: { seconds: 1 } }],
    ])
  );
});

describe('POST /api/portal/chat/messages/pin', () => {
  it('rejects an unauthenticated caller (401)', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    const res = await POST(postReq({ channelId: 'all-company', messageId: 'msg-1', pinned: true }));
    expect(res.status).toBe(401);
    expect(firestore.setCalls).toHaveLength(0);
  });

  it('rejects a rep — access alone does not grant pinning (403)', async () => {
    mockGate.mockResolvedValue(REP);
    const res = await POST(postReq({ channelId: 'all-company', messageId: 'msg-1', pinned: true }));
    expect(res.status).toBe(403);
    expect(firestore.setCalls).toHaveLength(0);
  });

  it('lets a manager pin: stamps isPinned/pinnedAt/pinnedBy via merge', async () => {
    mockGate.mockResolvedValue(MANAGER);
    const res = await POST(postReq({ channelId: 'all-company', messageId: 'msg-1', pinned: true }));
    expect(res.status).toBe(200);
    expect(firestore.setCalls).toHaveLength(1);
    const { payload, options } = firestore.setCalls[0];
    expect(payload.isPinned).toBe(true);
    expect(payload.pinnedAt).not.toBeNull();
    expect(payload.pinnedAt).toBeDefined();
    expect(payload.pinnedBy).toBe('mgr-uid');
    expect(options?.merge).toBe(true);
  });

  it('lets a manager unpin: clears isPinned/pinnedAt/pinnedBy', async () => {
    mockGate.mockResolvedValue(MANAGER);
    const res = await POST(postReq({ channelId: 'all-company', messageId: 'msg-1', pinned: false }));
    expect(res.status).toBe(200);
    const { payload, options } = firestore.setCalls[0];
    expect(payload.isPinned).toBe(false);
    expect(payload.pinnedAt).toBeNull();
    expect(payload.pinnedBy).toBeNull();
    expect(options?.merge).toBe(true);
  });

  it('rejects pinning a deleted message (400)', async () => {
    mockGate.mockResolvedValue(MANAGER);
    const res = await POST(postReq({ channelId: 'all-company', messageId: 'msg-deleted', pinned: true }));
    expect(res.status).toBe(400);
    expect(firestore.setCalls).toHaveLength(0);
  });

  it('rejects an unknown message (404)', async () => {
    mockGate.mockResolvedValue(MANAGER);
    const res = await POST(postReq({ channelId: 'all-company', messageId: 'nope', pinned: true }));
    expect(res.status).toBe(404);
    expect(firestore.setCalls).toHaveLength(0);
  });

  it('rejects a non-boolean pinned flag (400)', async () => {
    mockGate.mockResolvedValue(MANAGER);
    const res = await POST(postReq({ channelId: 'all-company', messageId: 'msg-1', pinned: 'yes' }));
    expect(res.status).toBe(400);
    expect(firestore.setCalls).toHaveLength(0);
  });

  it('rejects an unknown channel (404)', async () => {
    mockGate.mockResolvedValue(MANAGER);
    const res = await POST(postReq({ channelId: 'nope', messageId: 'msg-1', pinned: true }));
    expect(res.status).toBe(404);
    expect(firestore.setCalls).toHaveLength(0);
  });
});

describe('GET /api/portal/chat/messages/pin', () => {
  it('returns 403 when the caller cannot access the channel', async () => {
    mockGate.mockResolvedValue(REP);
    const res = await GET(getReq('managers'));
    expect(res.status).toBe(403);
  });

  it('returns only pinned, non-deleted messages, newest pin first', async () => {
    mockGate.mockResolvedValue(MANAGER);
    firestore.messageLists.set('all-company', [
      {
        id: 'p-older',
        data: {
          isPinned: true,
          text: 'older pin',
          authorName: 'A',
          createdAt: { toDate: () => new Date('2026-07-01T00:00:00Z') },
          pinnedAt: { toDate: () => new Date('2026-07-01T10:00:00Z') },
        },
      },
      {
        id: 'p-newer',
        data: {
          isPinned: true,
          text: '',
          attachment: { type: 'gif', url: 'https://media.tenor.com/g/x.gif' },
          authorName: 'B',
          createdAt: { toDate: () => new Date('2026-07-02T00:00:00Z') },
          pinnedAt: { toDate: () => new Date('2026-07-02T10:00:00Z') },
        },
      },
      {
        id: 'p-deleted',
        data: {
          isPinned: true,
          text: 'deleted pin',
          authorName: 'C',
          deletedAt: { toDate: () => new Date() },
          pinnedAt: { toDate: () => new Date('2026-07-03T10:00:00Z') },
        },
      },
      {
        id: 'not-pinned',
        data: { text: 'just a message', authorName: 'D', createdAt: { toDate: () => new Date() } },
      },
    ]);

    const res = await GET(getReq('all-company'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.pins).toHaveLength(2);
    // Newest pin first.
    expect(json.pins[0].messageId).toBe('p-newer');
    expect(json.pins[1].messageId).toBe('p-older');
    // GIF attachment surfaces on the newest pin; deleted/unpinned rows are gone.
    expect(json.pins[0].attachment).toMatchObject({ type: 'gif' });
    expect(json.pins[0].pinnedAt).toBe('2026-07-02T10:00:00.000Z');
  });
});
