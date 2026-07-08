import { describe, it, expect, vi, beforeEach } from 'vitest';

const { store, docMock, createEnvelopeMock, dispatchMock } = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const docMock = vi.fn((path: string) => ({
    get: async () => ({
      exists: store.has(path),
      get: (f: string) => store.get(path)?.[f],
      data: () => store.get(path),
    }),
    set: async (data: Record<string, unknown>) => {
      store.set(path, { ...(store.get(path) ?? {}), ...data });
    },
  }));
  const createEnvelopeMock = vi.fn(async () => ({ envelopeId: 'env_1' }));
  const dispatchMock = vi.fn(async () => undefined);
  return { store, docMock, createEnvelopeMock, dispatchMock };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: { doc: docMock } }));

vi.mock('./provider', () => ({
  getEsignProvider: () => ({ id: 'signwell', createEnvelope: createEnvelopeMock, parseWebhook: vi.fn() }),
}));

vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: dispatchMock }));

import { sendPendingEsignDocs } from './autoSend';

beforeEach(() => {
  store.clear();
  createEnvelopeMock.mockClear();
  dispatchMock.mockClear();
  store.set('users/u1', {
    fieldRole: 'entry_rep',
    isIBO: false,
    displayName: 'Sam Rep',
    email: 'sam@x.com',
    status: 'pending',
  });
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
});
