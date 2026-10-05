import { beforeEach, describe, expect, it, vi } from 'vitest';

interface DocSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

const { collectionMock, docMock, docGetMock, docSetMock } = vi.hoisted(() => {
  const docGet = vi.fn<() => Promise<DocSnapshot>>();
  const docSet = vi.fn<(record: Record<string, unknown>) => Promise<void>>();
  const doc = vi.fn((id: string) => ({ id, get: docGet, set: docSet }));
  return {
    collectionMock: vi.fn(() => ({ doc })),
    docMock: doc,
    docGetMock: docGet,
    docSetMock: docSet,
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: collectionMock },
}));

import { createEnvelope, ENVELOPES_COLLECTION, envelopeExists } from './inhouse';
import type { EnvelopeRequest } from './types';

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

describe('createEnvelope', () => {
  it('writes a sent envelope and returns its id', async () => {
    const result = await createEnvelope(
      envelopeRequest({ prefill: { accountType: 'savings' } })
    );

    expect(collectionMock).toHaveBeenCalledWith(ENVELOPES_COLLECTION);
    expect(docMock).toHaveBeenCalledWith(result.envelopeId);
    expect(Object.keys(result)).toEqual(['envelopeId']);

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
    await createEnvelope(envelopeRequest({ docKey: 'contract' }));
    await createEnvelope(envelopeRequest({ docKey: 'w9' }));

    const [contract, w9] = docSetMock.mock.calls.map(([record]) => record.sourcePdfSha256);
    expect(contract).toMatch(SHA256);
    expect(w9).toMatch(SHA256);
    expect(contract).not.toBe(w9);
  });

  it('drops every prefill key outside the accountType / taxClassification allowlist', async () => {
    await createEnvelope(
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
    await createEnvelope(envelopeRequest({ docKey: 'fcra_auth' }));
    const [written] = docSetMock.mock.calls[0];
    expect(written.prefill).toEqual({});
  });

  it('refuses to create an envelope when the database is not configured', async () => {
    vi.resetModules();
    vi.doMock('@/lib/firebase/admin', () => ({ adminDb: null }));
    const { createEnvelope: create } = await import('./inhouse');
    await expect(create(envelopeRequest())).rejects.toThrow('Database not configured');
    vi.doUnmock('@/lib/firebase/admin');
    vi.resetModules();
  });
});

describe('envelopeExists', () => {
  it('is true for a record in the envelopes collection', async () => {
    docGetMock.mockResolvedValue(snapshot({ status: 'sent' }));
    await expect(envelopeExists('env-1')).resolves.toBe(true);
    expect(collectionMock).toHaveBeenCalledWith(ENVELOPES_COLLECTION);
  });

  it('is false for an id with no record, such as one from before signing moved in-house', async () => {
    await expect(envelopeExists('legacy-123')).resolves.toBe(false);
  });
});
