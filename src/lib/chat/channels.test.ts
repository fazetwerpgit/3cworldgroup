import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => {
  type DocData = Record<string, unknown>;
  // Channel docs to iterate in syncChatChannels, and the users backing both the
  // audience query and the extra-member existence check.
  const channelDocs: Array<{ id: string; data: DocData }> = [];
  const users = new Map<string, DocData>();
  const batchSets: Array<{ ref: { __id: string }; data: DocData }> = [];
  const userWhereCalls: Array<{ field: string; op: string; value: unknown }> = [];

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
          where: vi.fn((field: string, op: string, value: unknown) => {
            userWhereCalls.push({ field, op, value });
            return {
            get: vi.fn(async () => ({
              docs: [...users.entries()]
                .filter(([, d]) => d[field] === value)
                .map(([id, d]) => ({ id, data: (): DocData => d })),
            })),
            };
          }),
          doc: vi.fn((id: string) => ({ __id: id, get: vi.fn(async () => userSnap(id)) })),
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
    userWhereCalls.length = 0;
    adminDb.collection.mockClear();
    adminDb.getAll.mockClear();
    adminDb.batch.mockClear();
  }

  return { adminDb, channelDocs, users, batchSets, userWhereCalls, reset };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: firestore.adminDb,
}));

import { FieldValue } from 'firebase-admin/firestore';
import {
  belongsInChannelDoc,
  createChannelId,
  getMemberIdsForAudience,
  isEligibleChatMember,
  isEligibleSandboxMember,
  planChatChannelSync,
  reconcileChatMembershipForUser,
  syncChatChannels,
  userCanAccessChannelDoc,
} from './channels';
import { canAccessChatChannel, MANAGEMENT_FIELD_ROLES } from '@/types';
import type { ChatChannel } from '@/types';

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

  it('includes onboarding hires in audience membership but excludes self-signups and inactive users', async () => {
    firestore.users.set('active-rep', { status: 'active', fieldRole: 'entry_rep' });
    firestore.users.set('pending-hire', { status: 'pending', fieldRole: 'entry_level_rep' });
    firestore.users.set('pending-self-signup', { status: 'pending' });
    firestore.users.set('inactive-rep', { status: 'inactive', fieldRole: 'entry_rep' });

    const memberIds = await getMemberIdsForAudience('field');

    expect(memberIds.sort()).toEqual(['active-rep', 'pending-hire']);
  });

  it('leaves a demo account out of every audience, even as a manual extra', async () => {
    firestore.users.set('active-rep', { status: 'active', fieldRole: 'entry_rep' });
    firestore.users.set('demo', { status: 'active', role: 'rep', fieldRole: 'entry_level_rep', demoAccount: true });

    for (const audience of ['all', 'field'] as const) {
      expect(await getMemberIdsForAudience(audience)).toEqual(['active-rep']);
    }
    expect(isEligibleChatMember({ status: 'active', fieldRole: 'entry_level_rep', demoAccount: true })).toBe(false);
    expect(isEligibleChatMember({ status: 'active', fieldRole: 'entry_level_rep', demoAccount: false })).toBe(true);
    const channel = { id: 'general', name: 'General', audience: 'all', order: 0, active: true, extraMemberIds: ['demo'] };
    expect(belongsInChannelDoc(channel, 'demo', firestore.users.get('demo')!)).toBe(false);
  });

  it('unions audience-derived members with surviving extras, dropping deleted and deactivated extras', async () => {
    firestore.channelDocs.push({
      id: 'managers',
      data: {
        id: 'managers',
        name: 'Managers',
        audience: 'managers',
        order: 4,
        active: true,
        // rep-x manually added (active), pending-hire manually added mid-onboarding;
        // deleted-y removed; inactive-z deactivated.
        extraMemberIds: ['rep-x', 'pending-hire', 'deleted-y', 'inactive-z'],
      },
    });
    firestore.users.set('mgr-1', { status: 'active', fieldRole: 'l1_manager' });
    firestore.users.set('rep-x', { status: 'active', fieldRole: 'entry_rep' });
    firestore.users.set('pending-hire', { status: 'pending', fieldRole: 'entry_level_rep' });
    firestore.users.set('inactive-z', { status: 'inactive', fieldRole: 'entry_rep' });
    // deleted-y intentionally absent from the users map.

    const result = await syncChatChannels();

    expect(result.channelsSynced).toBe(1);
    expect(firestore.batchSets).toHaveLength(1);
    const memberIds = firestore.batchSets[0].data.memberIds as string[];
    // Audience-derived manager kept, active + onboarding manual members kept;
    // deleted + deactivated pruned.
    expect([...memberIds].sort()).toEqual(['mgr-1', 'pending-hire', 'rep-x']);
    // The manual-additions list itself is preserved (merge write leaves it in place).
  });

  it('fetches active and pending cohorts once for all channels', async () => {
    firestore.channelDocs.push(
      { id: 'all-company', data: { id: 'all-company', name: 'All Company', audience: 'all', order: 1, active: true } },
      { id: 'field', data: { id: 'field', name: 'Field', audience: 'field', order: 2, active: true } },
    );
    firestore.users.set('active-rep', { status: 'active', fieldRole: 'entry_rep' });
    firestore.users.set('pending-hire', { status: 'pending', fieldRole: 'entry_level_rep' });

    await syncChatChannels();

    expect(firestore.userWhereCalls).toEqual([
      { field: 'status', op: '==', value: 'active' },
      { field: 'status', op: '==', value: 'pending' },
    ]);
  });
});

describe('reconcileChatMembershipForUser', () => {
  beforeEach(() => firestore.reset());

  function channel(id: string, audience: string, memberIds: string[], extra: Record<string, unknown> = {}) {
    firestore.channelDocs.push({
      id,
      data: { id, name: id, audience, order: 1, active: true, memberIds, ...extra },
    });
  }

  it('removes a demoted manager from Managers and keeps their other channels', async () => {
    channel('managers', 'managers', ['gm', 'other-mgr']);
    channel('all-company', 'all', ['gm']);
    firestore.users.set('gm', { status: 'active', fieldRole: 'ae_tier_1' });

    const memberOf = await reconcileChatMembershipForUser('gm');

    expect(firestore.batchSets).toEqual([
      { ref: { __id: 'managers' }, data: expect.objectContaining({ memberIds: FieldValue.arrayRemove('gm') }) },
    ]);
    expect(memberOf.map((c) => c.id)).toEqual(['all-company']);
  });

  it('adds a new user to every custom channel their role reaches', async () => {
    channel('qa-general', 'all', ['someone']);
    channel('managers', 'managers', []);
    firestore.users.set('new-rep', { status: 'active', fieldRole: 'entry_rep' });

    await reconcileChatMembershipForUser('new-rep');

    expect(firestore.batchSets).toEqual([
      { ref: { __id: 'qa-general' }, data: expect.objectContaining({ memberIds: FieldValue.arrayUnion('new-rep') }) },
    ]);
  });

  it('removes a deactivated user everywhere, even where they are a manual extra', async () => {
    channel('managers', 'managers', ['gone'], { extraMemberIds: ['gone'] });
    channel('all-company', 'all', ['gone']);
    firestore.users.set('gone', { status: 'inactive', fieldRole: 'l1_manager' });

    const memberOf = await reconcileChatMembershipForUser('gone');

    expect(firestore.batchSets.map((s) => s.ref.__id).sort()).toEqual(['all-company', 'managers']);
    expect(memberOf).toEqual([]);
  });

  it('keeps a manual extra whose role would not reach the channel', async () => {
    channel('managers', 'managers', ['rep-x'], { extraMemberIds: ['rep-x'] });
    firestore.users.set('rep-x', { status: 'active', fieldRole: 'entry_rep' });

    const memberOf = await reconcileChatMembershipForUser('rep-x');

    expect(firestore.batchSets).toEqual([]);
    expect(memberOf.map((c) => c.id)).toEqual(['managers']);
  });
});

describe('canAccessChatChannel', () => {
  it('allows an IBO level 1 user to access a managers channel', () => {
    const channel: ChatChannel = {
      id: 'managers',
      name: 'Managers',
      description: '',
      audience: 'managers',
      order: 1,
      active: true,
    };

    expect(canAccessChatChannel(channel, undefined, 'ibo_level_1')).toBe(true);
  });

  it('admits every management field role and no one else', () => {
    const channel: ChatChannel = {
      id: 'managers',
      name: 'Managers',
      description: '',
      audience: 'managers',
      order: 1,
      active: true,
    };

    for (const fieldRole of MANAGEMENT_FIELD_ROLES) {
      expect(canAccessChatChannel(channel, undefined, fieldRole)).toBe(true);
    }
    for (const fieldRole of ['entry_rep', 'ae_tier_1', 'ae_tier_2', 'internal_rep'] as const) {
      expect(canAccessChatChannel(channel, undefined, fieldRole)).toBe(false);
    }
    expect(canAccessChatChannel(channel, undefined, undefined)).toBe(false);
  });
});

describe('canAccessChatChannel — solar roles', () => {
  const at = (audience: ChatChannel['audience']): ChatChannel => ({ id: audience, name: audience, description: '', audience, order: 0, active: true });

  it('lets a solar-only rep into the company-wide channels and nowhere else', () => {
    expect(canAccessChatChannel(at('all'), undefined, undefined, 'entry_canvasser')).toBe(true);
    expect(canAccessChatChannel(at('field'), undefined, undefined, 'entry_canvasser')).toBe(false);
    expect(canAccessChatChannel(at('managers'), undefined, undefined, 'sales_director')).toBe(false);
    expect(canAccessChatChannel(at('platform'), undefined, undefined, 'sales_director')).toBe(false);
  });

  it('ignores an unknown solar role value', () => {
    expect(canAccessChatChannel(at('all'), undefined, undefined, 'astronaut')).toBe(false);
    expect(canAccessChatChannel(at('all'), undefined, undefined, undefined)).toBe(false);
  });

  it('applies through the channel doc gate, the membership sync and the demo rule', () => {
    const general = { id: 'general', name: 'General', audience: 'all', order: 0, active: true };
    expect(userCanAccessChannelDoc(general, { uid: 's1', solarRole: 'virtual_closer', demoAccount: false })).toBe(true);
    expect(userCanAccessChannelDoc(general, { uid: 's1', solarRole: 'virtual_closer', demoAccount: true })).toBe(false);
    expect(belongsInChannelDoc(general, 's1', { status: 'active', solarRole: 'virtual_closer' })).toBe(true);
    expect(belongsInChannelDoc(general, 's1', { status: 'active' })).toBe(false);
  });
});

describe('userCanAccessChannelDoc — demo accounts', () => {
  const custom = { id: 'leads', name: 'Leads', audience: 'managers', order: 5, active: true, extraMemberIds: ['demo', 'r1'] };
  const general = { id: 'general', name: 'General', audience: 'all', order: 0, active: true };

  it('denies a demo account even when its raw uid sits in extraMemberIds', () => {
    expect(userCanAccessChannelDoc(custom, { uid: 'demo', demoAccount: true })).toBe(false);
    expect(userCanAccessChannelDoc(general, { uid: 'demo', fieldRole: 'entry_level_rep', demoAccount: true })).toBe(false);
  });

  it('still lets a real manual extra and a real audience member in', () => {
    expect(userCanAccessChannelDoc(custom, { uid: 'r1', demoAccount: false })).toBe(true);
    expect(userCanAccessChannelDoc(general, { uid: 'r2', fieldRole: 'entry_level_rep', demoAccount: false })).toBe(true);
  });
});

describe('demo sandbox channel', () => {
  const sandbox = { id: 'app-review', name: 'App Review', audience: 'all', order: 99, active: true, demoSandbox: true, extraMemberIds: ['rep'] };
  const general = { id: 'general', name: 'General', audience: 'all', order: 0, active: true };

  it('admits a demo account to the sandbox and nowhere else', () => {
    expect(userCanAccessChannelDoc(sandbox, { uid: 'demo', demoAccount: true })).toBe(true);
    expect(userCanAccessChannelDoc(general, { uid: 'demo', demoAccount: true })).toBe(false);
  });

  it('keeps every real user out of the sandbox, admins and owners included, except Jacob', () => {
    expect(userCanAccessChannelDoc(sandbox, { uid: 'rep', fieldRole: 'entry_level_rep', demoAccount: false })).toBe(false);
    expect(userCanAccessChannelDoc(sandbox, { uid: 'mgr', fieldRole: 'l1_manager', demoAccount: false })).toBe(false);
    expect(userCanAccessChannelDoc(sandbox, { uid: 'ops', role: 'operations', demoAccount: false })).toBe(false);
    expect(userCanAccessChannelDoc(sandbox, { uid: 'adm', role: 'admin', demoAccount: false })).toBe(false);
    expect(userCanAccessChannelDoc(sandbox, { uid: 'own', role: 'owner', demoAccount: false })).toBe(false);
    // Being in memberIds or extraMemberIds changes nothing.
    const stale = { ...sandbox, memberIds: ['own'], extraMemberIds: ['own'] };
    expect(userCanAccessChannelDoc(stale, { uid: 'own', role: 'owner', demoAccount: false })).toBe(false);
    expect(userCanAccessChannelDoc(sandbox, { uid: 'bQWKezQmd1P9Yf3GzOdXXBkDzj93', role: 'owner', demoAccount: false })).toBe(true);
    expect(userCanAccessChannelDoc(sandbox, { uid: 'x', role: 'owner', demoAccount: false, email: 'JMyers@3cworldgroup.com' })).toBe(true);
  });

  it('closes an archived sandbox to everyone, the demo account included', () => {
    const archived = { ...sandbox, active: false };
    expect(userCanAccessChannelDoc(archived, { uid: 'demo', demoAccount: true })).toBe(false);
    expect(userCanAccessChannelDoc(archived, { uid: 'bQWKezQmd1P9Yf3GzOdXXBkDzj93', role: 'owner', demoAccount: false })).toBe(false);
  });

  it('limits sandbox eligibility to active demo accounts and Jacob', () => {
    expect(isEligibleSandboxMember({ status: 'active', demoAccount: true })).toBe(true);
    expect(isEligibleSandboxMember({ status: 'inactive', demoAccount: true })).toBe(false);
    expect(isEligibleSandboxMember({ status: 'active', role: 'admin' }, 'adm')).toBe(false);
    expect(isEligibleSandboxMember({ status: 'active', role: 'owner' }, 'own')).toBe(false);
    expect(isEligibleSandboxMember({ status: 'active', role: 'owner' }, 'bQWKezQmd1P9Yf3GzOdXXBkDzj93')).toBe(true);
    expect(isEligibleSandboxMember({ status: 'active', role: 'owner', Email: 'jmyers@3cworldgroup.com' }, 'other-uid')).toBe(true);
    expect(isEligibleSandboxMember({ status: 'inactive', role: 'owner' }, 'bQWKezQmd1P9Yf3GzOdXXBkDzj93')).toBe(false);
    expect(isEligibleSandboxMember({ status: 'active', role: 'operations' })).toBe(false);
    expect(isEligibleSandboxMember({ status: 'active', fieldRole: 'l1_manager' })).toBe(false);
    expect(isEligibleChatMember({ status: 'active', demoAccount: true }, sandbox)).toBe(true);
    expect(isEligibleChatMember({ status: 'active', fieldRole: 'entry_level_rep' }, sandbox)).toBe(false);
    expect(isEligibleChatMember({ status: 'active', demoAccount: true }, general)).toBe(false);
  });

  it('belongsInChannelDoc ignores audience and extras for the sandbox', () => {
    expect(belongsInChannelDoc(sandbox, 'demo', { status: 'active', demoAccount: true })).toBe(true);
    expect(belongsInChannelDoc(sandbox, 'adm', { status: 'active', role: 'admin' })).toBe(false);
    expect(belongsInChannelDoc(sandbox, 'bQWKezQmd1P9Yf3GzOdXXBkDzj93', { status: 'active', role: 'owner' })).toBe(true);
    expect(belongsInChannelDoc(sandbox, 'rep', { status: 'active', fieldRole: 'entry_level_rep' })).toBe(false);
  });

  it('sync sets sandbox memberIds to demo accounts plus Jacob only (dropping other admins/owners), and keeps demo out of the rest', async () => {
    firestore.reset();
    firestore.channelDocs.push({ id: 'app-review', data: { ...sandbox, memberIds: ['adm', 'own', 'demo'] } }, { id: 'general', data: general });
    firestore.users.set('bQWKezQmd1P9Yf3GzOdXXBkDzj93', { status: 'active', role: 'owner', email: 'jmyers@3cworldgroup.com' });
    firestore.users.set('demo', { status: 'active', demoAccount: true });
    firestore.users.set('adm', { status: 'active', role: 'admin' });
    firestore.users.set('own', { status: 'active', role: 'owner' });
    firestore.users.set('ops', { status: 'active', role: 'operations' });
    firestore.users.set('rep', { status: 'active', fieldRole: 'entry_level_rep' });
    firestore.users.set('hire', { status: 'pending', fieldRole: 'entry_level_rep' });

    await syncChatChannels();

    const byId = new Map(firestore.batchSets.map((set) => [set.ref.__id, set.data.memberIds as string[]]));
    expect([...(byId.get('app-review') ?? [])].sort()).toEqual(['bQWKezQmd1P9Yf3GzOdXXBkDzj93', 'demo']);
    expect(byId.get('general')).not.toContain('demo');
    expect(byId.get('general')).toContain('rep');
  });

  it('plan (the dry run) reports before and after memberIds and writes nothing', async () => {
    firestore.reset();
    firestore.channelDocs.push({ id: 'app-review', data: { ...sandbox, memberIds: ['adm', 'own', 'demo'] } }, { id: 'general', data: general });
    firestore.users.set('bQWKezQmd1P9Yf3GzOdXXBkDzj93', { status: 'active', role: 'owner', email: 'jmyers@3cworldgroup.com' });
    firestore.users.set('demo', { status: 'active', demoAccount: true });
    firestore.users.set('adm', { status: 'active', role: 'admin' });
    firestore.users.set('own', { status: 'active', role: 'owner' });

    const plan = await planChatChannelSync();

    expect(firestore.adminDb.batch).not.toHaveBeenCalled();
    const sandboxItem = plan.find((item) => item.channelId === 'app-review')!;
    expect(sandboxItem.sandbox).toBe(true);
    expect(sandboxItem.before).toEqual(['adm', 'own', 'demo']);
    expect([...sandboxItem.memberIds].sort()).toEqual(['bQWKezQmd1P9Yf3GzOdXXBkDzj93', 'demo']);
    const generalItem = plan.find((item) => item.channelId === 'general')!;
    expect(generalItem.sandbox).toBe(false);
    expect(generalItem.memberIds).not.toContain('demo');
  });

  it('reconcile removes an owner other than Jacob from the sandbox', async () => {
    firestore.reset();
    firestore.channelDocs.push({ id: 'app-review', data: { ...sandbox, memberIds: ['own'] } });
    const channels = await reconcileChatMembershipForUser('own', { status: 'active', role: 'owner' });
    expect(channels.map((c) => c.id)).toEqual([]);
    expect(firestore.batchSets.some((set) => set.ref.__id === 'app-review')).toBe(true);
  });

  it('reconcile adds the demo account to the sandbox only', async () => {
    firestore.reset();
    firestore.channelDocs.push({ id: 'app-review', data: { ...sandbox, memberIds: [] } }, { id: 'general', data: { ...general, memberIds: [] } });
    const channels = await reconcileChatMembershipForUser('demo', { status: 'active', demoAccount: true });
    expect(channels.map((c) => c.id)).toEqual(['app-review']);
    expect(channels[0].demoSandbox).toBe(true);
  });
});

describe('the Solar channel (audience: solar)', () => {
  beforeEach(() => firestore.reset());
  const solar = { id: 'solar', name: 'Solar', description: '', audience: 'solar', order: 5, active: true };
  const asChannel = solar as ChatChannel;

  it('denies a fiber rep with no solar role, in every gate', () => {
    expect(canAccessChatChannel(asChannel, undefined, 'entry_rep')).toBe(false);
    expect(canAccessChatChannel(asChannel, undefined, 'regional_manager')).toBe(false);
    expect(userCanAccessChannelDoc(solar, { uid: 'f1', fieldRole: 'entry_rep', demoAccount: false })).toBe(false);
    expect(belongsInChannelDoc(solar, 'f1', { status: 'active', fieldRole: 'entry_rep' })).toBe(false);
  });

  it('allows a solar rep, solar-only or with a fiber role too', () => {
    expect(canAccessChatChannel(asChannel, undefined, undefined, 'entry_canvasser')).toBe(true);
    expect(canAccessChatChannel(asChannel, undefined, 'entry_rep', 'virtual_closer')).toBe(true);
    expect(userCanAccessChannelDoc(solar, { uid: 's1', solarRole: 'virtual_closer', demoAccount: false })).toBe(true);
    expect(belongsInChannelDoc(solar, 's1', { status: 'active', solarRole: 'virtual_closer' })).toBe(true);
  });

  it('allows an admin', () => {
    expect(canAccessChatChannel(asChannel, 'admin')).toBe(true);
    expect(userCanAccessChannelDoc(solar, { uid: 'a1', role: 'admin', demoAccount: false })).toBe(true);
  });

  it('keeps a demo account and an unknown solar value out', () => {
    expect(userCanAccessChannelDoc(solar, { uid: 's1', solarRole: 'virtual_closer', demoAccount: true })).toBe(false);
    expect(canAccessChatChannel(asChannel, undefined, undefined, 'astronaut')).toBe(false);
  });

  it('derives memberIds (the unread listener and push roster) from solar roles plus admins only', async () => {
    firestore.users.set('fiber-rep', { status: 'active', fieldRole: 'entry_rep' });
    firestore.users.set('solar-rep', { status: 'active', solarRole: 'entry_canvasser' });
    firestore.users.set('both', { status: 'active', fieldRole: 'entry_rep', solarRole: 'virtual_closer' });
    firestore.users.set('admin', { status: 'active', role: 'admin' });

    expect((await getMemberIdsForAudience('solar')).sort()).toEqual(['admin', 'both', 'solar-rep']);
  });
});
