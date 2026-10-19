import { CalendarCheck, Handshake, Zap } from 'lucide-react';
import {
  formatLeaderboardValue,
  leaderboardUnit,
  leaderboardValue,
  type LeaderboardEntry,
  type LeaderboardMetric,
} from './LeaderboardTable';
import styles from './leaderboard.module.css';

/** The score, then its glyph: a bolt for points, a handshake for closed sales,
 *  a calendar check for booked consults (the solar board).
 *  The unit still reaches screen readers as a word. */
export function MetricValue({
  entry,
  metric,
  size = 'row',
}: {
  entry: LeaderboardEntry;
  metric: LeaderboardMetric;
  size?: 'row' | 'podium';
}) {
  const isPoints = metric === 'totalPoints';
  const Glyph = isPoints ? Zap : metric === 'bookedConsults' ? CalendarCheck : Handshake;
  const glyphClass = isPoints
    ? `${styles.metricGlyph} ${styles.metricGlyphFilled}`
    : styles.metricGlyph;

  return (
    <span className={size === 'podium' ? styles.podiumPoints : styles.rowPoints}>
      {formatLeaderboardValue(leaderboardValue(entry, metric))}
      <Glyph className={glyphClass} aria-hidden="true" />
      <span className={styles.srOnly}>{leaderboardUnit(metric)}</span>
    </span>
  );
}
