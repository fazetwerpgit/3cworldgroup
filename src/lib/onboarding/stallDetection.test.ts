import { beforeEach, describe, it, expect, vi } from 'vitest';

const { store, db, dispatchMock } = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();

  function makeDoc(path: string) {
    const id = path.split('/').pop() ?? path;
    return {
      id,
      get: (field: string) => store.get(path)?.[field],
      ref: {
        update: async (data: Record<string, unknown>) => {
          store.set(path, { ...(store.get(path) ?? {}), ...data });
        },
      },
    };
  }

  const db = {
    doc: vi.fn((path: string) => ({
      get: async () => ({
        exists: store.has(path),
        get: (field: string) => store.get(path)?.[field],
      }),
      set: async (data: Record<string, unknown>) => {
        store.set(path, { ...(store.get(path) ?? {}), ...data });
      },
    })),
    collection: vi.fn((name: string) => ({
      where: vi.fn((field: string, _op: string, value: unknown) => ({
        get: async () => {
          const docs = [...store.entries()]
            .filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value)
            .map(([path]) => makeDoc(path));
          return {
            docs,
            forEach: (callback: (doc: ReturnType<typeof makeDoc>) => void) => docs.forEach(callback),
          };
        },
      })),
    })),
  };

  const dispatchMock = vi.fn(async (input: { userId: string; title: string }) => {
    void input;
  });
  return { store, db, dispatchMock };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: db }));
vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: dispatchMock }));
vi.mock('@/lib/alerts/alertTasks', () => ({ createAlertTask: vi.fn(async () => 'task_1') }));
vi.mock('./activation', () => ({ getActivationReadiness: vi.fn(async () => ({ ready: false, missing: ['x'] })) }));

import { dueNudges, runOnboardingNudges } from './stallDetection';
import { getOnboardingItemsForUser } from '@/types/onboarding';
import { isEsignItem } from './esign';

const HOUR = 3600 * 1000;
const now = new Date('2026-07-08T12:00:00Z');
const idleFor = (h: number) => new Date(now.getTime() - h * HOUR);

beforeEach(() => {
  store.clear();
  dispatchMock.mockReset();
  dispatchMock.mockResolvedValue(undefined);
});

describe('dueNudges', () => {
  it('nothing due under 24h idle', () => {
    expect(dueNudges(idleFor(23), now, [])).toEqual([]);
  });

  it('h24 due after a day idle', () => {
    expect(dueNudges(idleFor(25), now, [])).toEqual(['h24']);
  });

  it('does not resend an already-sent tier', () => {
    expect(dueNudges(idleFor(25), now, ['h24'])).toEqual([]);
  });

  it('returns all overdue unsent tiers after a week', () => {
    expect(dueNudges(idleFor(7 * 24 + 1), now, ['h24'])).toEqual(['h72', 'd7']);
  });
});

describe('runOnboardingNudges', () => {
  it('skips pending users whose role does not require onboarding', async () => {
    store.set('users/account-executive', {
      status: 'pending',
      fieldRole: 'general_manager',
      createdAt: idleFor(8 * 24),
    });

    await expect(runOnboardingNudges(now)).resolves.toEqual({
      nudged: 0,
      flaggedAtRisk: 0,
    });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('continues to later users after one user fails', async () => {
    store.set('users/u1', {
      status: 'pending',
      fieldRole: 'entry_level_rep',
      displayName: 'First Rep',
      createdAt: idleFor(73),
    });
    store.set('users/u2', {
      status: 'pending',
      fieldRole: 'entry_level_rep',
      displayName: 'Second Rep',
      createdAt: idleFor(25),
    });

    dispatchMock.mockImplementation(async ({ userId }) => {
      if (userId === 'u1') throw new Error('dispatch failed');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runOnboardingNudges(now)).resolves.toEqual({ nudged: 1, flaggedAtRisk: 0 });

    expect(store.get('onboardingNudges/u1')).toBeUndefined();
    expect(store.get('onboardingNudges/u2')?.sent).toEqual(['h24']);
    expect(errorSpy).toHaveBeenCalledWith('[nudges] failed to process user', 'u1', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('sends at most one tier per run to a hire first seen after a week idle', async () => {
    store.set('users/u1', { status: 'pending', fieldRole: 'entry_level_rep', createdAt: idleFor(8 * 24) });

    await expect(runOnboardingNudges(now)).resolves.toEqual({ nudged: 1, flaggedAtRisk: 0 });
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(store.get('onboardingNudges/u1')?.sent).toEqual(['h24']);
  });

  it('does not nudge a hire whose remaining items all wait on management review', async () => {
    store.set('users/u1', { status: 'pending', fieldRole: 'entry_level_rep', createdAt: idleFor(8 * 24) });
    for (const item of getOnboardingItemsForUser('entry_level_rep', false)) {
      store.set(`userOnboarding/u1_${item.id}`, {
        userId: 'u1',
        itemId: item.id,
        status: isEsignItem(item.id) ? 'approved' : 'submitted',
        submittedAt: idleFor(5 * 24),
      });
    }

    await expect(runOnboardingNudges(now)).resolves.toEqual({ nudged: 0, flaggedAtRisk: 0 });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("measures idle from the hire's own activity, not a reviewer's approval", async () => {
    store.set('users/u1', { status: 'pending', fieldRole: 'entry_level_rep', createdAt: idleFor(8 * 24) });
    store.set('userOnboarding/u1_w9', {
      userId: 'u1',
      itemId: 'w9',
      status: 'approved',
      submittedAt: idleFor(30),
      updatedAt: idleFor(1), // approved an hour ago by a reviewer
    });

    await runOnboardingNudges(now);
    expect(store.get('onboardingNudges/u1')?.sent).toEqual(['h24']);
  });
});
