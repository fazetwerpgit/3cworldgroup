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

  it('returns an empty checklist and never auto-sends for an active user reading their own', async () => {
    activeUser();
    gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam', isManagement: false });
    store.set('userOnboarding/u1_contract', { status: 'approved', esignEnvelopeId: 'env_1' });

    const res = await GET(makeRequest('u1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.items).toEqual([]);
    expect(sendPendingEsignDocsMock).not.toHaveBeenCalled();
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
