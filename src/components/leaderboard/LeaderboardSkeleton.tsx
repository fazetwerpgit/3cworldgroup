import styles from './leaderboard.module.css';

export function LeaderboardSkeleton() {
  return (
    <div className={styles.skeleton} aria-label="Loading leaderboard" aria-busy="true">
      <div className={styles.skeletonPodium}>
        <span />
        <span />
        <span />
      </div>
      <div className={styles.skeletonRows}>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
