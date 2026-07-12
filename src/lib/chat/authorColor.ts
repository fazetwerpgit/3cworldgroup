/**
 * Deterministic per-author visual identity for chat: a stable color assigned
 * to each author ID, plus initials derived from their display name.
 */

export interface AuthorColor {
  /** Chip background (hex) — used in light AND dark mode. */
  bg: string;
  /** Initials text color on `bg` (hex), WCAG >= 4.5:1 vs `bg`. */
  fg: string;
  /** Sender-name text color for LIGHT mode (hex), >= 4.5:1 vs white. */
  name: string;
  /** Sender-name text color for DARK mode (hex), >= 4.5:1 vs the app's dark navy surface. */
  nameDark: string;
}

/**
 * 10 hues spread around the wheel, skipping the lime brand accent's range
 * (~70-100deg) and staying well clear of the near-black brand navy so no
 * entry reads as "the lime accent" or "an own-message bubble". Mid
 * saturation (60%) and consistent lightness (55%) keep entries visually
 * distinct from each other at small (32px) chip size while looking like one
 * family. `fg`/`name`/`nameDark` are each picked per-entry (near-black,
 * dark-ink, or white) so every pairing clears WCAG AA (>= 4.5:1).
 */
const AUTHOR_COLOR_PALETTE: AuthorColor[] = [
  { bg: '#d14753', fg: '#000000', name: '#871d25', nameDark: '#df9097' },
  { bg: '#d17547', fg: '#1a1a1a', name: '#87401d', nameDark: '#dfab90' },
  { bg: '#d1b647', fg: '#1a1a1a', name: '#87711d', nameDark: '#dfcf90' },
  { bg: '#47d15e', fg: '#1a1a1a', name: '#1d872e', nameDark: '#90df9d' },
  { bg: '#47d1af', fg: '#1a1a1a', name: '#1b7e65', nameDark: '#90dfcb' },
  { bg: '#47afd1', fg: '#1a1a1a', name: '#1d6c87', nameDark: '#90cbdf' },
  { bg: '#476ad1', fg: '#ffffff', name: '#1d3787', nameDark: '#90a4df' },
  { bg: '#7147d1', fg: '#ffffff', name: '#3c1d87', nameDark: '#a890df' },
  { bg: '#ba47d1', fg: '#000000', name: '#751d87', nameDark: '#d290df' },
  { bg: '#d147a3', fg: '#000000', name: '#871d63', nameDark: '#df90c5' },
];

/**
 * First letter of the first word + first letter of the last word, uppercased.
 * Single word -> first letter only. Empty/whitespace -> "?".
 */
export function getInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Simple FNV-1a string hash. */
function fnv1aHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic: the same author ID always maps to the same palette entry.
 * Hashes the ID (never the display name) so a display-name change doesn't
 * shift the color. Empty ID maps to entry 0.
 */
export function getAuthorColor(authorId: string): AuthorColor {
  if (!authorId) return AUTHOR_COLOR_PALETTE[0];
  const index = fnv1aHash(authorId) % AUTHOR_COLOR_PALETTE.length;
  return AUTHOR_COLOR_PALETTE[index];
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG contrast ratio between two hex colors (1-21). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA) + 0.05;
  const lumB = relativeLuminance(hexB) + 0.05;
  return lumA > lumB ? lumA / lumB : lumB / lumA;
}

export const DEVELOPER_UID = 'bQWKezQmd1P9Yf3GzOdXXBkDzj93';
export function isDeveloperAuthor(authorId: string): boolean { return authorId === DEVELOPER_UID; }
