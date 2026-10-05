import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as HoldModule from '@/types/onboardingHold';

const {
  store,
  docMock,
  collectionMock,
  createEnvelopeMock,
  dispatchMock,
  createAlertTaskMock,
  resolveAlertTasksMock,
  runTransactionMock,
  applyTransaction,
  claimItem,
  writes,
  setOptions,
  setMock,
  consoleErrorMock,
  DELETE_SENTINEL,
} = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
  const txWrites: Array<{ path: string; data: Record<string, unknown> }> = [];
  const setOptions: Array<{ merge?: boolean } | undefined> = [];
  const DELETE_SENTINEL = '__FIELD_VALUE_DELETE__';
  const setMock = vi.fn(async (
    path: string,
    data: Record<string, unknown>,
    options?: { merge?: boolean }
  ) => {
    writes.push({ path, data });
    setOptions.push(options);
    const next = { ...(store.get(path) ?? {}), ...data };
    Object.entries(data).forEach(([key, value]) => {
      if (value === DELETE_SENTINEL) delete next[key];
    });
    store.set(path, next);
  });
  // Snapshots capture the document as it stood when it was read, the way a real
  // DocumentSnapshot does. `setMock` always stores a fresh object, so the
  // captured reference never sees a later write — which is what makes the
  // "read, then someone else claims it" race testable.
  const snapshotOf = (path: string) => {
    const data = store.get(path);
    return {
      exists: data !== undefined,
      get: (f: string) => data?.[f],
      data: () => data,
    };
  };
  const docMock = vi.fn((path: string) => ({
    path,
    get: async () => snapshotOf(path),
    set: (data: Record<string, unknown>, options?: { merge?: boolean }) =>
      setMock(path, data, options),
  }));

  // Firestore merges nested maps rather than replacing them, which is what lets
  // the dispatch claim set esignDispatch.state without dropping attempts.
  const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
  const mergeInto = (path: string, data: Record<string, unknown>) => {
    const previous = store.get(path) ?? {};
    const next: Record<string, unknown> = { ...previous };
    for (const [key, value] of Object.entries(data)) {
      if (value === DELETE_SENTINEL) {
        delete next[key];
      } else if (isPlainObject(value) && isPlainObject(previous[key])) {
        next[key] = { ...(previous[key] as Record<string, unknown>), ...value };
      } else {
        next[key] = value;
      }
    }
    store.set(path, next);
  };

  // Writes a competing 'sending' claim straight into the store, standing in for
  // a second concurrent caller.
  const claimItem = (path: string, lastAttemptAt: Date) => {
    mergeInto(path, { esignDispatch: { state: 'sending', lastAttemptAt } });
  };

  type TransactionRef = { path: string; get: () => Promise<unknown> };
  type Transaction = {
    get: (ref: TransactionRef) => Promise<unknown>;
    set: (ref: TransactionRef, data: Record<string, unknown>, options?: { merge?: boolean }) => void;
  };
  // Transaction writes deliberately bypass `setMock`: they are a different API
  // path, and the tests that count plain `set` calls must not see them.
  //
  // Bodies run one at a time. A real Firestore transaction is atomic against
  // other transactions, and without that guarantee here two callers awaiting
  // inside `get` would both read the pre-claim document and both "win" —
  // making every concurrency test pass or fail on await ordering rather than
  // on the code under test.
  let transactionQueue: Promise<unknown> = Promise.resolve();
  const applyTransaction = <T,>(body: (transaction: Transaction) => Promise<T>): Promise<T> => {
    const run = transactionQueue.then(() =>
      body({
        get: async (ref: TransactionRef) => ref.get(),
        set: (ref: TransactionRef, data: Record<string, unknown>) => {
          txWrites.push({ path: ref.path, data });
          mergeInto(ref.path, data);
        },
      })
    );
    // Swallow here only: the caller still sees the rejection through `run`.
    transactionQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
  const runTransactionMock = vi.fn(applyTransaction);
  const createEnvelopeMock = vi.fn(
    async (request: { itemId: string }): Promise<{ envelopeId: string }> => {
      if (!request.itemId) throw new Error('item id required');
      return { envelopeId: 'env_1' };
    },
  );
  const dispatchMock = vi.fn(async () => undefined);
  const collectionMock = vi.fn((name: string) => {
    if (name === 'users') {
      // Only the deferred ready-email sweep queries users: `field <= cutoff`.
      return {
        where: vi.fn((field: string, _operator: string, cutoff: Date) => ({
          get: async () => ({
            docs: [...store.entries()]
              .filter(([path, data]) => {
                const value = data[field];
                return path.startsWith('users/') && value instanceof Date && value <= cutoff;
              })
              .map(([path, data]) => ({
                id: path.slice('users/'.length),
                ref: docMock(path),
                get: (f: string) => data[f],
              })),
          }),
        })),
      };
    }
    if (name !== 'userOnboarding') throw new Error(`Unexpected collection: ${name}`);
    return {
      where: vi.fn((_field: string, _operator: string, value: unknown) => ({
        get: async () => ({
          docs: [...store.entries()]
            .filter(([path, data]) => path.startsWith('userOnboarding/') && (data.userId === value || !data.userId))
            .map(([, data]) => ({ get: (field: string) => data[field] })),
        }),
      })),
    };
  });
  return {
    store,
    docMock,
    collectionMock,
    createEnvelopeMock,
    dispatchMock,
    runTransactionMock,
    applyTransaction,
    claimItem,
    createAlertTaskMock: vi.fn(async () => 'alert_1'),
    resolveAlertTasksMock: vi.fn(async (...args: [string, string[]?]) => {
      void args;
    }),
    writes,
    setOptions,
    setMock,
    consoleErrorMock: vi.fn(),
    DELETE_SENTINEL,
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { doc: docMock, collection: collectionMock, runTransaction: runTransactionMock },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: vi.fn(() => DELETE_SENTINEL) },
}));

vi.mock('./inhouse', () => ({
  createEnvelope: createEnvelopeMock,
  envelopeExists: envelopeExistsMock,
}));
// Reads the same store the rest of the test writes, so seeding
// `esignEnvelopes/<id>` makes an envelope exist.
const envelopeExistsMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: dispatchMock }));
const sendEmailMock = vi.hoisted(() =>
  vi.fn(async (input: { to: string; subject: string }): Promise<{ ok: boolean; error?: string }> => {
    void input;
    return { ok: true };
  })
);
vi.mock('@/lib/email/sendEmail', () => ({
  sendEmail: sendEmailMock,
  onboardingFrom: () => undefined,
}));
vi.mock('@/lib/alerts/alertTasks', () => ({
  createAlertTask: createAlertTaskMock,
  resolveAlertTasks: resolveAlertTasksMock,
}));

// The placeholder-document hold is lifted so dispatch is exercised over all
// five documents; the one test that covers the hold turns it back on.
const hold = vi.hoisted(() => ({ on: false }));
vi.mock('@/types/onboardingHold', async (importOriginal) => {
  const actual = await importOriginal<typeof HoldModule>();
  return { isHeldOnboardingItem: (itemId: string) => hold.on && actual.isHeldOnboardingItem(itemId) };
});

import { sendDeferredEsignReadyEmails, sendPendingEsignDocs } from './autoSend';
import { getOnboardingItemsForUser } from '@/types/onboarding';
import { ONBOARDING_FIELD_ROLES } from '@/types/auth';

beforeEach(() => {
  hold.on = false;
  store.clear();
  writes.length = 0;
  setOptions.length = 0;
  setMock.mockReset();
  setMock.mockImplementation(async (
    path: string,
    data: Record<string, unknown>,
    options?: { merge?: boolean }
  ) => {
    writes.push({ path, data });
    setOptions.push(options);
    const next = { ...(store.get(path) ?? {}), ...data };
    Object.entries(data).forEach(([key, value]) => {
      if (value === DELETE_SENTINEL) delete next[key];
    });
    store.set(path, next);
  });
  runTransactionMock.mockReset();
  runTransactionMock.mockImplementation(applyTransaction);
  createEnvelopeMock.mockReset();
  createEnvelopeMock.mockResolvedValue({ envelopeId: 'env_1' });
  envelopeExistsMock.mockReset();
  envelopeExistsMock.mockImplementation(async (id: string) => store.has(`esignEnvelopes/${id}`));
  createAlertTaskMock.mockReset();
  createAlertTaskMock.mockResolvedValue('alert_1');
  resolveAlertTasksMock.mockReset();
  resolveAlertTasksMock.mockResolvedValue(undefined);
  dispatchMock.mockClear();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true });
  consoleErrorMock.mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(consoleErrorMock);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-26T12:00:00.000Z'));
  store.set('users/u1', {
    fieldRole: 'entry_level_rep',
    isIBO: false,
    displayName: 'Sam Rep',
    email: 'sam@x.com',
    status: 'pending',
  });
  // Envelope records the tests' ids point at. An id with no record here is an
  // envelope from before signing moved in-house (see the stale envelope tests).
  for (const id of ['env_0', 'env_1', 'env_old']) {
    store.set(`esignEnvelopes/${id}`, { status: 'sent' });
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('placeholder document hold', () => {
  it('keeps the held documents off every checklist and never sends them', async () => {
    hold.on = true;
    for (const fieldRole of ONBOARDING_FIELD_ROLES) {
      for (const isIBO of [false, true]) {
        const ids = getOnboardingItemsForUser(fieldRole, isIBO).map((item) => item.id);
        expect(ids).not.toContain('fcra_auth');
        expect(ids).not.toContain('pay_structure');
      }
    }

    const sent = await sendPendingEsignDocs('u1');

    expect(sent.sort()).toEqual(['contract', 'direct_deposit', 'w9']);
    const requested = createEnvelopeMock.mock.calls.map(([request]) => request.itemId);
    expect(requested).not.toContain('fcra_auth');
    expect(requested).not.toContain('pay_structure');
    expect(store.has('userOnboarding/u1_fcra_auth')).toBe(false);
    expect(store.has('userOnboarding/u1_pay_structure')).toBe(false);
  });
});

describe('sendPendingEsignDocs', () => {
  it('creates envelopes for all applicable unsent esign items and marks them submitted', async () => {
    const sent = await sendPendingEsignDocs('u1');
    expect(sent.sort()).toEqual(['contract', 'direct_deposit', 'fcra_auth', 'pay_structure', 'w9']);
    expect(createEnvelopeMock).toHaveBeenCalledTimes(5);
    expect(store.get('userOnboarding/u1_contract')).toMatchObject({
      status: 'submitted',
      esignEnvelopeId: 'env_1',
    });
    // One write per item: the userOnboarding doc.
    expect(setOptions).toHaveLength(5);
    expect(setOptions.every((options) => options?.merge === true)).toBe(true);
    expect(createEnvelopeMock).toHaveBeenCalledWith({
      docKey: 'contract',
      userId: 'u1',
      itemId: 'contract',
      signerName: 'Sam Rep',
      signerEmail: 'sam@x.com',
    });
    expect(setMock).toHaveBeenCalledWith(
      'userOnboarding/u1_contract',
      expect.objectContaining({
        esignEnvelopeId: 'env_1',
        status: 'submitted',
      }),
      { merge: true }
    );
    expect(dispatchMock).toHaveBeenCalledOnce();
  });

  it('skips items that already have an envelope', async () => {
    store.set('userOnboarding/u1_contract', { status: 'submitted', esignEnvelopeId: 'env_0' });
    const sent = await sendPendingEsignDocs('u1');
    expect(sent).not.toContain('contract');
  });

  it('sends submitted esign items when they do not have an envelope yet', async () => {
    store.set('userOnboarding/u1_contract', { status: 'submitted', reference: 'candidate acknowledged' });
    store.set('userOnboarding/u1_direct_deposit', { status: 'approved' });
    store.set('userOnboarding/u1_fcra_auth', { status: 'approved' });
    store.set('userOnboarding/u1_pay_structure', { status: 'approved' });
    const sent = await sendPendingEsignDocs('u1');
    expect(sent).toEqual(['w9', 'contract']);
  });

  it('sends an existing not-started item without a reference and forwards its prefill', async () => {
    for (const itemId of ['w9', 'contract', 'fcra_auth', 'pay_structure']) {
      store.set(`userOnboarding/u1_${itemId}`, { status: 'approved' });
    }
    store.set('userOnboarding/u1_direct_deposit', {
      status: 'not_started',
      prefill: { accountType: 'checking' },
    });

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual(['direct_deposit']);
    expect(createEnvelopeMock).toHaveBeenCalledWith({
      docKey: 'direct_deposit',
      userId: 'u1',
      itemId: 'direct_deposit',
      signerName: 'Sam Rep',
      signerEmail: 'sam@x.com',
      prefill: { accountType: 'checking' },
    });
  });

  it('resends a rejected esign item when it has no envelope or dispatch state', async () => {
    for (const itemId of ['direct_deposit', 'fcra_auth', 'pay_structure']) {
      store.set(`userOnboarding/u1_${itemId}`, { status: 'approved' });
    }
    store.set('userOnboarding/u1_contract', { status: 'rejected' });

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual(['w9', 'contract']);
    expect(createEnvelopeMock).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'contract' }));
  });

  it('does not resend a rejected esign item that still has an envelope', async () => {
    for (const itemId of ['direct_deposit', 'fcra_auth', 'pay_structure']) {
      store.set(`userOnboarding/u1_${itemId}`, { status: 'approved' });
    }
    store.set('userOnboarding/u1_contract', { status: 'rejected', esignEnvelopeId: 'env_old' });

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual(['w9']);
    expect(createEnvelopeMock).toHaveBeenCalledOnce();
    expect(createEnvelopeMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'contract' })
    );
  });

  it('continues when one envelope creation fails', async () => {
    createEnvelopeMock.mockRejectedValueOnce(new Error('envelope 500'));
    const sent = await sendPendingEsignDocs('u1');
    expect(sent.length).toBe(4);
  });

  it('retries a failed persistence write once after the envelope is created', async () => {
    for (const itemId of ['direct_deposit', 'fcra_auth', 'pay_structure']) {
      store.set(`userOnboarding/u1_${itemId}`, { status: 'approved' });
    }
    // The contract's userOnboarding envelope-persistence write fails once and
    // then retries; w9 is also sent because it is now an applicable esign item.
    let contractPersistenceAttempts = 0;
    setMock.mockImplementation(async (
      path: string,
      data: Record<string, unknown>,
      options?: { merge?: boolean }
    ) => {
      if (path === 'userOnboarding/u1_contract' && contractPersistenceAttempts++ === 0) {
        throw new Error('temporary firestore failure');
      }
      writes.push({ path, data });
      setOptions.push(options);
      const next = { ...(store.get(path) ?? {}), ...data };
      Object.entries(data).forEach(([key, value]) => {
        if (value === DELETE_SENTINEL) delete next[key];
      });
      store.set(path, next);
    });

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual(['w9', 'contract']);
    expect(setMock).toHaveBeenCalledTimes(3);
    expect(setMock.mock.calls.map(([, , options]) => options)).toEqual([
      { merge: true },
      { merge: true },
      { merge: true },
    ]);
    expect(store.get('userOnboarding/u1_contract')).toMatchObject({
      status: 'submitted',
      esignEnvelopeId: 'env_1',
    });
  });

  it('records a post-send persistence failure with the created envelope details', async () => {
    for (const itemId of ['direct_deposit', 'fcra_auth', 'pay_structure']) {
      store.set(`userOnboarding/u1_${itemId}`, { status: 'approved' });
    }
    // The contract's userOnboarding write and its one retry both fail,
    // exhausting the retry budget; its dispatch failure is then recorded.
    let contractPersistenceAttempts = 0;
    setMock.mockImplementation(async (
      path: string,
      data: Record<string, unknown>,
      options?: { merge?: boolean }
    ) => {
      if (path === 'userOnboarding/u1_contract') {
        contractPersistenceAttempts += 1;
        if (contractPersistenceAttempts === 1) throw new Error('temporary firestore failure');
        if (contractPersistenceAttempts === 2) throw new Error('permanent firestore failure');
      }
      writes.push({ path, data });
      setOptions.push(options);
      const next = { ...(store.get(path) ?? {}), ...data };
      Object.entries(data).forEach(([key, value]) => {
        if (value === DELETE_SENTINEL) delete next[key];
      });
      store.set(path, next);
    });

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual(['w9']);
    expect(createEnvelopeMock).toHaveBeenCalledTimes(2);
    expect(setMock).toHaveBeenCalledTimes(4);
    expect(store.get('userOnboarding/u1_contract')?.esignDispatch).toMatchObject({
      state: 'failed',
      attempts: 1,
      lastError: 'Error: permanent firestore failure',
    });
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign] envelope was created but its record failed to persist for u1/contract',
      expect.objectContaining({ envelopeId: 'env_1', userId: 'u1', itemId: 'contract' })
    );
  });

  it('records a failed dispatch while allowing the other items to send', async () => {
    createEnvelopeMock.mockImplementation(async (request: { itemId: string }) => {
      if (request.itemId === 'fcra_auth') throw new Error('envelope 500');
      return { envelopeId: 'env_1' };
    });

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toHaveLength(4);
    expect(store.get('userOnboarding/u1_fcra_auth')?.esignDispatch).toMatchObject({
      state: 'failed',
      attempts: 1,
      lastError: 'Error: envelope 500',
      lastAttemptAt: expect.any(Date),
    });
  });

  it('increments a second failure to attempt two', async () => {
    store.set('userOnboarding/u1_fcra_auth', { status: 'approved' });
    store.set('userOnboarding/u1_contract', {
      status: 'not_started',
      esignDispatch: {
        state: 'failed',
        attempts: 1,
        lastAttemptAt: new Date(Date.now() - 6 * 60 * 1000),
      },
    });
    createEnvelopeMock.mockImplementation(async (request: { itemId: string }) => {
      if (request.itemId === 'contract') throw new Error('provider still down');
      return { envelopeId: 'env_1' };
    });

    await sendPendingEsignDocs('u1');

    expect(store.get('userOnboarding/u1_contract')?.esignDispatch).toMatchObject({
      state: 'failed',
      attempts: 2,
      lastError: 'Error: provider still down',
    });
  });

  it('skips an item whose last attempt was less than five minutes ago', async () => {
    store.set('userOnboarding/u1_contract', {
      status: 'not_started',
      esignDispatch: {
        state: 'failed',
        attempts: 1,
        lastAttemptAt: new Date(Date.now() - 1 * 60 * 1000),
      },
    });

    await sendPendingEsignDocs('u1');

    expect(createEnvelopeMock.mock.calls.some(([request]) => request.itemId === 'contract')).toBe(false);
  });

  it('throttles a Firestore Timestamp-shaped last attempt', async () => {
    store.set('userOnboarding/u1_contract', {
      status: 'not_started',
      esignDispatch: {
        state: 'failed',
        attempts: 1,
        lastAttemptAt: { toDate: () => new Date(Date.now() - 1 * 60 * 1000) },
      },
    });

    await sendPendingEsignDocs('u1');

    expect(createEnvelopeMock.mock.calls.some(([request]) => request.itemId === 'contract')).toBe(false);
  });

  it('retries an item whose last attempt was more than five minutes ago', async () => {
    store.set('userOnboarding/u1_contract', {
      status: 'not_started',
      esignDispatch: {
        state: 'failed',
        attempts: 1,
        lastAttemptAt: new Date(Date.now() - 6 * 60 * 1000),
      },
    });

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toContain('contract');
    expect(createEnvelopeMock.mock.calls.some(([request]) => request.itemId === 'contract')).toBe(true);
  });

  it('raises again when an item reaches attempt four after its alert was resolved', async () => {
    const old = new Date(Date.now() - 6 * 60 * 1000);
    for (const itemId of ['contract', 'direct_deposit']) {
      store.set(`userOnboarding/u1_${itemId}`, {
        status: 'not_started',
        esignDispatch: { state: 'failed', attempts: 2, lastAttemptAt: old },
      });
    }
    createEnvelopeMock.mockImplementation(async (request: { itemId: string }) => {
      if (request.itemId === 'contract' || request.itemId === 'direct_deposit') {
        throw new Error('third-attempt failure');
      }
      return { envelopeId: 'env_1' };
    });

    await sendPendingEsignDocs('u1');

    expect(createAlertTaskMock).toHaveBeenCalledOnce();
    expect(createAlertTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'review_needed', subjectUserId: 'u1' })
    );

    await resolveAlertTasksMock('u1', ['review_needed']);
    vi.advanceTimersByTime(6 * 60 * 1000);
    createEnvelopeMock.mockRejectedValue(new Error('fourth-attempt failure'));
    await sendPendingEsignDocs('u1');
    expect(createAlertTaskMock).toHaveBeenCalledTimes(2);
  });

  it('clears a failed dispatch and resolves the alert task after a successful envelope', async () => {
    for (const itemId of ['fcra_auth', 'direct_deposit', 'pay_structure']) {
      store.set(`userOnboarding/u1_${itemId}`, { status: 'approved' });
    }
    store.set('userOnboarding/u1_contract', {
      status: 'not_started',
      esignDispatch: {
        state: 'failed',
        attempts: 3,
        lastAttemptAt: new Date(Date.now() - 6 * 60 * 1000),
      },
    });

    await sendPendingEsignDocs('u1');

    expect(writes).toContainEqual({
      path: 'userOnboarding/u1_contract',
      data: expect.objectContaining({ esignDispatch: DELETE_SENTINEL }),
    });
    expect(resolveAlertTasksMock).toHaveBeenCalledWith('u1', ['review_needed']);
  });

  it('does not resolve the alert while another item remains failed', async () => {
    for (const itemId of ['fcra_auth', 'pay_structure']) {
      store.set(`userOnboarding/u1_${itemId}`, { status: 'approved' });
    }
    store.set('userOnboarding/u1_contract', {
      status: 'not_started',
      esignDispatch: {
        state: 'failed',
        attempts: 3,
        lastAttemptAt: new Date(Date.now() - 6 * 60 * 1000),
      },
    });
    store.set('userOnboarding/u1_direct_deposit', {
      status: 'not_started',
      esignDispatch: {
        state: 'failed',
        attempts: 3,
        lastAttemptAt: new Date(Date.now() - 6 * 60 * 1000),
      },
    });
    createEnvelopeMock.mockImplementation(async (request: { itemId: string }) => {
      if (request.itemId === 'direct_deposit') throw new Error('still down');
      return { envelopeId: 'env_recovered' };
    });

    await sendPendingEsignDocs('u1');

    expect(resolveAlertTasksMock).not.toHaveBeenCalled();
  });

  it('sends an unsent e-sign item for an active user', async () => {
    store.set('users/u1', {
      fieldRole: 'entry_rep',
      isIBO: false,
      displayName: 'Sam Rep',
      email: 'sam@x.com',
      status: 'active',
    });
    for (const itemId of ['fcra_auth', 'contract', 'direct_deposit', 'pay_structure']) {
      store.set(`userOnboarding/u1_${itemId}`, { status: 'approved' });
    }

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual(['w9']);
    expect(createEnvelopeMock).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'w9' }));
    expect(store.get('userOnboarding/u1_w9')).toMatchObject({
      status: 'submitted',
      esignEnvelopeId: 'env_1',
    });
  });

  it('is a no-op for a decommissioned user', async () => {
    store.set('users/u1', {
      fieldRole: 'entry_rep',
      isIBO: false,
      displayName: 'Sam Rep',
      email: 'sam@x.com',
      status: 'inactive',
    });

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual([]);
    expect(createEnvelopeMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('is a no-op for a role that never onboards, even while pending', async () => {
    store.set('users/u1', {
      fieldRole: 'general_manager',
      isIBO: false,
      displayName: 'Gm Person',
      email: 'gm@x.com',
      status: 'pending',
    });

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual([]);
    expect(createEnvelopeMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});

// Two checklist reads land together on login. Both build the same pending list
// before either writes, so only the transactional claim can stop the second
// from creating a duplicate envelope and sending a second "ready to sign" email.
describe('envelopes from before signing moved in-house', () => {
  const approveAllBut = (itemId: string) => {
    for (const other of ['w9', 'contract', 'direct_deposit', 'fcra_auth', 'pay_structure']) {
      if (other !== itemId) store.set(`userOnboarding/u1_${other}`, { status: 'approved' });
    }
  };

  it('sends a fresh envelope for an unsigned item whose envelope id names no record', async () => {
    approveAllBut('contract');
    store.set('userOnboarding/u1_contract', {
      userId: 'u1',
      itemId: 'contract',
      status: 'submitted',
      reference: 'esign:legacy-123',
      esignEnvelopeId: 'legacy-123',
    });
    createEnvelopeMock.mockResolvedValueOnce({ envelopeId: 'env_new' });

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual(['contract']);
    expect(createEnvelopeMock).toHaveBeenCalledOnce();
    expect(store.get('userOnboarding/u1_contract')).toMatchObject({
      status: 'submitted',
      esignEnvelopeId: 'env_new',
      reference: 'esign:env_new',
    });
    expect(dispatchMock).toHaveBeenCalledOnce();
  });

  it('also replaces a stale id on a rejected item', async () => {
    approveAllBut('w9');
    store.set('userOnboarding/u1_w9', { status: 'rejected', esignEnvelopeId: 'legacy-9' });

    expect(await sendPendingEsignDocs('u1')).toEqual(['w9']);
    expect(store.get('userOnboarding/u1_w9')?.esignEnvelopeId).toBe('env_1');
  });

  it('never resends an approved item, whatever its old envelope id', async () => {
    for (const itemId of ['w9', 'contract', 'direct_deposit', 'fcra_auth', 'pay_structure']) {
      store.set(`userOnboarding/u1_${itemId}`, { status: 'approved', esignEnvelopeId: `legacy-${itemId}` });
    }

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual([]);
    expect(createEnvelopeMock).not.toHaveBeenCalled();
    expect(store.get('userOnboarding/u1_contract')?.esignEnvelopeId).toBe('legacy-contract');
  });

  it('skips, never resends, an item whose envelope read fails', async () => {
    approveAllBut('contract');
    store.set('userOnboarding/u1_contract', { status: 'submitted', esignEnvelopeId: 'legacy-123' });
    envelopeExistsMock.mockRejectedValueOnce(new Error('firestore unavailable'));

    expect(await sendPendingEsignDocs('u1')).toEqual([]);
    expect(createEnvelopeMock).not.toHaveBeenCalled();
  });

  it('with onlyStale, replaces stale envelopes but sends nothing that was never sent', async () => {
    store.set('users/u1', { ...store.get('users/u1'), status: 'active' });
    store.set('userOnboarding/u1_contract', { status: 'submitted', esignEnvelopeId: 'legacy-123' });
    // w9, direct_deposit, fcra_auth, pay_structure: never sent.

    const sent = await sendPendingEsignDocs('u1', { onlyStale: true });

    expect(sent).toEqual(['contract']);
    expect(createEnvelopeMock).toHaveBeenCalledOnce();
    expect(store.get('userOnboarding/u1_w9')).toBeUndefined();
  });

  it('keeps an unsigned item whose envelope record exists', async () => {
    approveAllBut('contract');
    store.set('userOnboarding/u1_contract', { status: 'submitted', esignEnvelopeId: 'env_old' });

    expect(await sendPendingEsignDocs('u1')).toEqual([]);
    expect(createEnvelopeMock).not.toHaveBeenCalled();
  });

  it('sends one fresh envelope when two callers replace the same stale id at once', async () => {
    approveAllBut('contract');
    store.set('userOnboarding/u1_contract', { status: 'submitted', esignEnvelopeId: 'legacy-123' });
    createEnvelopeMock.mockImplementation(async () => {
      store.set('esignEnvelopes/env_new', { status: 'sent' });
      return { envelopeId: 'env_new' };
    });

    const [a, b] = await Promise.all([sendPendingEsignDocs('u1'), sendPendingEsignDocs('u1')]);

    expect([...a, ...b]).toEqual(['contract']);
    expect(createEnvelopeMock).toHaveBeenCalledOnce();
  });
});

describe('sendPendingEsignDocs concurrent dispatch', () => {
  // Lets a rival caller claim `items` in the window between our pending read
  // and our own claim transaction, which is exactly where the race lives.
  const rivalClaims = (items: string[], claimedAt: Date) => {
    let injected = false;
    runTransactionMock.mockImplementation(async (body) => {
      if (!injected) {
        injected = true;
        for (const itemId of items) claimItem(`userOnboarding/u1_${itemId}`, claimedAt);
      }
      return applyTransaction(body);
    });
  };

  it('skips the items another caller claimed after the pending list was read', async () => {
    rivalClaims(['contract', 'w9'], new Date());

    const sent = await sendPendingEsignDocs('u1');

    expect(sent.sort()).toEqual(['direct_deposit', 'fcra_auth', 'pay_structure']);
    expect(createEnvelopeMock).toHaveBeenCalledTimes(3);
    for (const itemId of createEnvelopeMock.mock.calls.map(([request]) => request.itemId)) {
      expect(['contract', 'w9']).not.toContain(itemId);
    }
    // The rival owns those items: this caller leaves their records alone.
    expect(store.get('userOnboarding/u1_contract')).not.toHaveProperty('esignEnvelopeId');
    expect(store.get('userOnboarding/u1_w9')).not.toHaveProperty('esignEnvelopeId');
  });

  it('names only its own documents in the one email it sends', async () => {
    rivalClaims(['contract', 'w9'], new Date());

    await sendPendingEsignDocs('u1');

    expect(dispatchMock).toHaveBeenCalledOnce();
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Ready to sign: Background Check Authorization (FCRA), Direct Deposit, Compensation',
      })
    );
  });

  it('sends no email at all when every item belongs to another caller', async () => {
    rivalClaims(['contract', 'direct_deposit', 'fcra_auth', 'pay_structure', 'w9'], new Date());

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual([]);
    expect(createEnvelopeMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('claims an item whose claim is older than two minutes', async () => {
    // A dispatch that crashed mid-flight must not brick the item forever.
    rivalClaims(['contract'], new Date(Date.now() - 3 * 60 * 1000));

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toContain('contract');
    expect(store.get('userOnboarding/u1_contract')).toMatchObject({ esignEnvelopeId: 'env_1' });
  });

  it('re-dispatches an item left marked sending by an abandoned attempt', async () => {
    // Six minutes old: past the retry throttle as well as the claim window.
    store.set('userOnboarding/u1_contract', {
      status: 'not_started',
      esignDispatch: { state: 'sending', lastAttemptAt: new Date(Date.now() - 6 * 60 * 1000) },
    });

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toContain('contract');
    expect(store.get('userOnboarding/u1_contract')).toMatchObject({ esignEnvelopeId: 'env_1' });
    // A clean send clears the claim rather than leaving it behind.
    expect(store.get('userOnboarding/u1_contract')).not.toHaveProperty('esignDispatch');
  });

  it('marks an item as sending before its envelope is created', async () => {
    let claimAtCreateTime: unknown;
    createEnvelopeMock.mockImplementation(async (request: { itemId: string }) => {
      if (request.itemId === 'contract') {
        claimAtCreateTime = store.get('userOnboarding/u1_contract')?.esignDispatch;
      }
      return { envelopeId: 'env_1' };
    });

    await sendPendingEsignDocs('u1');

    expect(claimAtCreateTime).toMatchObject({ state: 'sending' });
  });

  it('skips the item rather than double-sending when the claim itself fails', async () => {
    runTransactionMock.mockRejectedValue(new Error('transaction failed'));

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual([]);
    expect(createEnvelopeMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });
});

// The per-item claim splits the work between concurrent callers without
// duplicating envelopes, but each caller then wants to tell the rep their
// documents are ready. The rep should hear it once.
describe('sendPendingEsignDocs ready-to-sign email', () => {
  const ALL_ITEMS = ['contract', 'direct_deposit', 'fcra_auth', 'pay_structure', 'w9'];

  it('sends one email when two callers dispatch at the same time', async () => {
    // Hold the first caller inside its very first envelope creation. It already
    // owns that item's claim, so the second caller picks up the other four,
    // finishes, and emails. The first caller then returns with something of its
    // own to report — which is where the second email used to come from.
    let firstCallerReachedProvider: () => void = () => {};
    let releaseFirstCaller: () => void = () => {};
    const reachedProvider = new Promise<void>((resolve) => {
      firstCallerReachedProvider = resolve;
    });
    const held = new Promise<void>((resolve) => {
      releaseFirstCaller = resolve;
    });
    let firstEnvelope = true;
    createEnvelopeMock.mockImplementation(async () => {
      if (firstEnvelope) {
        firstEnvelope = false;
        firstCallerReachedProvider();
        await held;
      }
      return { envelopeId: 'env_1' };
    });

    const firstCaller = sendPendingEsignDocs('u1');
    await reachedProvider;
    const second = await sendPendingEsignDocs('u1');
    releaseFirstCaller();
    const first = await firstCaller;

    // Both callers really did send, and between them every document went out
    // exactly once.
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(4);
    expect([...first, ...second].sort()).toEqual(ALL_ITEMS);
    expect(createEnvelopeMock).toHaveBeenCalledTimes(5);
    // The rep hears about it once, not once per caller.
    expect(dispatchMock).toHaveBeenCalledOnce();
  });

  it('does not email again for a resend inside the ten minute window', async () => {
    await sendPendingEsignDocs('u1');
    expect(dispatchMock).toHaveBeenCalledOnce();

    vi.setSystemTime(new Date(Date.now() + 5 * 60 * 1000));
    store.set('userOnboarding/u1_contract', { userId: 'u1', itemId: 'contract', status: 'rejected' });

    const sent = await sendPendingEsignDocs('u1');

    // The envelope is still created; only the duplicate notice is suppressed.
    expect(sent).toEqual(['contract']);
    expect(store.get('userOnboarding/u1_contract')).toMatchObject({ esignEnvelopeId: 'env_1' });
    expect(dispatchMock).toHaveBeenCalledOnce();
  });

  it('emails again for a resend once the window has passed', async () => {
    await sendPendingEsignDocs('u1');
    expect(dispatchMock).toHaveBeenCalledOnce();

    // A rejected document is re-sent much later, and the rep has to hear about
    // it: the dedupe window closes rather than silencing the rep for good.
    vi.setSystemTime(new Date(Date.now() + 15 * 60 * 1000));
    store.set('userOnboarding/u1_contract', { userId: 'u1', itemId: 'contract', status: 'rejected' });

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual(['contract']);
    expect(dispatchMock).toHaveBeenCalledTimes(2);
    expect(dispatchMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'Ready to sign: Contract' })
    );
  });

  it('creates the envelopes and stays quiet when the email claim fails', async () => {
    runTransactionMock.mockImplementation((body) =>
      applyTransaction((transaction) =>
        body({
          get: async (ref) => {
            if (ref.path.startsWith('users/')) throw new Error('users transaction failed');
            return transaction.get(ref);
          },
          set: transaction.set,
        })
      )
    );

    const sent = await sendPendingEsignDocs('u1');

    // A failed claim costs a notification, never a document, and never a throw.
    expect(sent.sort()).toEqual(ALL_ITEMS);
    expect(store.get('userOnboarding/u1_contract')).toMatchObject({ esignEnvelopeId: 'env_1' });
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      '[esign] failed to claim the ready-to-sign notice for u1',
      expect.any(Error)
    );
  });
});

describe('deferred ready-to-sign email (invite link)', () => {
  const HOUR = 60 * 60 * 1000;

  it('creates every envelope but holds the email back, marking the user instead', async () => {
    const sent = await sendPendingEsignDocs('u1', { deferReadyEmail: true });

    expect(sent.sort()).toEqual(['contract', 'direct_deposit', 'fcra_auth', 'pay_structure', 'w9']);
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(store.get('users/u1')?.esignReadyEmailDeferredAt).toEqual(new Date('2026-07-26T12:00:00.000Z'));
    expect(store.get('users/u1')).not.toHaveProperty('esignReadyEmailAt');
  });

  it('a later normal send emails right away and clears the held-back marker', async () => {
    store.set('users/u1', { ...store.get('users/u1'), esignReadyEmailDeferredAt: new Date() });

    await sendPendingEsignDocs('u1');

    expect(dispatchMock).toHaveBeenCalledOnce();
    expect(store.get('users/u1')).not.toHaveProperty('esignReadyEmailDeferredAt');
  });

  it('a later normal send that takes over the held-back notice lists every unsigned document', async () => {
    store.set('users/u1', { ...store.get('users/u1'), esignReadyEmailDeferredAt: new Date() });
    // Sent from the invite link earlier and still unsigned.
    store.set('userOnboarding/u1_contract', {
      userId: 'u1',
      itemId: 'contract',
      status: 'in_progress',
      esignEnvelopeId: 'env_old',
    });

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).not.toContain('contract');
    expect(dispatchMock).toHaveBeenCalledOnce();
    const [notice] = dispatchMock.mock.calls[0] as unknown as [
      { message: string; email: { html?: string; text?: string } },
    ];
    expect(notice.message).toContain('Contract');
    expect(notice.message).toContain('W-9');
    expect(JSON.stringify(notice.email)).toContain('Contract');
  });

  it('a normal send without a held-back notice names only what it sent', async () => {
    store.set('userOnboarding/u1_contract', {
      userId: 'u1',
      itemId: 'contract',
      status: 'in_progress',
      esignEnvelopeId: 'env_old',
    });

    await sendPendingEsignDocs('u1');

    const [notice] = dispatchMock.mock.calls[0] as unknown as [{ message: string }];
    expect(notice.message).not.toContain('Contract');
    expect(notice.message).toContain('W-9');
  });

  it('the cron sends it once, after the delay, naming only the unsigned documents', async () => {
    await sendPendingEsignDocs('u1', { deferReadyEmail: true });
    store.set('userOnboarding/u1_w9', { ...store.get('userOnboarding/u1_w9'), status: 'approved' });

    const early = await sendDeferredEsignReadyEmails(new Date(Date.now() + HOUR / 2));
    expect(early).toEqual({ sent: 0, cleared: 0, retrying: 0 });
    expect(dispatchMock).not.toHaveBeenCalled();

    const later = new Date(Date.now() + 2 * HOUR);
    const first = await sendDeferredEsignReadyEmails(later);
    expect(first).toEqual({ sent: 1, cleared: 0, retrying: 0 });
    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock.mock.calls[0][0].to).toBe('sam@x.com');
    expect(dispatchMock).toHaveBeenCalledOnce();
    const [notice] = dispatchMock.mock.calls[0] as unknown as [{ userId: string; message: string }];
    expect(notice.userId).toBe('u1');
    expect(notice.message).not.toContain('W-9');
    expect(notice.message).toContain('Contract');
    expect(store.get('users/u1')).not.toHaveProperty('esignReadyEmailDeferredAt');

    const second = await sendDeferredEsignReadyEmails(new Date(later.getTime() + HOUR));
    expect(second).toEqual({ sent: 0, cleared: 0, retrying: 0 });
    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(dispatchMock).toHaveBeenCalledOnce();
  });

  it('a failed email keeps the marker so the next run retries, and sends once', async () => {
    await sendPendingEsignDocs('u1', { deferReadyEmail: true });
    const deferredAt = store.get('users/u1')?.esignReadyEmailDeferredAt;
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: 'provider down' });

    const later = new Date(Date.now() + 2 * HOUR);
    const failed = await sendDeferredEsignReadyEmails(later);
    expect(failed).toEqual({ sent: 0, cleared: 0, retrying: 1 });
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(store.get('users/u1')?.esignReadyEmailDeferredAt).toEqual(deferredAt);
    expect(store.get('users/u1')).not.toHaveProperty('esignReadyEmailAt');

    sendEmailMock.mockRejectedValueOnce(new Error('network'));
    const thrown = await sendDeferredEsignReadyEmails(new Date(later.getTime() + HOUR));
    expect(thrown).toEqual({ sent: 0, cleared: 0, retrying: 1 });
    expect(store.get('users/u1')?.esignReadyEmailDeferredAt).toEqual(deferredAt);

    const retried = await sendDeferredEsignReadyEmails(new Date(later.getTime() + 2 * HOUR));
    expect(retried).toEqual({ sent: 1, cleared: 0, retrying: 0 });
    expect(sendEmailMock).toHaveBeenCalledTimes(3);
    expect(dispatchMock).toHaveBeenCalledOnce();
    expect(store.get('users/u1')).not.toHaveProperty('esignReadyEmailDeferredAt');

    const after = await sendDeferredEsignReadyEmails(new Date(later.getTime() + 3 * HOUR));
    expect(after).toEqual({ sent: 0, cleared: 0, retrying: 0 });
    expect(sendEmailMock).toHaveBeenCalledTimes(3);
  });

  it('a failed email does not restore the marker when a portal notice went out meanwhile', async () => {
    await sendPendingEsignDocs('u1', { deferReadyEmail: true });
    const later = new Date(Date.now() + 2 * HOUR);
    sendEmailMock.mockImplementationOnce(async () => {
      store.set('users/u1', { ...store.get('users/u1'), esignReadyEmailAt: new Date(later.getTime() + 1) });
      return { ok: false, error: 'provider down' };
    });

    const result = await sendDeferredEsignReadyEmails(later);

    expect(result).toEqual({ sent: 0, cleared: 0, retrying: 1 });
    expect(store.get('users/u1')).not.toHaveProperty('esignReadyEmailDeferredAt');
  });

  it('sends nothing when the hire signed everything on the spot', async () => {
    await sendPendingEsignDocs('u1', { deferReadyEmail: true });
    for (const itemId of ['w9', 'fcra_auth', 'contract', 'direct_deposit', 'pay_structure']) {
      store.set(`userOnboarding/u1_${itemId}`, { ...store.get(`userOnboarding/u1_${itemId}`), status: 'approved' });
    }

    const result = await sendDeferredEsignReadyEmails(new Date(Date.now() + 2 * HOUR));

    expect(result).toEqual({ sent: 0, cleared: 1, retrying: 0 });
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(store.get('users/u1')).not.toHaveProperty('esignReadyEmailDeferredAt');
  });

  it('sends nothing to a hire who is no longer pending', async () => {
    await sendPendingEsignDocs('u1', { deferReadyEmail: true });
    store.set('users/u1', { ...store.get('users/u1'), status: 'active' });

    const result = await sendDeferredEsignReadyEmails(new Date(Date.now() + 2 * HOUR));

    expect(result).toEqual({ sent: 0, cleared: 1, retrying: 0 });
    expect(dispatchMock).not.toHaveBeenCalled();
  });
});
