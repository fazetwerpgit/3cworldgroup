import type { ReactNode } from 'react';
import type { LeaderboardPeriod } from './LeaderboardTable';
import { PeriodCountdown, periodTitle } from './PeriodCountdown';
import styles from './leaderboard.module.css';

/** The panel the podium stands on: a well band with the period and its clock,
 *  then the floor. `footer` adds a band under the floor (the desktop's board
 *  facts); `className` lets the desktop grid place it. */
export function LeaderboardStage({
  period,
  children,
  footer,
  className,
}: {
  period: LeaderboardPeriod;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `${styles.stage} ${className}` : styles.stage}>
      <div className={styles.band}>
        <h2 className={styles.bandTitle}>{periodTitle(period)}</h2>
        <PeriodCountdown period={period} />
      </div>
      <div className={styles.stageFloor}>{children}</div>
      {footer}
    </div>
  );
}
