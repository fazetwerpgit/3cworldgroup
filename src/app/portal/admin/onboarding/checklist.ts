import { isEsignItem } from '@/lib/onboarding/esign';
import type { OnboardingCategory, OnboardingStatus } from '@/types';

// One person's onboarding checklist as GET /api/portal/onboarding/review
// returns it, and the plain words To do uses for each item.

export interface ChecklistItem {
  id: string;
  userId: string;
  itemId: string;
  itemLabel: string;
  category: OnboardingCategory;
  sensitive: boolean;
  /** Sensitive item whose files this caller (operations) may not open. */
  adminOnly: boolean;
  referenceKind: 'vendor' | 'storage' | 'esign' | 'manual';
  reference: string | null;
  files: { name: string; url: string; contentType: string }[];
  status: OnboardingStatus;
  /** Unsigned placeholder document on hold: shown, but nobody is waiting on it. */
  onHold: boolean;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  rejectionReason: string | null;
  esignEnvelopeId: string | null;
  hasSignedPdf: boolean;
  /** Set when an owner marked the item complete by hand. */
  manualCompletion: { note: string; byName: string; at: string | null } | null;
}

export interface ChecklistPerson {
  userId: string;
  userName: string;
  items: ChecklistItem[];
  /** Uploads waiting on management: what the Hiring badge counts per person. */
  toReview: number;
}

const HOUR_MS = 1000 * 60 * 60;

/** "just now", "3 hours ago", "2 days ago"; '' when there is no usable date. */
export function timeAgo(value: Date | string | null | undefined, now = Date.now()): string {
  if (!value) return '';
  const ms = now - new Date(value).getTime();
  if (Number.isNaN(ms)) return '';
  const hours = Math.floor(Math.max(0, ms) / HOUR_MS);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function shortDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The API falls back to the uid when there is no name, so "name equals uid" is unnamed. */
export function personName(person: ChecklistPerson): string {
  return person.userName && person.userName !== person.userId
    ? person.userName
    : `Unnamed rep · ${person.userId.slice(-6)}`;
}

/** An upload waiting on management: Approve or Ask to fix. */
export function needsCheck(item: ChecklistItem): boolean {
  return item.status === 'submitted' && !item.onHold && !isEsignItem(item.itemId);
}

/** A document to sign that never went out: Send for signature. */
export function needsSending(item: ChecklistItem): boolean {
  return item.status === 'submitted' && !item.onHold && isEsignItem(item.itemId) && !item.esignEnvelopeId;
}

/** What the Check sheet lists first: the items someone on staff has to act on. */
export function isWaitingOnYou(item: ChecklistItem): boolean {
  return needsCheck(item) || needsSending(item);
}

/** When the person's oldest upload to check came in (ISO), or null. */
export function oldestUpload(person: ChecklistPerson): string | null {
  return person.items
    .filter(needsCheck)
    .map((item) => item.submittedAt)
    .reduce<string | null>((oldest, time) => (time && (!oldest || time < oldest) ? time : oldest), null);
}

/**
 * Signed, but no copy was stored: some documents signed before signing moved
 * in-house only exist in the old vendor's dashboard. A note, not an error.
 */
export function signedWithoutCopy(item: ChecklistItem): boolean {
  return (
    isEsignItem(item.itemId) &&
    item.status === 'approved' &&
    !item.hasSignedPdf &&
    !item.manualCompletion &&
    Boolean(item.esignEnvelopeId)
  );
}

/** One plain sentence saying where an item stands. */
export function itemLine(item: ChecklistItem, now = Date.now()): string {
  const by = (name: string | null) => (name ? ` by ${name}` : '');
  if (item.onHold) return 'On hold until 3C sends the real document. Nobody needs to sign it yet.';
  switch (item.status) {
    case 'approved':
      if (item.manualCompletion) return `Marked complete${by(item.manualCompletion.byName)}: ${item.manualCompletion.note}`;
      return [
        ['Approved', shortDate(item.reviewedAt)].filter(Boolean).join(' ') + by(item.reviewerName),
        signedWithoutCopy(item) ? 'signed, no stored copy' : '',
      ]
        .filter(Boolean)
        .join(' · ');
    case 'rejected':
      return `Sent back to fix${item.rejectionReason ? `: ${item.rejectionReason}` : ''}`;
    case 'submitted': {
      const ago = timeAgo(item.submittedAt, now);
      if (needsSending(item)) return 'Not sent to them for signature yet';
      if (isEsignItem(item.itemId)) return `Sent to sign${ago ? ` ${ago}` : ''} · waiting for them to sign`;
      return `Uploaded${ago ? ` ${ago}` : ''}`;
    }
    default:
      return 'Not started';
  }
}
