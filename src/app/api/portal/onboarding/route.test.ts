import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: vi.fn((callback: () => unknown) => void callback()) };
});

const { userDocGetMock, docMock, getAllMock, gateMock, sendPendingEsignDocsMock } = vi.hoisted(() => ({
  userDocGetMock: vi.fn(),
  docMock: vi.fn((id: string) => ({ id, get: userDocGetMock })),
  getAllMock: vi.fn(),
  gateMock: vi.fn(),
  sendPendingEsignDocsMock: vi.fn(async () => []),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: docMock })),
    getAll: getAllMock,
  },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedSelfOrManagement: gateMock }));
vi.mock('@/lib/esign/autoSend', () => ({ sendPendingEsignDocs: sendPendingEsignDocsMock }));

import { GET } from './route';

function makeRequest(userId: string) {
  return new NextRequest(`http://localhost/api/portal/onboarding?userId=${userId}`);
}

// Checklist order for an entry_level_rep (non-IBO): w9, fcra_auth,
// background_check, dl_photos, contract, direct_deposit, pay_structure,
// onboarding_submission. 'contract' lands at index 4.
const CONTRACT_INDEX = 4;
const CHECKLIST_LENGTH = 8;

function progressDocs(overrides: Record<number, Record<string, unknown>> = {}) {
  return Array.from({ length: CHECKLIST_LENGTH }, (_, i) => {
    const data = overrides[i];
    return data
      ? { exists: true, data: () => data }
      : { exists: false, data: () => undefined };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sendPendingEsignDocsMock.mockResolvedValue([]);
  userDocGetMock.mockResolvedValue({
    exists: true,
    data: () => ({ fieldRole: 'entry_level_rep', isIBO: false }),
  });
  getAllMock.mockResolvedValue(progressDocs());
});

describe('GET /api/portal/onboarding', () => {
  it('includes esignSigningUrl for the owner', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam', isManagement: false });
    getAllMock.mockResolvedValue(
      progressDocs({
        [CONTRACT_INDEX]: { status: 'submitted', esignSigningUrl: 'https://www.signwell.com/e/abc' },
      })
    );

    const res = await GET(makeRequest('u1'));
    const json = await res.json();
    const item = json.items.find((i: { id: string }) => i.id === 'contract');

    expect(item.esignSigningUrl).toBe('https://www.signwell.com/e/abc');
  });

  it('nulls esignSigningUrl for management viewing another user', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'admin1', name: 'Admin', isManagement: true });
    getAllMock.mockResolvedValue(
      progressDocs({
        [CONTRACT_INDEX]: { status: 'submitted', esignSigningUrl: 'https://www.signwell.com/e/abc' },
      })
    );

    const res = await GET(makeRequest('u1'));
    const json = await res.json();
    const item = json.items.find((i: { id: string }) => i.id === 'contract');

    expect(item.esignSigningUrl).toBeNull();
  });

  it('nulls esignSigningUrl for the owner when no signing url was persisted', async () => {
    gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam', isManagement: false });
    getAllMock.mockResolvedValue(
      progressDocs({
        [CONTRACT_INDEX]: { status: 'submitted', esignEnvelopeId: 'env_1' },
      })
    );

    const res = await GET(makeRequest('u1'));
    const json = await res.json();
    const item = json.items.find((i: { id: string }) => i.id === 'contract');

    expect(item.esignSigningUrl).toBeNull();
  });
});
