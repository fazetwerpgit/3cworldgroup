export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'all_time';
export type CompetitionStatus = 'upcoming' | 'active' | 'completed';
export type CompetitionMetric = 'sales_count' | 'sales_value' | 'commission';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  avatarUrl?: string;
  territoryName?: string;
  totalSales: number;
  totalValue: number;
  totalCommission: number;
  change: number; // Position change from previous period (positive = moved up)
}

export interface Competition {
  id: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  prizeDescription: string;
  metric: CompetitionMetric;
  status: CompetitionStatus;
  participants: string[]; // User IDs
  winners?: {
    first: string;
    second?: string;
    third?: string;
  };
  createdBy: string;
  createdAt: Date;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  criteria: {
    metric: string;
    threshold: number;
  };
}

export interface UserAchievement {
  id: string;
  userId: string;
  achievementId: string;
  earnedAt: Date;
}

export const LeaderboardPeriodConfig: Record<LeaderboardPeriod, { name: string; shortName: string }> = {
  daily: { name: 'Today', shortName: 'Day' },
  weekly: { name: 'This Week', shortName: 'Week' },
  monthly: { name: 'This Month', shortName: 'Month' },
  quarterly: { name: 'This Quarter', shortName: 'Quarter' },
  yearly: { name: 'This Year', shortName: 'Year' },
  all_time: { name: 'All Time', shortName: 'All' },
};

export const CompetitionMetricConfig: Record<CompetitionMetric, { name: string; format: (value: number) => string }> = {
  sales_count: { name: 'Total Sales', format: (v) => `${v} sales` },
  sales_value: { name: 'Sales Value', format: (v) => `$${v.toLocaleString()}` },
  commission: { name: 'Commission Earned', format: (v) => `$${v.toLocaleString()}` },
};
