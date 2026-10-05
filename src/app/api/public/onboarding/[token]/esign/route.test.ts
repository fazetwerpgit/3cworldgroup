import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type * as SignEnvelopeModule from '@/lib/esign/signEnvelope';

// One in-memory Firestore for the invite, the user, checklist rows and
// envelopes. Paths are 'collection/id'.
const { store, sendPendingMock, signMock, pdfMock } = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  sendPendingMock: vi.fn(async () => [] as string[]),
  signMock: vi.fn(),
  pdfMock: vi.fn(),
}));

function docApi(path: string) {
  return {
    path,
    get: async () => {
      const data = store.get(path);
      return { exists: !!data, data: () => data, get: (field: string) => data?.[field] };
    },
    set: async (data: Record<string, unknown>) => {
      const previous = store.get(path) ?? {};
      const next = { ...previous };
      for (const [key, value] of Object.entries(data)) {
        const before = previous[key];
        next[key] =
          value && typeof value === 'object' && !(value instanceof Date) && before && typeof before === 'object'
            ? { ...(before as object), ...(value as object) }
            : value;
      }
      store.set(path, next);
    },
  };
}

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    doc: (path: string) => docApi(path),
    collection: (name: string) => ({ doc: (id: string) => docApi(`${name}/${id}`) }),
  },
}));
vi.mock('@/lib/recruiting/inviteLookup', () => ({
  SUBMITTED_INVITE_STATUSES: ['submitted', 'approved', 'converted'],
  getInviteByToken: async (token: string) => {
    if (token !== 'token-1') return null;
    return { id: 'invite-1', ref: docApi('onboardingInvites/invite-1'), data: store.get('onboardingInvites/invite-1') };
  },
}));
vi.mock('@/lib/esign/autoSend', () => ({ sendPendingEsignDocs: sendPendingMock }));
vi.mock('@/lib/esign/inhouse', () => ({
  loadEnvelope: async (id: string) => {
    const data = store.get(`esignEnvelopes/${id}`);
    return data ? { prefill: {}, ...data } : null;
  },
}));
vi.mock('@/lib/esign/signEnvelope', async (importOriginal) => {
  const actual = await importOriginal<typeof SignEnvelopeModule>();
  return { ...actual, signInhouseEnvelope: signMock };
});
vi.mock('@/lib/esign/sourcePdf', () => ({ sourcePdfResponse: pdfMock }));

import { issueSigningSession, SIGNING_KEY_HEADER } from '@/lib/onboarding/inviteSigning';
import { GET as listDocuments } from './route';
import { POST as signDocument } from './sign/route';
import { GET as getPdf } from './[envelopeId]/pdf/route';

const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]).toString('base64')}`;
let key = '';

function req(method: 'GET' | 'POST', body?: unknown, signingKey: string | null = key) {
  return new NextRequest('http://localhost/api/public/onboarding/token-1/esign', {
    method,
    headers: {
      'content-type': 'application/json',
      ...(signingKey === null ? {} : { [SIGNING_KEY_HEADER]: signingKey }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const tokenParams = (token = 'token-1') => ({ params: Promise.resolve({ token }) });
const pdfParams = (envelopeId: string, token = 'token-1') => ({ params: Promise.resolve({ token, envelopeId }) });

function signBody(envelopeId: string) {
  return { envelopeId, fields: {}, signaturePng: PNG, signatureMethod: 'draw', consent: true };
}

function envelope(id: string, itemId: string, userId = 'user-1', status = 'sent') {
  store.set(`esignEnvelopes/${id}`, {
    docKey: itemId,
    userId,
    itemId,
    signerName: 'Casey Hire',
    signerEmail: 'casey@example.com',
    status,
  });
  store.set(`userOnboarding/${userId}_${itemId}`, { userId, itemId, status: 'submitted', esignEnvelopeId: id });
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  const session = issueSigningSession('user-1');
  key = session.key;
  store.set('onboardingInvites/invite-1', {
    status: 'submitted',
    candidateEmail: 'Casey@Example.com',
    convertedUserId: 'user-1',
    esignSession: session.record,
  });
  store.set('users/user-1', {
    email: 'casey@example.com',
    displayName: 'Casey Hire',
    fieldRole: 'entry_level_rep',
    isIBO: false,
    status: 'pending',
    onboardingInviteId: 'invite-1',
  });
  envelope('env-w9', 'w9');
  envelope('env-contract', 'contract');
  envelope('env-dd', 'direct_deposit');
  signMock.mockResolvedValue({ ok: true });
  pdfMock.mockResolvedValue(new NextResponse('pdf', { status: 200 }));
});

describe('invite signing: who may use it', () => {
  it.each([
    ['no signing key', null],
    ['a wrong signing key', 'not-the-key'],
  ])('rejects %s', async (_label, wrongKey) => {
    const response = await listDocuments(req('GET', undefined, wrongKey), tokenParams());
    expect(response.status).toBe(401);
    expect(sendPendingMock).not.toHaveBeenCalled();
  });

  it('rejects the key on a different invite token', async () => {
    const response = await listDocuments(req('GET'), tokenParams('token-2'));
    expect(response.status).toBe(404);
  });

  it('rejects an expired session', async () => {
    const invite = store.get('onboardingInvites/invite-1')!;
    store.set('onboardingInvites/invite-1', {
      ...invite,
      esignSession: { ...(invite.esignSession as object), expiresAt: new Date(Date.now() - 1000) },
    });
    const response = await listDocuments(req('GET'), tokenParams());
    expect(response.status).toBe(401);
  });

  it.each([
    ['the account is active', { status: 'active' }],
    ['the account went inactive', { status: 'inactive' }],
    ['another invite has since claimed the account', { onboardingInviteId: 'invite-2' }],
    ['the account email no longer matches the invite', { email: 'someone@else.com' }],
  ])('refuses once %s', async (_label, change) => {
    store.set('users/user-1', { ...store.get('users/user-1'), ...change });

    const list = await listDocuments(req('GET'), tokenParams());
    const sign = await signDocument(req('POST', signBody('env-w9')), tokenParams());
    const pdf = await getPdf(req('GET'), pdfParams('env-w9'));

    expect([list.status, sign.status, pdf.status]).toEqual([403, 403, 403]);
    expect(signMock).not.toHaveBeenCalled();
    expect(sendPendingMock).not.toHaveBeenCalled();
  });

  it('refuses a session bound to a different account than the invite', async () => {
    const invite = store.get('onboardingInvites/invite-1')!;
    store.set('onboardingInvites/invite-1', { ...invite, convertedUserId: 'user-2' });
    const response = await listDocuments(req('GET'), tokenParams());
    expect(response.status).toBe(401);
  });

  it('refuses an invite that is not submitted', async () => {
    store.set('onboardingInvites/invite-1', { ...store.get('onboardingInvites/invite-1'), status: 'rejected' });
    const response = await listDocuments(req('GET'), tokenParams());
    expect(response.status).toBe(403);
  });
});

describe('GET documents', () => {
  it('makes sure the envelopes exist (email held back) and lists each with its form', async () => {
    store.set('userOnboarding/user-1_w9', { ...store.get('userOnboarding/user-1_w9'), status: 'approved' });

    const response = await listDocuments(req('GET'), tokenParams());

    expect(response.status).toBe(200);
    expect(sendPendingMock).toHaveBeenCalledWith('user-1', { deferReadyEmail: true });
    const body = (await response.json()) as {
      signerName: string;
      documents: { itemId: string; state: string; envelope: { envelopeId: string } | null }[];
    };
    expect(body.signerName).toBe('Casey Hire');
    expect(body.documents.map((doc) => [doc.itemId, doc.state])).toEqual([
      ['w9', 'signed'],
      ['contract', 'ready'],
      ['direct_deposit', 'ready'],
    ]);
    expect(body.documents[1].envelope?.envelopeId).toBe('env-contract');
  });

  it("never exposes another user's envelope, even if a row points at it", async () => {
    envelope('env-other', 'contract', 'user-2');
    store.set('userOnboarding/user-1_contract', { userId: 'user-1', itemId: 'contract', status: 'submitted', esignEnvelopeId: 'env-other' });

    const response = await listDocuments(req('GET'), tokenParams());
    const body = (await response.json()) as { documents: { itemId: string; state: string; envelope: unknown }[] };

    expect(body.documents.find((doc) => doc.itemId === 'contract')).toEqual({
      itemId: 'contract',
      label: 'Contract',
      state: 'preparing',
      envelope: null,
    });
  });

  it('reports a document that failed to send', async () => {
    store.set('userOnboarding/user-1_contract', { userId: 'user-1', itemId: 'contract', status: 'not_started', esignDispatch: { state: 'failed' } });
    const response = await listDocuments(req('GET'), tokenParams());
    const body = (await response.json()) as { documents: { itemId: string; state: string }[] };
    expect(body.documents.find((doc) => doc.itemId === 'contract')?.state).toBe('failed');
  });

  it('once everything is signed, says done and closes the session for good', async () => {
    for (const itemId of ['w9', 'contract', 'direct_deposit']) {
      store.set(`userOnboarding/user-1_${itemId}`, { ...store.get(`userOnboarding/user-1_${itemId}`), status: 'approved' });
    }

    const first = await listDocuments(req('GET'), tokenParams());
    expect(first.status).toBe(409);
    expect(await first.json()).toMatchObject({ done: true });

    // Closed: even the sign route now refuses, before touching any envelope.
    const sign = await signDocument(req('POST', signBody('env-w9')), tokenParams());
    expect(sign.status).toBe(409);
    expect(signMock).not.toHaveBeenCalled();
  });
});

describe('GET document pdf', () => {
  it('serves the source pdf of the hire’s own envelope', async () => {
    const response = await getPdf(req('GET'), pdfParams('env-contract'));
    expect(response.status).toBe(200);
    expect(pdfMock).toHaveBeenCalledWith('contract');
  });

  it("answers 404 for another user's envelope", async () => {
    envelope('env-other', 'contract', 'user-2');
    const response = await getPdf(req('GET'), pdfParams('env-other'));
    expect(response.status).toBe(404);
    expect(pdfMock).not.toHaveBeenCalled();
  });
});

describe('POST sign', () => {
  it('signs one of the hire’s envelopes through the shared portal signing act', async () => {
    const response = await signDocument(req('POST', signBody('env-contract')), tokenParams());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ completed: true, allSigned: false });
    expect(signMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        envelope: expect.objectContaining({ itemId: 'contract', userId: 'user-1' }),
        request: expect.objectContaining({ envelopeId: 'env-contract', signatureMethod: 'draw' }),
      })
    );
  });

  it("refuses another user's envelope without signing anything", async () => {
    envelope('env-other', 'contract', 'user-2');
    const response = await signDocument(req('POST', signBody('env-other')), tokenParams());
    expect(response.status).toBe(404);
    expect(signMock).not.toHaveBeenCalled();
  });

  it('requires consent and a signature like the portal does', async () => {
    const response = await signDocument(
      req('POST', { ...signBody('env-contract'), consent: false }),
      tokenParams()
    );
    expect(response.status).toBe(400);
    expect(signMock).not.toHaveBeenCalled();
  });

  it('passes an already-signed answer through', async () => {
    signMock.mockResolvedValue({ ok: false, status: 409, error: 'already completed' });
    const response = await signDocument(req('POST', signBody('env-w9')), tokenParams());
    expect(response.status).toBe(409);
  });

  it('reports a failed document by its own status so the screen can retry just that one', async () => {
    signMock.mockResolvedValue({ ok: false, status: 502, error: 'upload failed' });
    const response = await signDocument(req('POST', signBody('env-dd')), tokenParams());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'upload failed' });
  });

  it('the last signature closes the session', async () => {
    store.set('userOnboarding/user-1_w9', { ...store.get('userOnboarding/user-1_w9'), status: 'approved' });
    store.set('userOnboarding/user-1_contract', { ...store.get('userOnboarding/user-1_contract'), status: 'approved' });
    signMock.mockImplementation(async () => {
      store.set('userOnboarding/user-1_direct_deposit', {
        ...store.get('userOnboarding/user-1_direct_deposit'),
        status: 'approved',
      });
      return { ok: true };
    });

    const response = await signDocument(req('POST', signBody('env-dd')), tokenParams());

    expect(await response.json()).toEqual({ completed: true, allSigned: true });
    const session = store.get('onboardingInvites/invite-1')?.esignSession as { closedAt?: Date };
    expect(session.closedAt).toBeInstanceOf(Date);
    const again = await listDocuments(req('GET'), tokenParams());
    expect(again.status).toBe(409);
  });
});
