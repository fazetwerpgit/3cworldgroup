import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  store,
  docMock,
  collectionMock,
  createEnvelopeMock,
  dispatchMock,
  getEsignProviderMock,
  createAlertTaskMock,
  resolveAlertTasksMock,
  writes,
  setOptions,
  setMock,
  consoleErrorMock,
  DELETE_SENTINEL,
} = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
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
  const docMock = vi.fn((path: string) => ({
    get: async () => ({
      exists: store.has(path),
      get: (f: string) => store.get(path)?.[f],
      data: () => store.get(path),
    }),
    set: (data: Record<string, unknown>, options?: { merge?: boolean }) =>
      setMock(path, data, options),
  }));
  const createEnvelopeMock = vi.fn(async (request: { itemId: string }) => {
    if (!request.itemId) throw new Error('item id required');
    return { envelopeId: 'env_1' };
  });
  const dispatchMock = vi.fn(async () => undefined);
  const getEsignProviderMock = vi.fn(() => ({
    id: 'signwell' as const,
    createEnvelope: createEnvelopeMock,
    parseWebhook: vi.fn(),
  }));
  const collectionMock = vi.fn((name: string) => {
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
    getEsignProviderMock,
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

vi.mock('@/lib/firebase/admin', () => ({ adminDb: { doc: docMock, collection: collectionMock } }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: vi.fn(() => DELETE_SENTINEL) },
}));

vi.mock('./provider', () => ({
  getEsignProvider: getEsignProviderMock,
}));

vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: dispatchMock }));
vi.mock('@/lib/alerts/alertTasks', () => ({
  createAlertTask: createAlertTaskMock,
  resolveAlertTasks: resolveAlertTasksMock,
}));

import { sendPendingEsignDocs } from './autoSend';

beforeEach(() => {
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
  createEnvelopeMock.mockReset();
  createEnvelopeMock.mockResolvedValue({ envelopeId: 'env_1' });
  getEsignProviderMock.mockReset();
  getEsignProviderMock.mockImplementation(() => ({
    id: 'signwell' as const,
    createEnvelope: createEnvelopeMock,
    parseWebhook: vi.fn(),
  }));
  createAlertTaskMock.mockReset();
  createAlertTaskMock.mockResolvedValue('alert_1');
  resolveAlertTasksMock.mockReset();
  resolveAlertTasksMock.mockResolvedValue(undefined);
  dispatchMock.mockClear();
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
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('sendPendingEsignDocs', () => {
  it('creates envelopes for all applicable unsent esign items and marks them submitted', async () => {
    const sent = await sendPendingEsignDocs('u1');
    expect(sent.sort()).toEqual(['contract', 'direct_deposit', 'fcra_auth', 'pay_structure']);
    expect(createEnvelopeMock).toHaveBeenCalledTimes(4);
    expect(store.get('userOnboarding/u1_contract')).toMatchObject({
      status: 'submitted',
      esignEnvelopeId: 'env_1',
    });
    expect(setOptions).toHaveLength(4);
    expect(setOptions.every((options) => options?.merge === true)).toBe(true);
    expect(createEnvelopeMock).toHaveBeenCalledWith({
      docKey: 'contract',
      userId: 'u1',
      itemId: 'contract',
      signerName: 'Sam Rep',
      signerEmail: 'sam@x.com',
    });
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
    expect(sent).toEqual(['contract']);
  });

  it('resends a rejected esign item when it has no envelope or dispatch state', async () => {
    for (const itemId of ['direct_deposit', 'fcra_auth', 'pay_structure']) {
      store.set(`userOnboarding/u1_${itemId}`, { status: 'approved' });
    }
    store.set('userOnboarding/u1_contract', { status: 'rejected' });

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual(['contract']);
    expect(createEnvelopeMock).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'contract' }));
  });

  it('does not resend a rejected esign item that still has an envelope', async () => {
    for (const itemId of ['direct_deposit', 'fcra_auth', 'pay_structure']) {
      store.set(`userOnboarding/u1_${itemId}`, { status: 'approved' });
    }
    store.set('userOnboarding/u1_contract', { status: 'rejected', esignEnvelopeId: 'env_old' });

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual([]);
    expect(createEnvelopeMock).not.toHaveBeenCalled();
  });

  it('continues when one envelope creation fails', async () => {
    createEnvelopeMock.mockRejectedValueOnce(new Error('signwell 500'));
    const sent = await sendPendingEsignDocs('u1');
    expect(sent.length).toBe(3);
  });

  it('retries a failed persistence write once after the envelope is created', async () => {
    for (const itemId of ['direct_deposit', 'fcra_auth', 'pay_structure']) {
      store.set(`userOnboarding/u1_${itemId}`, { status: 'approved' });
    }
    setMock.mockRejectedValueOnce(new Error('temporary firestore failure'));

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual(['contract']);
    expect(setMock).toHaveBeenCalledTimes(2);
    expect(setMock.mock.calls.map(([, , options]) => options)).toEqual([
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
    setMock
      .mockRejectedValueOnce(new Error('temporary firestore failure'))
      .mockRejectedValueOnce(new Error('permanent firestore failure'));

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toEqual([]);
    expect(createEnvelopeMock).toHaveBeenCalledOnce();
    expect(setMock).toHaveBeenCalledTimes(3);
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
    createEnvelopeMock.mockRejectedValueOnce(new Error('signwell 500'));

    const sent = await sendPendingEsignDocs('u1');

    expect(sent).toHaveLength(3);
    expect(store.get('userOnboarding/u1_fcra_auth')?.esignDispatch).toMatchObject({
      state: 'failed',
      attempts: 1,
      lastError: 'Error: signwell 500',
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
    createEnvelopeMock.mockRejectedValueOnce(new Error('provider still down'));

    await sendPendingEsignDocs('u1');

    expect(store.get('userOnboarding/u1_contract')?.esignDispatch).toMatchObject({
      state: 'failed',
      attempts: 2,
      lastError: 'Error: provider still down',
    });
  });

  it('marks every applicable item failed when provider construction throws without throwing', async () => {
    getEsignProviderMock.mockImplementationOnce(() => {
      throw new Error('provider misconfigured');
    });

    await expect(sendPendingEsignDocs('u1')).resolves.toEqual([]);

    expect(createEnvelopeMock).not.toHaveBeenCalled();
    for (const itemId of ['contract', 'direct_deposit', 'fcra_auth', 'pay_structure']) {
      expect(store.get(`userOnboarding/u1_${itemId}`)?.esignDispatch).toMatchObject({
        state: 'failed',
        attempts: 1,
        lastError: 'Error: provider misconfigured',
        lastAttemptAt: expect.any(Date),
      });
    }
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
    createEnvelopeMock.mockRejectedValueOnce(new Error('third-attempt failure'));
    createEnvelopeMock.mockRejectedValueOnce(new Error('third-attempt failure'));

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
});
