import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { envelopeGetMock, userGetMock, collectionMock, gateMock } = vi.hoisted(() => {
  const envelopeGet = vi.fn();
  const userGet = vi.fn();
  return {
    envelopeGetMock: envelopeGet,
    userGetMock: userGet,
    collectionMock: vi.fn((name: string) => ({
      doc: vi.fn(() => ({ get: name === 'users' ? userGet : envelopeGet })),
    })),
    gateMock: vi.fn(),
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: collectionMock },
  getOnboardingBucket: vi.fn(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: gateMock }));

import { GET } from './route';
import { GET as GET_PDF } from './pdf/route';
import type { EnvelopeFieldView, EnvelopeView } from './route';

const ENVELOPE_ID = 'env-1';

function snapshot(data: Record<string, unknown> | null) {
  return { exists: data !== null, data: () => data ?? undefined };
}

function envelope(overrides: Record<string, unknown> = {}) {
  return snapshot({
    docKey: 'contract',
    userId: 'user-1',
    itemId: 'contract',
    signerName: 'Test Rep',
    signerEmail: 'rep@example.com',
    status: 'sent',
    prefill: {},
    ...overrides,
  });
}

function request(path = `/api/portal/onboarding/esign/envelope/${ENVELOPE_ID}`) {
  return new NextRequest(`http://localhost${path}`);
}

const ctx = { params: Promise.resolve({ id: ENVELOPE_ID }) };

function field(view: EnvelopeView, key: string): EnvelopeFieldView {
  const found = view.fields.find((f) => f.key === key);
  if (!found) throw new Error(`no field ${key}`);
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockResolvedValue({ ok: true, uid: 'user-1', name: 'Test Rep', email: 'rep@example.com' });
  envelopeGetMock.mockResolvedValue(envelope());
  userGetMock.mockResolvedValue(
    snapshot({
      displayName: 'Test Rep',
      email: 'rep@example.com',
      phone: '555-0100',
      address: '1 Main St',
      city: 'Dallas',
      state: 'TX',
      zip: '75201',
    })
  );
});

describe('GET /api/portal/onboarding/esign/envelope/[id]', () => {
  it('rejects an unauthenticated caller', async () => {
    gateMock.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    const res = await GET(request(), ctx);
    expect(res.status).toBe(401);
    expect(envelopeGetMock).not.toHaveBeenCalled();
  });

  it('refuses an envelope that belongs to another rep', async () => {
    envelopeGetMock.mockResolvedValue(envelope({ userId: 'someone-else' }));
    const res = await GET(request(), ctx);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
  });

  it('returns 404 for an envelope that does not exist', async () => {
    envelopeGetMock.mockResolvedValue(snapshot(null));
    const res = await GET(request(), ctx);
    expect(res.status).toBe(404);
  });

  it('returns the document, its page count and the signer', async () => {
    const res = await GET(request(), ctx);
    expect(res.status).toBe(200);
    const view = (await res.json()) as EnvelopeView;
    expect(view).toMatchObject({
      envelopeId: ENVELOPE_ID,
      docKey: 'contract',
      name: 'Independent Agent Agreement',
      status: 'sent',
      pageCount: 3,
      signerName: 'Test Rep',
      signerEmail: 'rep@example.com',
    });
  });

  it('prefills the fields it can read off the rep profile', async () => {
    const view = (await (await GET(request(), ctx)).json()) as EnvelopeView;

    expect(field(view, 'agent_name')).toMatchObject({
      label: 'Agent name',
      type: 'text',
      required: true,
      sensitive: false,
      value: 'Test Rep',
      prefilled: true,
      page: 3,
    });
    expect(field(view, 'email').value).toBe('rep@example.com');
    expect(field(view, 'cell_phone').value).toBe('555-0100');
    expect(field(view, 'street_address').value).toBe('1 Main St');
    expect(field(view, 'city_state_zip').value).toBe('Dallas, TX 75201');
  });

  it('leaves a field the profile cannot fill empty and not prefilled', async () => {
    userGetMock.mockResolvedValue(snapshot({ displayName: 'Test Rep' }));
    const view = (await (await GET(request(), ctx)).json()) as EnvelopeView;

    expect(field(view, 'city_state_zip')).toMatchObject({ value: '', prefilled: false });
    expect(field(view, 'website')).toMatchObject({ value: '', prefilled: false, required: false });
  });

  it('never returns a value for a sensitive field', async () => {
    userGetMock.mockResolvedValue(
      snapshot({ displayName: 'Test Rep', ssn: '123-45-6789', ein: '12-3456789' })
    );
    envelopeGetMock.mockResolvedValue(
      envelope({ docKey: 'w9', itemId: 'w9', prefill: { taxClassification: 'llc' } })
    );

    const res = await GET(request(), ctx);
    const body = await res.text();
    const view = JSON.parse(body) as EnvelopeView;

    for (const key of ['ssn', 'ein']) {
      expect(field(view, key)).toMatchObject({ sensitive: true, value: '', prefilled: false });
    }
    expect(body).not.toMatch(/123-45-6789|12-3456789/);
  });

  it('checks the box the rep already chose during onboarding', async () => {
    envelopeGetMock.mockResolvedValue(
      envelope({ docKey: 'direct_deposit', itemId: 'direct_deposit', prefill: { accountType: 'savings' } })
    );
    const view = (await (await GET(request(), ctx)).json()) as EnvelopeView;

    expect(field(view, 'savings')).toMatchObject({ type: 'checkbox', value: true, prefilled: true });
    expect(field(view, 'checking')).toMatchObject({ type: 'checkbox', value: false, prefilled: false });
    expect(field(view, 'routing_number')).toMatchObject({ sensitive: true, value: '' });
  });

  it('returns an empty field list for a document with nothing to fill in', async () => {
    envelopeGetMock.mockResolvedValue(envelope({ docKey: 'fcra_auth', itemId: 'fcra_auth' }));
    const view = (await (await GET(request(), ctx)).json()) as EnvelopeView;
    expect(view.fields).toEqual([]);
    expect(view.pageCount).toBe(1);
  });
});

describe('GET /api/portal/onboarding/esign/envelope/[id]/pdf', () => {
  const pdfRequest = () => request(`/api/portal/onboarding/esign/envelope/${ENVELOPE_ID}/pdf`);

  it('rejects an unauthenticated caller', async () => {
    gateMock.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    expect((await GET_PDF(pdfRequest(), ctx)).status).toBe(401);
  });

  it('refuses an envelope that belongs to another rep', async () => {
    envelopeGetMock.mockResolvedValue(envelope({ userId: 'someone-else' }));
    expect((await GET_PDF(pdfRequest(), ctx)).status).toBe(403);
  });

  it('returns 404 for an envelope that does not exist', async () => {
    envelopeGetMock.mockResolvedValue(snapshot(null));
    expect((await GET_PDF(pdfRequest(), ctx)).status).toBe(404);
  });

  it('streams the blank source PDF to its owner', async () => {
    const res = await GET_PDF(pdfRequest(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="contract.pdf"');

    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
