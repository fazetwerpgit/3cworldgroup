import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { adminDb } from '@/lib/firebase/admin';
import { loadEnvelope } from '@/lib/esign/inhouse';
import {
  clientIp,
  parseSignRequest,
  signInhouseEnvelope,
  type SignRequestBody,
} from '@/lib/esign/signEnvelope';

// POST /api/portal/onboarding/esign/sign — the whole in-house signing act for
// the signed-in rep's own envelope. The stamping and completion live in
// signInhouseEnvelope, shared with the invite link's sign-all step.
export async function POST(request: NextRequest) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const body = (await request.json().catch(() => null)) as SignRequestBody | null;
  const parsed = parseSignRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  const envelope = await loadEnvelope(parsed.value.envelopeId);
  if (!envelope) return NextResponse.json({ error: 'envelope not found' }, { status: 404 });
  if (envelope.userId !== gate.uid) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const outcome = await signInhouseEnvelope({
    envelope,
    userId: gate.uid,
    request: parsed.value,
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent') ?? '',
  });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ completed: true });
}
