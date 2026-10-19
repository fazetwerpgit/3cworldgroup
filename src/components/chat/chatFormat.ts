import { isPdfFile } from '@/components/chat/attachmentUpload';
import { RoleDisplayNames, type ChatAttachment } from '@/types';

/** "9:14 AM": message stamps sit under a day divider, so the date is already on screen. */
export function clockTime(date: Date | null): string {
  if (!date) return 'Just now';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Display name for a stored author role. Only rendered for admins: role labels
 *  carry comp tiers, manager titles and IBO levels, which reps never see. */
export function roleLabel(role: string): string {
  return RoleDisplayNames[role as keyof typeof RoleDisplayNames] ?? role.replace(/_/g, ' ');
}

/** The All Company line, from /api/portal/sales/company-stats. */
// GET /api/portal/sales/company-stats (see lib/sales/companyTape). `at` and
// topRep are optional so an older deployment's response still renders.
export interface CompanyStats {
  mtdCount: number;
  /** Owners only; the tape never shows it. */
  mtdMonthlyValue?: number;
  lastSale: { repName: string; at?: string } | null;
  topRep?: { repName: string; count: number } | null;
}

/** The picked file's name, type and size, kept with a restored echo whose file
 *  is still in the device outbox, so it can be shown as a file before it loads. */
export interface PendingFileInfo {
  name: string;
  type: string;
  size?: number;
}

type AttachmentEcho = {
  attachment?: ChatAttachment;
  pendingFile?: File;
  pendingFileInfo?: PendingFileInfo;
};

/** True when a pending echo carries a PDF rather than a photo. */
export function isPdfEcho(message: AttachmentEcho): boolean {
  if (message.attachment) return message.attachment.type === 'file';
  const file = message.pendingFile ?? message.pendingFileInfo;
  return !!file && isPdfFile(file);
}

/** Status caption under a pending echo: upload progress for a photo or PDF, else "Sending…". */
// A failed echo's status. A photo or PDF says so: it may have been the upload that failed.
export function failedStatusLabel(
  message: AttachmentEcho & { photoPending?: boolean; localPreviewUrl?: string }
): string {
  if (isPdfEcho(message)) return 'PDF not sent';
  return message.pendingFile || message.photoPending || message.localPreviewUrl ? 'Photo not sent' : 'Not sent';
}

/** A restored attachment whose file is gone from the device outbox. */
export function lostStatusLabel(message: AttachmentEcho): string {
  return isPdfEcho(message) ? 'PDF not sent' : 'Photo not sent';
}

export function pendingStatusLabel(message: AttachmentEcho & { uploadProgress?: number }): string {
  const progress = message.uploadProgress;
  if (typeof progress === 'number' && progress < 1) {
    return `Uploading ${isPdfEcho(message) ? 'PDF' : 'photo'} · ${Math.round(progress * 100)}%`;
  }
  return 'Sending…';
}
