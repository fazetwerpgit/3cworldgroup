import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { DOCUMENTS } from './documents';
import { sha256Hex } from './stamp';
import type {
  EnvelopeRequest,
  EnvelopeResult,
  EsignDocKey,
  EsignProvider,
  EsignWebhookEvent,
} from './provider';

// The in-house provider replaces the vendor round-trip with a record in this
// collection plus an in-app signing page. There is no firestore.rules match for
// it: every read and write goes through the Admin SDK on a route that has
// already checked the caller owns the envelope.
export const ENVELOPES_COLLECTION = 'esignEnvelopes';

// The only prefill keys an envelope record may carry. `prefill` arrives from the
// rep's onboarding submission and can contain SSN/EIN/bank numbers, which are
// stamped into the PDF and never persisted — so the record is built from an
// allowlist rather than by deleting the sensitive keys.
const PERSISTED_PREFILL_KEYS = ['accountType', 'taxClassification'] as const;

export function inhouseSignPath(envelopeId: string): string {
  return `/portal/onboarding/sign/${envelopeId}`;
}

export interface InhouseEnvelope {
  docKey: EsignDocKey;
  userId: string;
  itemId: string;
  signerName: string;
  signerEmail: string;
  status: 'sent' | 'completed';
  createdAt: Date;
  completedAt?: Date;
  consentAt?: Date;
  ip?: string;
  userAgent?: string;
  signatureMethod?: 'draw' | 'type';
  sourcePdfSha256: string;
  signedPdfSha256?: string;
  signedPdfPath?: string;
  /** Non-sensitive only: accountType / taxClassification. */
  prefill: Record<string, string>;
}

// What the in-app signing routes read back. Deliberately narrower than
// InhouseEnvelope: Firestore hands dates back as Timestamps, and no route needs
// them, so they are not claimed to be Dates here.
export interface InhouseEnvelopeRecord {
  docKey: EsignDocKey;
  userId: string;
  itemId: string;
  signerName: string;
  signerEmail: string;
  status: 'sent' | 'completed';
  prefill: Record<string, string>;
  signedPdfPath?: string;
}

export function envelopeRef(envelopeId: string): FirebaseFirestore.DocumentReference {
  if (!adminDb) throw new Error('Database not configured');
  return adminDb.collection(ENVELOPES_COLLECTION).doc(envelopeId);
}

function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') out[key] = entry;
  }
  return out;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Reads an envelope record. Returns null when the id does not exist. */
export async function loadEnvelope(envelopeId: string): Promise<InhouseEnvelopeRecord | null> {
  const snap = await envelopeRef(envelopeId).get();
  const data = snap.data();
  if (!snap.exists || !data) return null;
  return {
    // Validated by the caller against DOCUMENTS before it is used as a key.
    docKey: str(data.docKey) as EsignDocKey,
    userId: str(data.userId),
    itemId: str(data.itemId),
    signerName: str(data.signerName),
    signerEmail: str(data.signerEmail),
    status: data.status === 'completed' ? 'completed' : 'sent',
    prefill: stringMap(data.prefill),
    signedPdfPath: typeof data.signedPdfPath === 'string' ? data.signedPdfPath : undefined,
  };
}

function persistablePrefill(prefill: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!prefill) return out;
  for (const key of PERSISTED_PREFILL_KEYS) {
    const value = prefill[key];
    if (typeof value === 'string' && value) out[key] = value;
  }
  return out;
}

async function sourcePdfSha256(docKey: EsignDocKey): Promise<string> {
  const bytes = await readFile(path.join(process.cwd(), 'assets', 'esign', DOCUMENTS[docKey].file));
  return sha256Hex(bytes);
}

export const inhouseProvider: EsignProvider = {
  id: 'inhouse',

  // Nothing is rendered up front: the record plus the in-app path is the whole
  // envelope. The rep's browser fetches the blank PDF and the sign route stamps it.
  async createEnvelope(req: EnvelopeRequest): Promise<EnvelopeResult> {
    const envelopeId = randomUUID();
    const ref = envelopeRef(envelopeId);
    const envelope: InhouseEnvelope = {
      docKey: req.docKey,
      userId: req.userId,
      itemId: req.itemId,
      signerName: req.signerName,
      signerEmail: req.signerEmail,
      status: 'sent',
      createdAt: new Date(),
      sourcePdfSha256: await sourcePdfSha256(req.docKey),
      prefill: persistablePrefill(req.prefill),
    };
    await ref.set(envelope);
    return { envelopeId, embeddedSigningUrl: inhouseSignPath(envelopeId) };
  },

  async getEmbeddedSigningUrl(envelopeId: string): Promise<{ url?: string; completed: boolean }> {
    const envelope = await loadEnvelope(envelopeId);
    if (!envelope) throw new Error('Envelope not found');
    return { url: inhouseSignPath(envelopeId), completed: envelope.status === 'completed' };
  },

  async getCompletedPdf(envelopeId: string): Promise<Buffer> {
    const envelope = await loadEnvelope(envelopeId);
    if (!envelope) throw new Error('Envelope not found');
    if (!envelope.signedPdfPath) throw new Error('Envelope has no signed PDF');
    const [bytes] = await getOnboardingBucket().file(envelope.signedPdfPath).download();
    return bytes;
  },

  // In-house signing has no vendor callback: the sign route completes the item
  // inline, so the webhook endpoint has nothing to parse for this provider.
  async parseWebhook(): Promise<EsignWebhookEvent | null> {
    return null;
  },
};
