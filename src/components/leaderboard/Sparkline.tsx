import { sparklineGeometry } from '@/lib/leaderboard/sparkline';

// 7-day rank trend. Line going up = climbing (rank axis is inverted in the
// geometry helper). Nulls (unranked days) break the line into segments.
export function Sparkline({ spark, mine }: { spark: (number | null)[]; mine?: boolean }) {
  const { polylines, dots } = sparklineGeometry(spark, 96, 27, 3);
  if (polylines.length === 0 && dots.length === 0) {
    return <span aria-hidden="true" className="text-[10px] font-semibold text-slate-300 dark:text-muted-foreground">--</span>;
  }
  return (
    <svg
      width={96}
      height={27}
      viewBox="0 0 96 27"
      aria-hidden="true"
      className={mine ? 'text-white dark:text-[#0A1F44]' : 'text-[#8dc63f] dark:text-[#d1d8e1]'}
    >
      {polylines.map((points, index) => (
        <polyline
          key={index}
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
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
