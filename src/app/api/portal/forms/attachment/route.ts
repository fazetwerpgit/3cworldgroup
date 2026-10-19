import { NextRequest, NextResponse } from 'next/server';
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { requireVerifiedRequester } from '@/lib/auth/requireVerifiedAdmin';
import { ATTACHMENT_ROOT, isCleanAttachmentPath } from '@/lib/forms/attachmentPath';
import { saleProofPaths } from '@/lib/sales/proofPaths';

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

// GET /api/portal/forms/attachment?path=form-attachments/... - management, or
// a user reading their OWN uploads (form-attachments/{their uid}/...) such as a
// rep's sale-proof thumbnails. A rep may also read proof stored on a sale they
// own (`saleId`), whoever uploaded it: an admin's edit stores its uploads under
// the admin's prefix.
// Mints a 15-min signed URL for the file in the folder. Never exposes the raw
// path back as a usable storage URL. `path` is the folder stored on the record:
// new submissions store their own per-submission folder
// (form-attachments/{uid}/{formType}/{uploadId}/...), older ones the legacy
// shared folder (form-attachments/{uid}/{formType}/[{slot}/]).
export async function GET(request: NextRequest) {
  try {
    const gate = await requireVerifiedRequester(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const path = request.nextUrl.searchParams.get('path') ?? '';
    if (!isCleanAttachmentPath(path)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    // Everyone else's uploads (onboarding documents, disputes, other reps'
    // proof) stay management-only. The uid comes from the token, never the query.
    if (!gate.isManagement && !path.startsWith(`${ATTACHMENT_ROOT}${gate.uid}/`)) {
      const saleId = request.nextUrl.searchParams.get('saleId') ?? '';
      if (!(await isProofOnOwnSale(saleId, path, gate.uid))) {
        return NextResponse.json({ error: 'Forbidden: you can only view your own uploads' }, { status: 403 });
      }
    }

    const bucket = getOnboardingBucket();
    const prefix = path.endsWith('/') ? path : `${path}/`;
    // Direct children only (delimiter '/'): uploads always write {folder}file.{ext},
    // and a legacy folder like form-attachments/{uid}/payroll-dispute/ is now the
    // PARENT of every per-submission folder, so a recursive listing could sign a
    // newer submission's file for an old record.
    const [files] = await bucket.getFiles({ prefix, delimiter: '/' });
    if (files.length === 0) return NextResponse.json({ url: null });

    const [url] = await files[0].getSignedUrl({
      action: 'read',
      expires: Date.now() + SIGNED_URL_TTL_MS,
    });
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Error signing form attachment:', error);
    return NextResponse.json({ error: 'Failed to load attachment' }, { status: 500 });
  }
}

/** The path is a proof screenshot stored on a sale the caller owns. */
async function isProofOnOwnSale(saleId: string, path: string, uid: string): Promise<boolean> {
  if (!saleId || saleId.includes('/') || !adminDb || !path.includes('/sale-proof/')) return false;
  const snap = await adminDb.collection('sales').doc(saleId).get();
  const sale = snap.exists ? snap.data() : undefined;
  return !!sale && sale.salesRepId === uid && saleProofPaths(sale).includes(path);
}
