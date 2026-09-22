import { PodiumSlot } from './PodiumSlot';
import type { LeaderboardEntry, LeaderboardMetric } from './LeaderboardTable';
import styles from './leaderboard.module.css';

interface PodiumProps {
  entries: LeaderboardEntry[];
  metric: LeaderboardMetric;
  currentUser?: LeaderboardEntry | null;
}

export function Podium({ entries, metric, currentUser }: PodiumProps) {
  const byRank = new Map(entries.map((entry) => [entry.rank, entry]));

  return (
    <section aria-label="Top three" className={styles.podium}>
      <PodiumSlot entry={byRank.get(2)} rank={2} metric={metric} currentUser={currentUser} />
      <PodiumSlot entry={byRank.get(1)} rank={1} metric={metric} currentUser={currentUser} />
      <PodiumSlot entry={byRank.get(3)} rank={3} metric={metric} currentUser={currentUser} />
    </section>
  );
}
