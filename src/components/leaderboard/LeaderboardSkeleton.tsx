import styles from './leaderboard.module.css';

/** The stage drawn empty: its band, and three block silhouettes on the floor. */
export function StageSkeleton({ className }: { className?: string }) {
  return (
    <div className={className ? `${styles.stage} ${className}` : styles.stage}>
      <div className={styles.band}>
        <span className={styles.skeletonBar} />
      </div>
      <div className={styles.stageFloor}>
        <div className={styles.skeletonPodium}>
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

/** The ranks panel drawn empty: its band and hairline-split row slots. */
export function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className={styles.rows}>
      <div className={styles.band}>
        <span className={styles.skeletonBar} />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className={styles.skeletonRow} />
      ))}
    </div>
  );
}

/** The phone page while the board loads: the same stage and panel, empty, so
 *  nothing jumps when the data lands. Nothing shimmers. */
export function LeaderboardSkeleton() {
  return (
    <div className={styles.skeleton} aria-label="Loading leaderboard" aria-busy="true">
      <StageSkeleton />
      <RowsSkeleton />
    </div>
  );
}
