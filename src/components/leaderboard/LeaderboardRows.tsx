import { Avatar } from './Avatar';
import { MetricValue } from './MetricValue';
import type { LeaderboardEntry, LeaderboardMetric } from './LeaderboardTable';
import styles from './leaderboard.module.css';

interface LeaderboardRowsProps {
  entries: LeaderboardEntry[];
  metric: LeaderboardMetric;
  currentUser?: LeaderboardEntry | null;
}

function metricHead(metric: LeaderboardMetric) {
  return metric === 'totalPoints' ? 'Points' : 'Sales';
}

/** The ranked list below the podium: rank four down, as one scoreboard panel.
 *  The band is a <header> so the rows stay the section's only divs. */
export function LeaderboardRows({ entries, metric, currentUser }: LeaderboardRowsProps) {
  if (entries.length === 0) return null;

  return (
    <section aria-label="Ranking" className={styles.rows}>
      <header className={styles.band}>
        <h2 className={styles.bandTitle}>Ranks 4–{entries[entries.length - 1].rank}</h2>
        <span className={styles.bandMeta}>{metricHead(metric)}</span>
      </header>
      {entries.map((entry) => {
        const isCurrentUser = entry.salesRepId === currentUser?.salesRepId;

        return (
          <div
            key={entry.salesRepId}
            className={`${styles.row} ${isCurrentUser ? styles.rowMine : ''}`}
            data-current-user={isCurrentUser || undefined}
          >
            <span className={styles.rank}>{String(entry.rank).padStart(2, '0')}</span>
            <Avatar entry={entry} />
            <strong className={styles.rowName}>
              <span>{entry.salesRepName}</span>
              {isCurrentUser ? <em>You</em> : null}
            </strong>
            <MetricValue entry={entry} metric={metric} />
          </div>
        );
      })}
    </section>
  );
}
