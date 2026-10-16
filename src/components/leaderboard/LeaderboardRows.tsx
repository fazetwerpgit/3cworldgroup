import type { CSSProperties } from 'react';
import { Avatar } from './Avatar';
import { MetricValue } from './MetricValue';
import { PlanMixLine } from './PlanMixLine';
import type { LeaderboardEntry, LeaderboardMetric } from './LeaderboardTable';
import styles from './leaderboard.module.css';

interface LeaderboardRowsProps {
  entries: LeaderboardEntry[];
  metric: LeaderboardMetric;
  currentUser?: LeaderboardEntry | null;
  /** The team at 0, after the ranks: the same rows, quieter. */
  zeros?: LeaderboardEntry[];
}

function metricHead(metric: LeaderboardMetric) {
  return metric === 'totalPoints' ? 'Points' : 'Sales';
}

/** The ranked list below the podium: rank four down, as one scoreboard panel.
 *  The band is a <header> so the rows stay the section's only divs. */
export function LeaderboardRows({ entries, metric, currentUser, zeros = [] }: LeaderboardRowsProps) {
  const rows = [...entries, ...zeros];
  if (rows.length === 0) return null;

  return (
    <section aria-label="Ranking" className={styles.rows}>
      <header className={styles.band}>
        <h2 className={styles.bandTitle}>{rows[rows.length - 1].rank <= 4 ? 'Rank 4' : `Ranks 4 to ${rows[rows.length - 1].rank}`}</h2>
        <span className={styles.bandMeta}>{metricHead(metric)}</span>
      </header>
      {rows.map((entry, index) => {
        const isCurrentUser = entry.salesRepId === currentUser?.salesRepId;
        const isZero = zeros.includes(entry);

        return (
          <div
            key={entry.salesRepId}
            className={[
              styles.row,
              isCurrentUser ? styles.rowMine : '',
              isZero ? styles.rowZero : '',
            ].filter(Boolean).join(' ')}
            data-current-user={isCurrentUser || undefined}
            data-zero={isZero || undefined}
            style={{ '--i': index } as CSSProperties}
          >
            <span className={styles.rank}>{entry.rank}</span>
            <Avatar entry={entry} />
            <span className={styles.rowWho}>
              <strong className={styles.rowName}>
                <span>{entry.salesRepName}</span>
                {isCurrentUser ? <em>You</em> : null}
              </strong>
              <PlanMixLine mix={entry.planMix} className={styles.rowMix} />
            </span>
            <MetricValue entry={entry} metric={metric} />
          </div>
        );
      })}
    </section>
  );
}
