import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => {
  type DocData = Record<string, unknown>;
  // Channel docs to iterate in syncChatChannels, and the users backing both the
  // audience query and the extra-member existence check.
  const channelDocs: Array<{ id: string; data: DocData }> = [];
  const users = new Map<string, DocData>();
  const batchSets: Array<{ ref: { __id: string }; data: DocData }> = [];

  function userSnap(id: string) {
    const data = users.get(id);
    return data
      ? { id, exists: true, data: (): DocData => data }
      : { id, exists: false, data: (): undefined => undefined };
  }

  const adminDb = {
    collection: vi.fn((name: string) => {
      if (name === 'chatChannels') {
        return {
          get: vi.fn(async () => ({
            docs: channelDocs.map((c) => ({
              id: c.id,
              ref: { __id: c.id },
              data: (): DocData => c.data,
            })),
          })),
        };
      }
      if (name === 'users') {
        return {
          where: vi.fn((field: string, _op: string, value: unknown) => ({
            get: vi.fn(async () => ({
              docs: [...users.entries()]
                .filter(([, d]) => d[field] === value)
                .map(([id, d]) => ({ id, data: (): DocData => d })),
            })),
          })),
          doc: vi.fn((id: string) => ({ __id: id })),
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    }),
    getAll: vi.fn(async (...refs: Array<{ __id: string }>) => refs.map((r) => userSnap(r.__id))),
    batch: vi.fn(() => ({
      set: vi.fn((ref: { __id: string }, data: DocData) => {
        batchSets.push({ ref, data });
      }),
      commit: vi.fn(async () => undefined),
    })),
  };

  function reset() {
    channelDocs.length = 0;
    users.clear();
    batchSets.length = 0;
    adminDb.collection.mockClear();
    adminDb.getAll.mockClear();
    adminDb.batch.mockClear();
  }

  return { adminDb, channelDocs, users, batchSets, reset };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: firestore.adminDb,
}));

import { createChannelId, syncChatChannels } from './channels';

describe('createChannelId', () => {
  it('creates lowercase dash slugs from spaces, punctuation, and casing', () => {
    expect(createChannelId('  Team Updates!!!  ')).toBe('team-updates');
    expect(createChannelId('Managers & L2 Leads')).toBe('managers-l2-leads');
    expect(createChannelId('Admin/Ops Chat')).toBe('adminops-chat');
  });

  it('collapses duplicate dashes and falls back for empty slugs', () => {
    expect(createChannelId('Field -- Training')).toBe('field-training');
    expect(createChannelId('!!!')).toBe('channel');
  });

  it('appends a numeric suffix to avoid existing ids', () => {
    expect(createChannelId('Team Updates', ['team-updates', 'team-updates-2'])).toBe('team-updates-3');
  });
});

describe('syncChatChannels', () => {
  beforeEach(() => firestore.reset());

  it('unions audience-derived members with surviving extras, dropping deleted and deactivated extras', async () => {
    firestore.channelDocs.push({
      id: 'managers',
      data: {
        id: 'managers',
        name: 'Managers',
        audience: 'managers',
        order: 4,
        active: true,
        // rep-x manually added (active); deleted-y removed; inactive-z deactivated.
        extraMemberIds: ['rep-x', 'deleted-y', 'inactive-z'],
      },
    });
    firestore.users.set('mgr-1', { status: 'active', fieldRole: 'l1_manager' });
    firestore.users.set('rep-x', { status: 'active', fieldRole: 'entry_rep' });
    firestore.users.set('inactive-z', { status: 'inactive', fieldRole: 'entry_rep' });
    // deleted-y intentionally absent from the users map.

    const result = await syncChatChannels();

    expect(result.channelsSynced).toBe(1);
    expect(firestore.batchSets).toHaveLength(1);
    const memberIds = firestore.batchSets[0].data.memberIds as string[];
    // Audience-derived manager kept, active manual rep kept; deleted + deactivated pruned.
    expect([...memberIds].sort()).toEqual(['mgr-1', 'rep-x']);
    // The manual-additions list itself is preserved (merge write leaves it in place).
  });
});
