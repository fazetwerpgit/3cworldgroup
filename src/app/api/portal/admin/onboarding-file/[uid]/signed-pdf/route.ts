import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireOwner } from '@/lib/announcements/requireOwner';
import { isEsignItem } from '@/lib/onboarding/esign';
import { logSensitiveFileAccess } from '@/lib/onboarding/sensitiveAccess';
import { hasSignedPdf, loadSignedPdf, SignedPdfError } from '@/lib/onboarding/signedPdf';
import { UID_PATTERN } from '@/lib/onboarding/onboardingFile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = 'private, no-store';

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': NO_STORE } });
}

// GET /api/portal/admin/onboarding-file/[uid]/signed-pdf?itemId= - OWNER ONLY.
// One completed e-sign PDF from a person's onboarding file, drawn in the page's
// viewer. Every opening is logged in sensitiveAccessLog before any bytes leave
// the server, sensitive item or not; no audit row, no PDF.
export async function GET(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const gate = await requireOwner(request);
  if (!gate.ok) return fail(gate.error, gate.status);
  if (!adminDb) return fail('Database not configured', 500);

  const { uid } = await params;
  const itemId = request.nextUrl.searchParams.get('itemId') ?? '';
  if (!UID_PATTERN.test(uid) || !isEsignItem(itemId)) return fail('Not found', 404);

  try {
    const snap = await adminDb.collection('userOnboarding').doc(`${uid}_${itemId}`).get();
    const data = snap.exists ? (snap.data() ?? {}) : undefined;
    if (!data || !hasSignedPdf(data)) return fail('Signed PDF not available', 404);

    await logSensitiveFileAccess({
      targetUid: uid,
      itemId,
      revealedBy: gate.uid,
      revealedByName: gate.name,
      source: 'onboarding-file-signed-pdf',
    });

    const pdf = await loadSignedPdf(uid, itemId, data);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${itemId}.pdf"`,
        'Cache-Control': NO_STORE,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof SignedPdfError) return fail(error.message, error.status);
    console.error('Onboarding file PDF failed:', error instanceof Error ? error.message : 'unknown');
    return fail("Couldn't open the signed PDF", 500);
  }
}
