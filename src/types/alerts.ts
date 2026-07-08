export type AlertTaskKind =
  | 'review_needed'
  | 'stalled_rep'
  | 'pending_assignment'
  | 'activation_ready';

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
