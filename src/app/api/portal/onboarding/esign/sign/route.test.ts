import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { StampInput, StampResult } from '@/lib/esign/stamp';

interface DocSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

type CompleteEsignItem = (input: {
  userId: string;
  itemId: string;
  envelopeId: string;
  pdf: Buffer | null;
}) => Promise<{ completedPdfPath: string | null }>;

const { docGetMock, docSetMock, collectionMock, gateMock, stampDocumentMock, completeEsignItemMock } =
  vi.hoisted(() => {
    const docGet = vi.fn<() => Promise<DocSnapshot>>();
    const docSet = vi.fn<(record: Record<string, unknown>, options: { merge: boolean }) => Promise<void>>();
    return {
      docGetMock: docGet,
      docSetMock: docSet,
      collectionMock: vi.fn(() => ({ doc: vi.fn(() => ({ get: docGet, set: docSet })) })),
      gateMock: vi.fn(),
      stampDocumentMock: vi.fn<(input: StampInput) => Promise<StampResult>>(),
      completeEsignItemMock: vi.fn<CompleteEsignItem>(),
    };
  });

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: collectionMock },
  getOnboardingBucket: vi.fn(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: gateMock }));
vi.mock('@/lib/esign/stamp', async () => {
  const actual = await vi.importActual<typeof import('@/lib/esign/stamp')>('@/lib/esign/stamp');
  return { ...actual, stampDocument: stampDocumentMock };
});
vi.mock('@/lib/esign/complete', () => ({ completeEsignItem: completeEsignItemMock }));

import { POST } from './route';
import { sha256Hex } from '@/lib/esign/stamp';
import { ESIGN_CONSENT_TEXT } from '@/lib/esign/documents';

const ENVELOPE_ID = 'env-1';
const COMPLETED_PATH = 'esign-completed/user-1/direct_deposit.pdf';
const SIGNED_PDF = Buffer.from('%PDF-1.7 stamped direct deposit');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// The routing and account numbers below must never leave this test file: they
// are asserted against every Firestore write and log line the route makes.
const ROUTING_NUMBER = '021000021';
const ACCOUNT_NUMBER = '000123456789';

function pngDataUrl(body: Buffer = Buffer.from('ink')): string {
  return `data:image/png;base64,${Buffer.concat([PNG_MAGIC, body]).toString('base64')}`;
}

function snapshot(data: Record<string, unknown> | null): DocSnapshot {
  return { exists: data !== null, data: () => data ?? undefined };
}

function envelope(overrides: Record<string, unknown> = {}) {
  return snapshot({
    docKey: 'direct_deposit',
    userId: 'user-1',
    itemId: 'direct_deposit',
    signerName: 'Test Rep',
    signerEmail: 'rep@example.com',
    status: 'sent',
    prefill: { accountType: 'checking' },
    ...overrides,
  });
}

function signBody(overrides: Record<string, unknown> = {}) {
  return {
    envelopeId: ENVELOPE_ID,
    fields: {
      legal_name: 'Test Rep',
      bank_name: 'First National',
      routing_number: ROUTING_NUMBER,
      account_number: ACCOUNT_NUMBER,
    },
    signaturePng: pngDataUrl(),
    signatureMethod: 'draw',
    consent: true,
    ...overrides,
  };
}

function signRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/portal/onboarding/esign/sign', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 (iPhone)',
      'x-forwarded-for': '203.0.113.5, 70.41.3.18',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockResolvedValue({ ok: true, uid: 'user-1', name: 'Test Rep', email: 'rep@example.com' });
  docGetMock.mockResolvedValue(envelope());
  docSetMock.mockResolvedValue(undefined);
  stampDocumentMock.mockResolvedValue({
    pdf: SIGNED_PDF,
    sourceSha256: 'a'.repeat(64),
    stampedSha256: 'b'.repeat(64),
    pageCount: 3,
  });
  completeEsignItemMock.mockResolvedValue({ completedPdfPath: COMPLETED_PATH });
});

describe('request rejection', () => {
  it('rejects an unauthenticated caller', async () => {
    gateMock.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    const res = await POST(signRequest(signBody()));
    expect(res.status).toBe(401);
    expect(docGetMock).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    const res = await POST(signRequest('not json'));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'invalid request' });
  });

  it('rejects a body with no envelope id', async () => {
    const res = await POST(signRequest(signBody({ envelopeId: '' })));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'invalid request' });
  });

  it('refuses to sign without consent', async () => {
    const res = await POST(signRequest(signBody({ consent: false })));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'consent required' });
    expect(stampDocumentMock).not.toHaveBeenCalled();
  });

  it('refuses an unknown signature method', async () => {
    const res = await POST(signRequest(signBody({ signatureMethod: 'stamp' })));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'invalid signature method' });
  });

  it('refuses a signature that is not a PNG data URL', async () => {
    const res = await POST(
      signRequest(signBody({ signaturePng: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }))
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'invalid signature image' });
  });

  it('refuses a PNG data URL whose bytes are not a PNG', async () => {
    const res = await POST(
      signRequest(
        signBody({ signaturePng: `data:image/png;base64,${Buffer.from('GIF89a').toString('base64')}` })
      )
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'invalid signature image' });
  });

  it('refuses a signature over 200 KB', async () => {
    const res = await POST(signRequest(signBody({ signaturePng: pngDataUrl(Buffer.alloc(205_000)) })));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'invalid signature image' });
    expect(stampDocumentMock).not.toHaveBeenCalled();
  });

  it('returns 404 for an envelope that does not exist', async () => {
    docGetMock.mockResolvedValue(snapshot(null));
    const res = await POST(signRequest(signBody()));
    expect(res.status).toBe(404);
  });

  it('refuses an envelope that belongs to another rep', async () => {
    docGetMock.mockResolvedValue(envelope({ userId: 'someone-else' }));
    const res = await POST(signRequest(signBody()));
    expect(res.status).toBe(403);
    expect(stampDocumentMock).not.toHaveBeenCalled();
  });

  it('returns 409 when the envelope is already signed', async () => {
    docGetMock.mockResolvedValue(envelope({ status: 'completed' }));
    const res = await POST(signRequest(signBody()));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'already completed' });
    expect(completeEsignItemMock).not.toHaveBeenCalled();
  });

  it('reports a missing required field with its label', async () => {
    const res = await POST(signRequest(signBody({ fields: { legal_name: '' } })));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Missing required field: Legal name' });
    expect(stampDocumentMock).not.toHaveBeenCalled();
  });
});

describe('signing', () => {
  it('stamps the document with the rep fields and the onboarding checkbox default', async () => {
    const res = await POST(signRequest(signBody()));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ completed: true });

    expect(stampDocumentMock).toHaveBeenCalledTimes(1);
    const [input] = stampDocumentMock.mock.calls[0];
    expect(input.docKey).toBe('direct_deposit');
    expect(input.fields).toMatchObject({
      legal_name: 'Test Rep',
      bank_name: 'First National',
      routing_number: ROUTING_NUMBER,
      account_number: ACCOUNT_NUMBER,
      checking: true,
    });
    // validateFields only carries keys the rep actually submitted, so the
    // untouched second account-type box stays out of the stamp input.
    expect(input.fields).not.toHaveProperty('savings');
    expect(input.signaturePng.subarray(0, 8)).toEqual(PNG_MAGIC);
    expect(input.audit).toMatchObject({
      envelopeId: ENVELOPE_ID,
      signerName: 'Test Rep',
      signerEmail: 'rep@example.com',
      userId: 'user-1',
      consentText: ESIGN_CONSENT_TEXT,
      ip: '203.0.113.5',
      userAgent: 'Mozilla/5.0 (iPhone)',
      signatureMethod: 'draw',
    });
  });

  it('lets the rep correct the checkbox the onboarding prefill chose', async () => {
    await POST(signRequest(signBody({ fields: { legal_name: 'Test Rep', bank_name: 'B', routing_number: ROUTING_NUMBER, account_number: ACCOUNT_NUMBER, checking: false, savings: true } })));
    expect(stampDocumentMock.mock.calls[0][0].fields).toMatchObject({ checking: false, savings: true });
  });

  it('runs the same completion the SignWell webhook runs', async () => {
    await POST(signRequest(signBody()));
    expect(completeEsignItemMock).toHaveBeenCalledWith({
      userId: 'user-1',
      itemId: 'direct_deposit',
      envelopeId: ENVELOPE_ID,
      pdf: SIGNED_PDF,
    });
  });

  it('marks the envelope completed with the final file hash and no field values', async () => {
    await POST(signRequest(signBody()));

    expect(docSetMock).toHaveBeenCalledTimes(1);
    const [written, options] = docSetMock.mock.calls[0];
    expect(options).toEqual({ merge: true });
    expect(written).toMatchObject({
      status: 'completed',
      ip: '203.0.113.5',
      userAgent: 'Mozilla/5.0 (iPhone)',
      signatureMethod: 'draw',
      signedPdfPath: COMPLETED_PATH,
      signedPdfSha256: sha256Hex(SIGNED_PDF),
    });
    expect(written.completedAt).toBeInstanceOf(Date);
    expect(written.consentAt).toBeInstanceOf(Date);

    const serialized = JSON.stringify(written);
    expect(serialized).not.toMatch(new RegExp(`${ROUTING_NUMBER}|${ACCOUNT_NUMBER}`));
    for (const key of ['ssn', 'ein', 'routing_number', 'account_number', 'legal_name', 'fields']) {
      expect(written).not.toHaveProperty(key);
    }
  });

  it('falls back to x-real-ip when there is no forwarded-for header', async () => {
    const request = new NextRequest('http://localhost/api/portal/onboarding/esign/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': '198.51.100.7' },
      body: JSON.stringify(signBody()),
    });
    await POST(request);
    expect(stampDocumentMock.mock.calls[0][0].audit).toMatchObject({ ip: '198.51.100.7', userAgent: '' });
  });
});

describe('failure after the rep pressed sign', () => {
  it('returns 502 and leaves the envelope open when the upload did not land', async () => {
    completeEsignItemMock.mockResolvedValue({ completedPdfPath: null });
    const res = await POST(signRequest(signBody()));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: 'upload failed' });
    expect(docSetMock).not.toHaveBeenCalled();
  });

  it('returns 500 without logging any field value when stamping throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stampDocumentMock.mockRejectedValue(new Error('pdf-lib exploded'));

    const res = await POST(signRequest(signBody()));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'sign failed' });
    expect(docSetMock).not.toHaveBeenCalled();

    const logged = consoleError.mock.calls.map((call) => JSON.stringify(call)).join(' ');
    expect(logged).toContain(ENVELOPE_ID);
    expect(logged).not.toMatch(new RegExp(`${ROUTING_NUMBER}|${ACCOUNT_NUMBER}|First National`));
    consoleError.mockRestore();
  });

  it('returns 500 when the shared completion throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    completeEsignItemMock.mockRejectedValue(new Error('Database not configured'));

    const res = await POST(signRequest(signBody()));
    expect(res.status).toBe(500);
    expect(docSetMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
