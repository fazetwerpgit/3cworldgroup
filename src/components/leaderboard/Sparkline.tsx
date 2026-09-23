import { sparklineGeometry } from '@/lib/leaderboard/sparkline';
import desk from './leaderboard-desk.module.css';

/** A rep's 7-day rank trend. Line going up = climbing (the geometry helper
 *  inverts the rank axis); nulls (unranked days) break the line. A flat or
 *  broken line is muted so the reps actually moving stand out; your own line
 *  is lime. */
export function Sparkline({ spark, mine }: { spark: (number | null)[]; mine?: boolean }) {
  const { polylines, dots } = sparklineGeometry(spark, 96, 27, 3);
  const values = spark.filter((value): value is number => value !== null);
  const muted = !mine && (polylines.length > 1 || (values.length > 1 && new Set(values).size === 1));

  if (polylines.length === 0 && dots.length === 0) {
    return <span aria-hidden="true" className={desk.none}>—</span>;
  }

  const tone = mine ? desk.sparkMine : muted ? desk.sparkMuted : desk.spark;

  return (
    <svg width={96} height={27} viewBox="0 0 96 27" aria-hidden="true" className={tone}>
      {polylines.map((points, index) => (
        <polyline
          key={index}
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {dots.map((dot, index) => (
        <circle key={index} cx={dot.x} cy={dot.y} r={1.5} fill="currentColor" />
      ))}
    </svg>
  );
}
