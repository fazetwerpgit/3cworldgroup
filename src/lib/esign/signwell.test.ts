import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifySignwellHash, signwellProvider, SIGNER_RECIPIENT_ID } from './signwell';
import { createHmac } from 'node:crypto';

describe('verifySignwellHash', () => {
  it('accepts a correct HMAC and rejects a wrong one', () => {
    const key = 'sw_key';
    const good = createHmac('sha256', key).update('document_completed@1751970000').digest('hex');
    expect(verifySignwellHash('document_completed', '1751970000', good, key)).toBe(true);
    expect(verifySignwellHash('document_completed', '1751970000', 'deadbeef', key)).toBe(false);
  });
});

describe('signwellProvider.createEnvelope', () => {
  const baseRequest = {
    docKey: 'contract' as const,
    userId: 'u1',
    itemId: 'contract',
    signerName: 'Sam Rep',
    signerEmail: 'sam@x.com',
  };

  beforeEach(() => {
    vi.stubEnv('SIGNWELL_API_KEY', 'sw_key');
    vi.stubEnv('SIGNWELL_TEST_MODE', 'true');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'doc_123' }), { status: 201 })));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts a raw PDF document with metadata and returns the envelope id', async () => {
    const result = await signwellProvider.createEnvelope({
      docKey: 'contract',
      userId: 'u1',
      itemId: 'contract',
      signerName: 'Sam Rep',
      signerEmail: 'sam@x.com',
    });
    expect(result.envelopeId).toBe('doc_123');
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(url).toBe('https://www.signwell.com/api/v1/documents');
    expect(body.metadata).toEqual({ userId: 'u1', itemId: 'contract' });
    expect(body.files).toHaveLength(1);
    expect(body.files[0].name).toBe('contract.pdf');
    expect(body.files[0].file_base64).toEqual(expect.stringMatching(/^JVBER/));
    expect(body.recipients).toEqual([{ id: 'signer', name: 'Sam Rep', email: 'sam@x.com' }]);
    expect(body.fields).toHaveLength(1);
    expect(body.fields[0][0]).toEqual(
      expect.objectContaining({
        x: 184,
        y: 584,
        page: 3,
        type: 'signature',
        required: true,
        recipient_id: 'signer',
        api_id: 'contract_signature',
      })
    );
    expect(body.fields[0][1]).toEqual(
      expect.objectContaining({
        x: 534,
        y: 584,
        page: 3,
        type: 'date',
        required: true,
        recipient_id: 'signer',
        api_id: 'contract_date',
      })
    );
    // Fill-in fields on the real contract's signature page follow sig/date.
    expect(body.fields[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text', api_id: 'contract_agent_name', required: true, page: 3 }),
        expect.objectContaining({ type: 'text', api_id: 'contract_email', required: true, page: 3 }),
      ])
    );
    for (const field of body.fields[0]) {
      expect(field.recipient_id).toBe('signer');
      expect((field as { key?: unknown }).key).toBeUndefined();
    }
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('sw_key');
  });

  it('throws a descriptive error when the API key env is missing', async () => {
    vi.stubEnv('SIGNWELL_API_KEY', '');
    await expect(
      signwellProvider.createEnvelope({
        docKey: 'contract', userId: 'u1', itemId: 'contract',
        signerName: 'S', signerEmail: 's@x.com',
      })
    ).rejects.toThrow(/SIGNWELL_API_KEY/);
  });

  it('throws when test mode is requested in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');

    await expect(
      signwellProvider.createEnvelope({
        docKey: 'contract', userId: 'u1', itemId: 'contract',
        signerName: 'S', signerEmail: 's@x.com',
      })
    ).rejects.toThrow(/SIGNWELL_TEST_MODE/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws when test mode is requested in non-Vercel production', async () => {
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NODE_ENV', 'production');

    await expect(
      signwellProvider.createEnvelope({
        docKey: 'contract', userId: 'u1', itemId: 'contract',
        signerName: 'S', signerEmail: 's@x.com',
      })
    ).rejects.toThrow(/SIGNWELL_TEST_MODE/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes in development when test mode is requested', async () => {
    vi.stubEnv('VERCEL_ENV', 'development');

    await expect(
      signwellProvider.createEnvelope({
        docKey: 'contract', userId: 'u1', itemId: 'contract',
        signerName: 'S', signerEmail: 's@x.com',
      })
    ).resolves.toEqual({ envelopeId: 'doc_123' });
  });

  it.each(['', 'false'])('passes in production when SIGNWELL_TEST_MODE is %s', async (value) => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('SIGNWELL_TEST_MODE', value);

    await expect(
      signwellProvider.createEnvelope({
        docKey: 'contract', userId: 'u1', itemId: 'contract',
        signerName: 'S', signerEmail: 's@x.com',
      })
    ).resolves.toEqual({ envelopeId: 'doc_123' });
  });

  it('requests embedded signing', async () => {
    await signwellProvider.createEnvelope(baseRequest);
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.embedded_signing).toBe(true);
  });

  it('returns the signer embedded_signing_url from the response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'env_1',
      recipients: [{ id: SIGNER_RECIPIENT_ID, embedded_signing_url: 'https://www.signwell.com/e/abc' }],
    }), { status: 201 }));
    const result = await signwellProvider.createEnvelope(baseRequest);
    expect(result).toEqual({ envelopeId: 'env_1', embeddedSigningUrl: 'https://www.signwell.com/e/abc' });
  });

  it('omits embeddedSigningUrl when the response has none', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'env_2' }), { status: 201 }));
    const result = await signwellProvider.createEnvelope(baseRequest);
    expect(result.envelopeId).toBe('env_2');
    expect(result.embeddedSigningUrl).toBeUndefined();
  });
});

describe('signwellProvider.getEmbeddedSigningUrl', () => {
  beforeEach(() => {
    vi.stubEnv('SIGNWELL_API_KEY', 'sw_key');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns the signer's embedded signing URL", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response(JSON.stringify({
      recipients: [
        { id: 'other', embedded_signing_url: 'https://www.signwell.com/e/other' },
        { id: SIGNER_RECIPIENT_ID, embedded_signing_url: 'https://www.signwell.com/e/fresh' },
      ],
    }), { status: 200 }));

    await expect(signwellProvider.getEmbeddedSigningUrl('env_123'))
      .resolves.toEqual({ url: 'https://www.signwell.com/e/fresh', completed: false });

    expect(fetch).toHaveBeenCalledWith(
      'https://www.signwell.com/api/v1/documents/env_123',
      { headers: { 'X-Api-Key': 'sw_key' } }
    );
  });

  it('returns completed when the document is completed without an embedded signing URL', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response(JSON.stringify({
      status: 'COMPLETED',
      recipients: [{ id: SIGNER_RECIPIENT_ID, embedded_signing_url: null }],
    }), { status: 200 }));

    await expect(signwellProvider.getEmbeddedSigningUrl('env_123')).resolves.toEqual({ completed: true });
  });

  it('returns incomplete when recipients lack an embedded signing URL', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response(JSON.stringify({
      recipients: [{ id: SIGNER_RECIPIENT_ID, embedded_signing_url: null }],
    }), { status: 200 }));

    await expect(signwellProvider.getEmbeddedSigningUrl('env_123')).resolves.toEqual({ completed: false });
  });

  it('throws a descriptive error for a non-ok response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response('not found', { status: 404 }));

    await expect(signwellProvider.getEmbeddedSigningUrl('env_123'))
      .rejects.toThrow('SignWell getEmbeddedSigningUrl failed: 404 not found');
  });
});

describe('signwellProvider.getCompletedPdf', () => {
  beforeEach(() => {
    vi.stubEnv('SIGNWELL_API_KEY', 'sw_key');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns raw PDF bytes', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('%PDF-raw', { status: 200, headers: { 'content-type': 'application/pdf' } })
    );

    await expect(signwellProvider.getCompletedPdf('env_123')).resolves.toEqual(
      Buffer.from('%PDF-raw')
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://www.signwell.com/api/v1/documents/env_123/completed_pdf',
      { headers: { 'X-Api-Key': 'sw_key' } }
    );
  });

  it('follows a JSON file_url response without API headers', async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(JSON.stringify({ file_url: 'https://files.example.com/completed.pdf' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('%PDF-followed', {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }));

    await expect(signwellProvider.getCompletedPdf('env_123')).resolves.toEqual(
      Buffer.from('%PDF-followed')
    );
    expect(fetch).toHaveBeenNthCalledWith(2, 'https://files.example.com/completed.pdf');
  });

  it('throws on a non-ok response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response('gone', { status: 404 }));

    await expect(signwellProvider.getCompletedPdf('env_123'))
      .rejects.toThrow('SignWell getCompletedPdf failed: 404 gone');
  });
});

describe('signwellProvider.parseWebhook', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null for malformed JSON', async () => {
    await expect(signwellProvider.parseWebhook('{nope', new Headers())).resolves.toBeNull();
  });

  it('returns null for valid JSON with a missing or invalid hash', async () => {
    const body = JSON.stringify({
      event: { type: 'document_completed', time: '1751970000', hash: 'deadbeef', webhook_id: 'wh_123' },
      data: { object: { id: 'doc_123', metadata: { userId: 'u1', itemId: 'contract' } } },
    });

    await expect(signwellProvider.parseWebhook(body, new Headers())).resolves.toBeNull();
  });

  it('returns null without throwing when no verification key can be resolved', async () => {
    const previousApiKey = process.env.SIGNWELL_API_KEY;
    const previousWebhookId = process.env.SIGNWELL_WEBHOOK_ID;
    delete process.env.SIGNWELL_API_KEY;
    delete process.env.SIGNWELL_WEBHOOK_ID;
    const body = JSON.stringify({
      event: { type: 'document_completed', time: '1751970000', hash: 'deadbeef' },
      data: { object: { id: 'doc_123', metadata: { userId: 'u1', itemId: 'contract' } } },
    });

    try {
      await expect(signwellProvider.parseWebhook(body, new Headers())).resolves.toBeNull();
    } finally {
      process.env.SIGNWELL_API_KEY = previousApiKey;
      process.env.SIGNWELL_WEBHOOK_ID = previousWebhookId;
    }
  });

  it('returns a completed event for a correctly signed payload', async () => {
    const key = 'wh_123';
    const hash = createHmac('sha256', key).update('document_completed@1751970000').digest('hex');
    const body = JSON.stringify({
      event: { type: 'document_completed', time: '1751970000', hash, webhook_id: key },
      data: { object: { id: 'doc_123', metadata: { userId: 'u1', itemId: 'contract' } } },
    });

    await expect(signwellProvider.parseWebhook(body, new Headers())).resolves.toEqual({
      envelopeId: 'doc_123',
      status: 'completed',
      metadata: { userId: 'u1', itemId: 'contract' },
    });
  });
});
