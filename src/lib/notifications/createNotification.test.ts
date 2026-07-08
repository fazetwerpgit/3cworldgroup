import { describe, it, expect, vi, beforeEach } from 'vitest';

const notifAdd = vi.fn(async (_doc: Record<string, unknown>) => ({ id: 'notif_1' }));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => {
      if (name === 'notifications') return { add: notifAdd };
      return { add: vi.fn() };
    },
  },
}));

import { createNotification, createNotificationForMany } from './createNotification';

beforeEach(() => {
  notifAdd.mockClear();
});

describe('createNotification', () => {
  it('writes a notification doc with read=false and returns the id', async () => {
    const id = await createNotification({
      userId: 'u1',
      type: 'onboarding_approved',
      title: 'Approved',
      message: 'Your W-9 was approved',
      link: '/portal/onboarding',
    });
    expect(id).toBe('notif_1');
    const doc = notifAdd.mock.calls[0][0] as unknown as {
      userId: string;
      read: boolean;
      createdAt: Date;
    };
    expect(doc.userId).toBe('u1');
    expect(doc.read).toBe(false);
    expect(doc.createdAt).toBeInstanceOf(Date);
  });

  it('fans out to many users', async () => {
    await createNotificationForMany(['a', 'b', 'c'], {
      type: 'alert_task',
      title: 't',
      message: 'm',
    });
    expect(notifAdd).toHaveBeenCalledTimes(3);
  });
});
