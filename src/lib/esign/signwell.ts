import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { EsignProvider, EsignDocKey, EnvelopeRequest, EnvelopeResult, EsignWebhookEvent } from './provider';
import { DOCUMENTS, selectedCheckboxKey, type EsignDocumentConfig } from './documents';

const SIGNWELL_BASE = 'https://www.signwell.com/api/v1';
export const SIGNER_RECIPIENT_ID = 'signer';

type SignWellFieldType = 'signature' | 'date' | 'text' | 'checkbox';

/**
 * Field payload SignWell expects. The geometry is an `EsignBox` verbatim —
 * SignWell's 96-DPI top-left pixels are the coordinate system `DOCUMENTS` is
 * written in — so only the recipient wiring, api_id, and type are added here.
 */
interface SignWellField {
  x: number;
  y: number;
  page: number;
  type: SignWellFieldType;
  required: boolean;
  recipient_id: string;
  api_id: string;
  width: number;
  height: number;
  value?: string | boolean;
  date_format?: 'MM/DD/YYYY';
  lock_sign_date?: boolean;
}

function requireApiKey(): string {
  const key = process.env.SIGNWELL_API_KEY;
  if (!key) throw new Error('SIGNWELL_API_KEY is not set');
  return key;
}

async function readDocumentBase64(file: string): Promise<string> {
  const bytes = await readFile(path.join(process.cwd(), 'assets', 'esign', file));
  return bytes.toString('base64');
}

function fieldsFor(
  docKey: EsignDocKey,
  config: EsignDocumentConfig,
  prefill?: EnvelopeRequest['prefill']
): SignWellField[][] {
  const selected = selectedCheckboxKey(docKey, prefill);

  return [
    [
      {
        ...config.signature,
        type: 'signature',
        recipient_id: SIGNER_RECIPIENT_ID,
        api_id: `${docKey}_signature`,
      },
      {
        ...config.date,
        type: 'date',
        recipient_id: SIGNER_RECIPIENT_ID,
        api_id: `${docKey}_date`,
      },
      ...(config.extra ?? []).map(({ key, ...spec }) => ({
        ...spec,
        ...(spec.type === 'checkbox' && key === selected ? { value: true } : {}),
        recipient_id: SIGNER_RECIPIENT_ID,
        api_id: `${docKey}_${key}`,
      })),
    ],
  ];
}

function webhookVerificationKey(
  payload: { event?: { webhook_id?: string; webhookId?: string } },
  headers: Headers
): string | null {
  const key =
    payload.event?.webhook_id ??
    payload.event?.webhookId ??
    headers.get('x-signwell-webhook-id') ??
    process.env.SIGNWELL_WEBHOOK_ID ??
    process.env.SIGNWELL_API_KEY ??
    null;
  return key || null;
}

export function verifySignwellHash(eventType: string, eventTime: string, hash: string, key: string): boolean {
  const expected = createHmac('sha256', key).update(`${eventType}@${eventTime}`).digest('hex');
  if (expected.length !== hash.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}

export const signwellProvider: EsignProvider = {
  id: 'signwell',

  async createEnvelope(req: EnvelopeRequest): Promise<EnvelopeResult> {
    const testMode = process.env.SIGNWELL_TEST_MODE === 'true';
    const isProduction =
      process.env.VERCEL_ENV === 'production' ||
      (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production');
    if (testMode && isProduction) {
      throw new Error('SIGNWELL_TEST_MODE cannot be enabled in production');
    }

    const apiKey = requireApiKey();
    const config = DOCUMENTS[req.docKey];
    const fileBase64 = await readDocumentBase64(config.file);

    const res = await fetch(`${SIGNWELL_BASE}/documents`, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        test_mode: testMode,
        name: config.name,
        embedded_signing: true,
        metadata: { userId: req.userId, itemId: req.itemId },
        files: [{ name: config.file, file_base64: fileBase64 }],
        recipients: [
          { id: SIGNER_RECIPIENT_ID, name: req.signerName, email: req.signerEmail },
        ],
        fields: fieldsFor(req.docKey, config, req.prefill),
      }),
    });
    if (!res.ok) {
      throw new Error(`SignWell createEnvelope failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      id: string;
      recipients?: Array<{ id?: string; embedded_signing_url?: string | null }>;
    };
    const signer = data.recipients?.find((r) => r.id === SIGNER_RECIPIENT_ID) ?? data.recipients?.[0];
    const embeddedSigningUrl = signer?.embedded_signing_url || undefined;
    return embeddedSigningUrl ? { envelopeId: data.id, embeddedSigningUrl } : { envelopeId: data.id };
  },

  async getCompletedPdf(envelopeId: string): Promise<Buffer> {
    const res = await fetch(`${SIGNWELL_BASE}/documents/${envelopeId}/completed_pdf`, {
      headers: { 'X-Api-Key': requireApiKey() },
    });
    if (!res.ok) {
      throw new Error(`SignWell getCompletedPdf failed: ${res.status} ${await res.text()}`);
    }

    const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.includes('application/json')) {
      const data = (await res.json()) as { file_url?: string };
      if (!data.file_url) throw new Error('SignWell getCompletedPdf response did not include file_url');
      const fileRes = await fetch(data.file_url);
      if (!fileRes.ok) {
        throw new Error(`SignWell completed PDF download failed: ${fileRes.status} ${await fileRes.text()}`);
      }
      return Buffer.from(await fileRes.arrayBuffer());
    }

    return Buffer.from(await res.arrayBuffer());
  },

  async getEmbeddedSigningUrl(envelopeId: string): Promise<{ url?: string; completed: boolean }> {
    const res = await fetch(`${SIGNWELL_BASE}/documents/${envelopeId}`, {
      headers: { 'X-Api-Key': requireApiKey() },
    });
    if (!res.ok) {
      throw new Error(`SignWell getEmbeddedSigningUrl failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      status?: string | null;
      recipients?: Array<{ id?: string; embedded_signing_url?: string | null }>;
    };
    const signer = data.recipients?.find((r) => r.id === SIGNER_RECIPIENT_ID) ?? data.recipients?.[0];
    const completed = typeof data.status === 'string' && data.status.toLowerCase() === 'completed';
    const url = signer?.embedded_signing_url || undefined;
    return url ? { url, completed } : { completed };
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
    const key = webhookVerificationKey(payload, headers);
    if (!key || !verifySignwellHash(type, time, hash, key)) return null;

    const obj = payload.data?.object;
    const envelopeId = String(obj?.id ?? '');
    const metadata = { userId: obj?.metadata?.userId, itemId: obj?.metadata?.itemId };
    if (type === 'document_completed') return { envelopeId, status: 'completed', metadata };
    if (type === 'document_declined') return { envelopeId, status: 'declined', metadata };
    return { envelopeId, status: 'other', metadata };
  },
};
