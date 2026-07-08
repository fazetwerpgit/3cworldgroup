export type NotificationType =
  | 'sale_approved'
  | 'sale_rejected'
  | 'sale_pending'
  | 'points_earned'
  | 'leaderboard_rank'
  | 'onboarding_submitted'
  | 'onboarding_approved'
  | 'onboarding_rejected'
  | 'announcement'
  | 'system'
  | 'onboarding_nudge'
  | 'esign_completed'
  | 'activation_ready'
  | 'rep_activated'
  | 'pending_assignment'
  | 'alert_task';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  link?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface NotificationPreferences {
  saleApprovals: boolean;
  pointsUpdates: boolean;
  leaderboardUpdates: boolean;
  announcements: boolean;
}

export const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  sale_approved: 'bg-green-50 text-green-700',
  sale_rejected: 'bg-red-50 text-red-700',
  sale_pending: 'bg-yellow-50 text-yellow-700',
  points_earned: 'bg-purple-50 text-purple-700',
  leaderboard_rank: 'bg-blue-50 text-blue-700',
  onboarding_submitted: 'bg-blue-50 text-blue-700',
  onboarding_approved: 'bg-green-50 text-green-700',
  onboarding_rejected: 'bg-red-50 text-red-700',
  announcement: 'bg-orange-50 text-orange-700',
  system: 'bg-gray-50 text-gray-700',
  onboarding_nudge: 'bg-blue-50 text-blue-700',
  esign_completed: 'bg-blue-50 text-blue-700',
  activation_ready: 'bg-blue-50 text-blue-700',
  rep_activated: 'bg-blue-50 text-blue-700',
  pending_assignment: 'bg-blue-50 text-blue-700',
  alert_task: 'bg-orange-50 text-orange-700',
};
