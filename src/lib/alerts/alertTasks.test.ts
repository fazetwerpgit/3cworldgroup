import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  addAlertTaskMock,
  collectionMock,
  createNotificationForManyMock,
  getExistingTasksMock,
  getManagementUsersMock,
  getOnboardingRowsMock,
  getUserDocMock,
  runTransactionMock,
  sendEmailMock,
  sendPushMock,
} = vi.hoisted(() => {
  const getExistingTasksMock = vi.fn();
  const addAlertTaskMock = vi.fn();
  const getManagementUsersMock = vi.fn();
  const getUserDocMock = vi.fn();
  const getOnboardingRowsMock = vi.fn();
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

  const onboardingCollection = {
    where: vi.fn(() => ({ get: getOnboardingRowsMock })),
  };

  return {
    addAlertTaskMock,
    collectionMock: vi.fn((name: string) => {
      if (name === 'users') return usersCollection;
      if (name === 'userOnboarding') return onboardingCollection;
      return makeAlertQuery();
    }),
    createNotificationForManyMock: vi.fn(),
    getExistingTasksMock,
    getManagementUsersMock,
    getOnboardingRowsMock,
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

vi.mock('@/types/onboarding', () => ({
  getOnboardingItemsForUser: (fieldRole: string) =>
    fieldRole === 'trainee'
      ? [
          { id: 'contract', referenceKind: 'esign' },
          { id: 'w9', referenceKind: 'esign' },
          { id: 'drivers_license', referenceKind: 'storage' },
        ]
      : [],
}));
vi.mock('@/lib/onboarding/esign', () => ({
  isEsignItem: (id: string) => ['contract', 'w9', 'fcra_auth'].includes(id),
}));
vi.mock('@/types/auth', () => ({
  MANAGEMENT_PLATFORM_ROLES: ['owner', 'admin', 'operations'],
  roleRequiresOnboarding: (role?: string) => role === 'trainee',
}));

import {
  createAlertTask,
  dismissAlertTask,
  renagStaleTasks,
  resolveSigningAlertTasks,
  shouldRenag,
} from './alertTasks';

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
  getOnboardingRowsMock.mockResolvedValue({ docs: [] });
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
  const INPUT = {
    kind: 'review_needed' as const,
    subjectUserId: 'rep-1',
    subjectName: 'Rep One',
    title: 'Review needed',
    message: 'Rep One needs review.',
    link: '/portal/onboarding',
  };

  // tx.get: the key doc (a ref with an id) or the legacy duplicate query.
  function useTx(opts: { keyedTask?: { status: string } } = {}) {
    const create = vi.fn();
    const set = vi.fn();
    runTransactionMock.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        get: vi.fn(async (target: { id?: string }) => {
          if (target.id === undefined) return { empty: true, docs: [] };
          if (opts.keyedTask && target.id === 'alert-1') {
            return { exists: true, get: (f: string) => (f === 'taskId' ? 'alert-1' : opts.keyedTask?.status) };
          }
          return { exists: false, get: () => undefined };
        }),
        create,
        set,
      })
    );
    return { create, set };
  }

  it('resolves with the new doc id when notification fan-out rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createNotificationForManyMock.mockRejectedValueOnce(new Error('notification write failed'));
    const { create } = useTx();

    await expect(createAlertTask(INPUT)).resolves.toBe('alert-1');

    expect(create).toHaveBeenCalledOnce();
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

  it('returns the open task held by the key doc without creating or broadcasting', async () => {
    const { create } = useTx({ keyedTask: { status: 'open' } });

    await expect(createAlertTask(INPUT)).resolves.toBe('alert-1');

    expect(create).not.toHaveBeenCalled();
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it('notifies only back-office roles, never field managers who cannot act on it', async () => {
    useTx();
    await createAlertTask(INPUT);

    // One users query (role in owner/admin/operations); no fieldRole query.
    expect(getManagementUsersMock).toHaveBeenCalledTimes(1);
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

describe('renagStaleTasks', () => {
  it('closes a task whose subject account no longer exists instead of nagging about it', async () => {
    // One deleted bot signup emailed every admin daily for ten days because
    // nothing that deletes an account knew the alert existed.
    const now = new Date('2026-09-11T14:00:00Z');
    const update = vi.fn(async () => undefined);
    getExistingTasksMock.mockResolvedValueOnce({
      docs: [
        {
          id: 'alert-ghost',
          ref: { update },
          get: (field: string) =>
            ({
              status: 'open',
              kind: 'pending_assignment',
              subjectUserId: 'ghost-uid',
              subjectName: 'ghost',
              title: 'ghost self-registered and needs a position',
              message: 'Assign their role.',
              link: '/portal/admin',
              createdAt: new Date('2026-09-01T00:00:00Z'),
              lastNaggedAt: undefined,
            })[field],
        },
      ],
    });
    getUserDocMock.mockResolvedValueOnce({ exists: false });

    const count = await renagStaleTasks(now);

    expect(count).toBe(0);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'resolved' }));
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

type Row = Record<string, unknown>;

const fields = (data: Row) => ({ get: (field: string) => data[field] });

function onboardingRows(rows: Array<{ itemId: string; status: string }>) {
  getOnboardingRowsMock.mockResolvedValue({ docs: rows.map((row) => fields(row)) });
}

function subjectDoc(data: Row) {
  return { exists: true, ...fields(data) };
}

function taskDoc(id: string, data: Row) {
  const update = vi.fn(async () => undefined);
  return {
    update,
    doc: {
      id,
      ref: { update },
      ...fields({
        status: 'open',
        subjectUserId: 'rep-1',
        subjectName: 'Rep One',
        message: 'Something happened.',
        link: '/portal/admin/onboarding',
        createdAt: new Date('2026-09-26T00:00:00Z'),
        ...data,
      }),
    },
  };
}

describe('renagStaleTasks signing alerts', () => {
  const now = new Date('2026-10-13T14:00:00Z');

  async function renagOne(task: ReturnType<typeof taskDoc>, subject: Row) {
    getExistingTasksMock.mockResolvedValueOnce({ docs: [task.doc] });
    getUserDocMock.mockResolvedValueOnce(subjectDoc(subject));
    return renagStaleTasks(now);
  }

  it('closes a signing alert once the rep has nothing left to sign', async () => {
    onboardingRows([
      { itemId: 'contract', status: 'approved' },
      { itemId: 'w9', status: 'approved' },
      { itemId: 'fcra_auth', status: 'submitted' }, // held: never signed, never counts
    ]);
    const task = taskDoc('alert-sign', {
      kind: 'review_needed',
      title: 'E-signature delivery needs attention',
    });

    const count = await renagOne(task, { status: 'pending', fieldRole: 'trainee' });

    expect(count).toBe(0);
    expect(task.update).toHaveBeenCalledWith({
      status: 'resolved',
      resolvedAt: now,
      resolvedReason: 'every e-sign document is signed',
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(createNotificationForManyMock).not.toHaveBeenCalled();
  });

  it('keeps nagging about a signing alert while a checklist document is unsigned', async () => {
    // w9 has no row yet but is on the onboarding rep's checklist.
    onboardingRows([{ itemId: 'contract', status: 'approved' }]);
    const task = taskDoc('alert-sign', {
      kind: 'review_needed',
      title: 'E-signature delivery needs attention',
    });

    const count = await renagOne(task, { status: 'pending', fieldRole: 'trainee' });

    expect(count).toBe(1);
    expect(task.update).toHaveBeenCalledWith({ lastNaggedAt: now });
    expect(createNotificationForManyMock).toHaveBeenCalledWith(
      ['manager-1'],
      expect.objectContaining({ title: 'Still unclaimed: E-signature delivery needs attention' })
    );
  });

  it('closes a retired-source alert for an active rep even with an unsigned row on file', async () => {
    // The Sep 26 "failed to load" alert: its route was deleted with the old
    // vendor, the rep signed in-house and is active, yet it re-nagged daily.
    onboardingRows([{ itemId: 'w9', status: 'submitted' }]);
    const task = taskDoc('1kEOaVQ4rbEFpeU88jKB', {
      kind: 'review_needed',
      title: 'In-portal signing failed to load',
    });

    const count = await renagOne(task, { status: 'active', fieldRole: 'rep' });

    expect(count).toBe(0);
    expect(task.update).toHaveBeenCalledWith({
      status: 'resolved',
      resolvedAt: now,
      resolvedReason: 'retired alert source (removed signing vendor) and the subject is active',
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('closes a retired-source alert for a rep still onboarding once everything is signed', async () => {
    onboardingRows([
      { itemId: 'contract', status: 'approved' },
      { itemId: 'w9', status: 'approved' },
    ]);
    const task = taskDoc('alert-old', { kind: 'review_needed', title: 'In-portal signing failed to load' });

    const count = await renagOne(task, { status: 'pending', fieldRole: 'trainee' });

    expect(count).toBe(0);
    expect(task.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'resolved', resolvedReason: 'every e-sign document is signed' })
    );
  });

  it('keeps nagging when the e-sign check fails rather than guessing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getOnboardingRowsMock.mockRejectedValueOnce(new Error('firestore down'));
    const task = taskDoc('alert-sign', { kind: 'review_needed', title: 'E-signature delivery needs attention' });

    const count = await renagOne(task, { status: 'pending', fieldRole: 'trainee' });

    expect(count).toBe(1);
    expect(task.update).toHaveBeenCalledWith({ lastNaggedAt: now });
    errorSpy.mockRestore();
  });

  it.each([
    ['an unrelated review_needed task', { kind: 'review_needed', title: 'Review needed' }],
    ['a stalled_rep task', { kind: 'stalled_rep', title: 'In-portal signing failed to load' }],
  ])('still re-nags %s even when nothing is left to sign', async (_label, data) => {
    onboardingRows([{ itemId: 'contract', status: 'approved' }]);
    const task = taskDoc('alert-other', data);

    const count = await renagOne(task, { status: 'active', fieldRole: 'rep' });

    expect(count).toBe(1);
    expect(task.update).toHaveBeenCalledWith({ lastNaggedAt: now });
    expect(getOnboardingRowsMock).not.toHaveBeenCalled();
  });
});

describe('resolveSigningAlertTasks', () => {
  function openTasks(...tasks: Array<ReturnType<typeof taskDoc>>) {
    getExistingTasksMock.mockResolvedValueOnce({ docs: tasks.map((task) => task.doc) });
  }

  it('closes only the rep\'s signing alerts once every e-sign document is signed', async () => {
    getUserDocMock.mockResolvedValueOnce(subjectDoc({ status: 'active', fieldRole: 'rep' }));
    onboardingRows([
      { itemId: 'contract', status: 'approved' },
      { itemId: 'w9', status: 'approved' },
    ]);
    const retired = taskDoc('a1', { kind: 'review_needed', title: 'In-portal signing failed to load' });
    const delivery = taskDoc('a2', {
      kind: 'review_needed',
      title: 'E-signature delivery needs attention',
      status: 'claimed',
    });
    const unrelated = taskDoc('a3', { kind: 'review_needed', title: 'Review needed' });
    const stalled = taskDoc('a4', { kind: 'stalled_rep', title: 'Rep One has stalled' });
    openTasks(retired, delivery, unrelated, stalled);

    await resolveSigningAlertTasks('rep-1');

    const resolved = {
      status: 'resolved',
      resolvedAt: expect.any(Date),
      resolvedReason: 'every e-sign document is signed',
    };
    expect(retired.update).toHaveBeenCalledWith(resolved);
    expect(delivery.update).toHaveBeenCalledWith(resolved);
    expect(unrelated.update).not.toHaveBeenCalled();
    expect(stalled.update).not.toHaveBeenCalled();
  });

  it('leaves signing alerts open while another document is unsigned', async () => {
    getUserDocMock.mockResolvedValueOnce(subjectDoc({ status: 'pending', fieldRole: 'trainee' }));
    onboardingRows([{ itemId: 'contract', status: 'approved' }]);

    await resolveSigningAlertTasks('rep-1');

    // Never even reads the rep's tasks: w9 is still on the checklist unsigned.
    expect(getExistingTasksMock).not.toHaveBeenCalled();
  });
});
