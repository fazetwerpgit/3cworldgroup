import { NextRequest, NextResponse } from 'next/server';
import { loadEnvelope } from '@/lib/esign/inhouse';
import {
  clientIp,
  parseSignRequest,
  signInhouseEnvelope,
  type SignRequestBody,
} from '@/lib/esign/signEnvelope';
import {
  allEsignItemsSigned,
  authorizeInviteSigning,
  closeSigningSession,
  SIGNING_KEY_HEADER,
} from '@/lib/onboarding/inviteSigning';

// POST /api/public/onboarding/{token}/esign/sign — signs ONE of the invite
// hire's envelopes. The sign-all screen calls it once per document so a
// failure is reported against that document and can be retried alone. The
// signing act is the portal's own (signInhouseEnvelope): same stamped PDF,
// audit block, checklist approval and activation check.
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const auth = await authorizeInviteSigning(token, request.headers.get(SIGNING_KEY_HEADER));
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error, ...(auth.done ? { done: true } : {}) }, { status: auth.status });
    }

    const body = (await request.json().catch(() => null)) as SignRequestBody | null;
    const parsed = parseSignRequest(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

    const envelope = await loadEnvelope(parsed.value.envelopeId);
    if (!envelope || envelope.userId !== auth.userId) {
      return NextResponse.json({ error: 'envelope not found' }, { status: 404 });
    }

    const outcome = await signInhouseEnvelope({
      envelope,
      userId: auth.userId,
      request: parsed.value,
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent') ?? '',
    });
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });

    const allSigned = await allEsignItemsSigned(auth.userId, auth.items);
    if (allSigned) await closeSigningSession(auth.inviteRef);
    return NextResponse.json({ completed: true, allSigned });
  } catch (error) {
    console.error('[onboard sign] sign failed', error);
    return NextResponse.json({ error: 'sign failed' }, { status: 500 });
  }
}
