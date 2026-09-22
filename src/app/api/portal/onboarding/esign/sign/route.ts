import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { adminDb } from '@/lib/firebase/admin';
import {
  DOCUMENTS,
  ESIGN_CONSENT_TEXT,
  selectedCheckboxKey,
  validateFields,
  type EsignFieldValues,
} from '@/lib/esign/documents';
import { envelopeRef, loadEnvelope } from '@/lib/esign/inhouse';
import { sha256Hex, stampDocument } from '@/lib/esign/stamp';
import { completeEsignItem } from '@/lib/esign/complete';

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_SIGNATURE_BYTES = 200 * 1024;
const SIGNATURE_METHODS = ['draw', 'type'] as const;

type SignatureMethod = (typeof SIGNATURE_METHODS)[number];

interface SignRequestBody {
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

function clientIp(request: NextRequest): string {
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

// POST /api/portal/onboarding/esign/sign — the whole in-house signing act: stamp
// the source PDF, run the same completion the SignWell webhook runs, then mark
// the envelope. Nothing the rep typed is logged or written to the envelope; the
// field values live only inside the stamped PDF.
export async function POST(request: NextRequest) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const body = (await request.json().catch(() => null)) as SignRequestBody | null;
  const envelopeId = typeof body?.envelopeId === 'string' ? body.envelopeId : '';
  if (!body || !envelopeId) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }
  if (body.consent !== true) {
    return NextResponse.json({ error: 'consent required' }, { status: 400 });
  }
  if (!isSignatureMethod(body.signatureMethod)) {
    return NextResponse.json({ error: 'invalid signature method' }, { status: 400 });
  }
  const signaturePng = decodeSignaturePng(body.signaturePng);
  if (!signaturePng) {
    return NextResponse.json({ error: 'invalid signature image' }, { status: 400 });
  }

  const envelope = await loadEnvelope(envelopeId);
  if (!envelope) return NextResponse.json({ error: 'envelope not found' }, { status: 404 });
  if (envelope.userId !== gate.uid) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (envelope.status === 'completed') {
    return NextResponse.json({ error: 'already completed' }, { status: 409 });
  }
  if (!DOCUMENTS[envelope.docKey]) {
    return NextResponse.json({ error: 'unknown document' }, { status: 404 });
  }

  // The checkbox the rep already chose during onboarding is the default; an
  // explicit value in the request wins so they can correct it while signing.
  const checkedKey = selectedCheckboxKey(envelope.docKey, envelope.prefill);
  const defaults: EsignFieldValues = checkedKey ? { [checkedKey]: true } : {};
  const validation = validateFields(envelope.docKey, {
    ...defaults,
    ...submittedFields(body.fields),
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const now = new Date();
  const ip = clientIp(request);
  const userAgent = request.headers.get('user-agent') ?? '';
  const signatureMethod = body.signatureMethod;

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
        userId: gate.uid,
        consentText: ESIGN_CONSENT_TEXT,
        consentAt: now,
        ip,
        userAgent,
        signatureMethod,
      },
    });
    pdf = stamped.pdf;
    ({ completedPdfPath } = await completeEsignItem({
      userId: gate.uid,
      itemId: envelope.itemId,
      envelopeId,
      pdf,
    }));
  } catch (error) {
    // Field values are never part of this log line.
    console.error('[esign] in-house sign failed', {
      envelopeId,
      userId: gate.uid,
      itemId: envelope.itemId,
      docKey: envelope.docKey,
      error,
    });
    return NextResponse.json({ error: 'sign failed' }, { status: 500 });
  }

  // The envelope stays 'sent' when the upload failed, so the rep can sign again.
  if (!completedPdfPath) {
    return NextResponse.json({ error: 'upload failed' }, { status: 502 });
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

  return NextResponse.json({ completed: true });
}
