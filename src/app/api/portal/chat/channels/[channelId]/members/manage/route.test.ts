import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const firestore = vi.hoisted(() => {
  type DocData = Record<string, unknown>;
  const channels = new Map<string, DocData>();
  const users = new Map<string, DocData>();
  // Every chatChannels doc.set(...) is recorded so tests can assert the exact update shape.
  const setCalls: Array<{ id: string; updates: DocData }> = [];

  function snap(id: string, data: DocData | undefined) {
    return data
      ? { id, exists: true, data: (): DocData => data }
      : { id, exists: false, data: (): undefined => undefined };
  }

  const adminDb = {
    collection: vi.fn((name: string) => {
      if (name === 'chatChannels') {
        return {
          doc: vi.fn((id: string) => ({
            get: vi.fn(async () => snap(id, channels.get(id))),
            set: vi.fn(async (updates: DocData) => {
              setCalls.push({ id, updates });
            }),
          })),
        };
      }
      if (name === 'users') {
        return {
          doc: vi.fn((id: string) => ({
            get: vi.fn(async () => snap(id, users.get(id))),
          })),
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    }),
  };

  function reset() {
    channels.clear();
    users.clear();
    setCalls.length = 0;
    adminDb.collection.mockClear();
  }

  return { adminDb, channels, users, setCalls, reset };
});

vi.mock('@/lib/chat/access', () => ({
  getVerifiedChatUser: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: firestore.adminDb,
}));

// Inspectable FieldValue sentinels so tests can assert the exact op + target uid written to
// each array field (a wrong-uid regression must fail, not slip past a bare key check).
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    arrayUnion: (...values: unknown[]) => ({ __op: 'arrayUnion', values }),
    arrayRemove: (...values: unknown[]) => ({ __op: 'arrayRemove', values }),
    serverTimestamp: () => ({ __op: 'serverTimestamp' }),
  },
}));

import { DELETE, POST } from './route';
import { getVerifiedChatUser } from '@/lib/chat/access';

const mockGetUser = getVerifiedChatUser as unknown as ReturnType<typeof vi.fn>;

function req(channelId: string, body: unknown, method: 'POST' | 'DELETE') {
  return new NextRequest(
    `http://localhost/api/portal/chat/channels/${channelId}/members/manage`,
    { method, body: JSON.stringify(body) }
  );
}

function ctx(channelId: string) {
  return { params: Promise.resolve({ channelId }) };
}

const ADMIN = {
  ok: true as const,
  user: {
    uid: 'admin-1',
    displayName: 'Admin One',
    role: 'admin' as const,
    fieldRole: undefined,
    effectiveRole: 'admin' as const,
    canModerate: true,
  },
};

// Operations moderates chat but is NOT a platform admin — add-people is admins only.
const OPS = {
  ok: true as const,
  user: {
    uid: 'ops-1',
    displayName: 'Ops One',
    role: 'operations' as const,
    fieldRole: undefined,
    effectiveRole: 'operations' as const,
    canModerate: true,
  },
};

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

// An l1/l2 manager has role === undefined → not a platform admin, so add-people is denied.
const MANAGER = {
  ok: true as const,
  user: {
    uid: 'mgr-1',
    displayName: 'Manager One',
    role: undefined,
    fieldRole: 'l1_manager' as const,
    effectiveRole: 'l1_manager' as const,
    canModerate: false,
  },
};

function managersChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'managers',
    name: 'Managers',
    description: 'Manager alignment',
    audience: 'managers',
    order: 4,
    active: true,
    memberIds: ['manager-1'],
    extraMemberIds: [],
    ...overrides,
  };
}

beforeEach(() => {
  firestore.reset();
  mockGetUser.mockReset();
});

describe('POST /api/portal/chat/channels/[channelId]/members/manage', () => {
  it('returns 403 for a non-admin (even operations)', async () => {
    mockGetUser.mockResolvedValue(OPS);
    firestore.channels.set('managers', managersChannel());
    firestore.users.set('rep-2', { status: 'active', fieldRole: 'entry_rep' });

    const res = await POST(req('managers', { uid: 'rep-2' }, 'POST'), ctx('managers'));

    expect(res.status).toBe(403);
    expect(firestore.setCalls).toHaveLength(0);
  });

  it('returns 403 for an l1/l2 manager caller', async () => {
    mockGetUser.mockResolvedValue(MANAGER);
    firestore.channels.set('managers', managersChannel());
    firestore.users.set('rep-2', { status: 'active', fieldRole: 'entry_rep' });

    const res = await POST(req('managers', { uid: 'rep-2' }, 'POST'), ctx('managers'));

    expect(res.status).toBe(403);
    expect(firestore.setCalls).toHaveLength(0);
  });

  it('returns 400 for a malformed uid (Firestore-path-unsafe)', async () => {
    mockGetUser.mockResolvedValue(ADMIN);
    firestore.channels.set('managers', managersChannel());

    const res = await POST(req('managers', { uid: 'a/b' }, 'POST'), ctx('managers'));

    expect(res.status).toBe(400);
    expect(firestore.setCalls).toHaveLength(0);
  });

  it('returns 400 when adding to an archived channel', async () => {
    mockGetUser.mockResolvedValue(ADMIN);
    firestore.channels.set('managers', managersChannel({ active: false }));
    firestore.users.set('rep-2', { status: 'active', fieldRole: 'entry_rep' });

    const res = await POST(req('managers', { uid: 'rep-2' }, 'POST'), ctx('managers'));

    expect(res.status).toBe(400);
    expect(firestore.setCalls).toHaveLength(0);
  });

  it('returns 401 when the token is missing/invalid', async () => {
    mockGetUser.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });

    const res = await POST(req('managers', { uid: 'rep-2' }, 'POST'), ctx('managers'));

    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown channel', async () => {
    mockGetUser.mockResolvedValue(ADMIN);

    const res = await POST(req('nope', { uid: 'rep-2' }, 'POST'), ctx('nope'));

    expect(res.status).toBe(404);
  });

  it('returns 400 for an unknown target user', async () => {
    mockGetUser.mockResolvedValue(ADMIN);
    firestore.channels.set('managers', managersChannel());

    const res = await POST(req('managers', { uid: 'ghost' }, 'POST'), ctx('managers'));

    expect(res.status).toBe(400);
    expect(firestore.setCalls).toHaveLength(0);
  });

  it('returns 400 for an inactive target user', async () => {
    mockGetUser.mockResolvedValue(ADMIN);
    firestore.channels.set('managers', managersChannel());
    firestore.users.set('rep-2', { status: 'inactive', fieldRole: 'entry_rep' });

    const res = await POST(req('managers', { uid: 'rep-2' }, 'POST'), ctx('managers'));

    expect(res.status).toBe(400);
    expect(firestore.setCalls).toHaveLength(0);
  });

  it('adds an active user to BOTH extraMemberIds and memberIds', async () => {
    mockGetUser.mockResolvedValue(ADMIN);
    firestore.channels.set('managers', managersChannel());
    firestore.users.set('rep-2', { status: 'active', fieldRole: 'entry_rep' });

    const res = await POST(req('managers', { uid: 'rep-2' }, 'POST'), ctx('managers'));

    expect(res.status).toBe(200);
    expect(firestore.setCalls).toHaveLength(1);
    const { updates } = firestore.setCalls[0];
    // Both fields arrayUnion the SPECIFIC target uid.
    expect(updates.extraMemberIds).toEqual({ __op: 'arrayUnion', values: ['rep-2'] });
    expect(updates.memberIds).toEqual({ __op: 'arrayUnion', values: ['rep-2'] });
  });
});

describe('DELETE /api/portal/chat/channels/[channelId]/members/manage', () => {
  it('returns 403 for a non-admin', async () => {
    mockGetUser.mockResolvedValue(REP);
    firestore.channels.set('managers', managersChannel({ extraMemberIds: ['rep-2'] }));

    const res = await DELETE(req('managers', { uid: 'rep-2' }, 'DELETE'), ctx('managers'));

    expect(res.status).toBe(403);
  });

  it('returns 400 when removing a non-extra (audience-derived) member', async () => {
    mockGetUser.mockResolvedValue(ADMIN);
    // manager-1 is a plain member, not in extraMemberIds — not removable.
    firestore.channels.set('managers', managersChannel({ extraMemberIds: [] }));

    const res = await DELETE(req('managers', { uid: 'manager-1' }, 'DELETE'), ctx('managers'));

    expect(res.status).toBe(400);
    expect(firestore.setCalls).toHaveLength(0);
  });

  it('removes an extra member from both arrays when they are not audience-derived', async () => {
    mockGetUser.mockResolvedValue(ADMIN);
    firestore.channels.set(
      'managers',
      managersChannel({ memberIds: ['manager-1', 'rep-2'], extraMemberIds: ['rep-2'] })
    );
    // entry_rep cannot access a managers channel by role → safe to drop from memberIds.
    firestore.users.set('rep-2', { status: 'active', fieldRole: 'entry_rep' });

    const res = await DELETE(req('managers', { uid: 'rep-2' }, 'DELETE'), ctx('managers'));

    expect(res.status).toBe(200);
    expect(firestore.setCalls).toHaveLength(1);
    const { updates } = firestore.setCalls[0];
    // Both fields arrayRemove the SPECIFIC target uid.
    expect(updates.extraMemberIds).toEqual({ __op: 'arrayRemove', values: ['rep-2'] });
    expect(updates.memberIds).toEqual({ __op: 'arrayRemove', values: ['rep-2'] });
  });

  it('keeps an audience-derived extra member in memberIds when removed', async () => {
    mockGetUser.mockResolvedValue(ADMIN);
    // all-company: audience 'all' grants entry_rep access, so removal from extras must
    // NOT strip memberIds (they still belong via role).
    firestore.channels.set('all-company', {
      id: 'all-company',
      name: 'All Company',
      description: 'Company-wide',
      audience: 'all',
      order: 1,
      active: true,
      memberIds: ['rep-2'],
      extraMemberIds: ['rep-2'],
    });
    firestore.users.set('rep-2', { status: 'active', fieldRole: 'entry_rep' });

    const res = await DELETE(req('all-company', { uid: 'rep-2' }, 'DELETE'), ctx('all-company'));

    expect(res.status).toBe(200);
    const { updates } = firestore.setCalls[0];
    expect(updates.extraMemberIds).toEqual({ __op: 'arrayRemove', values: ['rep-2'] });
    expect(updates).not.toHaveProperty('memberIds');
  });
});
