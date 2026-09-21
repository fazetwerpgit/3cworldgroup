import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { APPLY_HREF } from "../../_cinematic/nav";
import kit from "../../_cinematic/cinematic.module.css";
import styles from "../cinematic-home.module.css";

/**
 * The signature moment: a route drawn the way a rep actually walks one — down a
 * street, turn, down the next. Both paths carry `pathLength="1"`, so the draw
 * is a single `stroke-dashoffset: calc(1 - var(--route-progress))` with no
 * measurement in JavaScript; MotionRoot only supplies the number.
 *
 * Two paths exist because a horizontal route and a vertical route are different
 * drawings, not one drawing stretched. The labels are a single ordered list,
 * repositioned by CSS, so the sequence is read once by assistive tech.
 */
const STOPS = [
  {
    n: "01",
    title: "Apply",
    body: "A short application online. Tell us where you want to work and how to reach you.",
    // Fractions of each path's length, so a stop lands exactly as the line
    // reaches it. `at` is the wide route, `atSm` the stacked one.
    at: "0.01",
    atSm: "0.01",
    x: "9.833%",
    y: "63.83%",
    side: "below" as const,
    cap: "start" as const,
  },
  {
    n: "02",
    title: "Talk it through",
    body: "A real conversation about the role, the products, and whether the work fits you.",
    at: "0.305",
    atSm: "0.333",
    x: "32.5%",
    y: "37.23%",
    side: "above" as const,
    cap: undefined,
  },
  {
    n: "03",
    title: "Train",
    body: "Learn the products and the sales process, with hands-on coaching from people who sell them.",
    at: "0.64",
    atSm: "0.667",
    x: "58.333%",
    y: "63.83%",
    side: "below" as const,
    cap: undefined,
  },
  {
    n: "04",
    title: "Work your first route",
    body: "Out in a neighborhood with your team, with support in the field and not just in a classroom.",
    at: "0.96",
    atSm: "0.96",
    x: "86.667%",
    y: "37.23%",
    side: "above" as const,
    cap: "end" as const,
  },
];

/*
 * Both paths now begin on stop 01 and end on stop 04 — no stub running off into
 * empty canvas at either end. The wide route is four blocks walked with rounded
 * 90-degree corners; the stops sit exactly on it, which is why the `at`
 * fractions above are measured against these very coordinates and have to be
 * recomputed if a corner moves.
 */
const WIDE_PATH =
  "M 118 300 H 300 Q 330 300 330 270 V 205 Q 330 175 360 175 H 640 Q 670 175 670 205 V 270 " +
  "Q 670 300 700 300 H 950 Q 980 300 980 270 V 205 Q 980 175 1010 175 H 1040";

const STACKED_PATH = "M 18 80 V 214 Q 18 240 38 240 V 374 Q 38 400 18 400 V 534 Q 18 560 38 560";

export default function RouteSequence() {
  return (
    <div className={styles.route}>
      <svg
        className={styles.routeSvgWide}
        viewBox="0 0 1200 470"
        fill="none"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
      >
        <path d={WIDE_PATH} className={styles.routeGhost} pathLength={1} />
        <path d={WIDE_PATH} className={styles.routeLine} pathLength={1} />
      </svg>

      <svg
        className={styles.routeSvgStacked}
        viewBox="0 0 56 640"
        fill="none"
        aria-hidden="true"
        preserveAspectRatio="xMinYMin meet"
      >
        <path d={STACKED_PATH} className={styles.routeGhost} pathLength={1} />
        <path d={STACKED_PATH} className={styles.routeLine} pathLength={1} />
      </svg>

      <ol className={styles.routeStops}>
        {STOPS.map((stop) => (
          <li
            key={stop.n}
            className={styles.routeStop}
            data-stop
            data-at={stop.at}
            data-at-sm={stop.atSm}
            data-side={stop.side}
            data-cap={stop.cap}
            style={{ "--stop-x": stop.x, "--stop-y": stop.y } as React.CSSProperties}
          >
            <span className={styles.routeDot} aria-hidden="true" />
            <span className={styles.routeStopCard}>
              <span className={styles.routeStopNumber}>{stop.n}</span>
              <span className={styles.routeStopTitle}>{stop.title}</span>
              <span className={styles.routeStopBody}>{stop.body}</span>
            </span>
          </li>
        ))}
      </ol>

      {/*
        The drawn line finishes in the bottom right of the canvas, so that is
        where the step the whole sequence describes belongs. On the stacked
        layout it rejoins the flow underneath the last stop.
      */}
      <div className={styles.routeEnd}>
        <p className={styles.routeEndKind}>Ready to get started?</p>
        <p className={styles.routeEndBody}>Everything above starts with one application.</p>
        <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime}`}>
          Apply
          <ArrowRight aria-hidden="true" className={kit.btnArrow} size={17} strokeWidth={2.2} />
        </Link>
      </div>
    </div>
  );
}
