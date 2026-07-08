import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  addAlertTaskMock,
  collectionMock,
  createNotificationForManyMock,
  getExistingTasksMock,
  getManagementUsersMock,
  getUserDocMock,
  sendEmailMock,
  sendPushMock,
} = vi.hoisted(() => {
  const getExistingTasksMock = vi.fn();
  const addAlertTaskMock = vi.fn();
  const getManagementUsersMock = vi.fn();
  const getUserDocMock = vi.fn();

  const makeAlertQuery = () => {
    const query = {
      where: vi.fn(),
      limit: vi.fn(),
      get: getExistingTasksMock,
      add: addAlertTaskMock,
    };
    query.where.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    return query;
  };

  const usersCollection = {
    where: vi.fn(() => ({ get: getManagementUsersMock })),
    doc: vi.fn(() => ({ get: getUserDocMock })),
  };

  return {
    addAlertTaskMock,
    collectionMock: vi.fn((name: string) => {
      if (name === 'users') return usersCollection;
      return makeAlertQuery();
    }),
    createNotificationForManyMock: vi.fn(),
    getExistingTasksMock,
    getManagementUsersMock,
    getUserDocMock,
    sendEmailMock: vi.fn(),
    sendPushMock: vi.fn(),
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: collectionMock,
  },
}));
vi.mock('@/lib/notifications/createNotification', () => ({
  createNotificationForMany: createNotificationForManyMock,
}));
vi.mock('@/lib/push/sendPush', () => ({ sendPushToUser: sendPushMock }));
vi.mock('@/lib/email/sendEmail', () => ({ sendEmail: sendEmailMock }));
vi.mock('@/lib/email/templates', () => ({
  appBaseUrl: () => 'http://localhost:3000',
  managerAlertEmail: (input: { title: string; message: string; link: string }) => ({
    subject: input.title,
    htmlBody: input.message,
    textBody: input.link,
  }),
}));

import { createAlertTask, shouldRenag } from './alertTasks';

const HOUR = 3600 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  getExistingTasksMock.mockResolvedValue({ empty: true, docs: [] });
  addAlertTaskMock.mockResolvedValue({ id: 'alert-1' });
  getManagementUsersMock.mockResolvedValue({
    forEach: (callback: (doc: { id: string; get: (field: string) => string | undefined }) => void) => {
      callback({ id: 'manager-1', get: (field: string) => (field === 'status' ? 'active' : undefined) });
    },
  });
  getUserDocMock.mockResolvedValue({
    get: (field: string) => (field === 'email' ? 'manager@example.com' : undefined),
  });
  createNotificationForManyMock.mockResolvedValue(undefined);
  sendPushMock.mockResolvedValue(undefined);
  sendEmailMock.mockResolvedValue({ ok: true });
});

describe('shouldRenag', () => {
  const now = new Date('2026-07-08T12:00:00Z');

  it('re-nags open tasks 24h after creation', () => {
    expect(shouldRenag({ status: 'open', createdAt: new Date(now.getTime() - 25 * HOUR) }, now)).toBe(true);
    expect(shouldRenag({ status: 'open', createdAt: new Date(now.getTime() - 23 * HOUR) }, now)).toBe(false);
  });

  it('uses lastNaggedAt when present', () => {
    const task = {
      status: 'open' as const,
      createdAt: new Date(now.getTime() - 100 * HOUR),
      lastNaggedAt: new Date(now.getTime() - 2 * HOUR),
    };
    expect(shouldRenag(task, now)).toBe(false);
  });

  it('never re-nags claimed or resolved tasks', () => {
    const old = new Date(now.getTime() - 100 * HOUR);
    expect(shouldRenag({ status: 'claimed', createdAt: old }, now)).toBe(false);
    expect(shouldRenag({ status: 'resolved', createdAt: old }, now)).toBe(false);
  });
});

describe('createAlertTask', () => {
  it('resolves with the new doc id when notification fan-out rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createNotificationForManyMock.mockRejectedValueOnce(new Error('notification write failed'));

    await expect(
      createAlertTask({
        kind: 'review_needed',
        subjectUserId: 'rep-1',
        subjectName: 'Rep One',
        title: 'Review needed',
        message: 'Rep One needs review.',
        link: '/portal/onboarding',
      })
    ).resolves.toBe('alert-1');

    expect(addAlertTaskMock).toHaveBeenCalledOnce();
    expect(sendPushMock).toHaveBeenCalledWith('manager-1', {
      title: 'Review needed',
      body: 'Rep One needs review.',
      url: '/portal/onboarding',
    });
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'manager@example.com', subject: 'Review needed' })
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '[alertTasks] broadcast channel failed',
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });
});
