import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const fake = vi.hoisted(() => {
  const store: Record<string, Map<string, Row>> = { alertTasks: new Map(), notifications: new Map() };
  const read = (row: Row, field: string) =>
    field.split('.').reduce<unknown>((value, key) => (value as Row | undefined)?.[key], row);
  const snapOf = (col: string, id: string) => ({
    id,
    get: (field: string) => read(store[col].get(id)!, field),
    ref: {
      update: vi.fn(async (data: Row) => {
        store[col].set(id, { ...store[col].get(id)!, ...data });
      }),
    },
  });
  const collection = (col: string) => ({
    where: (field: string, op: string, value: unknown) => ({
      get: async () => ({
        docs: [...store[col].entries()]
          .filter(([, row]) =>
            op === 'in' ? (value as unknown[]).includes(read(row, field)) : read(row, field) === value
          )
          .map(([id]) => snapOf(col, id)),
      }),
    }),
  });
  return { store, adminDb: { collection: vi.fn(collection) } };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: fake.adminDb }));
vi.mock('@/lib/notifications/createNotification', () => ({ createNotificationForMany: vi.fn() }));
vi.mock('@/lib/push/sendPush', () => ({ sendPushToUser: vi.fn() }));
vi.mock('@/lib/email/sendEmail', () => ({ sendEmail: vi.fn() }));

import { anonymizeAlertTasks } from './alertTasks';

describe('anonymizeAlertTasks', () => {
  beforeEach(() => {
    fake.store.alertTasks.clear();
    fake.store.notifications.clear();
    fake.store.alertTasks.set('t1', {
      kind: 'pending_assignment',
      subjectUserId: 'u1',
      subjectName: 'Jane Rep',
      title: 'Jane Rep self-registered and needs a position',
      message: 'Assign their role to start onboarding.',
      status: 'resolved',
    });
    fake.store.alertTasks.set('t-other', {
      subjectUserId: 'u2',
      subjectName: 'Other Person',
      title: 'Other Person self-registered and needs a position',
      message: 'm',
    });
    fake.store.notifications.set('n1', {
      userId: 'mgr1',
      title: 'Jane Rep self-registered and needs a position',
      message: 'Assign their role to start onboarding.',
      metadata: { alertTaskId: 't1' },
    });
    fake.store.notifications.set('n2', {
      userId: 'mgr2',
      title: 'Still unclaimed: Jane Rep self-registered and needs a position',
      message: 'Assign their role to start onboarding.',
      metadata: { alertTaskId: 't1' },
    });
    fake.store.notifications.set('n-other', {
      userId: 'mgr1',
      title: 'Other Person self-registered and needs a position',
      message: 'm',
      metadata: { alertTaskId: 't-other' },
    });
  });

  it('re-stamps the task and every manager notification copy, resolved or not', async () => {
    await anonymizeAlertTasks('u1', 'Deleted user');

    expect(fake.store.alertTasks.get('t1')).toMatchObject({
      subjectName: 'Deleted user',
      title: 'Deleted user self-registered and needs a position',
      status: 'resolved',
    });
    expect(fake.store.notifications.get('n1')!.title).toBe('Deleted user self-registered and needs a position');
    expect(fake.store.notifications.get('n2')!.title).toBe(
      'Still unclaimed: Deleted user self-registered and needs a position'
    );
    const all = JSON.stringify([...fake.store.alertTasks.values(), ...fake.store.notifications.values()]);
    expect(all).not.toContain('Jane Rep');
  });

  it('leaves other people alone', async () => {
    await anonymizeAlertTasks('u1', 'Deleted user');
    expect(fake.store.alertTasks.get('t-other')!.subjectName).toBe('Other Person');
    expect(fake.store.notifications.get('n-other')!.title).toContain('Other Person');
  });

  it('is a no-op on a second run', async () => {
    await anonymizeAlertTasks('u1', 'Deleted user');
    await anonymizeAlertTasks('u1', 'Deleted user');
    expect(fake.store.alertTasks.get('t1')!.title).toBe('Deleted user self-registered and needs a position');
  });
});
