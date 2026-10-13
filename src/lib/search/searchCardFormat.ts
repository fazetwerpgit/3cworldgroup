import { APPLICATION_COUNT_KEYS, type ApplicationCountKey, type ApplicationCounts } from './searchStatsTypes';

// Wording for the owner's "Hiring from search" card. Pure, so it is tested
// without rendering.

export const CHANNEL_NAMES: Record<ApplicationCountKey, string> = {
  google: 'Google',
  indeed: 'Indeed',
  bing: 'Bing',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  direct: 'Direct',
  other: 'Other',
  unknown: 'Unknown',
};

/** The channels the card lists: every one above zero, and Google always. */
export function channelParts(counts: ApplicationCounts): Array<{ key: ApplicationCountKey; name: string; count: number }> {
  return APPLICATION_COUNT_KEYS.filter((key) => key === 'google' || counts[key] > 0).map((key) => ({
    key,
    name: CHANNEL_NAMES[key],
    count: counts[key],
  }));
}

export const totalOf = (counts: ApplicationCounts) =>
  APPLICATION_COUNT_KEYS.reduce((sum, key) => sum + counts[key], 0);

/** Whole-percent change against the prior week; null when there is nothing to compare. */
export function changePct(current: number | undefined, prior: number | undefined): number | null {
  if (typeof current !== 'number' || typeof prior !== 'number' || prior <= 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}

/** "+12%", "−5%", "0%". */
export function changeText(pct: number): string {
  if (pct > 0) return `+${pct}%`;
  if (pct < 0) return `−${Math.abs(pct)}%`;
  return '0%';
}

/** The card's line for a run that failed. */
export function searchErrorText(error: string | undefined): string {
  if (error === 'no_access') return 'Waiting on Search Console access';
  if (error === 'api_disabled') return 'Search Console API is off';
  return 'Search Console update failed';
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "just now", "12m ago", "3h ago", "1 day ago", "4 days ago". Null for an unreadable stamp. */
export function timeAgo(iso: string | null | undefined, nowMs: number): string | null {
  const atMs = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(atMs)) return null;
  const ago = Math.max(0, nowMs - atMs);
  if (ago < MINUTE_MS) return 'just now';
  if (ago < HOUR_MS) return `${Math.floor(ago / MINUTE_MS)}m ago`;
  if (ago < DAY_MS) return `${Math.floor(ago / HOUR_MS)}h ago`;
  const days = Math.floor(ago / DAY_MS);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
