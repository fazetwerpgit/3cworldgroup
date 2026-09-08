import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface DocSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

const { collectionMock, docMock, docGetMock, docSetMock, fileMock, downloadMock, getOnboardingBucketMock } =
  vi.hoisted(() => {
    const docGet = vi.fn<() => Promise<DocSnapshot>>();
    const docSet = vi.fn<(record: Record<string, unknown>) => Promise<void>>();
    const doc = vi.fn((id: string) => ({ id, get: docGet, set: docSet }));
    const download = vi.fn<() => Promise<[Buffer]>>();
    const file = vi.fn(() => ({ download }));
    return {
      collectionMock: vi.fn(() => ({ doc })),
      docMock: doc,
      docGetMock: docGet,
      docSetMock: docSet,
      fileMock: file,
      downloadMock: download,
      getOnboardingBucketMock: vi.fn(() => ({ file })),
    };
  });

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: collectionMock },
  getOnboardingBucket: getOnboardingBucketMock,
}));

import { ENVELOPES_COLLECTION, inhouseProvider, inhouseSignPath } from './inhouse';
import { getEsignProvider } from './provider';
import { signwellProvider } from './signwell';
import type { EnvelopeRequest } from './provider';

const SHA256 = /^[0-9a-f]{64}$/;

function envelopeRequest(overrides: Partial<EnvelopeRequest> = {}): EnvelopeRequest {
  return {
    docKey: 'direct_deposit',
    userId: 'user-1',
    itemId: 'direct_deposit',
    signerName: 'Test Rep',
    signerEmail: 'rep@example.com',
    ...overrides,
  };
}

function snapshot(data: Record<string, unknown> | null): DocSnapshot {
  return { exists: data !== null, data: () => data ?? undefined };
}

beforeEach(() => {
  vi.clearAllMocks();
  docGetMock.mockResolvedValue(snapshot(null));
  docSetMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createEnvelope', () => {
  it('writes a sent envelope and returns the in-app signing path', async () => {
    const result = await inhouseProvider.createEnvelope(
      envelopeRequest({ prefill: { accountType: 'savings' } })
    );

    expect(collectionMock).toHaveBeenCalledWith(ENVELOPES_COLLECTION);
    expect(docMock).toHaveBeenCalledWith(result.envelopeId);
    expect(result.embeddedSigningUrl).toBe(inhouseSignPath(result.envelopeId));

    const [written] = docSetMock.mock.calls[0];
    expect(written).toMatchObject({
      docKey: 'direct_deposit',
      userId: 'user-1',
      itemId: 'direct_deposit',
      signerName: 'Test Rep',
      signerEmail: 'rep@example.com',
      status: 'sent',
      prefill: { accountType: 'savings' },
    });
    expect(written.createdAt).toBeInstanceOf(Date);
    expect(written.sourcePdfSha256).toMatch(SHA256);
  });

  it('hashes the source PDF it will later stamp', async () => {
    await inhouseProvider.createEnvelope(envelopeRequest({ docKey: 'contract' }));
    await inhouseProvider.createEnvelope(envelopeRequest({ docKey: 'w9' }));

    const [contract, w9] = docSetMock.mock.calls.map(([record]) => record.sourcePdfSha256);
    expect(contract).toMatch(SHA256);
    expect(w9).toMatch(SHA256);
    expect(contract).not.toBe(w9);
  });

  it('drops every prefill key outside the accountType / taxClassification allowlist', async () => {
    await inhouseProvider.createEnvelope(
      envelopeRequest({
        docKey: 'w9',
        prefill: {
          taxClassification: 'llc',
          ssn: '123-45-6789',
          ein: '12-3456789',
          routing_number: '021000021',
          account_number: '000123456789',
          agent_name: 'Test Rep',
        },
      })
    );

    const [written] = docSetMock.mock.calls[0];
    expect(written.prefill).toEqual({ taxClassification: 'llc' });
    expect(JSON.stringify(written)).not.toMatch(/123-45-6789|12-3456789|021000021|000123456789/);
  });

  it('omits prefill entirely when the request has none', async () => {
    await inhouseProvider.createEnvelope(envelopeRequest({ docKey: 'fcra_auth' }));
    const [written] = docSetMock.mock.calls[0];
    expect(written.prefill).toEqual({});
  });

  it('refuses to create an envelope when the database is not configured', async () => {
    vi.resetModules();
    vi.doMock('@/lib/firebase/admin', () => ({ adminDb: null, getOnboardingBucket: vi.fn() }));
    const { inhouseProvider: provider } = await import('./inhouse');
    await expect(provider.createEnvelope(envelopeRequest())).rejects.toThrow('Database not configured');
    vi.doUnmock('@/lib/firebase/admin');
    vi.resetModules();
  });
});

describe('getEmbeddedSigningUrl', () => {
  it('reports an envelope that is still out for signature', async () => {
    docGetMock.mockResolvedValue(snapshot({ userId: 'user-1', status: 'sent' }));
    await expect(inhouseProvider.getEmbeddedSigningUrl('env-1')).resolves.toEqual({
      url: '/portal/onboarding/sign/env-1',
      completed: false,
    });
  });

  it('reports a completed envelope', async () => {
    docGetMock.mockResolvedValue(snapshot({ userId: 'user-1', status: 'completed' }));
    await expect(inhouseProvider.getEmbeddedSigningUrl('env-1')).resolves.toEqual({
      url: '/portal/onboarding/sign/env-1',
      completed: true,
    });
  });

  it('throws when the envelope does not exist', async () => {
    docGetMock.mockResolvedValue(snapshot(null));
    await expect(inhouseProvider.getEmbeddedSigningUrl('missing')).rejects.toThrow('Envelope not found');
  });
});

describe('getCompletedPdf', () => {
  it('downloads the stored signed PDF', async () => {
    const pdf = Buffer.from('%PDF-1.7 signed');
    docGetMock.mockResolvedValue(
      snapshot({ status: 'completed', signedPdfPath: 'esign-completed/user-1/w9.pdf' })
    );
    downloadMock.mockResolvedValue([pdf]);

    await expect(inhouseProvider.getCompletedPdf('env-1')).resolves.toBe(pdf);
    expect(fileMock).toHaveBeenCalledWith('esign-completed/user-1/w9.pdf');
  });

  it('throws when the envelope has no signed PDF yet', async () => {
    docGetMock.mockResolvedValue(snapshot({ status: 'sent' }));
    await expect(inhouseProvider.getCompletedPdf('env-1')).rejects.toThrow('Envelope has no signed PDF');
    expect(getOnboardingBucketMock).not.toHaveBeenCalled();
  });

  it('throws when the envelope does not exist', async () => {
    docGetMock.mockResolvedValue(snapshot(null));
    await expect(inhouseProvider.getCompletedPdf('missing')).rejects.toThrow('Envelope not found');
  });
});

describe('parseWebhook', () => {
  it('returns null because in-house signing has no vendor callback', async () => {
    await expect(inhouseProvider.parseWebhook('{}', new Headers())).resolves.toBeNull();
  });
});

describe('getEsignProvider', () => {
  it('returns the in-house provider when ESIGN_PROVIDER=inhouse', () => {
    vi.stubEnv('ESIGN_PROVIDER', 'inhouse');
    expect(getEsignProvider()).toBe(inhouseProvider);
  });

  it('still defaults to signwell when ESIGN_PROVIDER is unset', () => {
    vi.stubEnv('ESIGN_PROVIDER', undefined);
    expect(getEsignProvider()).toBe(signwellProvider);
  });
});
