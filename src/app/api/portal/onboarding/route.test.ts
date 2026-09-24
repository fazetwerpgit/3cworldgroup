import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: vi.fn((callback: () => unknown) => void callback()) };
});

// A path-keyed store stands in for Firestore: production code builds refs via
// adminDb.collection(name).doc(id), and adminDb.getAll(...refs) resolves each
// ref by its `${name}/${id}` path. This lets tests set up userOnboarding and
// esignSigningUrls documents independently, matching the real two-collection
// architecture (the signing URL is a bearer capability kept out of
// userOnboarding entirely - see finding 1 of the security review).
const { userDocGetMock, docMock, getAllMock, gateMock, sendPendingEsignDocsMock, store } = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const userDocGetMock = vi.fn();
  const docMock = vi.fn((name: string, id: string) => {
    if (name === 'users') return { get: userDocGetMock };
    const path = `${name}/${id}`;
    return {
      path,
      get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    };
  });
  const getAllMock = vi.fn(async (...refs: { path: string }[]) =>
    refs.map((ref) => ({
      exists: store.has(ref.path),
      data: () => store.get(ref.path),
    }))
  );
  return {
    userDocGetMock,
    docMock,
    getAllMock,
    gateMock: vi.fn(),
    sendPendingEsignDocsMock: vi.fn(async () => []),
    store,
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => ({ doc: (id: string) => docMock(name, id) })),
    getAll: getAllMock,
  },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedSelfOrManagement: gateMock }));
vi.mock('@/lib/esign/autoSend', () => ({ sendPendingEsignDocs: sendPendingEsignDocsMock }));

import { GET } from './route';

function makeRequest(userId: string) {
  return new NextRequest(`http://localhost/api/portal/onboarding?userId=${userId}`);
}

beforeEach(() => {
  store.clear();
  getAllMock.mockClear();
  gateMock.mockReset();
  sendPendingEsignDocsMock.mockReset();
  sendPendingEsignDocsMock.mockResolvedValue([]);
  userDocGetMock.mockReset();
  userDocGetMock.mockResolvedValue({
    exists: true,
    data: () => ({ fieldRole: 'entry_level_rep', isIBO: false, status: 'pending' }),
  });
});

describe('GET /api/portal/onboarding', () => {
  it('includes esignSigningUrl for the owner, sourced from esignSigningUrls', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam', isManagement: false });
    store.set('userOnboarding/u1_contract', { status: 'submitted', esignEnvelopeId: 'env_1' });
    store.set('esignSigningUrls/u1_contract', {
      url: 'https://www.signwell.com/e/abc',
      envelopeId: 'env_1',
    });

    const res = await GET(makeRequest('u1'));
    const json = await res.json();
    const item = json.items.find((i: { id: string }) => i.id === 'contract');

    expect(item.esignSigningUrl).toBe('https://www.signwell.com/e/abc');
  });

  it('never reads the signing url field back off the userOnboarding document itself', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam', isManagement: false });
    // Simulate a stray/legacy field on the userOnboarding doc - the API must
    // ignore it and source the URL only from esignSigningUrls.
    store.set('userOnboarding/u1_contract', {
      status: 'submitted',
      esignEnvelopeId: 'env_1',
      esignSigningUrl: 'https://www.signwell.com/e/should-not-be-served',
    });

    const res = await GET(makeRequest('u1'));
    const json = await res.json();
    const item = json.items.find((i: { id: string }) => i.id === 'contract');

    expect(item.esignSigningUrl).toBeNull();
  });

  it('nulls esignSigningUrl for management viewing another user', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'admin1', name: 'Admin', isManagement: true });
    store.set('userOnboarding/u1_contract', { status: 'submitted', esignEnvelopeId: 'env_1' });
    store.set('esignSigningUrls/u1_contract', {
      url: 'https://www.signwell.com/e/abc',
      envelopeId: 'env_1',
    });

    const res = await GET(makeRequest('u1'));
    const json = await res.json();
    const item = json.items.find((i: { id: string }) => i.id === 'contract');

    expect(item.esignSigningUrl).toBeNull();
    // Management never needs the URL - the route should not even fetch it.
    expect(getAllMock).toHaveBeenCalledTimes(1);
  });

  it('nulls esignSigningUrl for the owner when no signing url was persisted', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam', isManagement: false });
    store.set('userOnboarding/u1_contract', { status: 'submitted', esignEnvelopeId: 'env_1' });

    const res = await GET(makeRequest('u1'));
    const json = await res.json();
    const item = json.items.find((i: { id: string }) => i.id === 'contract');

    expect(item.esignSigningUrl).toBeNull();
  });
});

describe('GET /api/portal/onboarding status gate', () => {
  function activeUser() {
    userDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ fieldRole: 'entry_rep', isIBO: false, status: 'active' }),
    });
  }

  it('auto-sends for a pending user reading their own checklist', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam', isManagement: false });

    const res = await GET(makeRequest('u1'));
    const json = await res.json();

    expect(json.items.length).toBeGreaterThan(0);
    expect(sendPendingEsignDocsMock).toHaveBeenCalledWith('u1');
  });

  // Bryan and Mason 9/23: activated with documents unsigned, the checklist was
  // empty and the "sign your documents" notification led nowhere.
  it("shows an active user only their unsigned documents, and never auto-sends", async () => {
    activeUser();
    gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam', isManagement: false });
    store.set('userOnboarding/u1_contract', { status: 'approved', esignEnvelopeId: 'env_1' });
    store.set('userOnboarding/u1_w9', { status: 'submitted', esignEnvelopeId: 'env_2' });
    store.set('esignSigningUrls/u1_w9', { url: '/portal/onboarding/sign/env_2' });
    // Never sent (no signing link): nothing the rep can act on, so not listed.
    store.set('userOnboarding/u1_pay_structure', { status: 'not_started' });

    const res = await GET(makeRequest('u1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    const ids = json.items.map((i: { id: string }) => i.id);
    expect(ids).toContain('w9');
    expect(ids).not.toContain('contract');
    expect(ids).not.toContain('pay_structure');
    // Uploads and admin-reviewed items are not the rep's to redo.
    expect(ids).not.toContain('dl_photos');
    expect(sendPendingEsignDocsMock).not.toHaveBeenCalled();
  });

  it('is empty for an active rep activated before e-sign existed (nothing sent)', async () => {
    activeUser();
    gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam', isManagement: false });

    const json = await (await GET(makeRequest('u1'))).json();
    expect(json.items).toEqual([]);
  });

  it('is empty for an active user once every document is signed', async () => {
    activeUser();
    gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam', isManagement: false });
    for (const id of ['w9', 'contract', 'pay_structure', 'direct_deposit', 'fcra_auth', 'ibo_agreement', 'chargeback_card']) {
      store.set(`userOnboarding/u1_${id}`, { status: 'approved', esignEnvelopeId: `env_${id}` });
    }

    const json = await (await GET(makeRequest('u1'))).json();
    expect(json.items).toEqual([]);
  });

  it('still returns records to management viewing an active user, without auto-sending', async () => {
    activeUser();
    gateMock.mockResolvedValue({ ok: true, uid: 'admin1', name: 'Admin', isManagement: true });
    store.set('userOnboarding/u1_contract', { status: 'approved', esignEnvelopeId: 'env_1' });

    const res = await GET(makeRequest('u1'));
    const json = await res.json();
    const item = json.items.find((i: { id: string }) => i.id === 'contract');

    expect(item.status).toBe('approved');
    expect(sendPendingEsignDocsMock).not.toHaveBeenCalled();
  });
});
