import { isPdfUrl } from '@/lib/forms/openAttachment';
import type { OnboardingStatus } from '@/types';

export type OnboardingFileTone = 'lime' | 'blue' | 'amber' | 'red' | 'muted';

/**
 * The status an owner reads for one item in the onboarding file. Client-safe
 * (no server imports). An e-sign item reads "Out for signature" only when an
 * envelope really exists and it is not signed yet; a submitted e-sign item
 * with no envelope has not gone out, so it reads "Not sent yet".
 */
export function onboardingFileItemStatus(item: {
  status: OnboardingStatus;
  onHold: boolean;
  referenceKind: 'vendor' | 'storage' | 'esign' | 'manual';
  envelopeSent: boolean;
}): { tone: OnboardingFileTone; label: string } {
  if (item.onHold) return { tone: 'muted', label: 'On hold' };
  switch (item.status) {
    case 'approved':
      return { tone: 'lime', label: 'Approved' };
    case 'rejected':
      return { tone: 'red', label: 'Rejected' };
    case 'submitted':
      if (item.referenceKind !== 'esign') return { tone: 'amber', label: 'Needs review' };
      return item.envelopeSent
        ? { tone: 'blue', label: 'Out for signature' }
        : { tone: 'amber', label: 'Not sent yet' };
    default:
      return item.referenceKind === 'esign' && !item.envelopeSent
        ? { tone: 'muted', label: 'Not sent yet' }
        : { tone: 'muted', label: 'Not started' };
  }
}

/** Photos and PDFs draw in the in-app viewer; anything else (HEIC) stays a link. */
export function opensInViewer(upload: { url: string; contentType: string }): boolean {
  if (/^image\/(jpeg|png|webp)$/.test(upload.contentType)) return true;
  return upload.contentType === 'application/pdf' && isPdfUrl(upload.url);
}

/**
 * iPhone, iPod or iPad (iPadOS reports a Mac UA, so a "Macintosh" with a touch
 * screen counts). Only there does the zip go through the share sheet (Save to
 * Files); Android, desktop and everything else download the blob directly.
 */
export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}
