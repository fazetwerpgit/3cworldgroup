import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: vi.fn((callback: () => unknown) => void callback()) };
});

// A path-keyed store stands in for Firestore: production code builds refs via
// adminDb.collection(name).doc(id), and adminDb.getAll(...refs) resolves each
// ref by its `${name}/${id}` path. This lets tests set up userOnboarding and
// esignEnvelopes documents independently.
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
  it('links the owner to the signing page of an envelope that exists', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam', isManagement: false });
    store.set('userOnboarding/u1_contract', { status: 'submitted', esignEnvelopeId: 'env_1' });
    store.set('esignEnvelopes/env_1', { status: 'sent' });

    const res = await GET(makeRequest('u1'));
    const json = await res.json();
    const item = json.items.find((i: { id: string }) => i.id === 'contract');

    expect(item.signPath).toBe('/portal/onboarding/sign/env_1');
  });

  it('gives no signing page for an envelope id with no record (sent before signing moved in-house)', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam', isManagement: false });
    store.set('userOnboarding/u1_contract', { status: 'submitted', esignEnvelopeId: 'legacy-123' });

    const res = await GET(makeRequest('u1'));
    const json = await res.json();
    const item = json.items.find((i: { id: string }) => i.id === 'contract');

    expect(item.signPath).toBeNull();
    // The pending hire's read triggers the send that replaces the stale id.
    expect(sendPendingEsignDocsMock).toHaveBeenCalledWith('u1');
  });

  it('nulls signPath for management viewing another user, without reading envelopes', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'admin1', name: 'Admin', isManagement: true });
    store.set('userOnboarding/u1_contract', { status: 'submitted', esignEnvelopeId: 'env_1' });
    store.set('esignEnvelopes/env_1', { status: 'sent' });

    const res = await GET(makeRequest('u1'));
    const json = await res.json();
    const item = json.items.find((i: { id: string }) => i.id === 'contract');

    expect(item.signPath).toBeNull();
    expect(getAllMock).toHaveBeenCalledTimes(1);
  });

  it('gives no signing page for a signed item', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam', isManagement: false });
    store.set('userOnboarding/u1_contract', { status: 'approved', esignEnvelopeId: 'env_1' });
    store.set('esignEnvelopes/env_1', { status: 'completed' });

    const res = await GET(makeRequest('u1'));
    const json = await res.json();
    const item = json.items.find((i: { id: string }) => i.id === 'contract');

    expect(item.signPath).toBeNull();
  });

  it('tells the rep a license number is on file by its last 4 only', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam', isManagement: false });
    store.set('userSensitive/u1', {
      dlNumberEncrypted: 'iv.tag.cipher',
      dlLast4: '4567',
      ssnEncrypted: 'iv.tag.ssn',
      ssnLast4: '6789',
    });

    const res = await GET(makeRequest('u1'));
    const body = await res.text();

    expect(JSON.parse(body).dlLast4).toBe('4567');
    expect(body).not.toContain('iv.tag');
    expect(body).not.toContain('6789');
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
    store.set('esignEnvelopes/env_2', { status: 'sent' });
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

  // Approved before signing, with envelopes sent before signing moved in-house:
  // the rep still owes them, so those (and only those) get fresh envelopes.
  it('resends only stale envelopes for an active rep reading their own checklist', async () => {
    activeUser();
    gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam', isManagement: false });
    store.set('userOnboarding/u1_w9', { status: 'submitted', esignEnvelopeId: 'legacy-123' });

    await GET(makeRequest('u1'));

    expect(sendPendingEsignDocsMock).toHaveBeenCalledExactlyOnceWith('u1', { onlyStale: true });
  });

  it('does not resend for an active rep when an envelope read fails', async () => {
    activeUser();
    gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam', isManagement: false });
    store.set('userOnboarding/u1_w9', { status: 'submitted', esignEnvelopeId: 'env_9' });
    const realDoc = docMock.getMockImplementation()!;
    docMock.mockImplementation((name: string, id: string) =>
      name === 'esignEnvelopes'
        ? { path: `${name}/${id}`, get: () => Promise.reject(new Error('unavailable')) }
        : realDoc(name, id)
    );

    const res = await GET(makeRequest('u1'));

    docMock.mockImplementation(realDoc);
    expect(res.status).toBe(200);
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
