import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: vi.fn((callback: () => unknown) => void callback()) };
});

// A path-keyed in-memory Firestore: `${collection}/${id}` -> data.
const { store, gateMock, setMock, deleteMock, activationMock } = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  gateMock: vi.fn(),
  setMock: vi.fn(),
  deleteMock: vi.fn(),
  activationMock: vi.fn(async () => undefined),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => {
        const path = `${name}/${id}`;
        return {
          get: async () => {
            const data = store.get(path);
            return { exists: !!data, get: (field: string) => data?.[field] };
          },
          set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
            setMock(path, data, options);
            store.set(path, options?.merge ? { ...store.get(path), ...data } : data);
          },
          delete: async () => {
            deleteMock(path);
            store.delete(path);
          },
        };
      },
    }),
  },
}));
vi.mock('@/types', () => ({
  ONBOARDING_ITEMS: [
    { id: 'contract', label: 'Contract', referenceKind: 'esign' },
    { id: 'dl_photos', label: "Driver's License Photos", referenceKind: 'storage' },
  ],
}));
vi.mock('@/lib/onboarding/esign', () => ({ isEsignItem: (id: string) => id === 'contract' }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: gateMock }));
vi.mock('@/lib/onboarding/activation', () => ({ maybeFlagActivationReady: activationMock }));

import { POST } from './route';

const OWNER = { ok: true, uid: 'owner-1', name: 'Jeremy', isAdmin: true, isOwner: true };

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/portal/onboarding/mark-complete', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const valid = { userId: 'rep-1', itemId: 'contract', note: '  Signed on paper 9/20  ' };

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  store.set('users/rep-1', { displayName: 'Rep' });
  gateMock.mockResolvedValue(OWNER);
});

describe('POST /api/portal/onboarding/mark-complete', () => {
  it('completes a not-started e-sign item and stops asking the rep to sign', async () => {
    store.set('userOnboarding/rep-1_contract', { status: 'not_started', esignEnvelopeId: 'env_1' });
    store.set('esignSigningUrls/rep-1_contract', { url: '/portal/onboarding/sign/env_1', envelopeId: 'env_1' });
    store.set('esignEnvelopes/env_1', { status: 'sent' });

    const response = await POST(request(valid));

    expect(response.status).toBe(200);
    expect(store.get('userOnboarding/rep-1_contract')).toMatchObject({
      status: 'approved',
      reviewedBy: 'owner-1',
      reviewerName: 'Jeremy',
      rejectionReason: null,
      // The envelope stays recorded so a late provider webhook still matches.
      esignEnvelopeId: 'env_1',
      manualCompletion: { note: 'Signed on paper 9/20', by: 'owner-1', byName: 'Jeremy', at: expect.any(Date) },
    });
    expect(store.has('esignSigningUrls/rep-1_contract')).toBe(false);
    expect(store.get('esignEnvelopes/env_1')).toEqual({ status: 'sent' });
    expect(activationMock).toHaveBeenCalledWith('rep-1');
  });

  it('completes an item that has no progress doc yet without touching signing urls', async () => {
    const response = await POST(request({ ...valid, itemId: 'dl_photos' }));

    expect(response.status).toBe(200);
    expect(store.get('userOnboarding/rep-1_dl_photos')).toMatchObject({
      userId: 'rep-1',
      itemId: 'dl_photos',
      status: 'approved',
    });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it.each([
    ['admin', { ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true, isOwner: false }],
    ['operations', { ok: true, uid: 'ops-1', name: 'Ops', isAdmin: false, isOwner: false }],
  ])('refuses %s', async (_role, gate) => {
    gateMock.mockResolvedValue(gate);

    const response = await POST(request(valid));

    expect(response.status).toBe(403);
    expect(setMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['blank', '    '],
    ['too short', ' ok '],
    ['too long', 'x'.repeat(301)],
    ['not text', 42],
  ])('requires a note (%s)', async (_case, note) => {
    const response = await POST(request({ ...valid, note }));

    expect(response.status).toBe(400);
    expect(setMock).not.toHaveBeenCalled();
  });

  it('rejects an item that is not on the checklist', async () => {
    const response = await POST(request({ ...valid, itemId: 'not_an_item' }));

    expect(response.status).toBe(400);
    expect(setMock).not.toHaveBeenCalled();
  });

  it('refuses a rep that does not exist rather than creating an orphan item', async () => {
    const response = await POST(request({ ...valid, userId: 'ghost' }));

    expect(response.status).toBe(404);
    expect(setMock).not.toHaveBeenCalled();
  });

  it('leaves an already approved item as it was', async () => {
    const approved = { status: 'approved', reviewedBy: 'system', reviewerName: 'E-sign (auto)' };
    store.set('userOnboarding/rep-1_contract', approved);
    store.set('esignSigningUrls/rep-1_contract', { url: 'x' });

    const response = await POST(request(valid));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, alreadyComplete: true });
    expect(store.get('userOnboarding/rep-1_contract')).toEqual(approved);
    expect(setMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(activationMock).not.toHaveBeenCalled();
  });
});
