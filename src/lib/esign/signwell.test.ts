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
    vi.stubEnv('SIGNWELL_TEMPLATE_CONTRACT', 'tpl_contract');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'doc_123' }), { status: 201 })));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts the template document with metadata and returns the envelope id', async () => {
    const result = await signwellProvider.createEnvelope({
      docKey: 'contract',
      userId: 'u1',
      itemId: 'contract',
      signerName: 'Sam Rep',
      signerEmail: 'sam@x.com',
    });
    expect(result.envelopeId).toBe('doc_123');
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.template_id).toBe('tpl_contract');
    expect(body.metadata).toEqual({ userId: 'u1', itemId: 'contract' });
    expect(body.recipients[0].email).toBe('sam@x.com');
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('sw_key');
  });

  it('throws a descriptive error when the template env is missing', async () => {
    vi.stubEnv('SIGNWELL_TEMPLATE_CONTRACT', '');
    await expect(
      signwellProvider.createEnvelope({
        docKey: 'contract', userId: 'u1', itemId: 'contract',
        signerName: 'S', signerEmail: 's@x.com',
      })
    ).rejects.toThrow(/SIGNWELL_TEMPLATE/);
  });
});
