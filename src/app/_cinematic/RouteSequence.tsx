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
    at: "0.05",
    atSm: "0.11",
    x: "9.17%",
    y: "63.8%",
    side: "below" as const,
  },
  {
    n: "02",
    title: "Talk it through",
    body: "A real conversation about the role, the products, and whether the work fits you.",
    at: "0.27",
    atSm: "0.37",
    x: "29.17%",
    y: "37.2%",
    side: "above" as const,
  },
  {
    n: "03",
    title: "Train",
    body: "Learn the products and the sales process, with hands-on coaching from people who sell them.",
    at: "0.53",
    atSm: "0.63",
    x: "54.17%",
    y: "63.8%",
    side: "below" as const,
  },
  {
    n: "04",
    title: "Work your first route",
    body: "Out in a neighborhood with your team, with support in the field and not just in a classroom.",
    at: "0.79",
    atSm: "0.89",
    x: "79.17%",
    y: "37.2%",
    side: "above" as const,
  },
];

const WIDE_PATH =
  "M 30 300 H 170 Q 200 300 200 270 V 205 Q 200 175 230 175 H 470 Q 500 175 500 205 V 270 " +
  "Q 500 300 530 300 H 770 Q 800 300 800 270 V 205 Q 800 175 830 175 H 1070 Q 1100 175 1100 205 " +
  "V 270 Q 1100 300 1130 300 H 1170";

const STACKED_PATH =
  "M 18 6 V 150 Q 18 176 38 176 V 300 Q 38 326 18 326 V 470 Q 18 496 38 496 V 634";

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
    </div>
  );
}
