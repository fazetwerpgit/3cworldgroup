import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { EsignProvider, EsignDocKey, EnvelopeRequest, EnvelopeResult, EsignWebhookEvent } from './provider';

const SIGNWELL_BASE = 'https://www.signwell.com/api/v1';
const SIGNER_RECIPIENT_ID = 'signer';

type SignWellFieldType = 'signature' | 'date';

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

interface SignWellDocumentConfig {
  file: string;
  name: string;
  signature: Omit<SignWellField, 'recipient_id' | 'api_id' | 'type'>;
  date: Omit<SignWellField, 'recipient_id' | 'api_id' | 'type'>;
}

// SignWell field x/y are 96dpi pixels from the page's TOP-LEFT (not PDF points,
// which are 72dpi from bottom-left): sw = pt * 4/3, y measured from the top.
// Positions below are visually verified against the assets/esign PDFs.
const DOCUMENTS: Record<EsignDocKey, SignWellDocumentConfig> = {
  contract: {
    file: 'contract.pdf',
    name: 'Employment Agreement',
    signature: { x: 187, y: 827, page: 1, required: true, width: 253, height: 42 },
    date: { x: 573, y: 841, page: 1, required: true, width: 147, height: 28, date_format: 'MM/DD/YYYY', lock_sign_date: true },
  },
  direct_deposit: {
    file: 'direct_deposit.pdf',
    name: 'Direct Deposit Authorization',
    signature: { x: 187, y: 827, page: 1, required: true, width: 253, height: 42 },
    date: { x: 573, y: 841, page: 1, required: true, width: 147, height: 28, date_format: 'MM/DD/YYYY', lock_sign_date: true },
  },
  pay_structure: {
    file: 'pay_structure.pdf',
    name: 'Pay Structure Acknowledgment',
    signature: { x: 187, y: 827, page: 1, required: true, width: 253, height: 42 },
    date: { x: 573, y: 841, page: 1, required: true, width: 147, height: 28, date_format: 'MM/DD/YYYY', lock_sign_date: true },
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
        test_mode: process.env.SIGNWELL_TEST_MODE === 'true',
        name: config.name,
        embedded_signing: false,
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
