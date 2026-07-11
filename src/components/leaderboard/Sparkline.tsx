import { sparklineGeometry } from '@/lib/leaderboard/sparkline';

// 7-day rank trend. Line going up = climbing (rank axis is inverted in the
// geometry helper). Nulls (unranked days) break the line into segments.
export function Sparkline({ spark, mine }: { spark: (number | null)[]; mine?: boolean }) {
  const { polylines, dots } = sparklineGeometry(spark);
  if (polylines.length === 0 && dots.length === 0) {
    return <span aria-hidden="true" className="text-[10px] font-semibold text-slate-300 dark:text-muted-foreground">--</span>;
  }
  return (
    <svg
      width={64}
      height={20}
      viewBox="0 0 64 20"
      aria-hidden="true"
      className={mine ? 'text-[#5f8f20] dark:text-[#8dc63f]' : 'text-slate-400 dark:text-slate-500'}
    >
      {polylines.map((points, index) => (
        <polyline
          key={index}
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
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
