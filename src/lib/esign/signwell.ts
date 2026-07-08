import { createHmac, timingSafeEqual } from 'node:crypto';
import type { EsignProvider, EsignDocKey, EnvelopeRequest, EnvelopeResult, EsignWebhookEvent } from './provider';

const SIGNWELL_BASE = 'https://www.signwell.com/api/v1';

function requireApiKey(): string {
  const key = process.env.SIGNWELL_API_KEY;
  if (!key) throw new Error('SIGNWELL_API_KEY is not set');
  return key;
}

function templateIdFor(docKey: EsignDocKey): string {
  const map: Record<EsignDocKey, string | undefined> = {
    contract: process.env.SIGNWELL_TEMPLATE_CONTRACT,
    direct_deposit: process.env.SIGNWELL_TEMPLATE_DIRECT_DEPOSIT,
    pay_structure: process.env.SIGNWELL_TEMPLATE_PAY_STRUCTURE,
    fcra_auth: process.env.SIGNWELL_TEMPLATE_FCRA,
  };
  const id = map[docKey];
  if (!id) throw new Error(`Missing SIGNWELL_TEMPLATE_* env var for docKey "${docKey}"`);
  return id;
}

function webhookVerificationKey(
  payload: { event?: { webhook_id?: string; webhookId?: string } },
  headers: Headers
): string {
  return (
    payload.event?.webhook_id ??
    payload.event?.webhookId ??
    headers.get('x-signwell-webhook-id') ??
    process.env.SIGNWELL_WEBHOOK_ID ??
    requireApiKey()
  );
}

export function verifySignwellHash(eventType: string, eventTime: string, hash: string, key: string): boolean {
  const expected = createHmac('sha256', key).update(`${eventType}@${eventTime}`).digest('hex');
  if (expected.length !== hash.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}

export const signwellProvider: EsignProvider = {
  id: 'signwell',

  async createEnvelope(req: EnvelopeRequest): Promise<EnvelopeResult> {
    const res = await fetch(`${SIGNWELL_BASE}/document_templates/documents`, {
      method: 'POST',
      headers: {
        'X-Api-Key': requireApiKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        test_mode: process.env.SIGNWELL_TEST_MODE === 'true',
        template_id: templateIdFor(req.docKey),
        embedded_signing: false,
        metadata: { userId: req.userId, itemId: req.itemId },
        recipients: [
          { id: '1', placeholder_name: 'signer', name: req.signerName, email: req.signerEmail },
        ],
        template_fields: Object.entries(req.prefill ?? {}).map(([api_id, value]) => ({ api_id, value })),
      }),
    });
    if (!res.ok) {
      throw new Error(`SignWell createEnvelope failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { id: string };
    return { envelopeId: data.id };
  },

  async parseWebhook(rawBody: string, headers: Headers): Promise<EsignWebhookEvent | null> {
    let payload: {
      event?: { type?: string; time?: string | number; hash?: string; webhook_id?: string; webhookId?: string };
      data?: { object?: { id?: string; metadata?: { userId?: string; itemId?: string } } };
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const type = String(payload.event?.type ?? '');
    const time = String(payload.event?.time ?? '');
    const hash = String(payload.event?.hash ?? '');
    if (!verifySignwellHash(type, time, hash, webhookVerificationKey(payload, headers))) return null;

    const obj = payload.data?.object;
    const envelopeId = String(obj?.id ?? '');
    const metadata = { userId: obj?.metadata?.userId, itemId: obj?.metadata?.itemId };
    if (type === 'document_completed') return { envelopeId, status: 'completed', metadata };
    if (type === 'document_declined') return { envelopeId, status: 'declined', metadata };
    return { envelopeId, status: 'other', metadata };
  },
};
