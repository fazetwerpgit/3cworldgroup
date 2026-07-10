import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOnboardingItemsForUser, type OnboardingStatus } from '@/types/onboarding';

const { store, db, dispatchMock, resolveMock } = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const get = (path: string) => ({
    exists: store.has(path),
    get: (field: string) => store.get(path)?.[field],
  });
  const db = {
    doc: vi.fn((path: string) => ({
      get: async () => get(path),
      update: async (data: Record<string, unknown>) => {
        store.set(path, { ...(store.get(path) ?? {}), ...data });
      },
    })),
    collection: vi.fn((name: string) => ({
      where: vi.fn((_field: string, _op: string, value: unknown) => ({
        get: async () => {
          const docs = [...store.entries()]
            .filter(([path, data]) => path.startsWith(`${name}/`) && data.userId === value)
            .map(([path, data]) => ({
              get: (field: string) => data[field],
            }));
          return { forEach: (callback: (doc: { get: (field: string) => unknown }) => void) => docs.forEach(callback) };
        },
      })),
    })),
  };
  return {
    store,
    db,
    dispatchMock: vi.fn(async () => undefined),
    resolveMock: vi.fn(async () => undefined),
  };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: db }));
vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: dispatchMock }));
vi.mock('@/lib/alerts/alertTasks', () => ({ resolveAlertTasks: resolveMock }));

import { computeReadiness, getActivationReadiness, maybeFlagActivationReady } from './activation';

beforeEach(() => {
  store.clear();
  dispatchMock.mockReset();
  resolveMock.mockReset();
});

describe('computeReadiness', () => {
  const items = getOnboardingItemsForUser('entry_level_rep', false);

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
    store.set('users/non-onboarding', { status: 'pending', fieldRole: 'entry_rep' });
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
      fieldRole: 'entry_rep',
      status: 'active',
    });
    expect(resolveMock).toHaveBeenCalledWith('ready-rep');
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'ready-rep',
        type: 'rep_activated',
        title: "Onboarding complete — you're now an Account Executive",
      })
    );
  });
});
