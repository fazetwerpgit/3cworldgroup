export type AlertTaskKind =
  | 'review_needed'
  | 'stalled_rep'
  | 'pending_assignment'
  | 'activation_ready'
  // A completed e-signature arrived for an envelope we have no record of.
  // Deliberately NOT review_needed: alert tasks dedupe on (kind, subjectUserId),
  // and a successful e-sign dispatch resolves every open review_needed task for
  // that rep, which would swallow or silently close this one.
  | 'esign_mismatch';

export type AlertTaskStatus = 'open' | 'claimed' | 'resolved';

export interface AlertTask {
  id: string;
  kind: AlertTaskKind;
  subjectUserId: string;
  subjectName: string;
  title: string;
  message: string;
  link: string;
  status: AlertTaskStatus;
  claimedBy?: string;
  claimedByName?: string;
  claimedAt?: Date;
  resolvedAt?: Date;
  lastNaggedAt?: Date;
  createdAt: Date;
}
