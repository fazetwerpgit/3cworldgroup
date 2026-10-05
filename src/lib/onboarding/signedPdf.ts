import { adminStorage } from '@/lib/firebase/admin';

// Loads the stored copy of one e-sign onboarding item's signed PDF. Shared by
// the management signed-pdf route and the owner's onboarding file (view + zip).
// Every document signed in-house is stored when it is signed. Some documents
// signed before signing moved in-house never got a stored copy; those exist
// only in the old vendor's dashboard and are reported as such, never fetched.

export const NO_STORED_COPY = 'No stored copy of this signed document';

export class SignedPdfError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'SignedPdfError';
  }
}

function storedPdfPath(data: Record<string, unknown> | undefined): string {
  return typeof data?.completedPdfPath === 'string' ? data.completedPdfPath : '';
}

/** True when the item doc points at a stored signed PDF. */
export function hasSignedPdf(data: Record<string, unknown> | undefined): boolean {
  return storedPdfPath(data) !== '';
}

/**
 * Signed, but with no stored copy to open: an approved e-sign item that was
 * signed through an envelope (not marked complete by hand) before signing
 * moved in-house.
 */
export function signedWithoutStoredCopy(data: Record<string, unknown> | undefined): boolean {
  return (
    !!data &&
    data.status === 'approved' &&
    !hasSignedPdf(data) &&
    !data.manualCompletion &&
    typeof data.esignEnvelopeId === 'string' &&
    data.esignEnvelopeId !== ''
  );
}

/**
 * The stored copy. Throws SignedPdfError with the HTTP status a route should
 * send: 404 no stored copy, 500 storage not configured.
 */
export async function loadSignedPdf(data: Record<string, unknown>): Promise<Buffer> {
  const path = storedPdfPath(data);
  if (!path) throw new SignedPdfError(NO_STORED_COPY, 404);
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!adminStorage || !bucketName) throw new SignedPdfError('Storage not configured', 500);
  const [pdf] = await adminStorage.bucket(bucketName).file(path).download();
  return pdf;
}
