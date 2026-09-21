import Image from "next/image";
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
    art: "/redesign/cinematic/route-apply-dusk-960.webp",
    title: "Apply",
    body: "A short application online. Tell us where you want to work and how to reach you.",
    // Fractions of each path's length, so a stop lands exactly as the line
    // reaches it. `at` is the wide route, `atSm` the stacked one.
    at: "0.01",
    atSm: "0.01",
    x: "12.5%",
    y: "63.83%",
    side: "below" as const,
    cap: "start" as const,
  },
  {
    n: "02",
    art: "/redesign/cinematic/route-talk-dusk-960.webp",
    title: "Talk it through",
    body: "A real conversation about the role, the products, and whether the work fits you.",
    at: "0.333",
    atSm: "0.333",
    x: "37.5%",
    y: "37.23%",
    side: "above" as const,
    cap: undefined,
  },
  {
    n: "03",
    art: "/redesign/cinematic/route-train-dusk-960.webp",
    title: "Train",
    body: "Learn the products and the sales process, with hands-on coaching from people who sell them.",
    at: "0.667",
    atSm: "0.667",
    x: "62.5%",
    y: "63.83%",
    side: "below" as const,
    cap: undefined,
  },
  {
    n: "04",
    art: "/redesign/cinematic/route-walk-dusk-960.webp",
    title: "Work your first route",
    body: "Out in a neighborhood with your team, with support in the field and not just in a classroom.",
    at: "0.98",
    atSm: "0.96",
    x: "87.5%",
    y: "37.23%",
    side: "above" as const,
    cap: "end" as const,
  },
];

/*
 * Each stop also carries a photograph. On the wide route it is the same
 * 14rem column as the copy, centred on the same dot, on the other side of
 * the line: above the road for 01 and 03, below it for 02 and 04. One anchor
 * rule for all four — the line was redrawn so its corners clear those
 * columns, rather than the photos being nudged to clear the line. Stacked,
 * the same photo sits under its copy.
 */

/*
 * Both paths begin on stop 01 and end on stop 04 — no stub running off into
 * empty canvas at either end. The wide route is four blocks walked with rounded
 * 90-degree corners. The stops sit at 150/450/750/1050, the corners at
 * 300/600/900: every stop is 150 canvas units from the nearest vertical, so a
 * 14rem column centred on it (7rem = 112px at the 1200 canvas, 100px at the
 * narrow-desktop 12.5rem) clears the line on both sides. The `at` fractions
 * above are measured against these coordinates (total length ≈ 1197: 02 at
 * 399, 03 at 798) and have to be recomputed if a corner moves.
 */
const WIDE_PATH =
  "M 150 300 H 270 Q 300 300 300 270 V 205 Q 300 175 330 175 H 570 Q 600 175 600 205 V 270 " +
  "Q 600 300 630 300 H 870 Q 900 300 900 270 V 205 Q 900 175 930 175 H 1050";

/*
 * The stacked line is a straight rail: the above/below alternation means
 * something on a horizontal route and nothing on a vertical one. It is
 * stretched to the height of the four rows beside it (preserveAspectRatio
 * "none"), so the stops land 12.5% into each row — on the row's title, above
 * its photograph — whatever the photos make the rows; non-scaling-stroke
 * keeps the line 4px through it. Stops at 20/180/340/500 of 520: thirds.
 */
const STACKED_PATH = "M 18 20 V 500";

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
        preserveAspectRatio="none"
      >
        {/*
          No vector-effect here. non-scaling-stroke resolves the dash pattern in
          device pixels, which throws away the pathLength={1} normalisation the
          draw depends on: the phone rail rendered in three broken pieces at
          progress 1. The stroke does not need it either: the svg is 56 CSS px
          wide for a 56-unit viewBox, so the horizontal scale, the one a
          vertical stroke's width lives in, is exactly 1 even with
          preserveAspectRatio="none".
        */}
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
              <span className={styles.routeStopTitle}>{stop.title}</span>
              <span className={styles.routeStopBody}>{stop.body}</span>
              <span className={styles.routeStopArtSm} aria-hidden="true">
                <Image src={stop.art} alt="" fill sizes="(max-width: 900px) 100vw, 1px" />
              </span>
            </span>
          </li>
        ))}
      </ol>

      {/*
        The wide layout's photographs, one per bay. They are outside the list
        so the sequence is still read once; the photos say nothing the copy
        does not.
      */}
      <div className={styles.routeArt} aria-hidden="true">
        {STOPS.map((stop) => (
          <span
            key={stop.n}
            className={`${styles.routeArtItem} ${kit.revealRise}`}
            data-reveal
            data-side={stop.side}
            style={{ "--stop-x": stop.x, "--stop-y": stop.y } as React.CSSProperties}
          >
            <Image src={stop.art} alt="" fill sizes="(max-width: 900px) 1px, 16vw" />
          </span>
        ))}
      </div>
    </div>
  );
}
