import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  inviteRef,
  batchSetMock,
  batchCommitMock,
  createUserMock,
  deleteUserMock,
  sendPendingEsignDocsMock,
  inviteData,
} = vi.hoisted(() => ({
  inviteRef: { set: vi.fn() },
  batchSetMock: vi.fn(),
  batchCommitMock: vi.fn(),
  createUserMock: vi.fn(),
  deleteUserMock: vi.fn(),
  sendPendingEsignDocsMock: vi.fn(),
  inviteData: {
    candidateName: 'Candidate',
    candidateEmail: 'candidate@example.com',
    candidatePhone: '555-0100',
    intendedFieldRole: 'entry_level_rep',
    isIBO: false,
    ownerId: 'owner-1',
    status: 'in_progress',
    tokenHash: 'hashed-token-1',
    expiresAt: undefined as { toDate: () => Date } | undefined,
  },
}));

vi.mock('next/server', () => {
  class TestNextRequest {
    body: string;

    constructor(_url: string, init: { body?: string }) {
      this.body = init.body ?? '';
    }

    async json() {
      return JSON.parse(this.body);
    }
  }

  return {
    NextRequest: TestNextRequest,
    after(callback: () => unknown) {
      void callback();
    },
    NextResponse: {
      json(data: unknown, init?: { status?: number }) {
        return new Response(JSON.stringify(data), {
          status: init?.status ?? 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    createUser: createUserMock,
    deleteUser: deleteUserMock,
  },
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'onboardingInvites') {
        return {
          where: (_field: string, _operator: string, tokenHash: unknown) => ({
            limit: (count: number) => ({
              get: async () => ({
                empty: tokenHash !== inviteData.tokenHash || count !== 1,
                docs: tokenHash === inviteData.tokenHash && count === 1
                  ? [{ id: 'invite-1', ref: inviteRef, data: () => inviteData }]
                  : [],
              }),
            }),
          }),
        };
      }

      return {
        doc: vi.fn((id: string) => ({ id, set: vi.fn() })),
        add: vi.fn(async () => undefined),
      };
    }),
    batch: () => ({ set: batchSetMock, commit: batchCommitMock }),
  },
}));
vi.mock('@/lib/recruiting/tokens', () => ({
  hashInviteToken: vi.fn((token: string) => token === 'token-1' ? 'hashed-token-1' : `hash:${token}`),
}));
vi.mock('@/types', () => ({
  ONBOARDING_ITEMS: [
    { id: 'contract', label: 'Contract', sensitive: false, referenceKind: 'esign' },
    { id: 'direct_deposit', label: 'Direct Deposit', sensitive: true, referenceKind: 'esign' },
    { id: 'onboarding_submission', label: 'Onboarding Submission', sensitive: false, referenceKind: 'manual' },
  ],
  getOnboardingItemsForUser: vi.fn(() => [
    { id: 'contract', label: 'Contract', sensitive: false, referenceKind: 'esign' },
    { id: 'direct_deposit', label: 'Direct Deposit', sensitive: true, referenceKind: 'esign' },
    { id: 'onboarding_submission', label: 'Onboarding Submission', sensitive: false, referenceKind: 'manual' },
  ]),
  looksLikeRawSensitiveData: vi.fn(() => false),
  requiresHeavyVetting: vi.fn(() => false),
}));
vi.mock('@/lib/onboarding/uploads', () => ({ isStorageItem: vi.fn(() => false) }));
vi.mock('@/lib/onboarding/verifyStorageReference', () => ({ verifyStorageReference: vi.fn() }));
vi.mock('@/lib/validation/address', () => ({
  validateAddress: vi.fn(() => ({
    ok: true,
    clean: { address: '1 Main St', city: 'Dallas', state: 'TX', zip: '75001' },
  })),
}));
vi.mock('@/lib/onboarding/sensitiveFields', () => ({ buildSensitiveDoc: vi.fn() }));
vi.mock('@/lib/esign/autoSend', () => ({ sendPendingEsignDocs: sendPendingEsignDocsMock }));

import { NextRequest } from 'next/server';
import { POST } from './route';

function request(references: Record<string, string>, password = 'password') {
  return new NextRequest('http://localhost/api/public/onboarding/token-1', {
    method: 'POST',
    body: JSON.stringify({
      displayName: 'Candidate',
      phone: '555-0100',
      address: '1 Main St',
      city: 'Dallas',
      state: 'TX',
      zip: '75001',
      password,
      references,
    }),
  });
}

function params(token = 'token-1') {
  return { params: Promise.resolve({ token }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  createUserMock.mockResolvedValue({ uid: 'user-1' });
  deleteUserMock.mockResolvedValue(undefined);
  batchCommitMock.mockResolvedValue(undefined);
  sendPendingEsignDocsMock.mockResolvedValue([]);
  Object.assign(inviteData, {
    candidateName: 'Candidate',
    candidateEmail: 'candidate@example.com',
    candidatePhone: '555-0100',
    intendedFieldRole: 'entry_level_rep',
    isIBO: false,
    ownerId: 'owner-1',
    status: 'in_progress',
    tokenHash: 'hashed-token-1',
    expiresAt: undefined,
  });
});

describe('POST /api/public/onboarding/[token]', () => {
  it('accepts a packet with no references for e-sign items', async () => {
    const response = await POST(request({ onboarding_submission: 'completed' }), {
      ...params(),
    });

    expect(response.status).toBe(200);
  });

  it('still rejects a packet missing a non-e-sign item', async () => {
    const response = await POST(request({}), {
      ...params(),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('Onboarding Submission'),
    });
  });

  it('does not persist a typed reference for an e-sign item', async () => {
    const response = await POST(request({
      contract: 'typed fake signature',
      direct_deposit: 'typed bank confirmation',
      onboarding_submission: 'completed',
    }), {
      ...params(),
    });

    expect(response.status).toBe(200);
    const progressWrites = batchSetMock.mock.calls.filter(([ref]) =>
      String(ref?.id ?? '').startsWith('user-1_')
    );
    expect(progressWrites.map(([, data]) => data.itemId)).toEqual(['onboarding_submission']);
    const packetWrite = batchSetMock.mock.calls.find(([ref]) => ref?.id === 'invite-1');
    expect(packetWrite?.[1].items).toEqual([
      { itemId: 'contract', label: 'Contract', status: 'not_started' },
      { itemId: 'direct_deposit', label: 'Direct Deposit', status: 'not_started' },
      {
        itemId: 'onboarding_submission',
        label: 'Onboarding Submission',
        status: 'submitted',
        reference: 'completed',
      },
    ]);
  });

  it('rejects a wrong invite token as not found', async () => {
    const response = await POST(request({ onboarding_submission: 'completed' }), params('wrong-token'));

    expect(response.status).toBe(404);
  });

  it('rejects an expired invite', async () => {
    inviteData.expiresAt = { toDate: () => new Date('2020-01-01T00:00:00.000Z') };

    const response = await POST(request({ onboarding_submission: 'completed' }), params());

    expect(response.status).toBe(410);
  });

  it('rejects an already-submitted invite', async () => {
    inviteData.status = 'submitted';

    const response = await POST(request({ onboarding_submission: 'completed' }), params());

    expect(response.status).toBe(400);
  });

  it('rejects a password shorter than six characters', async () => {
    const response = await POST(
      request({ onboarding_submission: 'completed' }, 'short'),
      params()
    );

    expect(response.status).toBe(400);
  });
});
