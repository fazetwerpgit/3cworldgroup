import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { getEsignProvider } from '@/lib/esign/provider';

// Loads the completed PDF of one e-sign onboarding item. Shared by the
// management signed-pdf route and the owner's onboarding file (view + zip), so
// the storage-first, provider-fallback logic lives in one place.

export class SignedPdfError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'SignedPdfError';
  }
}

/** True when the item doc points at a completed PDF (stored copy or envelope). */
export function hasSignedPdf(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  return (
    (typeof data.completedPdfPath === 'string' && data.completedPdfPath !== '') ||
    (typeof data.esignEnvelopeId === 'string' && data.esignEnvelopeId !== '')
  );
}

/**
 * The stored copy when there is one; otherwise the provider's completed PDF,
 * which is then best-effort saved to Storage (and the path onto the item) so
 * the next open is local. Throws SignedPdfError with the HTTP status a route
 * should send: 404 nothing to load, 500 storage missing, 502 provider failed.
 */
export async function loadSignedPdf(
  userId: string,
  itemId: string,
  data: Record<string, unknown>
): Promise<Buffer> {
  const storedPdfPath = typeof data.completedPdfPath === 'string' ? data.completedPdfPath : '';
  const envelopeId = typeof data.esignEnvelopeId === 'string' ? data.esignEnvelopeId : '';
  if (!storedPdfPath && !envelopeId) throw new SignedPdfError('Signed PDF not available', 404);

  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (storedPdfPath) {
    if (!adminStorage || !bucketName) throw new SignedPdfError('Storage not configured', 500);
    const [pdf] = await adminStorage.bucket(bucketName).file(storedPdfPath).download();
    return pdf;
  }

  let pdf: Buffer;
  try {
    pdf = await getEsignProvider().getCompletedPdf(envelopeId);
  } catch (error) {
    console.error(`[esign] completed PDF fetch failed for ${userId}/${itemId}`, error);
    throw new SignedPdfError('Failed to fetch signed PDF', 502);
  }

  const completedPdfPath = `esign-completed/${userId}/${itemId}.pdf`;
  try {
    if (adminStorage && bucketName && adminDb) {
      await adminStorage
        .bucket(bucketName)
        .file(completedPdfPath)
        .save(pdf, { contentType: 'application/pdf', resumable: false });
      await adminDb
        .collection('userOnboarding')
        .doc(`${userId}_${itemId}`)
        .set({ completedPdfPath }, { merge: true });
    }
  } catch (error) {
    // The provider PDF is still valid for this response if persistence is unavailable.
    console.error(`[esign] completed PDF persistence failed for ${userId}/${itemId}`, error);
  }
  return pdf;
}
