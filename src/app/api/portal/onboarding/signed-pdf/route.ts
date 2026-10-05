import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { isEsignItem } from '@/lib/onboarding/esign';
import { isSensitiveOnboardingItem, logSensitiveFileAccess } from '@/lib/onboarding/sensitiveAccess';
import { hasSignedPdf, loadSignedPdf, NO_STORED_COPY, SignedPdfError } from '@/lib/onboarding/signedPdf';

function pdfResponse(pdf: Buffer, itemId: string): NextResponse {
  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${itemId}.pdf"`,
    },
  });
}

// GET /api/portal/onboarding/signed-pdf - Stream a completed e-sign PDF to ops.
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // The signed PDF exposes another user's completed document; management only.
    // Sensitive items (W-9 = full SSN, direct deposit = bank account) are
    // narrowed further to admin/owner below, once the item id is known.
    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const userId = request.nextUrl.searchParams.get('userId');
    const itemId = request.nextUrl.searchParams.get('itemId');
    if (!userId || !itemId) {
      return NextResponse.json(
        { error: 'Missing required query params: userId, itemId' },
        { status: 400 }
      );
    }
    if (!isEsignItem(itemId)) {
      return NextResponse.json({ error: 'Signed PDF is only available for e-sign items' }, { status: 404 });
    }
    const sensitive = isSensitiveOnboardingItem(itemId);
    if (sensitive && !gate.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: admin access required for sensitive documents' },
        { status: 403 }
      );
    }

    const onboardingDoc = await adminDb.collection('userOnboarding').doc(`${userId}_${itemId}`).get();
    if (!onboardingDoc.exists) {
      return NextResponse.json({ error: 'Onboarding item not found' }, { status: 404 });
    }

    const data = onboardingDoc.data() ?? {};
    // Stored copies only; see loadSignedPdf. Checked before the audit write so
    // a document with no stored copy logs no access.
    if (!hasSignedPdf(data)) {
      return NextResponse.json({ error: NO_STORED_COPY }, { status: 404 });
    }

    // Audit before any sensitive bytes leave the server, in the same shape the
    // SSN/DL# reveal route writes. A failed write fails the request (500).
    if (sensitive) {
      await logSensitiveFileAccess({
        targetUid: userId,
        itemId,
        revealedBy: gate.uid,
        revealedByName: gate.name,
        source: 'onboarding-signed-pdf',
      });
    }

    try {
      return pdfResponse(await loadSignedPdf(data), itemId);
    } catch (error) {
      if (error instanceof SignedPdfError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error fetching signed onboarding PDF:', error);
    return NextResponse.json({ error: 'Failed to fetch signed PDF' }, { status: 500 });
  }
}
