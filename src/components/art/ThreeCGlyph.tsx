import * as React from "react";

export const GLYPH_NAVY = "#0B1F3A";
export const GLYPH_GREEN = "#8DC63F";
export const GLYPH_OFF_WHITE = "#F2F4F7";

/**
 * "3C" letterforms, traced from the brand lockup art
 * (public/redesign/about-hero-lock-art-hd.png). Condensed, heavy, back-slanted
 * numerals with chamfered corners. Drawn with fill-rule="evenodd" so the
 * counters read as holes. Coordinate space: 1000 x 773.
 */
export const THREE_C_PATH =
  "M238.3 0L499.2 0L552.3 59.6L497.6 299.5L428.3 360.7L465.4 412.2L470.2 439.6L405.8 695.7L386.5 723L318.8 772.9L58 772.9L0 700.5L45.1 518.5L178.7 515.3L161 597.4L169.1 618.4L267.3 624.8L325.3 436.4L310.8 421.9L228.7 417.1L246.4 325.3L264.1 291.5L360.7 281.8L388.1 182L394.5 132L386.5 119.2L299.5 117.6L280.2 135.3L259.3 201.3L127.2 199.7L164.3 49.9ZM731.1 0L937.2 0L1000 70.9L954.9 231.9L837.4 228.7L855.1 141.7L847 122.4L772.9 120.8L753.6 135.3L650.6 571.7L642.5 611.9L650.6 626.4L732.7 626.4L776.2 475L901.8 473.4L872.8 658.6L858.3 708.5L784.2 771.3L545.9 772.9L484.7 695.7L557.2 370.4L639.3 67.6Z";

export const THREE_C_WIDTH = 1000;
export const THREE_C_HEIGHT = 773;

export type ThreeCGlyphProps = {
  className?: string;
  /** Letterform fill under the texture. */
  fill?: string;
  /** Outline stroke color. Pass null for no outline. */
  outline?: string | null;
  outlineWidth?: number;
  /** Street-map texture clipped inside the letters. */
  texture?: boolean;
  /** Accent used for routes and dots. */
  accent?: string;
  /** Ink color of the street grid. */
  streets?: string;
  /** Glow halo behind the accent dots. */
  glow?: boolean;
  /** Unique suffix for clipPath/filter ids when several glyphs share a page. */
  idPrefix?: string;
  /** Supply to make the glyph an accessible image instead of decoration. */
  title?: string;
  style?: React.CSSProperties;
};

// ---------------------------------------------------------------------------
// Procedural street texture. Deterministic (seeded), so server and client
// render byte-identical markup.
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Street = { d: string; w: number; o: number };

function buildStreets(): Street[] {
  const rnd = mulberry32(30319);
  const out: Street[] = [];
  const W = THREE_C_WIDTH;
  const H = THREE_C_HEIGHT;

  // Horizontal-ish streets, drifting slightly so the grid is not mechanical.
  for (let i = 0; i < 44; i++) {
    const y = -40 + (i * (H + 90)) / 43 + (rnd() - 0.5) * 12;
    const arterial = i % 8 === 2;
    let d = `M-40 ${(y + (rnd() - 0.5) * 10).toFixed(1)}`;
    for (let x = 60; x <= W + 60; x += 85) {
      d += `L${x} ${(y + (rnd() - 0.5) * 20).toFixed(1)}`;
    }
    out.push({ d, w: arterial ? 3 : 1.4, o: arterial ? 0.34 : 0.19 });
  }

  // Vertical-ish streets, sheared to echo the letterform slant.
  for (let i = 0; i < 38; i++) {
    const x = -60 + (i * (W + 140)) / 37 + (rnd() - 0.5) * 14;
    const arterial = i % 7 === 1;
    let d = `M${(x + 60).toFixed(1)} -40`;
    for (let y = 40; y <= H + 60; y += 78) {
      d += `L${(x + 60 - (y / H) * 52 + (rnd() - 0.5) * 22).toFixed(1)} ${y}`;
    }
    out.push({ d, w: arterial ? 2.6 : 1.3, o: arterial ? 0.3 : 0.17 });
  }

  // A handful of diagonal cut-throughs.
  for (let i = 0; i < 11; i++) {
    const x0 = rnd() * W;
    const y0 = rnd() * H;
    const len = 260 + rnd() * 420;
    const ang = (rnd() * 0.9 - 0.45) + (i % 2 ? 2.5 : 0.6);
    out.push({
      d: `M${x0.toFixed(1)} ${y0.toFixed(1)}L${(x0 + Math.cos(ang) * len).toFixed(1)} ${(y0 + Math.sin(ang) * len).toFixed(1)}`,
      w: 2.2,
      o: 0.26,
    });
  }
  return out;
}

const STREETS = buildStreets();

/** Eight glowing hubs, placed inside the letter strokes rather than the counters. */
const HUBS: Array<{ x: number; y: number; r: number }> = [
  { x: 330, y: 78, r: 11 },
  { x: 455, y: 232, r: 9 },
  { x: 330, y: 402, r: 13 },
  { x: 300, y: 560, r: 9 },
  { x: 175, y: 706, r: 15 },
  { x: 900, y: 88, r: 12 },
  { x: 705, y: 220, r: 13 },
  { x: 645, y: 405, r: 9 },
];

/** Green routes threading hub to hub. */
const ROUTES = [
  "M330 78L455 232L330 402L300 560L175 706L20 690",
  "M330 402L150 380",
  "M300 560L470 640",
  "M900 88L705 220L645 405L720 560L860 640",
  "M705 220L790 300",
];

export default function ThreeCGlyph({
  className,
  fill = "#12345C",
  outline = GLYPH_OFF_WHITE,
  outlineWidth = 4,
  texture = true,
  accent = GLYPH_GREEN,
  streets = GLYPH_OFF_WHITE,
  glow = true,
  idPrefix = "threec",
  title,
  style,
}: ThreeCGlyphProps) {
  const clipId = `${idPrefix}-clip`;
  const glowId = `${idPrefix}-glow`;
  const titleId = `${idPrefix}-title`;
  const pad = outline ? outlineWidth : 0;

  return (
    <svg
      className={className}
      viewBox={`${-pad} ${-pad} ${THREE_C_WIDTH + pad * 2} ${THREE_C_HEIGHT + pad * 2}`}
      width="100%"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      style={{ display: "block", width: "100%", height: "auto", ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <defs>
        <clipPath id={clipId}>
          <path d={THREE_C_PATH} clipRule="evenodd" />
        </clipPath>
        {glow ? (
          <filter id={glowId} x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="9" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ) : null}
      </defs>

      <path d={THREE_C_PATH} fillRule="evenodd" fill={fill} />

      {texture ? (
        <g clipPath={`url(#${clipId})`}>
          <g fill="none" stroke={streets} strokeLinecap="round">
            {STREETS.map((s, i) => (
              <path key={i} d={s.d} strokeWidth={s.w} strokeOpacity={s.o} />
            ))}
          </g>
          <g
            fill="none"
            stroke={accent}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.9}
          >
            {ROUTES.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          <g filter={glow ? `url(#${glowId})` : undefined}>
            {HUBS.map((h, i) => (
              <g key={i}>
                <circle
                  cx={h.x}
                  cy={h.y}
                  r={h.r + 5}
                  fill={accent}
                  fillOpacity={0.35}
                />
                <circle cx={h.x} cy={h.y} r={h.r} fill="#FFFFFF" />
              </g>
            ))}
          </g>
        </g>
      ) : null}

      {outline ? (
        <path
          d={THREE_C_PATH}
          fillRule="evenodd"
          fill="none"
          stroke={outline}
          strokeWidth={outlineWidth}
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}
