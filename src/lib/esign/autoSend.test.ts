import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  store,
  docMock,
  createEnvelopeMock,
  dispatchMock,
  getEsignProviderMock,
  createAlertTaskMock,
  resolveAlertTasksMock,
  writes,
  DELETE_SENTINEL,
} = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
  const DELETE_SENTINEL = '__FIELD_VALUE_DELETE__';
  const docMock = vi.fn((path: string) => ({
    get: async () => ({
      exists: store.has(path),
      get: (f: string) => store.get(path)?.[f],
      data: () => store.get(path),
    }),
    set: async (data: Record<string, unknown>) => {
      writes.push({ path, data });
      const next = { ...(store.get(path) ?? {}), ...data };
      Object.entries(data).forEach(([key, value]) => {
        if (value === DELETE_SENTINEL) delete next[key];
      });
      store.set(path, next);
    },
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
  return {
    store,
    docMock,
    createEnvelopeMock,
    dispatchMock,
    getEsignProviderMock,
    createAlertTaskMock: vi.fn(async () => 'alert_1'),
    resolveAlertTasksMock: vi.fn(async () => undefined),
    writes,
    DELETE_SENTINEL,
  };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: { doc: docMock } }));
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

  it('continues when one envelope creation fails', async () => {
    createEnvelopeMock.mockRejectedValueOnce(new Error('signwell 500'));
    const sent = await sendPendingEsignDocs('u1');
    expect(sent.length).toBe(3);
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

  it('raises one alert task per user when attempts reach three and does not re-raise on later retry', async () => {
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

    vi.advanceTimersByTime(6 * 60 * 1000);
    createEnvelopeMock.mockRejectedValue(new Error('fourth-attempt failure'));
    await sendPendingEsignDocs('u1');
    expect(createAlertTaskMock).toHaveBeenCalledOnce();
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
});
