import type { ReactNode } from 'react';
import type { LeaderboardPeriod } from './LeaderboardTable';
import type { MonthKey } from '@/lib/sales/monthWindow';
import { PeriodCountdown, periodTitle } from './PeriodCountdown';
import styles from './leaderboard.module.css';

/** The panel the podium stands on: a well band with the period and its clock
 *  (a past month is closed, so it has no clock), then the floor. `footer` adds a band under the floor (the desktop's board
 *  facts); `className` lets the desktop grid place it. */
export function LeaderboardStage({
  period,
  pastMonth = null,
  children,
  footer,
  className,
}: {
  period: LeaderboardPeriod;
  pastMonth?: MonthKey | null;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `${styles.stage} ${className}` : styles.stage}>
      <div className={styles.band}>
        <h2 className={styles.bandTitle}>{periodTitle(period, pastMonth)}</h2>
        {pastMonth ? null : <PeriodCountdown period={period} />}
      </div>
      <div className={styles.stageFloor}>{children}</div>
      {footer}
    </div>
  );
}
