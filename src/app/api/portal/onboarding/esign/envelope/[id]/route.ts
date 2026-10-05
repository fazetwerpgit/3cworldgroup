import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { adminDb } from '@/lib/firebase/admin';
import { DOCUMENTS } from '@/lib/esign/documents';
import { buildEnvelopeView } from '@/lib/esign/envelopeView';
import { loadEnvelope } from '@/lib/esign/inhouse';
import { isHeldOnboardingItem } from '@/types/onboardingHold';

export type { EnvelopeFieldView, EnvelopeView } from '@/lib/esign/envelopeView';

// GET /api/portal/onboarding/esign/envelope/{id} — what the in-app sign page needs
// to render one document: its name, page count, and the field list with whatever
// we can prefill from the rep's own profile.
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
  // An unsigned placeholder on hold reads as withdrawn: the sign page sends the
  // rep back to the checklist, which no longer lists it.
  if (envelope.status === 'sent' && isHeldOnboardingItem(envelope.itemId)) {
    return NextResponse.json({ error: 'document on hold' }, { status: 404 });
  }

  const config = DOCUMENTS[envelope.docKey];
  if (!config) return NextResponse.json({ error: 'unknown document' }, { status: 404 });

  const userSnap = await adminDb.collection('users').doc(gate.uid).get();
  const view = buildEnvelopeView(id, envelope, userSnap.data() ?? {});
  if (!view) return NextResponse.json({ error: 'unknown document' }, { status: 404 });
  return NextResponse.json(view);
}
