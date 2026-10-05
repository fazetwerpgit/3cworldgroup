import { NextRequest, NextResponse } from 'next/server';
import { loadEnvelope } from '@/lib/esign/inhouse';
import { sourcePdfResponse } from '@/lib/esign/sourcePdf';
import { authorizeInviteSigning, SIGNING_KEY_HEADER } from '@/lib/onboarding/inviteSigning';

// GET /api/public/onboarding/{token}/esign/{envelopeId}/pdf — the blank source
// document, for the invite's own hire to read before signing.
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ token: string; envelopeId: string }> }
) {
  try {
    const { token, envelopeId } = await ctx.params;
    const auth = await authorizeInviteSigning(token, request.headers.get(SIGNING_KEY_HEADER));
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const envelope = await loadEnvelope(envelopeId);
    // Someone else's envelope reads exactly like a missing one.
    if (!envelope || envelope.userId !== auth.userId) {
      return NextResponse.json({ error: 'envelope not found' }, { status: 404 });
    }
    const response = await sourcePdfResponse(envelope.docKey);
    return response ?? NextResponse.json({ error: 'unknown document' }, { status: 404 });
  } catch (error) {
    console.error('[onboard sign] failed to load a document', error);
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 });
  }
}
