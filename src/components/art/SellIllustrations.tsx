import * as React from "react";

export const ART_INK = "#DDE6F0";
export const ART_ACCENT = "#8DC63F";

export type SellArtProps = {
  className?: string;
  /** Line color. Defaults to a light ink that reads on navy. */
  ink?: string;
  /** Accent color for the few highlighted details. */
  accent?: string;
  /** Stroke weight in the 400-wide coordinate space. */
  weight?: number;
  /** Supply to make the art an accessible image instead of decoration. */
  title?: string;
  idPrefix?: string;
  style?: React.CSSProperties;
};

const VIEWBOX = "0 0 400 300";

function Frame({
  className,
  title,
  titleId,
  children,
  style,
}: {
  className?: string;
  title?: string;
  titleId: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      viewBox={VIEWBOX}
      width="100%"
      height="auto"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      style={{ display: "block", width: "100%", height: "auto", ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title id={titleId}>{title}</title> : null}
      {children}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Fiber: a fan of strands leaving a bundle, each tipped with an LC connector. */
/* -------------------------------------------------------------------------- */

const FIBER_STRANDS = [
  { y: 150, spread: -104, tip: 344 },
  { y: 150, spread: -78, tip: 356 },
  { y: 150, spread: -52, tip: 364 },
  { y: 150, spread: -26, tip: 368 },
  { y: 150, spread: 0, tip: 370 },
  { y: 150, spread: 26, tip: 368 },
  { y: 150, spread: 52, tip: 364 },
  { y: 150, spread: 78, tip: 356 },
  { y: 150, spread: 104, tip: 344 },
];

export function FiberArt({
  className,
  ink = ART_INK,
  accent = ART_ACCENT,
  weight = 2,
  title,
  idPrefix = "fiber",
  style,
}: SellArtProps) {
  const titleId = `${idPrefix}-title`;
  return (
    <Frame
      className={className}
      title={title}
      titleId={titleId}
      style={style}
    >
      <g
        fill="none"
        stroke={ink}
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Jacketed trunk cable entering from the left. */}
        <path d="M8 138h56" />
        <path d="M8 162h56" />
        <path d="M8 138a12 12 0 0 0 0 24" />

        {/* Bundle collar. */}
        <rect x="64" y="126" width="34" height="48" rx="8" />
        <path d="M76 126v48M86 126v48" />

        {/* Strands fanning out to their connector tips. */}
        {FIBER_STRANDS.map((s, i) => {
          const endY = 150 + s.spread;
          return (
            <path
              key={i}
              d={`M98 ${150 + s.spread * 0.12}C170 ${150 + s.spread * 0.35} 220 ${endY} ${s.tip - 46} ${endY}`}
            />
          );
        })}

        {/* LC connector bodies + ferrules. */}
        {FIBER_STRANDS.map((s, i) => {
          const y = 150 + s.spread;
          const x = s.tip - 46;
          return (
            <g key={`c${i}`}>
              <rect x={x} y={y - 9} width="30" height="18" rx="3" />
              <path d={`M${x + 8} ${y - 9}v18`} />
              <path d={`M${x + 30} ${y - 4.5}h10v9h-10`} />
              <path d={`M${x + 6} ${y - 13}h14v4h-14z`} />
            </g>
          );
        })}
      </g>

      {/* Two strands lit to accent. */}
      <g
        fill="none"
        stroke={accent}
        strokeWidth={weight + 0.6}
        strokeLinecap="round"
      >
        <path d="M98 153C170 159 220 176 246 176" />
        <path d="M98 147C170 141 220 124 246 124" />
      </g>
      <g fill={accent}>
        <circle cx="290" cy="176" r="3.5" />
        <circle cx="290" cy="124" r="3.5" />
      </g>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* TV: flat panel on a pedestal, with a remote leaning in from the right.      */
/* -------------------------------------------------------------------------- */

export function TvArt({
  className,
  ink = ART_INK,
  accent = ART_ACCENT,
  weight = 2,
  title,
  idPrefix = "tv",
  style,
}: SellArtProps) {
  const titleId = `${idPrefix}-title`;
  // Remote keypad: 3 columns x 4 rows of round keys.
  const keys: Array<[number, number]> = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      keys.push([c * 20 - 20, r * 20]);
    }
  }
  return (
    <Frame className={className} title={title} titleId={titleId} style={style}>
      <g
        fill="none"
        stroke={ink}
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Panel. */}
        <rect x="18" y="42" width="248" height="152" rx="6" />
        <rect x="30" y="54" width="224" height="128" rx="3" />
        {/* Pedestal. */}
        <path d="M142 194v26" />
        <path d="M96 226h92a6 6 0 0 0 0-12H96a6 6 0 0 0 0 12z" />
      </g>

      {/* On-screen play glyph, the only accent on the panel. */}
      <g fill="none" stroke={accent} strokeWidth={weight + 0.5} strokeLinejoin="round">
        <path d="M128 96l44 22-44 22z" />
      </g>

      {/* Remote, rotated so it leans against the panel. */}
      <g transform="translate(316 148) rotate(14)">
        <g
          fill="none"
          stroke={ink}
          strokeWidth={weight}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="-30" y="-118" width="60" height="236" rx="26" />
          {/* Power key. */}
          <circle cx="0" cy="-92" r="9" />
          <path d="M0 -96v5" />
          {/* Directional ring. */}
          <circle cx="0" cy="-46" r="24" />
          <circle cx="0" cy="-46" r="9" />
          {/* Numeric keypad, 3 x 4. */}
          {keys.map(([kx, ky], i) => (
            <circle key={i} cx={kx} cy={ky + 4} r="7" />
          ))}
        </g>
        <g fill={accent}>
          <circle cx="0" cy="-92" r="3" />
        </g>
      </g>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Security: keypad panel, camera, and a two-piece door contact sensor.        */
/* -------------------------------------------------------------------------- */

export function SecurityArt({
  className,
  ink = ART_INK,
  accent = ART_ACCENT,
  weight = 2,
  title,
  idPrefix = "security",
  style,
}: SellArtProps) {
  const titleId = `${idPrefix}-title`;
  // Panel keypad: 3 columns x 4 rows of round keys.
  const keys: Array<[number, number]> = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      keys.push([46 + c * 30, 108 + r * 30]);
    }
  }
  return (
    <Frame className={className} title={title} titleId={titleId} style={style}>
      <g
        fill="none"
        stroke={ink}
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Keypad panel. */}
        <rect x="22" y="44" width="124" height="212" rx="14" />
        <rect x="36" y="60" width="96" height="30" rx="5" />
        {keys.map(([kx, ky], i) => (
          <circle key={i} cx={kx} cy={ky} r="11" />
        ))}

        {/* Bullet camera on a ceiling mount. */}
        <rect x="248" y="44" width="44" height="10" rx="3" />
        <path d="M270 54v22" />
        <circle cx="270" cy="84" r="9" />
        <rect x="206" y="96" width="112" height="58" rx="18" />
        <path d="M318 110h12a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6h-12" />
        <path d="M206 108a18 18 0 0 0 0 34" />
        <circle cx="232" cy="125" r="17" />
        <circle cx="232" cy="125" r="8" />

        {/* Door contact sensor: transmitter body + magnet. */}
        <rect x="212" y="184" width="58" height="88" rx="8" />
        <rect x="284" y="196" width="30" height="64" rx="7" />
        <path d="M226 262h30" />
      </g>

      <g fill={accent}>
        {/* Armed indicator on the panel, camera lens catch, sensor status. */}
        <circle cx="132" cy="75" r="5" />
        <circle cx="232" cy="125" r="4" />
        <circle cx="241" cy="200" r="4.5" />
      </g>
      <g fill="none" stroke={accent} strokeWidth={weight} strokeLinecap="round">
        {/* Signal arcs between the two sensor halves. */}
        <path d="M274 216a14 14 0 0 1 0 28" />
        <path d="M280 208a24 24 0 0 1 0 44" />
      </g>
    </Frame>
  );
}

export default { FiberArt, TvArt, SecurityArt };
