import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { EsignProvider, EsignDocKey, EnvelopeRequest, EnvelopeResult, EsignWebhookEvent } from './provider';

const SIGNWELL_BASE = 'https://www.signwell.com/api/v1';
export const SIGNER_RECIPIENT_ID = 'signer';

type SignWellFieldType = 'signature' | 'date' | 'text' | 'checkbox';

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
  date_format?: 'MM/DD/YYYY';
  lock_sign_date?: boolean;
}

type SignWellFieldSpec = Omit<SignWellField, 'recipient_id' | 'api_id' | 'type'>;

interface SignWellDocumentConfig {
  file: string;
  name: string;
  signature: SignWellFieldSpec;
  date: SignWellFieldSpec;
  // Additional fill-in fields (text/checkbox) keyed by api_id suffix.
  extra?: Array<SignWellFieldSpec & { key: string; type: 'text' | 'checkbox' }>;
}

// SignWell field x/y are 96dpi pixels from the page's TOP-LEFT (not PDF points,
// which are 72dpi from bottom-left): sw = pt * 4/3, y measured from the top.
// Positions below are visually verified against the assets/esign PDFs.
const DOCUMENTS: Record<EsignDocKey, SignWellDocumentConfig> = {
  contract: {
    file: 'contract.pdf',
    name: 'Independent Agent Agreement',
    signature: { x: 184, y: 584, page: 3, required: true, width: 312, height: 34 },
    date: { x: 534, y: 584, page: 3, required: true, width: 148, height: 34, date_format: 'MM/DD/YYYY', lock_sign_date: true },
    extra: [
      { key: 'agent_name', type: 'text', x: 168, y: 636, page: 3, required: true, width: 532, height: 30 },
      { key: 'business_name', type: 'text', x: 184, y: 684, page: 3, required: false, width: 516, height: 30 },
      { key: 'ein', type: 'text', x: 132, y: 728, page: 3, required: false, width: 564, height: 30 },
      { key: 'street_address', type: 'text', x: 180, y: 772, page: 3, required: true, width: 520, height: 34 },
      { key: 'city_state_zip', type: 'text', x: 212, y: 820, page: 3, required: true, width: 488, height: 32 },
      { key: 'office_phone', type: 'text', x: 168, y: 868, page: 3, required: false, width: 224, height: 32 },
      { key: 'cell_phone', type: 'text', x: 460, y: 868, page: 3, required: true, width: 236, height: 32 },
      { key: 'email', type: 'text', x: 180, y: 916, page: 3, required: true, width: 212, height: 32 },
      { key: 'website', type: 'text', x: 452, y: 916, page: 3, required: false, width: 244, height: 32 },
    ],
  },
  direct_deposit: {
    file: 'direct_deposit.pdf',
    name: 'Direct Deposit Authorization',
    signature: { x: 112, y: 576, page: 1, required: true, width: 500, height: 34 },
    date: { x: 676, y: 576, page: 1, required: true, width: 100, height: 34, date_format: 'MM/DD/YYYY', lock_sign_date: true },
    extra: [
      { key: 'legal_name', type: 'text', x: 132, y: 536, page: 1, required: true, width: 644, height: 34 },
      { key: 'bank_name', type: 'text', x: 128, y: 164, page: 2, required: true, width: 644, height: 26 },
      { key: 'routing_number', type: 'text', x: 124, y: 192, page: 2, required: true, width: 252, height: 26 },
      { key: 'account_number', type: 'text', x: 468, y: 192, page: 2, required: true, width: 304, height: 26 },
      { key: 'checking', type: 'checkbox', x: 46, y: 262, page: 2, required: false, width: 16, height: 16 },
      { key: 'savings', type: 'checkbox', x: 200, y: 262, page: 2, required: false, width: 16, height: 16 },
      { key: 'deposit_amount', type: 'text', x: 404, y: 258, page: 2, required: false, width: 120, height: 20 },
      { key: 'full_net_amount', type: 'checkbox', x: 566, y: 262, page: 2, required: false, width: 16, height: 16 },
    ],
  },
  pay_structure: {
    file: 'pay_structure.pdf',
    name: 'Pay Structure Acknowledgment',
    signature: { x: 187, y: 827, page: 1, required: true, width: 253, height: 42 },
    date: { x: 573, y: 841, page: 1, required: true, width: 147, height: 28, date_format: 'MM/DD/YYYY', lock_sign_date: true },
  },
  w9: {
    file: 'w9.pdf',
    name: 'Form W-9 (Request for Taxpayer Identification Number)',
    signature: { x: 200, y: 770, page: 1, required: true, width: 304, height: 32 },
    date: { x: 552, y: 770, page: 1, required: true, width: 208, height: 32, date_format: 'MM/DD/YYYY', lock_sign_date: true },
    extra: [
      { key: 'name', type: 'text', x: 98, y: 152, page: 1, required: true, width: 640, height: 18 },
      { key: 'business_name', type: 'text', x: 98, y: 187, page: 1, required: false, width: 640, height: 18 },
      { key: 'individual_sole_prop', type: 'checkbox', x: 96, y: 239, page: 1, required: false, width: 14, height: 14 },
      { key: 'llc', type: 'checkbox', x: 96, y: 258, page: 1, required: false, width: 14, height: 14 },
      { key: 'llc_classification', type: 'text', x: 512, y: 254, page: 1, required: false, width: 80, height: 16 },
      { key: 'address', type: 'text', x: 84, y: 383, page: 1, required: true, width: 424, height: 20 },
      { key: 'city_state_zip', type: 'text', x: 84, y: 417, page: 1, required: true, width: 424, height: 20 },
      // TIN is one-of SSN/EIN — SignWell can't express either/or, so both are
      // optional; admin review catches a missing TIN.
      { key: 'ssn', type: 'text', x: 560, y: 498, page: 1, required: false, width: 200, height: 24 },
      { key: 'ein', type: 'text', x: 560, y: 562, page: 1, required: false, width: 200, height: 24 },
    ],
  },
  fcra_auth: {
    file: 'fcra_auth.pdf',
    name: 'FCRA Background Check Authorization',
    signature: { x: 187, y: 827, page: 1, required: true, width: 253, height: 42 },
    date: { x: 573, y: 841, page: 1, required: true, width: 147, height: 28, date_format: 'MM/DD/YYYY', lock_sign_date: true },
  },
};

function requireApiKey(): string {
  const key = process.env.SIGNWELL_API_KEY;
  if (!key) throw new Error('SIGNWELL_API_KEY is not set');
  return key;
}

async function readDocumentBase64(file: string): Promise<string> {
  const bytes = await readFile(path.join(process.cwd(), 'assets', 'esign', file));
  return bytes.toString('base64');
}

function fieldsFor(docKey: EsignDocKey, config: SignWellDocumentConfig): SignWellField[][] {
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
        fields: fieldsFor(req.docKey, config),
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
