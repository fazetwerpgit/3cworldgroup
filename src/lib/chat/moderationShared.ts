// Team chat moderation, the parts both the browser and the server use: report
// reasons, id rules and the review path. No server imports here, so client
// components can take them; src/lib/chat/moderation.ts re-exports all of it.

export const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam',
  harassment: 'Harassment or bullying',
  inappropriate: 'Inappropriate content',
  other: 'Something else',
};

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);
}

/** Longest free-text note a reporter may add. */
export const REPORT_DETAILS_MAX = 500;

/** Firestore doc ids and uids the moderation routes accept: no slashes, bounded. */
export function isSafeDocId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/') && value !== '.' && value !== '..';
}

/** One report per person per message. */
export function chatReportId(messageId: string, reporterUid: string): string {
  return `${messageId}_${reporterUid}`;
}

/** Where the back office reviews reports. */
export const CHAT_REPORTS_PATH = '/portal/admin/chat-reports';

/**
 * Whether a report's signed upload link (attachmentExpiresAt from the queue
 * API) has stopped working. A null expiry is a link that is not signed.
 */
export function reportLinkExpired(expiresAt: string | null, now = Date.now()): boolean {
  if (!expiresAt) return false;
  const at = Date.parse(expiresAt);
  return !Number.isNaN(at) && now >= at;
}
