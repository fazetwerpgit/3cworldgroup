'use client';

import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import type { LeaderboardMetric, LeaderboardPeriod } from './LeaderboardTable';
import { periodBounds as sharedPeriodBounds } from '@/lib/leaderboard/periods';
import styles from './leaderboard.module.css';

const DAY_MS = 86_400_000;

export function periodLabel(period: LeaderboardPeriod, metric: LeaderboardMetric = 'totalPoints') {
  const subject = metric === 'totalPoints' ? 'points' : 'sales';

  if (period === 'week') return `Weekly ${subject} · resets Sunday`;
  if (period === 'month') return `Monthly ${subject} · resets on the 1st`;
  if (period === 'year') return `Yearly ${subject} · resets Jan 1`;
  return `All-time ${subject}`;
}

/** The stage band's short sport head: set in Bebas, so a few words only. */
export function periodTitle(period: LeaderboardPeriod) {
  if (period === 'week') return 'This week';
  if (period === 'month') return 'This month';
  if (period === 'year') return 'This year';
  return 'All time';
}

export function periodBounds(period: LeaderboardPeriod, now = new Date()) {
  return sharedPeriodBounds(period, now);
}

export function formatCountdown(period: LeaderboardPeriod, now = new Date()) {
  const bounds = periodBounds(period, now);
  if (!bounds) return null;

  const remainingMs = Math.max(0, bounds.end.getTime() - now.getTime());
  const days = Math.floor(remainingMs / DAY_MS);
  const hours = Math.floor((remainingMs % DAY_MS) / 3_600_000);

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;
  return 'Under 1h left';
}

export function PeriodCountdown({ period }: { period: LeaderboardPeriod }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const label = formatCountdown(period, now);
  if (!label) return null;

  const duration = label.replace(' left', '');
  const isUnderOneHour = duration.startsWith('Under ');
  const accentedDuration = isUnderOneHour ? duration.slice('Under '.length) : duration;

  return (
    <span className={styles.countdown} aria-label={`Period ends in ${label.replace(' left', '')}`}>
      <Clock3 size={14} aria-hidden="true" />
      <span className={styles.countdownText}>
        {isUnderOneHour ? 'Under ' : null}
        <span className={styles.countdownValue}>{accentedDuration}</span>
        {' left'}
      </span>
    </span>
  );
}
