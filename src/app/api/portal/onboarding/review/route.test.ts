import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: vi.fn((callback: () => unknown) => void callback()) };
});

const { docGetMock, docUpdateMock, docDeleteMock, docIdMock, gateMock, queryGetMock, getAllMock } = vi.hoisted(() => ({
  docGetMock: vi.fn(),
  docUpdateMock: vi.fn(),
  docDeleteMock: vi.fn(async () => undefined),
  docIdMock: vi.fn((_collection: string, id: string) => ({
    id,
    get: docGetMock,
    update: docUpdateMock,
    delete: docDeleteMock,
  })),
  gateMock: vi.fn(),
  queryGetMock: vi.fn(),
  getAllMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => ({
      doc: (id: string) => docIdMock(name, id),
      where: vi.fn(() => ({ get: queryGetMock })),
      ...(name === 'users' ? {} : {}),
    })),
    getAll: getAllMock,
  },
  getOnboardingBucket: vi.fn(),
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    delete: vi.fn(() => '__FIELD_VALUE_DELETE__'),
    arrayUnion: vi.fn((value: string) => `__FIELD_VALUE_ARRAY_UNION__:${value}`),
  },
}));
vi.mock('@/types', () => ({
  ONBOARDING_ITEMS: [
    { id: 'contract', label: 'Contract', category: 'paperwork', sensitive: false, referenceKind: 'esign' },
    { id: 'onboarding_submission', label: 'Onboarding Submission', category: 'paperwork', sensitive: false, referenceKind: 'manual' },
  ],
}));
vi.mock('@/lib/onboarding/uploads', () => ({ isStorageItem: vi.fn(() => false) }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: gateMock }));
vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/templates', () => ({
  appBaseUrl: vi.fn(() => 'http://localhost'),
  itemRejectedEmail: vi.fn(() => undefined),
}));
vi.mock('@/lib/onboarding/activation', () => ({ maybeFlagActivationReady: vi.fn(async () => undefined) }));

import { GET, POST } from './route';
import { maybeFlagActivationReady } from '@/lib/onboarding/activation';

const onboardingDoc = (esignEnvelopeId?: string) => ({
  exists: true,
  data: () => ({ status: 'submitted' }),
  get: (field: string) =>
    field === 'displayName' ? 'Rep' : field === 'esignEnvelopeId' ? esignEnvelopeId : undefined,
});

function postRequest(itemId: string, status: 'approved' | 'rejected') {
  return new NextRequest('http://localhost/api/portal/onboarding/review', {
    method: 'POST',
    body: JSON.stringify({
      userId: 'user-1',
      itemId,
      status,
      ...(status === 'rejected' ? { rejectionReason: 'Please use the provider envelope.' } : {}),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockResolvedValue({ ok: true, uid: 'manager-1', name: 'Manager', isAdmin: true });
  queryGetMock.mockResolvedValue({ docs: [] });
  getAllMock.mockResolvedValue([]);
  docGetMock.mockResolvedValue(onboardingDoc('env_current'));
  docUpdateMock.mockResolvedValue(undefined);
});

describe('POST /api/portal/onboarding/review', () => {
  it('refuses approval for an e-sign item', async () => {
    const response = await POST(postRequest('contract', 'approved'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('e-sign provider'),
    });
    expect(docUpdateMock).not.toHaveBeenCalled();
  });

  it('still allows rejection for an e-sign item', async () => {
    const response = await POST(postRequest('contract', 'rejected'));

    expect(response.status).toBe(200);
    expect(docUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'rejected',
      supersededEnvelopeIds: '__FIELD_VALUE_ARRAY_UNION__:env_current',
      esignEnvelopeId: '__FIELD_VALUE_DELETE__',
      esignDispatch: '__FIELD_VALUE_DELETE__',
    }));
    // The stale, superseded envelope's bearer signing URL must not keep being
    // served to the candidate after the item is rejected.
    expect(docIdMock).toHaveBeenCalledWith('esignSigningUrls', 'user-1_contract');
    expect(docDeleteMock).toHaveBeenCalledOnce();
  });

  it('rejects an e-sign item without an envelope without adding a superseded id', async () => {
    docGetMock.mockResolvedValue(onboardingDoc());

    const response = await POST(postRequest('contract', 'rejected'));

    expect(response.status).toBe(200);
    const update = docUpdateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(update).not.toHaveProperty('supersededEnvelopeIds');
    expect(update).toMatchObject({
      esignEnvelopeId: '__FIELD_VALUE_DELETE__',
      esignDispatch: '__FIELD_VALUE_DELETE__',
    });
    expect(docDeleteMock).toHaveBeenCalledOnce();
  });

  it('rejecting a non-e-sign item does not clear e-sign fields', async () => {
    const response = await POST(postRequest('onboarding_submission', 'rejected'));

    expect(response.status).toBe(200);
    const update = docUpdateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(update).toMatchObject({ status: 'rejected' });
    expect(update).not.toHaveProperty('esignEnvelopeId');
    expect(update).not.toHaveProperty('esignDispatch');
    expect(docDeleteMock).not.toHaveBeenCalled();
  });

  it('approves a non-e-sign item, writes the target item document, and checks activation', async () => {
    const response = await POST(postRequest('onboarding_submission', 'approved'));

    expect(response.status).toBe(200);
    expect(docIdMock).toHaveBeenCalledWith('userOnboarding', 'user-1_onboarding_submission');
    expect(docUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    expect(maybeFlagActivationReady).toHaveBeenCalledWith('user-1');
    expect(docDeleteMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/portal/onboarding/review', () => {
  it('excludes submitted e-sign items while retaining submitted non-e-sign items', async () => {
    queryGetMock.mockResolvedValue({
      docs: [
        {
          id: 'user-1_contract',
          data: () => ({ userId: 'user-1', itemId: 'contract', submittedAt: { toDate: () => new Date('2026-07-26') } }),
        },
        {
          id: 'user-2_onboarding_submission',
          data: () => ({ userId: 'user-2', itemId: 'onboarding_submission', submittedAt: { toDate: () => new Date('2026-07-27') } }),
        },
      ],
    });
    getAllMock
      .mockResolvedValueOnce([
        { exists: true, id: 'user-2', data: () => ({ displayName: 'Rep', email: 'rep@example.com' }), get: () => false },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(new NextRequest('http://localhost/api/portal/onboarding/review'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      submissions: [expect.objectContaining({
        id: 'user-2_onboarding_submission',
        itemId: 'onboarding_submission',
      })],
      esignPending: [expect.objectContaining({
        id: 'user-1_contract',
        itemId: 'contract',
      })],
    });
  });
});
