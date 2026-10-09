import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const firestore = vi.hoisted(() => {
  type DocData = Record<string, unknown>;
  const channels = new Map<string, DocData>();
  const messages = new Map<string, DocData>(); // key: `${channelId}/${messageId}`
  const users = new Map<string, DocData>();
  const reads = new Map<string, DocData>(); // key: `${uid}/${channelId}`

  type Ref = { kind: 'user' | 'read'; key: string; id: string };

  function snap(id: string, data: DocData | undefined) {
    return data
      ? { id, exists: true, data: (): DocData => data }
      : { id, exists: false, data: (): undefined => undefined };
  }

  const adminDb = {
    collection: vi.fn((name: string) => {
      if (name === 'chatChannels') {
        return {
          doc: vi.fn((channelId: string) => ({
            get: vi.fn(async () => snap(channelId, channels.get(channelId))),
            collection: vi.fn(() => ({
              doc: vi.fn((messageId: string) => ({
                get: vi.fn(async () => snap(messageId, messages.get(`${channelId}/${messageId}`))),
              })),
            })),
          })),
        };
      }
      if (name === 'users') {
        return {
          doc: vi.fn((uid: string) => ({
            kind: 'user',
            key: uid,
            id: uid,
            collection: vi.fn(() => ({
              doc: vi.fn((channelId: string): Ref => ({ kind: 'read', key: `${uid}/${channelId}`, id: channelId })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    }),
    getAll: vi.fn(async (...refs: Ref[]) =>
      refs.map((ref) => snap(ref.id, ref.kind === 'user' ? users.get(ref.key) : reads.get(ref.key)))
    ),
  };

  function reset() {
    channels.clear();
    messages.clear();
    users.clear();
    reads.clear();
    adminDb.collection.mockClear();
    adminDb.getAll.mockClear();
  }

  return { adminDb, channels, messages, users, reads, reset };
});

vi.mock('@/lib/chat/access', () => ({
  getVerifiedChatUser: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: firestore.adminDb,
}));

import { GET } from './route';
import { getVerifiedChatUser } from '@/lib/chat/access';

const mockGetUser = getVerifiedChatUser as unknown as ReturnType<typeof vi.fn>;

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

function req(channelId: string, messageId?: string) {
  const query = messageId === undefined ? '' : `?messageId=${encodeURIComponent(messageId)}`;
  return new NextRequest(`http://localhost/api/portal/chat/channels/${channelId}/reads${query}`, {
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

function seedAllCompany(memberIds: string[]) {
  firestore.channels.set('all-company', {
    id: 'all-company',
    name: 'All Company',
    description: 'Company-wide',
    audience: 'all',
    order: 1,
    active: true,
    memberIds,
  });
}

function seedUser(uid: string, displayName: string, extra: Record<string, unknown> = {}) {
  firestore.users.set(uid, { status: 'active', fieldRole: 'entry_rep', displayName, email: `${uid}@example.com`, ...extra });
}

beforeEach(() => {
  firestore.reset();
  mockGetUser.mockReset();
});

describe('GET /api/portal/chat/channels/[channelId]/reads', () => {
  it('returns 401 when the token is missing/invalid', async () => {
    mockGetUser.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });

    const res = await GET(req('all-company', 'm1'), ctx('all-company'));

    expect(res.status).toBe(401);
    expect(firestore.adminDb.getAll).not.toHaveBeenCalled();
  });

  it('returns 400 without a messageId', async () => {
    mockGetUser.mockResolvedValue(REP);
    seedAllCompany(['rep-1']);

    const res = await GET(req('all-company'), ctx('all-company'));

    expect(res.status).toBe(400);
  });

  it('returns 403 when the caller cannot access the channel', async () => {
    mockGetUser.mockResolvedValue(REP);
    firestore.channels.set('managers', {
      id: 'managers', name: 'Managers', description: 'M', audience: 'managers', order: 4,
      active: true, memberIds: ['manager-1'],
    });
    firestore.messages.set('managers/m1', { authorId: 'manager-1', createdAt: ts('2026-10-09T15:00:00Z') });
    firestore.reads.set('manager-1/managers', { lastReadAt: ts('2026-10-09T16:00:00Z') });

    const res = await GET(req('managers', 'm1'), ctx('managers'));

    expect(res.status).toBe(403);
    expect(firestore.adminDb.getAll).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown or deleted message', async () => {
    mockGetUser.mockResolvedValue(REP);
    seedAllCompany(['rep-1']);
    firestore.messages.set('all-company/gone', {
      authorId: 'rep-1', createdAt: ts('2026-10-09T15:00:00Z'), deletedAt: ts('2026-10-09T15:01:00Z'),
    });

    expect((await GET(req('all-company', 'nope'), ctx('all-company'))).status).toBe(404);
    expect((await GET(req('all-company', 'gone'), ctx('all-company'))).status).toBe(404);
  });

  it('splits readers by receipt time and excludes the author', async () => {
    mockGetUser.mockResolvedValue(REP);
    seedAllCompany(['author', 'early', 'late', 'stale', 'never', 'rep-1']);
    seedUser('author', 'Author Person');
    seedUser('early', 'Early Reader', { avatarUrl: 'https://example.com/early.png' });
    seedUser('late', 'Late Reader');
    seedUser('stale', 'Stale Reader');
    seedUser('never', 'Never Opened');
    seedUser('rep-1', 'Rep One');
    firestore.messages.set('all-company/m1', { authorId: 'author', createdAt: ts('2026-10-09T15:00:00Z') });
    // The author's own receipt is newest of all — still never listed.
    firestore.reads.set('author/all-company', { lastReadAt: ts('2026-10-09T18:00:00Z') });
    firestore.reads.set('late/all-company', { lastReadAt: ts('2026-10-09T16:30:00Z') });
    // Exactly at createdAt counts as read.
    firestore.reads.set('early/all-company', { lastReadAt: ts('2026-10-09T15:00:00Z') });
    // Read the channel before this message landed -> unread.
    firestore.reads.set('stale/all-company', { lastReadAt: ts('2026-10-09T14:59:59Z') });

    const res = await GET(req('all-company', 'm1'), ctx('all-company'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      count: 2,
      readers: [
        { uid: 'early', name: 'Early Reader', avatarUrl: 'https://example.com/early.png', readAt: '2026-10-09T15:00:00.000Z' },
        { uid: 'late', name: 'Late Reader', readAt: '2026-10-09T16:30:00.000Z' },
      ],
    });
    // Rows carry display fields only — never the email.
    for (const reader of json.readers) {
      expect(reader).not.toHaveProperty('email');
    }
    // Profiles are fetched only for the people who read it.
    const userBatch = firestore.adminDb.getAll.mock.calls[1] as Array<{ kind: string; key: string }>;
    expect(userBatch.map((ref) => ref.key).sort()).toEqual(['early', 'late']);
  });

  it('drops a reader who no longer belongs in the channel', async () => {
    mockGetUser.mockResolvedValue(REP);
    seedAllCompany(['author', 'gone']);
    seedUser('author', 'Author Person');
    seedUser('gone', 'Gone Rep', { status: 'inactive' });
    firestore.messages.set('all-company/m1', { authorId: 'author', createdAt: ts('2026-10-09T15:00:00Z') });
    firestore.reads.set('gone/all-company', { lastReadAt: ts('2026-10-09T16:00:00Z') });

    const json = await (await GET(req('all-company', 'm1'), ctx('all-company'))).json();

    expect(json).toEqual({ readers: [], count: 0 });
  });

  it('answers "no one yet" without reading profiles when nobody has caught up', async () => {
    mockGetUser.mockResolvedValue(REP);
    seedAllCompany(['author', 'rep-1']);
    seedUser('rep-1', 'Rep One');
    firestore.messages.set('all-company/m1', { authorId: 'author', createdAt: ts('2026-10-09T15:00:00Z') });

    const json = await (await GET(req('all-company', 'm1'), ctx('all-company'))).json();

    expect(json).toEqual({ readers: [], count: 0 });
    expect(firestore.adminDb.getAll).toHaveBeenCalledTimes(1);
  });
});
