import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifySignwellHash, signwellProvider } from './signwell';
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
    expect(body.fields[0]).toEqual([
      expect.objectContaining({
        x: 187,
        y: 827,
        page: 1,
        type: 'signature',
        required: true,
        recipient_id: 'signer',
        api_id: 'contract_signature',
      }),
      expect.objectContaining({
        x: 573,
        y: 841,
        page: 1,
        type: 'date',
        required: true,
        recipient_id: 'signer',
        api_id: 'contract_date',
      }),
    ]);
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
