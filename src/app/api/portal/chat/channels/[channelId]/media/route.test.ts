import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const firestore = vi.hoisted(() => {
  type DocData = Record<string, unknown>;
  const channels = new Map<string, DocData>();
  // Per-channel ordered list of message docs (already newest-first for the test).
  const messages = new Map<string, Array<{ id: string; data: DocData }>>();

  function chanSnap(id: string, data: DocData | undefined) {
    return data
      ? { id, exists: true, data: (): DocData => data }
      : { id, exists: false, data: (): undefined => undefined };
  }

  function messagesCollection(channelId: string) {
    // A tiny chainable query stub; where/orderBy/limit just return `this`.
    const query = {
      where: vi.fn(() => query),
      orderBy: vi.fn(() => query),
      limit: vi.fn(() => query),
      get: vi.fn(async () => ({
        docs: (messages.get(channelId) ?? []).map((m) => ({
          id: m.id,
          data: (): DocData => m.data,
        })),
      })),
    };
    return query;
  }

  const adminDb = {
    collection: vi.fn((name: string) => {
      if (name === 'chatChannels') {
        return {
          doc: vi.fn((id: string) => ({
            get: vi.fn(async () => chanSnap(id, channels.get(id))),
            collection: vi.fn((sub: string) => {
              if (sub === 'messages') return messagesCollection(id);
              throw new Error(`Unexpected subcollection ${sub}`);
            }),
          })),
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    }),
  };

  function reset() {
    channels.clear();
    messages.clear();
    adminDb.collection.mockClear();
  }

  return { adminDb, channels, messages, reset };
});

vi.mock('@/lib/chat/access', () => ({ getVerifiedChatUser: vi.fn() }));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: firestore.adminDb }));

import { GET } from './route';
import { getVerifiedChatUser } from '@/lib/chat/access';

const mockGate = getVerifiedChatUser as unknown as ReturnType<typeof vi.fn>;

function req(channelId: string) {
  return new NextRequest(`http://localhost/api/portal/chat/channels/${channelId}/media`, {
    method: 'GET',
  });
}
function ctx(channelId: string) {
  return { params: Promise.resolve({ channelId }) };
}

const REP = {
  ok: true as const,
  user: {
    uid: 'rep-1',
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
});

describe('GET /api/portal/chat/channels/[channelId]/media', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    const res = await GET(req('all-company'), ctx('all-company'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller cannot access the channel', async () => {
    mockGate.mockResolvedValue(REP);
    const res = await GET(req('managers'), ctx('managers'));
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown channel', async () => {
    mockGate.mockResolvedValue(REP);
    const res = await GET(req('nope'), ctx('nope'));
    expect(res.status).toBe(404);
  });

  it('returns recent media, skipping deleted and malformed rows', async () => {
    mockGate.mockResolvedValue(REP);
    firestore.messages.set('all-company', [
      {
        id: 'm1',
        data: {
          hasAttachment: true,
          attachment: { type: 'image', url: 'https://firebasestorage.googleapis.com/x', width: 100 },
          authorName: 'Rep One',
          createdAt: { toDate: () => new Date('2026-07-01T00:00:00Z') },
        },
      },
      {
        id: 'm2',
        data: {
          hasAttachment: true,
          attachment: { type: 'gif', url: 'https://media.giphy.com/g/x.gif' },
          authorName: 'Rep Two',
          deletedAt: { toDate: () => new Date() },
          createdAt: { toDate: () => new Date('2026-06-30T00:00:00Z') },
        },
      },
      {
        // Flag set but attachment missing/malformed → dropped.
        id: 'm3',
        data: { hasAttachment: true, authorName: 'Rep Three', createdAt: { toDate: () => new Date() } },
      },
    ]);

    const res = await GET(req('all-company'), ctx('all-company'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.media).toHaveLength(1);
    expect(json.media[0]).toMatchObject({
      messageId: 'm1',
      authorName: 'Rep One',
      attachment: { type: 'image' },
    });
    expect(json.media[0].createdAt).toBe('2026-07-01T00:00:00.000Z');
  });
});
