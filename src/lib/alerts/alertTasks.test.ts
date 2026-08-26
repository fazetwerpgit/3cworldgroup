import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  addAlertTaskMock,
  collectionMock,
  createNotificationForManyMock,
  getExistingTasksMock,
  getManagementUsersMock,
  getUserDocMock,
  runTransactionMock,
  sendEmailMock,
  sendPushMock,
} = vi.hoisted(() => {
  const getExistingTasksMock = vi.fn();
  const addAlertTaskMock = vi.fn();
  const getManagementUsersMock = vi.fn();
  const getUserDocMock = vi.fn();
  const runTransactionMock = vi.fn();
  const alertTaskRef = { id: 'alert-1' };

  const makeAlertQuery = () => {
    const query = {
      where: vi.fn(),
      limit: vi.fn(),
      get: getExistingTasksMock,
      add: addAlertTaskMock,
      doc: vi.fn(() => alertTaskRef),
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
    runTransactionMock,
    sendEmailMock: vi.fn(),
    sendPushMock: vi.fn(),
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: collectionMock,
    runTransaction: runTransactionMock,
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

import { createAlertTask, dismissAlertTask, shouldRenag } from './alertTasks';

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
  runTransactionMock.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      get: vi.fn(),
      update: vi.fn(),
    })
  );
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

describe('dismissAlertTask', () => {
  it('returns not_found when the task does not exist', async () => {
    const txGetMock = vi.fn().mockResolvedValue({ exists: false });
    const txUpdateMock = vi.fn();
    runTransactionMock.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ get: txGetMock, update: txUpdateMock })
    );

    await expect(dismissAlertTask('missing', 'manager-1', 'Manager One')).resolves.toBe('not_found');
    expect(txUpdateMock).not.toHaveBeenCalled();
  });

  it.each(['open', 'claimed'])('resolves a %s task with dismissal details', async (status) => {
    const txGetMock = vi.fn().mockResolvedValue({ exists: true, get: () => status });
    const txUpdateMock = vi.fn();
    runTransactionMock.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ get: txGetMock, update: txUpdateMock })
    );

    await expect(dismissAlertTask('alert-1', 'manager-1', 'Manager One')).resolves.toBe('dismissed');
    expect(txUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'alert-1' }),
      {
        status: 'resolved',
        resolvedAt: expect.any(Date),
        dismissedBy: 'manager-1',
        dismissedByName: 'Manager One',
      }
    );
  });

  it('returns dismissed without writing an already resolved task', async () => {
    const txGetMock = vi.fn().mockResolvedValue({ exists: true, get: () => 'resolved' });
    const txUpdateMock = vi.fn();
    runTransactionMock.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ get: txGetMock, update: txUpdateMock })
    );

    await expect(dismissAlertTask('alert-1', 'manager-1', 'Manager One')).resolves.toBe('dismissed');
    expect(txUpdateMock).not.toHaveBeenCalled();
  });
});
