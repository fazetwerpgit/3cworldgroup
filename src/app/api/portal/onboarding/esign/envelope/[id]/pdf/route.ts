import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { adminDb } from '@/lib/firebase/admin';
import { loadEnvelope } from '@/lib/esign/inhouse';
import { sourcePdfResponse } from '@/lib/esign/sourcePdf';

// GET /api/portal/onboarding/esign/envelope/{id}/pdf — the blank source document
// for the envelope's owner to read before signing.
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const { id } = await ctx.params;
  const envelope = await loadEnvelope(id);
  if (!envelope) return NextResponse.json({ error: 'envelope not found' }, { status: 404 });
  if (envelope.userId !== gate.uid) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const response = await sourcePdfResponse(envelope.docKey);
  return response ?? NextResponse.json({ error: 'unknown document' }, { status: 404 });
}
