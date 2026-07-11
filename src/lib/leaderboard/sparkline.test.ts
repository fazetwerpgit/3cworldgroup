import { describe, expect, it } from 'vitest';
import { sparklineGeometry } from './sparkline';

const pointsOf = (polyline: string) =>
  polyline.split(' ').map((pair) => pair.split(',').map(Number) as [number, number]);

describe('sparklineGeometry', () => {
  it('returns empty geometry for all-null or empty input', () => {
    expect(sparklineGeometry([])).toEqual({ polylines: [], dots: [] });
    expect(sparklineGeometry([null, null, null])).toEqual({ polylines: [], dots: [] });
  });

  it('better rank (1) sits ABOVE worse rank (5): smaller y', () => {
    const { polylines } = sparklineGeometry([5, 1]);
    const [[, yWorse], [, yBest]] = pointsOf(polylines[0]);
    expect(yBest).toBeLessThan(yWorse);
  });

  it('a constant rank draws a flat mid-height line', () => {
    const { polylines } = sparklineGeometry([2, 2, 2]);
    const ys = pointsOf(polylines[0]).map(([, y]) => y);
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBe(10); // height 20 / 2
  });

  it('nulls split the line and isolated points become dots', () => {
    const { polylines, dots } = sparklineGeometry([1, 2, null, 3, null, 4, 4]);
    expect(polylines).toHaveLength(2); // [1,2] and [4,4]
    expect(dots).toHaveLength(1); // the isolated 3
  });

  it('x spans pad..width-pad across the 7 slots', () => {
    const { polylines } = sparklineGeometry([1, 1, 1, 1, 1, 1, 2], 64, 20, 3);
    const pts = pointsOf(polylines[0]);
    expect(pts[0][0]).toBe(3);
    expect(pts[6][0]).toBe(61);
  });
});
