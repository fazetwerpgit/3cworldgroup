import * as React from "react";

import {
  ALASKA_PATH,
  CONTIGUOUS_PATH,
  HAWAII_PATH,
  STATE_BORDERS_PATH,
  US_CITIES,
  US_MAP_HEIGHT,
  US_MAP_VIEWBOX,
  US_MAP_WIDTH,
} from "./usMapPaths";

export const NAVY = "#0B1F3A";
export const GREEN = "#8DC63F";
export const OFF_WHITE = "#F2F4F7";

export type MapNode = {
  id: string;
  /** X in the map's own coordinate space (0-975). */
  x: number;
  /** Y in the map's own coordinate space (0-610). */
  y: number;
  label?: string;
  /** Draws a larger dot. Use for the one or two hub cities. */
  hub?: boolean;
};

/**
 * A link is either a pair of node ids, an object with a curvature, or a raw
 * path string in map coordinates (for hand-drawn routes off the node graph).
 */
export type MapLink =
  | [string, string]
  | { from: string; to: string; curve?: number }
  | { path: string };

export type USMapVariant = "light" | "dark";
export type USMapInsets = "none" | "alaska" | "both";

export type USMapProps = {
  className?: string;
  nodes?: MapNode[];
  links?: MapLink[];
  /** 'light': navy landmass on a light page. 'dark': outline only, for navy bands. */
  variant?: USMapVariant;
  /** Halo behind each node dot. */
  glow?: boolean;
  insets?: USMapInsets;
  /** Interior state borders. On by default. */
  borders?: boolean;
  /** Default curvature for tuple links: 0 is straight, 0.2 is a gentle arc. */
  curve?: number;
  accent?: string;
  /** Landmass color. Defaults per variant. */
  land?: string;
  /** Outline/border stroke color. Defaults per variant. */
  ink?: string;
  /** Supply to make the map an accessible image instead of decoration. */
  title?: string;
  /** Unique suffix for the gradient/filter ids when several maps share a page. */
  idPrefix?: string;
  style?: React.CSSProperties;
};

/** Node position as CSS percentages, for anchoring DOM elements over the map. */
export function nodeToPercent(node: { x: number; y: number }): {
  left: string;
  top: string;
} {
  return {
    left: `${(node.x / US_MAP_WIDTH) * 100}%`,
    top: `${(node.y / US_MAP_HEIGHT) * 100}%`,
  };
}

/** Look up a built-in city node by id, e.g. cityNode('atlanta'). */
export function cityNode(id: keyof typeof US_CITIES, hub = false): MapNode {
  const c = US_CITIES[id];
  return { id, x: c.x, y: c.y, label: c.label, hub };
}

/** Quadratic arc between two points, bowed perpendicular to the chord. */
export function arcPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
  curve = 0.2,
): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  if (!curve) return `M${a.x} ${a.y}L${b.x} ${b.y}`;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Perpendicular offset, always bowing "up" so arcs read like flight paths.
  const cx = mx + dy * curve;
  const cy = my - dx * curve;
  return `M${a.x} ${a.y}Q${cx} ${cy} ${b.x} ${b.y}`;
}

const DEFAULT_NODES: MapNode[] = [
  cityNode("sanFrancisco"),
  cityNode("losAngeles"),
  cityNode("phoenix"),
  cityNode("denver", true),
  cityNode("dallas", true),
  cityNode("chicago"),
  cityNode("atlanta"),
  cityNode("norfolk"),
];

const DEFAULT_LINKS: MapLink[] = [
  { from: "sanFrancisco", to: "denver", curve: 0.16 },
  { from: "sanFrancisco", to: "losAngeles", curve: 0.1 },
  { from: "losAngeles", to: "phoenix", curve: 0.12 },
  { from: "denver", to: "phoenix", curve: 0 },
  { from: "denver", to: "dallas", curve: 0 },
  { from: "denver", to: "chicago", curve: 0.14 },
  { from: "denver", to: "atlanta", curve: 0.16 },
  { from: "dallas", to: "chicago", curve: 0.14 },
  { from: "dallas", to: "atlanta", curve: 0.12 },
  { from: "chicago", to: "norfolk", curve: 0.12 },
  { from: "atlanta", to: "norfolk", curve: 0.14 },
];

export default function USMap({
  className,
  nodes = DEFAULT_NODES,
  links = DEFAULT_LINKS,
  variant = "light",
  glow = true,
  insets = "none",
  borders = true,
  curve = 0.18,
  accent = GREEN,
  land,
  ink,
  title,
  idPrefix = "usmap",
  style,
}: USMapProps) {
  const isDark = variant === "dark";
  const landFill = land ?? (isDark ? "none" : NAVY);
  const inkStroke = ink ?? (isDark ? "#3E5A80" : "#8DA0BC");
  const outlineStroke = isDark ? ink ?? "#4A6A93" : "none";
  const glowId = `${idPrefix}-glow`;
  const titleId = `${idPrefix}-title`;

  const byId = new Map(nodes.map((n) => [n.id, n]));

  const linkPaths = links.map((link, i) => {
    if ("path" in link) return { key: `p${i}`, d: link.path };
    const [fromId, toId, c] = Array.isArray(link)
      ? ([link[0], link[1], curve] as const)
      : ([link.from, link.to, link.curve ?? curve] as const);
    const a = byId.get(fromId);
    const b = byId.get(toId);
    if (!a || !b) return null;
    return { key: `${fromId}-${toId}-${i}`, d: arcPath(a, b, c) };
  });

  return (
    <svg
      className={className}
      viewBox={US_MAP_VIEWBOX}
      width="100%"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      style={{ display: "block", width: "100%", height: "auto", ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title id={titleId}>{title}</title> : null}
      {glow ? (
        <defs>
          <filter id={glowId} x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      ) : null}

      <g>
        <path
          d={CONTIGUOUS_PATH}
          fill={landFill}
          stroke={outlineStroke}
          strokeWidth={isDark ? 1.4 : 0}
          strokeLinejoin="round"
        />
        {insets !== "none" ? (
          <path
            d={ALASKA_PATH}
            fill={landFill}
            stroke={outlineStroke}
            strokeWidth={isDark ? 1.4 : 0}
            strokeLinejoin="round"
          />
        ) : null}
        {insets === "both" ? (
          <path
            d={HAWAII_PATH}
            fill={landFill}
            stroke={outlineStroke}
            strokeWidth={isDark ? 1.4 : 0}
            strokeLinejoin="round"
          />
        ) : null}
        {borders ? (
          <path
            d={STATE_BORDERS_PATH}
            fill="none"
            stroke={inkStroke}
            strokeWidth={isDark ? 1 : 1.1}
            strokeOpacity={isDark ? 0.85 : 0.6}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
      </g>

      <g
        fill="none"
        stroke={accent}
        strokeWidth={3}
        strokeLinecap="round"
        strokeOpacity={0.95}
      >
        {linkPaths.map((l) => (l ? <path key={l.key} d={l.d} /> : null))}
      </g>

      <g filter={glow ? `url(#${glowId})` : undefined}>
        {nodes.map((n) => (
          <g key={n.id}>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.hub ? 12 : 10}
              fill={accent}
              fillOpacity={0.35}
            />
            <circle
              cx={n.x}
              cy={n.y}
              r={n.hub ? 8 : 6.5}
              fill="#FFFFFF"
              stroke={accent}
              strokeWidth={3}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

export { US_CITIES, US_MAP_VIEWBOX, US_MAP_WIDTH, US_MAP_HEIGHT };
