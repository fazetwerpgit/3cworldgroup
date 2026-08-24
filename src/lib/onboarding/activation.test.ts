import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOnboardingItemsForUser, type OnboardingStatus } from '@/types/onboarding';
import { graduatedFieldRole, type FieldRole } from '@/types/auth';

const { store, updates, db, dispatchMock, resolveMock, sendPacketMock } = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const updates: Array<{ path: string; data: Record<string, unknown> }> = [];
  const get = (path: string) => ({
    exists: store.has(path),
    get: (field: string) => store.get(path)?.[field],
  });
  const db = {
    doc: vi.fn((path: string) => ({
      get: async () => get(path),
      update: async (data: Record<string, unknown>) => {
        updates.push({ path, data });
        store.set(path, { ...(store.get(path) ?? {}), ...data });
      },
    })),
    collection: vi.fn((name: string) => ({
      where: vi.fn((_field: string, _op: string, value: unknown) => ({
        get: async () => {
          const docs = [...store.entries()]
            .filter(([path, data]) => path.startsWith(`${name}/`) && data.userId === value)
            .map(([, data]) => ({
              get: (field: string) => data[field],
            }));
          return { forEach: (callback: (doc: { get: (field: string) => unknown }) => void) => docs.forEach(callback) };
        },
      })),
    })),
  };
  return {
    store,
    updates,
    db,
    dispatchMock: vi.fn(async () => undefined),
    resolveMock: vi.fn(async () => undefined),
    sendPacketMock: vi.fn(async () => undefined),
  };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: db }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: vi.fn(() => '__DELETE__') },
}));
vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: dispatchMock }));
vi.mock('@/lib/alerts/alertTasks', () => ({ resolveAlertTasks: resolveMock }));
vi.mock('@/lib/onboarding/ownerNotify', () => ({ sendOnboardingPacket: sendPacketMock }));

import {
  activateUser,
  computeReadiness,
  getActivationReadiness,
  maybeFlagActivationReady,
} from './activation';

beforeEach(() => {
  store.clear();
  updates.length = 0;
  dispatchMock.mockReset();
  resolveMock.mockReset();
  sendPacketMock.mockReset();
});

describe('activateUser', () => {
  it('activates an invited l1_manager without demoting the field role', async () => {
    store.set('users/l1-manager', {
      status: 'pending',
      fieldRole: 'l1_manager',
      atRisk: true,
    });

    await expect(activateUser('l1-manager')).resolves.toEqual({ alreadyActive: false });

    expect(updates).toHaveLength(1);
    expect(updates[0]?.data).toMatchObject({
      status: 'active',
      fieldRole: 'l1_manager',
      atRisk: '__DELETE__',
      hireDate: expect.any(Date),
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
