import { RoleDisplayNames } from '@/types';

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
  mtdMonthlyValue: number;
  lastSale: { repName: string; at?: string } | null;
  topRep?: { repName: string; count: number } | null;
}

/** Status caption under a pending echo: upload progress for a photo, else "Sending…". */
// A failed echo's status. A photo says so: it may have been the upload that failed.
export function failedStatusLabel(message: { pendingFile?: File; photoPending?: boolean; localPreviewUrl?: string }): string {
  return message.pendingFile || message.photoPending || message.localPreviewUrl ? 'Photo not sent' : 'Not sent';
}

export function pendingStatusLabel(message: { uploadProgress?: number }): string {
  const progress = message.uploadProgress;
  if (typeof progress === 'number' && progress < 1) return `Uploading photo · ${Math.round(progress * 100)}%`;
  return 'Sending…';
}
