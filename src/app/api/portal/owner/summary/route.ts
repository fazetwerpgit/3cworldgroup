import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { buildOwnerSummary, OWNER_SECTIONS, type OwnerSection } from '@/lib/owner/companySummary';
import { createFirestoreOwnerSource } from '@/lib/owner/firestoreSource';

export const dynamic = 'force-dynamic';

// GET /api/portal/owner/summary[?section=money|problems|recruiting]
// The owner's company view. OWNER ONLY: it carries the "3C Receives" margin,
// which no admin, operations or field caller may see. Aggregate counts,
// estimated dollars and page links only — never a customer or a rep's details.
// No section means all three, built from one read of the sales book; a section
// that fails is listed in `failed` (the rest still return) so the dashboard can
// show it as failed and retry just that one with ?section=.
export async function GET(request: NextRequest) {
  const gate = await requireVerifiedManagement(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  if (!gate.isOwner) {
    return NextResponse.json({ error: 'Forbidden: owner access required' }, { status: 403 });
  }

  const requested = request.nextUrl.searchParams.get('section');
  if (requested && !(OWNER_SECTIONS as readonly string[]).includes(requested)) {
    return NextResponse.json({ error: 'Unknown section' }, { status: 400 });
  }
  const sections = requested ? [requested as OwnerSection] : OWNER_SECTIONS;

  try {
    const summary = await buildOwnerSummary(createFirestoreOwnerSource(), sections);
    if (summary.failed?.length === sections.length) {
      return NextResponse.json({ error: 'Failed to build the owner summary' }, { status: 500 });
    }
    return NextResponse.json(summary, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Owner summary failed:', error);
    return NextResponse.json({ error: 'Failed to build the owner summary' }, { status: 500 });
  }
}
