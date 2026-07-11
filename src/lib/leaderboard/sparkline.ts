// Maps a 7-slot rank series (nulls = unranked) onto SVG polyline/dot
// geometry. Rank 1 is BEST, so y is inverted: smaller rank -> smaller y.

export interface SparklineGeometry {
  polylines: string[];
  dots: { x: number; y: number }[];
}

export function sparklineGeometry(
  spark: (number | null)[],
  width = 64,
  height = 20,
  pad = 3,
): SparklineGeometry {
  const values = spark.filter((v): v is number => v !== null);
  if (values.length === 0 || spark.length < 2) return { polylines: [], dots: [] };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => pad + (i * (width - pad * 2)) / (spark.length - 1);
  const y = (rank: number) =>
    max === min ? height / 2 : pad + ((rank - min) * (height - pad * 2)) / (max - min);

  const polylines: string[] = [];
  const dots: { x: number; y: number }[] = [];
  let run: { x: number; y: number }[] = [];

  const flush = () => {
    if (run.length >= 2) {
      polylines.push(run.map((p) => `${p.x},${p.y}`).join(' '));
    } else if (run.length === 1) {
      dots.push(run[0]);
    }
    run = [];
  };

  spark.forEach((v, i) => {
    if (v === null) flush();
    else run.push({ x: x(i), y: y(v) });
  });
  flush();

  return { polylines, dots };
}
