export type NotificationType =
  | 'sale_approved'
  | 'sale_rejected'
  | 'sale_pending'
  | 'points_earned'
  | 'leaderboard_rank'
  | 'announcement'
  | 'system';

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

export const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  sale_approved: '✅',
  sale_rejected: '❌',
  sale_pending: '⏳',
  points_earned: '⭐',
  leaderboard_rank: '🏆',
  announcement: '📢',
  system: '🔔',
};

export const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  sale_approved: 'bg-green-50 text-green-700',
  sale_rejected: 'bg-red-50 text-red-700',
  sale_pending: 'bg-yellow-50 text-yellow-700',
  points_earned: 'bg-purple-50 text-purple-700',
  leaderboard_rank: 'bg-blue-50 text-blue-700',
  announcement: 'bg-orange-50 text-orange-700',
  system: 'bg-gray-50 text-gray-700',
};
