import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: vi.fn((callback: () => unknown) => void callback()) };
});

const { docGetMock, docUpdateMock, docDeleteMock, docIdMock, gateMock, queryGetMock, getAllMock, sendPendingEsignDocsMock, logAddMock } = vi.hoisted(() => ({
  logAddMock: vi.fn(async () => undefined),
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
  sendPendingEsignDocsMock: vi.fn(async () => []),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => ({
      doc: (id: string) => docIdMock(name, id),
      where: vi.fn(() => ({ get: queryGetMock })),
      add: logAddMock,
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
vi.mock('@/types', () => {
  const ONBOARDING_ITEMS = [
    { id: 'w9', label: 'W-9', category: 'paperwork', sensitive: true, referenceKind: 'esign', order: 1 },
    { id: 'contract', label: 'Contract', category: 'paperwork', sensitive: false, referenceKind: 'esign', order: 2 },
    { id: 'onboarding_submission', label: 'Onboarding Submission', category: 'paperwork', sensitive: false, referenceKind: 'manual', order: 3 },
    { id: 'dl_photos', label: "Driver's License Photos", category: 'paperwork', sensitive: true, referenceKind: 'storage', order: 4 },
  ];
  return {
    ONBOARDING_ITEMS,
    // Every field role gets every item here; which items apply is not under test.
    getOnboardingItemsForUser: () => ONBOARDING_ITEMS,
    resolveRoles: (role?: string, fieldRole?: string) => ({ role, fieldRole }),
    RoleDisplayNames: { entry_level_rep: 'Entry Level Rep' },
  };
});
vi.mock('@/lib/onboarding/uploads', () => ({ isStorageItem: vi.fn(() => false) }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: gateMock }));
vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/templates', () => ({
  appBaseUrl: vi.fn(() => 'http://localhost'),
  itemRejectedEmail: vi.fn(() => undefined),
}));
vi.mock('@/lib/onboarding/activation', () => ({ maybeFlagActivationReady: vi.fn(async () => undefined) }));
vi.mock('@/lib/esign/autoSend', () => ({ sendPendingEsignDocs: sendPendingEsignDocsMock }));

import { GET, POST } from './route';
import { maybeFlagActivationReady } from '@/lib/onboarding/activation';
import { isStorageItem } from '@/lib/onboarding/uploads';
import { getOnboardingBucket } from '@/lib/firebase/admin';

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
      ...(status === 'rejected' ? { rejectionReason: 'Please sign the new envelope.' } : {}),
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
  sendPendingEsignDocsMock.mockResolvedValue([]);
});

describe('POST /api/portal/onboarding/review', () => {
  it.each(['w9', 'contract'])('refuses approval for the e-sign item %s', async (itemId) => {
    const response = await POST(postRequest(itemId, 'approved'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('only when the rep signs them'),
    });
    expect(docUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 409 when another reviewer changed the item after it was read', async () => {
    const updateTime = { seconds: 1 };
    docGetMock.mockResolvedValue({ ...onboardingDoc(), updateTime });
    docUpdateMock.mockRejectedValueOnce(Object.assign(new Error('precondition'), { code: 9 }));

    const response = await POST(postRequest('onboarding_submission', 'approved'));

    expect(response.status).toBe(409);
    expect(docUpdateMock.mock.calls[0]?.[1]).toEqual({ lastUpdateTime: updateTime });
    expect(maybeFlagActivationReady).not.toHaveBeenCalled();
  });

  it('still allows rejection for an e-sign item', async () => {
    const response = await POST(postRequest('contract', 'rejected'));

    expect(response.status).toBe(200);
    expect(docUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'rejected',
      supersededEnvelopeIds: '__FIELD_VALUE_ARRAY_UNION__:env_current',
      reference: '__FIELD_VALUE_DELETE__',
      esignEnvelopeId: '__FIELD_VALUE_DELETE__',
      esignDispatch: '__FIELD_VALUE_DELETE__',
    }));
    expect(sendPendingEsignDocsMock).toHaveBeenCalledWith('user-1');
  });

  it('rejects an e-sign item without an envelope without adding a superseded id', async () => {
    docGetMock.mockResolvedValue(onboardingDoc());

    const response = await POST(postRequest('contract', 'rejected'));

    expect(response.status).toBe(200);
    const update = docUpdateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(update).not.toHaveProperty('supersededEnvelopeIds');
    expect(update).toMatchObject({
      reference: '__FIELD_VALUE_DELETE__',
      esignEnvelopeId: '__FIELD_VALUE_DELETE__',
      esignDispatch: '__FIELD_VALUE_DELETE__',
    });
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
  const progress = (userId: string, itemId: string, fields: Record<string, unknown>) => ({
    id: `${userId}_${itemId}`,
    data: () => ({ userId, itemId, ...fields }),
  });
  const at = (iso: string) => ({ toDate: () => new Date(iso) });

  it('groups every rep with their whole checklist, reps with something waiting first', async () => {
    // submitted
    queryGetMock.mockResolvedValueOnce({
      docs: [
        progress('user-2', 'onboarding_submission', { status: 'submitted', submittedAt: at('2026-07-27') }),
        progress('user-2', 'w9', { status: 'submitted', submittedAt: at('2026-07-26'), esignEnvelopeId: 'env-w9' }),
      ],
    });
    // approved / rejected
    queryGetMock.mockResolvedValueOnce({
      docs: [
        progress('user-2', 'contract', {
          status: 'approved',
          reviewedAt: at('2026-07-28'),
          reviewerName: 'Jeremy',
          // Sent, then signed on paper: the envelope was never signed.
          esignEnvelopeId: 'env-contract',
          manualCompletion: { note: 'Signed on paper', by: 'owner-1', byName: 'Jeremy', at: at('2026-07-28') },
        }),
      ],
    });
    // pending users: a new hire who has not started, and a self-signup with no field role
    queryGetMock.mockResolvedValueOnce({
      docs: [
        { id: 'user-1', data: () => ({ displayName: 'Anna New', fieldRole: 'entry_level_rep', status: 'pending' }) },
        { id: 'signup-1', data: () => ({ displayName: 'Signup', status: 'pending' }) },
      ],
    });
    getAllMock.mockResolvedValueOnce([
      { exists: true, id: 'user-2', data: () => ({ displayName: 'Zed Waiting', fieldRole: 'entry_level_rep', atRisk: true }) },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/portal/onboarding/review'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.people.map((p: { userId: string }) => p.userId)).toEqual(['user-2', 'user-1']);
    const [waiting, fresh] = json.people;
    expect(waiting).toMatchObject({
      userName: 'Zed Waiting',
      roleLabel: 'Entry Level Rep',
      atRisk: true,
      done: 1,
      total: 4,
      toReview: 1,
      unsigned: 1,
    });
    expect(waiting.items.map((i: { itemId: string; status: string }) => [i.itemId, i.status])).toEqual([
      ['w9', 'submitted'],
      ['contract', 'approved'],
      ['onboarding_submission', 'submitted'],
      ['dl_photos', 'not_started'],
    ]);
    expect(waiting.items[1]).toMatchObject({
      reviewerName: 'Jeremy',
      manualCompletion: { note: 'Signed on paper', byName: 'Jeremy' },
      hasSignedPdf: false,
    });
    expect(fresh).toMatchObject({ userName: 'Anna New', done: 0, total: 4, toReview: 0, unsigned: 0 });
    // The dashboard's queue: submitted, never e-sign.
    expect(json.submissions).toEqual([
      expect.objectContaining({ id: 'user-2_onboarding_submission', itemId: 'onboarding_submission' }),
    ]);
  });

  it('does not sign files for an item that is no longer under review', async () => {
    vi.mocked(isStorageItem).mockImplementation((itemId: string) => itemId === 'dl_photos');
    const getFiles = vi.fn(async () => [[]]);
    vi.mocked(getOnboardingBucket).mockReturnValue({ getFiles } as never);
    queryGetMock.mockResolvedValueOnce({ docs: [] });
    queryGetMock.mockResolvedValueOnce({
      docs: [progress('user-1', 'dl_photos', { status: 'approved', reference: 'onboarding/user-1/dl_photos' })],
    });
    getAllMock.mockResolvedValueOnce([{ exists: true, id: 'user-1', data: () => ({ displayName: 'One' }) }]);

    const json = await (await GET(new NextRequest('http://localhost/api/portal/onboarding/review'))).json();

    expect(json.people[0].items).toEqual([expect.objectContaining({ itemId: 'dl_photos', files: [] })]);
    expect(getFiles).not.toHaveBeenCalled();
    expect(logAddMock).not.toHaveBeenCalled();
  });

  describe('sensitive storage files', () => {
    const getSignedUrlMock = vi.fn(async () => ['https://signed.example/front.jpg']);

    beforeEach(() => {
      vi.mocked(isStorageItem).mockImplementation((itemId: string) => itemId === 'dl_photos');
      vi.mocked(getOnboardingBucket).mockReturnValue({
        getFiles: vi.fn(async () => [[
          { name: 'onboarding/user-1/dl_photos/front.jpg', metadata: { contentType: 'image/jpeg' }, getSignedUrl: getSignedUrlMock },
        ]]),
      } as never);
      queryGetMock.mockResolvedValueOnce({
        docs: [{
          id: 'user-1_dl_photos',
          data: () => ({
            userId: 'user-1',
            itemId: 'dl_photos',
            status: 'submitted',
            reference: 'onboarding/user-1/dl_photos',
            submittedAt: { toDate: () => new Date('2026-07-26') },
          }),
        }],
      });
      queryGetMock.mockResolvedValueOnce({ docs: [] });
      getAllMock.mockResolvedValue([{ exists: true, id: 'user-1', data: () => ({ displayName: 'One', fieldRole: 'entry_level_rep' }) }]);
    });

    it('gives operations the item but no signed URLs, and writes no audit row', async () => {
      gateMock.mockResolvedValue({ ok: true, uid: 'ops-1', name: 'Ops', isAdmin: false });

      const json = await (await GET(new NextRequest('http://localhost/api/portal/onboarding/review'))).json();

      expect(json.submissions).toEqual([
        expect.objectContaining({ itemId: 'dl_photos', sensitive: true, adminOnly: true, files: [] }),
      ]);
      expect(getSignedUrlMock).not.toHaveBeenCalled();
      expect(logAddMock).not.toHaveBeenCalled();
    });

    it('signs the files for an admin and writes a sensitiveAccessLog row', async () => {
      const json = await (await GET(new NextRequest('http://localhost/api/portal/onboarding/review'))).json();

      expect(json.submissions).toEqual([
        expect.objectContaining({
          itemId: 'dl_photos',
          adminOnly: false,
          files: [{ name: 'front.jpg', url: 'https://signed.example/front.jpg', contentType: 'image/jpeg' }],
        }),
      ]);
      expect(logAddMock).toHaveBeenCalledWith({
        targetUid: 'user-1',
        revealedBy: 'manager-1',
        revealedByName: 'Manager',
        itemId: 'dl_photos',
        source: 'onboarding-review',
        at: expect.any(Date),
      });
    });

    it('withholds the files when the audit row cannot be written', async () => {
      logAddMock.mockRejectedValueOnce(new Error('write failed'));

      const json = await (await GET(new NextRequest('http://localhost/api/portal/onboarding/review'))).json();

      expect(json.submissions).toEqual([expect.objectContaining({ itemId: 'dl_photos', files: [] })]);
    });
  });
});

describe('GET /api/portal/onboarding/review?summary=1', () => {
  const waiting = (userId: string, itemId: string, submittedAt?: string) => ({
    id: `${userId}_${itemId}`,
    data: () => ({ userId, itemId, status: 'submitted', ...(submittedAt ? { submittedAt: { toDate: () => new Date(submittedAt) } } : {}) }),
  });
  const summary = () => GET(new NextRequest('http://localhost/api/portal/onboarding/review?summary=1'));
  // getAll answers per requested ref, like Firestore: unknown ids come back as missing docs.
  const accounts = (byId: Record<string, Record<string, unknown>>) =>
    getAllMock.mockImplementation(async (...refs: Array<{ id: string }>) =>
      refs.map((ref) => ({ exists: ref.id in byId, id: ref.id, data: () => byId[ref.id] }))
    );

  it('returns one row per item waiting on management, and leaves e-sign and unknown items out', async () => {
    accounts({ u1: { fieldRole: 'entry_level_rep' }, u2: { fieldRole: 'entry_level_rep' }, u3: { fieldRole: 'entry_level_rep' } });
    queryGetMock.mockResolvedValueOnce({
      docs: [
        waiting('u1', 'onboarding_submission', '2026-07-27T00:00:00.000Z'),
        waiting('u2', 'dl_photos', '2026-07-26T00:00:00.000Z'),
        waiting('u2', 'w9', '2026-07-26T00:00:00.000Z'), // out for signature, not waiting on management
        waiting('u3', 'not_a_real_item', '2026-07-26T00:00:00.000Z'),
      ],
    });

    const response = await summary();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      submissions: [{ submittedAt: '2026-07-27T00:00:00.000Z' }, { submittedAt: '2026-07-26T00:00:00.000Z' }],
    });
  });

  it('does not count items of an account that has been deleted', async () => {
    accounts({ u1: { fieldRole: 'entry_level_rep' } });
    queryGetMock.mockResolvedValueOnce({
      docs: [waiting('u1', 'dl_photos', '2026-07-27T00:00:00.000Z'), waiting('ghost', 'dl_photos', '2026-07-24T00:00:00.000Z')],
    });

    const json = await (await summary()).json();

    expect(json.submissions).toEqual([{ submittedAt: '2026-07-27T00:00:00.000Z' }]);
  });

  it('does not count items of an inactive (rejected or decommissioned) account', async () => {
    accounts({ u1: { fieldRole: 'entry_level_rep' }, gone: { fieldRole: 'entry_level_rep', status: 'inactive' } });
    queryGetMock.mockResolvedValueOnce({
      docs: [waiting('u1', 'dl_photos', '2026-07-27T00:00:00.000Z'), waiting('gone', 'dl_photos', '2026-07-24T00:00:00.000Z')],
    });

    const json = await (await summary()).json();

    expect(json.submissions).toEqual([{ submittedAt: '2026-07-27T00:00:00.000Z' }]);
  });

  it('reads only the submitted items and their accounts: no review history, no pending scan, no signed files', async () => {
    accounts({ u2: { fieldRole: 'entry_level_rep' } });
    queryGetMock.mockResolvedValueOnce({ docs: [waiting('u2', 'dl_photos', '2026-07-26T00:00:00.000Z')] });

    await summary();

    expect(queryGetMock).toHaveBeenCalledTimes(1);
    expect(getAllMock).toHaveBeenCalledTimes(1);
    expect(getOnboardingBucket).not.toHaveBeenCalled();
    expect(logAddMock).not.toHaveBeenCalled();
  });

  it('still requires management', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, error: 'Forbidden', status: 403 });

    expect((await summary()).status).toBe(403);
    expect(queryGetMock).not.toHaveBeenCalled();
  });

  it('counts exactly what the Review tab lists for the same data, including a deleted user and an e-sign item', async () => {
    const submitted = {
      docs: [
        waiting('u1', 'onboarding_submission', '2026-07-27T00:00:00.000Z'),
        waiting('u2', 'dl_photos', '2026-07-26T00:00:00.000Z'),
        waiting('u2', 'w9', '2026-07-25T00:00:00.000Z'),
        waiting('ghost', 'dl_photos', '2026-07-24T00:00:00.000Z'), // account no longer exists
        waiting('u3', 'not_a_real_item', '2026-07-23T00:00:00.000Z'),
      ],
    };
    accounts({
      u1: { displayName: 'One', fieldRole: 'entry_level_rep' },
      u2: { displayName: 'Two', fieldRole: 'entry_level_rep' },
      u3: { displayName: 'Three', fieldRole: 'entry_level_rep' },
    });

    // Full response: submitted, reviewed history, pending users.
    queryGetMock.mockResolvedValueOnce(submitted).mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [] });
    const full = await (await GET(new NextRequest('http://localhost/api/portal/onboarding/review'))).json();

    // Summary response: submitted only.
    queryGetMock.mockResolvedValueOnce(submitted);
    const counted = await (await summary()).json();

    const times = (rows: Array<{ submittedAt: string | null }>) => rows.map((row) => row.submittedAt).sort();
    expect(full.submissions).toHaveLength(2);
    expect(full.people.map((p: { userId: string }) => p.userId)).not.toContain('ghost');
    expect(times(counted.submissions)).toEqual(times(full.submissions));
  });
});
