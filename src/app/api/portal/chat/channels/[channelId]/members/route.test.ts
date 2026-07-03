import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const firestore = vi.hoisted(() => {
  type DocData = Record<string, unknown>;
  const channels = new Map<string, DocData>();
  const users = new Map<string, DocData>();

  // A user ref is opaque here — getAll reads its id back out.
  function userRef(id: string) {
    return { __userId: id };
  }

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
          })),
        };
      }
      if (name === 'users') {
        return {
          doc: vi.fn((id: string) => userRef(id)),
          // Backs the admin-only addable query (where status == active).
          where: vi.fn((field: string, _op: string, value: unknown) => ({
            get: vi.fn(async () => ({
              docs: [...users.entries()]
                .filter(([, data]) => data[field] === value)
                .map(([id, data]) => ({ id, data: (): DocData => data })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    }),
    getAll: vi.fn(async (...refs: Array<{ __userId: string }>) =>
      refs.map((ref) => snap(ref.__userId, users.get(ref.__userId)))
    ),
  };

  function reset() {
    channels.clear();
    users.clear();
    adminDb.collection.mockClear();
    adminDb.getAll.mockClear();
  }

  return { adminDb, channels, users, reset };
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

function req(channelId: string) {
  return new NextRequest(
    `http://localhost/api/portal/chat/channels/${channelId}/members`,
    { method: 'GET' }
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
  mockGetUser.mockReset();
});

describe('GET /api/portal/chat/channels/[channelId]/members', () => {
  it('returns 401 when the token is missing/invalid', async () => {
    mockGetUser.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });

    const res = await GET(req('all-company'), ctx('all-company'));

    expect(res.status).toBe(401);
    expect(firestore.adminDb.getAll).not.toHaveBeenCalled();
  });

  it('returns 403 when the verified user is not active', async () => {
    mockGetUser.mockResolvedValue({ ok: false, error: 'Account is not active', status: 403 });

    const res = await GET(req('all-company'), ctx('all-company'));

    expect(res.status).toBe(403);
  });

  it('returns 403 when the caller cannot access the channel', async () => {
    mockGetUser.mockResolvedValue(REP);
    firestore.channels.set('managers', {
      id: 'managers',
      name: 'Managers',
      description: 'Manager alignment',
      audience: 'managers',
      order: 4,
      active: true,
      memberIds: ['manager-1'],
    });

    const res = await GET(req('managers'), ctx('managers'));

    expect(res.status).toBe(403);
    expect(firestore.adminDb.getAll).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown channel', async () => {
    mockGetUser.mockResolvedValue(ADMIN);

    const res = await GET(req('nope'), ctx('nope'));

    expect(res.status).toBe(404);
  });

  it('returns an empty list without throwing when memberIds is empty', async () => {
    mockGetUser.mockResolvedValue(ADMIN);
    firestore.channels.set('all-company', {
      id: 'all-company',
      name: 'All Company',
      description: 'Company-wide',
      audience: 'all',
      order: 1,
      active: true,
      memberIds: [],
    });

    const res = await GET(req('all-company'), ctx('all-company'));
    const json = await res.json();

    expect(res.status).toBe(200);
    // Admin caller → addable is present (empty here: no active users seeded).
    expect(json).toEqual({ members: [], memberCount: 0, addable: [] });
    expect(firestore.adminDb.getAll).not.toHaveBeenCalled();
  });

  it('resolves members to uid/name/role/isExtra only (no emails/PII)', async () => {
    mockGetUser.mockResolvedValue(ADMIN);
    firestore.users.set('admin-1', {
      status: 'active',
      role: 'admin',
      displayName: 'Admin One',
      email: 'admin@example.com',
    });
    // No displayName → name derives from the email local-part.
    firestore.users.set('manager-1', {
      status: 'active',
      fieldRole: 'l1_manager',
      email: 'jane.doe@example.com',
    });
    firestore.channels.set('all-company', {
      id: 'all-company',
      name: 'All Company',
      description: 'Company-wide',
      audience: 'all',
      order: 1,
      active: true,
      memberIds: ['admin-1', 'manager-1'],
    });

    const res = await GET(req('all-company'), ctx('all-company'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.memberCount).toBe(2);
    expect(json.members).toEqual([
      { uid: 'admin-1', name: 'Admin One', role: 'Administrator', isExtra: false },
      { uid: 'manager-1', name: 'jane.doe', role: 'L1 Manager', isExtra: false },
    ]);
    // Every row exposes exactly the display fields — no email or raw role.
    for (const member of json.members) {
      expect(Object.keys(member).sort()).toEqual(['isExtra', 'name', 'role', 'uid']);
    }
    // Both seeded users are already members → nothing left to add.
    expect(json.addable).toEqual([]);
  });

  it('flags manually-added members with isExtra and lists addable non-members for admins', async () => {
    mockGetUser.mockResolvedValue(ADMIN);
    firestore.users.set('admin-1', { status: 'active', role: 'admin', displayName: 'Admin One' });
    firestore.users.set('rep-2', { status: 'active', fieldRole: 'entry_rep', displayName: 'Rep Two' });
    // Active, but not a member → should appear in addable.
    firestore.users.set('rep-3', { status: 'active', fieldRole: 'entry_rep', displayName: 'Rep Three' });
    // Inactive → excluded from addable.
    firestore.users.set('gone-4', { status: 'inactive', fieldRole: 'entry_rep', displayName: 'Gone Four' });
    firestore.channels.set('managers', {
      id: 'managers',
      name: 'Managers',
      description: 'Manager alignment',
      audience: 'managers',
      order: 4,
      active: true,
      memberIds: ['admin-1', 'rep-2'],
      extraMemberIds: ['rep-2'],
    });

    const res = await GET(req('managers'), ctx('managers'));
    const json = await res.json();

    expect(res.status).toBe(200);
    const rep2 = json.members.find((m: { uid: string }) => m.uid === 'rep-2');
    expect(rep2.isExtra).toBe(true);
    const admin = json.members.find((m: { uid: string }) => m.uid === 'admin-1');
    expect(admin.isExtra).toBe(false);
    // addable = active users not already members; rep-3 in, inactive gone-4 out, members out.
    expect(json.addable).toEqual([
      { uid: 'rep-3', name: 'Rep Three', role: 'Account Executive' },
    ]);
  });

  it('never returns the addable key to non-admins', async () => {
    mockGetUser.mockResolvedValue(REP);
    firestore.users.set('rep-1', { status: 'active', fieldRole: 'entry_rep', displayName: 'Rep One' });
    firestore.channels.set('all-company', {
      id: 'all-company',
      name: 'All Company',
      description: 'Company-wide',
      audience: 'all',
      order: 1,
      active: true,
      memberIds: ['rep-1'],
    });

    const res = await GET(req('all-company'), ctx('all-company'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).not.toHaveProperty('addable');
    expect(json.members[0].isExtra).toBe(false);
  });

  it('grants access to a manually-added member whose role would otherwise be denied', async () => {
    // entry_rep cannot access a managers channel by audience, but is in extraMemberIds.
    mockGetUser.mockResolvedValue(REP);
    firestore.users.set('rep-1', { status: 'active', fieldRole: 'entry_rep', displayName: 'Rep One' });
    firestore.channels.set('managers', {
      id: 'managers',
      name: 'Managers',
      description: 'Manager alignment',
      audience: 'managers',
      order: 4,
      active: true,
      memberIds: ['rep-1'],
      extraMemberIds: ['rep-1'],
    });

    const res = await GET(req('managers'), ctx('managers'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.members[0].uid).toBe('rep-1');
    // Non-admin → still no addable key.
    expect(json).not.toHaveProperty('addable');
  });

  it('403s an extra member on an ARCHIVED channel (extras never bypass active:false)', async () => {
    mockGetUser.mockResolvedValue(REP);
    firestore.users.set('rep-1', { status: 'active', fieldRole: 'entry_rep', displayName: 'Rep One' });
    firestore.channels.set('managers', {
      id: 'managers',
      name: 'Managers',
      description: 'Manager alignment',
      audience: 'managers',
      order: 4,
      active: false,
      memberIds: ['rep-1'],
      extraMemberIds: ['rep-1'],
    });

    const res = await GET(req('managers'), ctx('managers'));

    expect(res.status).toBe(403);
    expect(firestore.adminDb.getAll).not.toHaveBeenCalled();
  });
});
