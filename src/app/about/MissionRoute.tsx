"use client";

import * as React from "react";

import { US_MAP_HEIGHT, US_MAP_WIDTH } from "@/components/art/usMapPaths";

type Pt = { x: number; y: number; r: number };

type Geom = { w: number; h: number; origin: { x: number; y: number }; targets: Pt[] };

export type MissionRouteProps = {
  className?: string;
  pathClassName?: string;
  /** Route origin, in the US map's own coordinate space (0-975 / 0-610). */
  originX: number;
  originY: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The green route that leaves the map and runs through the three value marks.
 *
 * Every coordinate is measured from the live DOM, and the viewBox is the host
 * element's own pixel box, so one SVG unit is always one CSS pixel of the
 * band. The line therefore lands on the map node and on the value circles at
 * any viewport width and any browser zoom, with no shared magic numbers.
 */
function buildRoute(g: Geom): string {
  const first = g.targets[0];
  const last = g.targets[g.targets.length - 1];
  const y = first.y;
  const o = g.origin;
  const dy = y - o.y;

  // Descent from the map node: an S-curve that arrives vertically on the last
  // value mark, so the join reads as one continuous line.
  const descent =
    `M${r2(o.x)} ${r2(o.y)}` +
    `C${r2(o.x)} ${r2(o.y + dy * 0.55)} ${r2(last.x)} ${r2(y - dy * 0.5)} ${r2(last.x)} ${r2(y)}`;

  // Spine between the outer edges of the first and last marks. It never runs
  // past them, so the rail reads as a link between the three C's only.
  const spine = `M${r2(first.x - first.r)} ${r2(y)}H${r2(last.x + last.r)}`;

  return `${descent}${spine}`;
}

export default function MissionRoute({
  className,
  pathClassName,
  originX,
  originY,
}: MissionRouteProps) {
  const ref = React.useRef<SVGSVGElement | null>(null);
  const [geom, setGeom] = React.useState<Geom | null>(null);

  React.useLayoutEffect(() => {
    const svg = ref.current;
    const host = svg?.parentElement;
    if (!svg || !host) return;

    let frame = 0;

    const measure = () => {
      const hostRect = host.getBoundingClientRect();
      const map = host.querySelector<HTMLElement>("[data-mission-map]");
      const marks = Array.from(
        host.querySelectorAll<HTMLElement>("[data-route-node]"),
      );
      if (!map || marks.length < 2 || hostRect.width < 1) {
        setGeom(null);
        return;
      }

      const m = map.getBoundingClientRect();
      if (m.width < 1 || m.height < 1) {
        setGeom(null);
        return;
      }

      const origin = {
        x: m.left - hostRect.left + (originX / US_MAP_WIDTH) * m.width,
        y: m.top - hostRect.top + (originY / US_MAP_HEIGHT) * m.height,
      };

      const targets = marks.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          x: r.left - hostRect.left + r.width / 2,
          y: r.top - hostRect.top + r.height / 2,
          r: r.width / 2,
        };
      });

      // Stacked (narrow) layout: a single horizontal spine makes no sense.
      const ys = targets.map((p) => p.y);
      if (Math.max(...ys) - Math.min(...ys) > 8) {
        setGeom(null);
        return;
      }

      setGeom({ w: hostRect.width, h: hostRect.height, origin, targets });
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();

    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    const map = host.querySelector("[data-mission-map]");
    if (map) ro.observe(map);
    host.querySelectorAll("[data-route-node]").forEach((el) => ro.observe(el));

    window.addEventListener("resize", schedule);
    if (document.fonts?.ready) void document.fonts.ready.then(schedule);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [originX, originY]);

  return (
    <svg
      ref={ref}
      className={className}
      viewBox={geom ? `0 0 ${r2(geom.w)} ${r2(geom.h)}` : "0 0 1 1"}
      aria-hidden="true"
      focusable="false"
      style={geom ? undefined : { visibility: "hidden" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {geom ? (
        <>
          <path className={pathClassName} d={buildRoute(geom)} />
          {geom.targets.map((p, i) => (
            <circle key={i} cx={r2(p.x)} cy={r2(p.y)} r={7} />
          ))}
        </>
      ) : null}
    </svg>
  );
}
