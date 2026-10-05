import type { NextRequest } from 'next/server';
import {
  DOCUMENTS,
  ESIGN_CONSENT_TEXT,
  selectedCheckboxKey,
  validateFields,
  type EsignFieldValues,
} from '@/lib/esign/documents';
import { envelopeRef, type InhouseEnvelopeRecord } from '@/lib/esign/inhouse';
import { sha256Hex, stampDocument } from '@/lib/esign/stamp';
import { completeEsignItem } from '@/lib/esign/complete';
import { isHeldOnboardingItem } from '@/types/onboardingHold';

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_SIGNATURE_BYTES = 200 * 1024;
const SIGNATURE_METHODS = ['draw', 'type'] as const;

export type SignatureMethod = (typeof SIGNATURE_METHODS)[number];

export interface SignRequestBody {
  envelopeId?: unknown;
  fields?: unknown;
  signaturePng?: unknown;
  signatureMethod?: unknown;
  consent?: unknown;
}

function isSignatureMethod(value: unknown): value is SignatureMethod {
  return SIGNATURE_METHODS.includes(value as SignatureMethod);
}

// A drawn or typed signature always reaches us as a PNG data URL. Anything else
// is rejected before it can be handed to pdf-lib.
function decodeSignaturePng(value: unknown): Buffer | null {
  if (typeof value !== 'string' || !value.startsWith(PNG_DATA_URL_PREFIX)) return null;
  const png = Buffer.from(value.slice(PNG_DATA_URL_PREFIX.length), 'base64');
  if (png.length === 0 || png.length > MAX_SIGNATURE_BYTES) return null;
  if (!png.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) return null;
  return png;
}

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || '';
}

function submittedFields(value: unknown): EsignFieldValues {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: EsignFieldValues = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string' || typeof entry === 'boolean') out[key] = entry;
  }
  return out;
}

export interface ParsedSignRequest {
  envelopeId: string;
  fields: unknown;
  signaturePng: Buffer;
  signatureMethod: SignatureMethod;
}

export type SignOutcome =
  | { ok: true }
  | { ok: false; status: number; error: string };

/** Validates a sign request body. The caller still has to check who owns the envelope. */
export function parseSignRequest(
  body: SignRequestBody | null
): { ok: true; value: ParsedSignRequest } | { ok: false; status: number; error: string } {
  const envelopeId = typeof body?.envelopeId === 'string' ? body.envelopeId : '';
  if (!body || !envelopeId) return { ok: false, status: 400, error: 'invalid request' };
  if (body.consent !== true) return { ok: false, status: 400, error: 'consent required' };
  if (!isSignatureMethod(body.signatureMethod)) {
    return { ok: false, status: 400, error: 'invalid signature method' };
  }
  const signaturePng = decodeSignaturePng(body.signaturePng);
  if (!signaturePng) return { ok: false, status: 400, error: 'invalid signature image' };
  return {
    ok: true,
    value: { envelopeId, fields: body.fields, signaturePng, signatureMethod: body.signatureMethod },
  };
}

/**
 * The whole in-house signing act for one envelope the caller has already
 * proven belongs to `userId`: stamp the source PDF, run the same completion the
 * SignWell webhook runs, then mark the envelope. Shared by the portal sign
 * route and the invite link's sign-all step, so both leave the same signed
 * PDF, audit block and checklist approval. Nothing the rep typed is logged or
 * written to the envelope; the field values live only inside the stamped PDF.
 */
export async function signInhouseEnvelope(input: {
  envelope: InhouseEnvelopeRecord;
  userId: string;
  request: ParsedSignRequest;
  ip: string;
  userAgent: string;
}): Promise<SignOutcome> {
  const { envelope, userId, ip, userAgent } = input;
  const { envelopeId, signaturePng, signatureMethod } = input.request;

  if (envelope.status === 'completed') {
    return { ok: false, status: 409, error: 'already completed' };
  }
  // A placeholder document on hold is not signable, even from a link sent
  // before the hold (see onboardingHold).
  if (isHeldOnboardingItem(envelope.itemId)) {
    return { ok: false, status: 409, error: 'document on hold' };
  }
  if (!DOCUMENTS[envelope.docKey]) {
    return { ok: false, status: 404, error: 'unknown document' };
  }

  // The checkbox the rep already chose during onboarding is the default; an
  // explicit value in the request wins so they can correct it while signing.
  const checkedKey = selectedCheckboxKey(envelope.docKey, envelope.prefill);
  const defaults: EsignFieldValues = checkedKey ? { [checkedKey]: true } : {};
  const validation = validateFields(envelope.docKey, {
    ...defaults,
    ...submittedFields(input.request.fields),
  });
  if (!validation.ok) {
    return { ok: false, status: 400, error: validation.error };
  }

  const now = new Date();
  let pdf: Buffer;
  let completedPdfPath: string | null;
  try {
    const stamped = await stampDocument({
      docKey: envelope.docKey,
      fields: validation.fields,
      signaturePng,
      signedAt: now,
      audit: {
        envelopeId,
        signerName: envelope.signerName,
        signerEmail: envelope.signerEmail,
        userId,
        consentText: ESIGN_CONSENT_TEXT,
        consentAt: now,
        ip,
        userAgent,
        signatureMethod,
      },
    });
    pdf = stamped.pdf;
    ({ completedPdfPath } = await completeEsignItem({
      userId,
      itemId: envelope.itemId,
      envelopeId,
      pdf,
    }));
  } catch (error) {
    // Field values are never part of this log line.
    console.error('[esign] in-house sign failed', {
      envelopeId,
      userId,
      itemId: envelope.itemId,
      docKey: envelope.docKey,
      error,
    });
    return { ok: false, status: 500, error: 'sign failed' };
  }

  // The envelope stays 'sent' when the upload failed, so the rep can sign again.
  if (!completedPdfPath) {
    return { ok: false, status: 502, error: 'upload failed' };
  }

  await envelopeRef(envelopeId).set(
    {
      status: 'completed',
      completedAt: now,
      consentAt: now,
      ip,
      userAgent,
      signatureMethod,
      signedPdfSha256: sha256Hex(pdf),
      signedPdfPath: completedPdfPath,
    },
    { merge: true }
  );

  return { ok: true };
}
