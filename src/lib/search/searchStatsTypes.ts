// The shape of config/searchStats (written once a day by /api/cron/search-stats)
// and of what /api/portal/owner/search-stats hands the owner's Home card.
// Types only, so the client card can import them without server code.

export type SearchStatsError = 'no_access' | 'api_disabled' | string;

export interface TopQuery {
  query: string;
  impressions: number;
  clicks: number;
}

export interface JobPageStatus {
  slug: string;
  /** URL Inspection verdict PASS: the page is on Google. */
  indexed: boolean;
  /** Google's own words, e.g. "Submitted and indexed" or "Discovered - currently not indexed". */
  coverage: string;
  /** A Job posting rich result Google read without errors; null when Google has not reported on it. */
  jobPostingValid: boolean | null;
}

/** The numbers from one good run. */
export interface SearchFigures {
  clicks7: number;
  impressions7: number;
  clicksPrev7: number;
  impressionsPrev7: number;
  topQueries: TopQuery[];
  jobPages: JobPageStatus[];
}

/** config/searchStats as the API serializes it (dates as ISO strings). */
export interface SearchStatsView extends Partial<SearchFigures> {
  /** When the figures were last fetched successfully; null until the first good run. */
  updatedAt: string | null;
  /** When the cron last tried, good or not. */
  checkedAt: string | null;
  ok: boolean;
  error?: SearchStatsError;
}

export const APPLICATION_COUNT_KEYS = [
  'google',
  'indeed',
  'bing',
  'facebook',
  'instagram',
  'tiktok',
  'direct',
  'other',
  'unknown',
] as const;

export type ApplicationCountKey = (typeof APPLICATION_COUNT_KEYS)[number];

export type ApplicationCounts = Record<ApplicationCountKey, number>;

export interface SearchStatsResponse {
  search: SearchStatsView | null;
  applications: { last7: ApplicationCounts; last30: ApplicationCounts };
}
