import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOnboardingItemsForUser, type OnboardingStatus } from '@/types/onboarding';
import { graduatedFieldRole, type FieldRole } from '@/types/auth';

const { store, updates, sets, db, dispatchMock, resolveMock, sendPacketMock } = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const updates: Array<{ path: string; data: Record<string, unknown> }> = [];
  const sets: Array<{ path: string; data: Record<string, unknown> }> = [];
  const setDoc = async (path: string, data: Record<string, unknown>) => {
    sets.push({ path, data });
    store.set(path, { ...(store.get(path) ?? {}), ...data });
  };
  const get = (path: string) => ({
    exists: store.has(path),
    get: (field: string) => store.get(path)?.[field],
  });
  // Transactions run one at a time, like Firestore retrying on contention.
  let txChain: Promise<unknown> = Promise.resolve();
  const db = {
    runTransaction: vi.fn(<T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const run = txChain.then(() =>
        fn({
          get: async (ref: { path: string }) => get(ref.path),
          update: (ref: { path: string }, data: Record<string, unknown>) => {
            updates.push({ path: ref.path, data });
            store.set(ref.path, { ...(store.get(ref.path) ?? {}), ...data });
          },
        })
      );
      txChain = run.catch(() => undefined);
      return run;
    }),
    doc: vi.fn((path: string) => ({
      path,
      get: async () => get(path),
      update: async (data: Record<string, unknown>) => {
        updates.push({ path, data });
        const next: Record<string, unknown> = { ...(store.get(path) ?? {}), ...data };
        for (const key of Object.keys(data)) if (data[key] === '__DELETE__') delete next[key];
        store.set(path, next);
      },
    })),
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        set: async (data: Record<string, unknown>) => setDoc(`${name}/${id}`, data),
      })),
      where: vi.fn((field: string, _op: string, value: unknown) => ({
        get: async () => {
          const docs = [...store.entries()]
            .filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value)
            .map(([path, data]) => ({
              get: (f: string) => data[f],
              ref: { set: async (d: Record<string, unknown>) => setDoc(path, d) },
            }));
          return { forEach: (callback: (doc: (typeof docs)[number]) => void) => docs.forEach(callback) };
        },
      })),
    })),
  };
  return {
    store,
    updates,
    sets,
    db,
    dispatchMock: vi.fn(async () => undefined),
    resolveMock: vi.fn(async () => undefined),
    sendPacketMock: vi.fn<(opts: { userId: string }) => Promise<{ attempted: number; ok: number }>>(
      async () => ({ attempted: 1, ok: 1 })
    ),
  };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: db }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: vi.fn(() => '__DELETE__'), serverTimestamp: vi.fn(() => '__SERVER_TS__') },
}));
vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: dispatchMock }));
vi.mock('@/lib/alerts/alertTasks', () => ({ resolveAlertTasks: resolveMock }));
vi.mock('@/lib/onboarding/ownerNotify', () => ({ sendOnboardingPacket: sendPacketMock }));
const reconcileMock = vi.hoisted(() => vi.fn(async () => []));
vi.mock('@/lib/chat/channels', () => ({ reconcileChatMembershipForUser: reconcileMock }));

import {
  activateUser,
  computeReadiness,
  getActivationReadiness,
  maybeFlagActivationReady,
  PACKET_EMAILED_FIELD,
  sendOnboardingPacketOnce,
} from './activation';

beforeEach(() => {
  store.clear();
  updates.length = 0;
  sets.length = 0;
  dispatchMock.mockReset();
  resolveMock.mockReset();
  sendPacketMock.mockReset().mockResolvedValue({ attempted: 2, ok: 2 });
  reconcileMock.mockClear();
});

describe('activateUser', () => {
  it('activates an invited l1_manager without demoting the field role', async () => {
    store.set('users/l1-manager', {
      status: 'pending',
      fieldRole: 'l1_manager',
      atRisk: true,
    });

    await expect(activateUser('l1-manager')).resolves.toEqual({ alreadyActive: false });

    // The status flip, then the owner-packet stamp.
    expect(updates).toHaveLength(2);
    expect(updates[1]?.data).toEqual({ [PACKET_EMAILED_FIELD]: '__SERVER_TS__' });
    expect(updates[0]?.data).toMatchObject({
      status: 'active',
      fieldRole: 'l1_manager',
      atRisk: '__DELETE__',
      hireDate: expect.any(Date),
      activatedAt: '__SERVER_TS__',
      updatedAt: expect.any(Date),
    });
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'l1-manager',
        type: 'rep_activated',
        title: 'Onboarding complete — your new role: L1 Manager',
        message: 'Your onboarding is complete.',
        link: '/portal',
        email: expect.anything(),
      })
    );
    expect(resolveMock).toHaveBeenCalledWith('l1-manager');
  });

  it('graduates an entry_level_rep to ae_tier_1', async () => {
    store.set('users/entry-level-rep', {
      status: 'pending',
      fieldRole: 'entry_level_rep',
    });

    await activateUser('entry-level-rep');

    expect(updates[0]?.data).toMatchObject({
      status: 'active',
      fieldRole: 'ae_tier_1',
    });
    // The graduated role may reach different chat channels.
    expect(reconcileMock).toHaveBeenCalledWith('entry-level-rep');
  });

  it('does not add a field role when the target has none', async () => {
    store.set('users/no-field-role', { status: 'pending' });

    await activateUser('no-field-role');

    expect(updates[0]?.data).not.toHaveProperty('fieldRole');
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'no-field-role',
        type: 'rep_activated',
        title: 'Welcome aboard - you are active',
        email: expect.anything(),
      })
    );
  });

  it('returns alreadyActive without writing for an already-active user', async () => {
    store.set('users/already-active', { status: 'active', fieldRole: 'entry_rep' });

    await expect(activateUser('already-active')).resolves.toEqual({ alreadyActive: true });

    expect(updates).toHaveLength(0);
  });

  it('returns null when the user document is missing', async () => {
    await expect(activateUser('missing-user')).resolves.toBeNull();

    expect(updates).toHaveLength(0);
  });

  it('closes out the open invite and its application on activation', async () => {
    store.set('users/hire', { status: 'pending', fieldRole: 'entry_level_rep' });
    store.set('onboardingInvites/inv1', { status: 'submitted', convertedUserId: 'hire', applicationId: 'app1' });
    store.set('onboardingInvites/old', { status: 'rejected', convertedUserId: 'hire' });

    await activateUser('hire');

    expect(store.get('onboardingInvites/inv1')).toMatchObject({ status: 'converted', convertedUserId: 'hire' });
    expect(store.get('applications/app1')).toMatchObject({ status: 'converted', convertedUserId: 'hire' });
    expect(store.get('onboardingInvites/old')?.status).toBe('rejected');
  });
});

describe('computeReadiness', () => {
  const items = getOnboardingItemsForUser('entry_level_rep', false);
  // Every role that runs a checklist, not just the ones still on the invite
  // form — a retired tier must keep activating for hires already on it.
  const onboardingRoles: FieldRole[] = [
    'entry_level_rep',
    'ae_tier_1',
    'ae_tier_2',
    'regional_manager',
    'director',
    'entry_rep',
    'l1_manager',
    'l2_manager',
    'ibo_level_1',
    'ibo_level_2',
    'ibo_level_3',
    'ibo_level_4',
  ];

  it('not ready when nothing is approved', () => {
    const r = computeReadiness(items, {});
    expect(r.ready).toBe(false);
    expect(r.missing).toContain('background_check');
  });

  it('ready when every applicable item is approved', () => {
    const statuses = Object.fromEntries(
      items.map((i) => [i.id, 'approved' as OnboardingStatus])
    );
    expect(computeReadiness(items, statuses)).toEqual({ ready: true, missing: [] });
  });

  it('a rejected background screen blocks activation', () => {
    const statuses = Object.fromEntries(
      items.map((i) => [i.id, 'approved' as OnboardingStatus])
    );
    statuses.background_check = 'rejected';
    const r = computeReadiness(items, statuses);
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual(['background_check']);
  });

  it('reports non-onboarding roles as not ready without checklist items', async () => {
    store.set('users/non-onboarding', { status: 'pending', fieldRole: 'general_manager' });
    await expect(getActivationReadiness('non-onboarding')).resolves.toEqual({
      ready: false,
      missing: [],
    });
  });

  it('auto-promotes and activates an entry-level rep when all items are approved', async () => {
    store.set('users/ready-rep', {
      status: 'pending',
      fieldRole: 'entry_level_rep',
      displayName: 'Ready Rep',
    });
    for (const item of items) {
      store.set(`userOnboarding/ready-rep_${item.id}`, {
        userId: 'ready-rep',
        itemId: item.id,
        status: 'approved',
      });
    }

    await maybeFlagActivationReady('ready-rep');

    expect(store.get('users/ready-rep')).toMatchObject({
      fieldRole: 'ae_tier_1',
      status: 'active',
    });
    expect(updates[0]?.data).toMatchObject({
      fieldRole: 'ae_tier_1',
      status: 'active',
      hireDate: expect.any(Date),
      atRisk: '__DELETE__',
      updatedAt: expect.any(Date),
    });
    expect(resolveMock).toHaveBeenCalledWith('ready-rep');
    expect(sendPacketMock).toHaveBeenCalledWith({ userId: 'ready-rep' });
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'ready-rep',
        type: 'rep_activated',
        title: 'Onboarding complete — your new role: Account Executive Tier 1',
        message: 'Your onboarding is complete.',
        link: '/portal',
        email: expect.anything(),
      })
    );
  });

  it('does not activate or dispatch while an item is still submitted', async () => {
    const userId = 'not-ready-rep';
    store.set(`users/${userId}`, {
      status: 'pending',
      fieldRole: 'entry_level_rep',
    });
    for (const item of items) {
      store.set(`userOnboarding/${userId}_${item.id}`, {
        userId,
        itemId: item.id,
        status: item.id === 'background_check' ? 'submitted' : 'approved',
      });
    }

    await maybeFlagActivationReady(userId);

    expect(updates).toHaveLength(0);
    expect(store.get(`users/${userId}`)).toMatchObject({ status: 'pending' });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('names an invited l1 manager in the activation notification', async () => {
    const userId = 'ready-l1-manager';
    store.set(`users/${userId}`, { status: 'pending', fieldRole: 'l1_manager' });
    for (const item of getOnboardingItemsForUser('l1_manager', false)) {
      store.set(`userOnboarding/${userId}_${item.id}`, {
        userId, itemId: item.id, status: 'approved',
      });
    }

    await maybeFlagActivationReady(userId);

    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        title: 'Onboarding complete — your new role: L1 Manager',
      })
    );
    expect(dispatchMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('Account Executive') })
    );
  });

  it.each(onboardingRoles)('activates an invited %s into its graduated role', async (invitedRole) => {
    const userId = `ready-${invitedRole}`;
    store.set(`users/${userId}`, {
      status: 'pending',
      fieldRole: invitedRole,
    });
    for (const item of getOnboardingItemsForUser(invitedRole, false)) {
      store.set(`userOnboarding/${userId}_${item.id}`, {
        userId,
        itemId: item.id,
        status: 'approved',
      });
    }

    await maybeFlagActivationReady(userId);

    expect(store.get(`users/${userId}`)).toMatchObject({
      status: 'active',
      fieldRole: graduatedFieldRole(invitedRole),
    });
  });

  it('leaves a pending user with no field role unchanged', async () => {
    store.set('users/no-field-role', { status: 'pending' });

    await maybeFlagActivationReady('no-field-role');

    expect(store.get('users/no-field-role')).toEqual({ status: 'pending' });
  });
});

describe('activation side effects', () => {
  function seedReady(userId: string) {
    store.set(`users/${userId}`, { status: 'pending', fieldRole: 'entry_level_rep', displayName: 'Rep' });
    for (const item of getOnboardingItemsForUser('entry_level_rep', false)) {
      store.set(`userOnboarding/${userId}_${item.id}`, { userId, itemId: item.id, status: 'approved' });
    }
  }

  it('activates once and sends one packet when two approval paths race', async () => {
    seedReady('race-rep');

    await Promise.all([maybeFlagActivationReady('race-rep'), maybeFlagActivationReady('race-rep')]);

    expect(store.get('users/race-rep')?.status).toBe('active');
    const flips = updates.filter((u) => u.path === 'users/race-rep' && u.data.status === 'active');
    expect(flips).toHaveLength(1);
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(sendPacketMock).toHaveBeenCalledTimes(1);
  });

  it('skips the owner packet when the user was already activated by another path', async () => {
    seedReady('late-rep');
    // Another path activates the user after the pending check, before the flip.
    const original = db.runTransaction.getMockImplementation()!;
    db.runTransaction.mockImplementationOnce(async (fn) => {
      store.set('users/late-rep', { ...(store.get('users/late-rep') ?? {}), status: 'active' });
      return original(fn);
    });

    await maybeFlagActivationReady('late-rep');

    expect(dispatchMock).not.toHaveBeenCalled();
    expect(sendPacketMock).not.toHaveBeenCalled();
  });

  it('still sends the activation notice and owner packet when alert resolve throws', async () => {
    seedReady('flaky-rep');
    resolveMock.mockRejectedValueOnce(new Error('firestore unavailable'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await maybeFlagActivationReady('flaky-rep');

    expect(store.get('users/flaky-rep')?.status).toBe('active');
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(sendPacketMock).toHaveBeenCalledWith({ userId: 'flaky-rep' });
    errSpy.mockRestore();
  });

  // Manual Activate (onboarding/activate) and recruiting convert both call
  // activateUser directly, so these cover those routes.
  it('sends the packet on a direct activateUser (manual Activate / recruiting convert) and stamps the user', async () => {
    seedReady('manual-rep');

    await activateUser('manual-rep');

    expect(sendPacketMock).toHaveBeenCalledTimes(1);
    expect(sendPacketMock).toHaveBeenCalledWith({ userId: 'manual-rep' });
    expect(store.get('users/manual-rep')?.[PACKET_EMAILED_FIELD]).toBe('__SERVER_TS__');
  });

  it('sends one packet when activation runs twice, or auto runs before manual', async () => {
    seedReady('twice-rep');
    await activateUser('twice-rep');
    await activateUser('twice-rep');
    seedReady('auto-then-manual');
    await maybeFlagActivationReady('auto-then-manual');
    await activateUser('auto-then-manual');

    expect(sendPacketMock).toHaveBeenCalledTimes(2);
    expect(sendPacketMock).toHaveBeenCalledWith({ userId: 'twice-rep' });
    expect(sendPacketMock).toHaveBeenCalledWith({ userId: 'auto-then-manual' });
  });

  it('sends no second packet when a rep is deactivated and activated again', async () => {
    seedReady('again-rep');
    await activateUser('again-rep');
    store.set('users/again-rep', { ...(store.get('users/again-rep') ?? {}), status: 'pending' });

    await activateUser('again-rep');

    expect(dispatchMock).toHaveBeenCalledTimes(2);
    expect(sendPacketMock).toHaveBeenCalledTimes(1);
  });

  it('sends one packet when sendOnboardingPacketOnce races itself', async () => {
    seedReady('race-claim');

    const results = await Promise.all([sendOnboardingPacketOnce('race-claim'), sendOnboardingPacketOnce('race-claim')]);

    expect(results.sort()).toEqual([false, true]);
    expect(sendPacketMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no recipients (or the lookup failed)', { attempted: 0, ok: 0 }],
    ['every send failed', { attempted: 2, ok: 0 }],
  ])('releases the stamp when %s, so the next activation path retries', async (_label, tally) => {
    seedReady('retry-rep');
    sendPacketMock.mockResolvedValueOnce(tally);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await activateUser('retry-rep');
    expect(store.get('users/retry-rep')).not.toHaveProperty(PACKET_EMAILED_FIELD);

    await expect(sendOnboardingPacketOnce('retry-rep')).resolves.toBe(true);
    expect(sendPacketMock).toHaveBeenCalledTimes(2);
    expect(store.get('users/retry-rep')?.[PACKET_EMAILED_FIELD]).toBe('__SERVER_TS__');
    errSpy.mockRestore();
  });

  it('keeps the stamp when only some packet sends failed', async () => {
    seedReady('partial-rep');
    sendPacketMock.mockResolvedValueOnce({ attempted: 2, ok: 1 });

    await activateUser('partial-rep');
    await sendOnboardingPacketOnce('partial-rep');

    expect(sendPacketMock).toHaveBeenCalledTimes(1);
    expect(store.get('users/partial-rep')?.[PACKET_EMAILED_FIELD]).toBe('__SERVER_TS__');
  });

  it('with deferPacket, activates and reports the packet due without sending it', async () => {
    seedReady('deferred-rep');

    await expect(activateUser('deferred-rep', { deferPacket: true })).resolves.toEqual({
      alreadyActive: false,
      packetDue: true,
    });

    expect(store.get('users/deferred-rep')?.status).toBe('active');
    expect(sendPacketMock).not.toHaveBeenCalled();
    store.set('users/no-role', { status: 'pending' });
    await expect(activateUser('no-role', { deferPacket: true })).resolves.toEqual({
      alreadyActive: false,
      packetDue: false,
    });
  });

  it('activates a demo account but sends it no packet', async () => {
    seedReady('demo-rep');
    store.set('users/demo-rep', { ...(store.get('users/demo-rep') ?? {}), demoAccount: true });

    await activateUser('demo-rep');

    expect(store.get('users/demo-rep')?.status).toBe('active');
    expect(sendPacketMock).not.toHaveBeenCalled();
  });

  it('activates a test account but sends it no packet', async () => {
    seedReady('qa-rep');
    store.set('users/qa-rep', { ...(store.get('users/qa-rep') ?? {}), testAccount: true });

    await activateUser('qa-rep');

    expect(store.get('users/qa-rep')?.status).toBe('active');
    expect(sendPacketMock).not.toHaveBeenCalled();
    expect(store.get('users/qa-rep')?.[PACKET_EMAILED_FIELD]).toBeUndefined();
  });

  it('sends no packet for a user with no checklist role', async () => {
    store.set('users/no-role', { status: 'pending' });

    await activateUser('no-role');

    expect(sendPacketMock).not.toHaveBeenCalled();
  });

  it('still sends the owner packet when the activation notice fails', async () => {
    seedReady('nopush-rep');
    dispatchMock.mockRejectedValueOnce(new Error('push down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await maybeFlagActivationReady('nopush-rep');

    expect(sendPacketMock).toHaveBeenCalledWith({ userId: 'nopush-rep' });
    errSpy.mockRestore();
  });
});
