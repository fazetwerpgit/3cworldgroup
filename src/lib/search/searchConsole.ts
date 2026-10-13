import type { JobPageStatus, SearchFigures, TopQuery } from './searchStatsTypes';

// Google Search Console, read only, for the owner's "Hiring from search" card.
// Everything here is pure or takes its fetch as an argument, so the tests run
// against canned Google responses and never reach the network.
//
// The property is the verified Domain property. Search Analytics data lags
// about two days and its days are Pacific time, so every range ends on the
// Pacific date two days before today.

export const SEARCH_CONSOLE_PROPERTY = 'sc-domain:3cworldgroup.com';
export const WEBMASTERS_READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const SEARCH_ANALYTICS_URL = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
  SEARCH_CONSOLE_PROPERTY
)}/searchAnalytics/query`;
export const URL_INSPECTION_URL = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

/**
 * A Google Cloud project to bill the calls to instead of the service account's
 * own (cworldgroup-cca68), sent as x-goog-user-project. Only when
 * SEARCH_CONSOLE_QUOTA_PROJECT is set; unset, no header is sent. The service
 * account then needs Service Usage Consumer on that project.
 */
export function searchConsoleQuotaProject(env: Record<string, string | undefined> = process.env): string | null {
  return env.SEARCH_CONSOLE_QUOTA_PROJECT?.trim() || null;
}

/** Search Analytics days run on Pacific time. */
const DATA_ZONE = 'America/Los_Angeles';
/** How far behind today the data is complete. */
export const DATA_LAG_DAYS = 2;
const TOP_QUERY_COUNT = 5;
const REQUEST_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------- ranges

export interface DateRange {
  startDate: string;
  endDate: string;
}

const PACIFIC_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: DATA_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in Pacific time, as YYYY-MM-DD. */
export function pacificDay(now: Date): string {
  return PACIFIC_DAY.format(now);
}

/** A YYYY-MM-DD date moved by whole days (calendar math, no time zone). */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The three windows the card shows, all ending two days before today (Pacific):
 * the last 7 days, the 7 before them, and the last 28 for top searches.
 */
export function searchRanges(now: Date): { last7: DateRange; prev7: DateRange; last28: DateRange } {
  const end = addDays(pacificDay(now), -DATA_LAG_DAYS);
  return {
    last7: { startDate: addDays(end, -6), endDate: end },
    prev7: { startDate: addDays(end, -13), endDate: addDays(end, -7) },
    last28: { startDate: addDays(end, -27), endDate: end },
  };
}

// ---------------------------------------------------------------- errors

export class SearchConsoleError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'SearchConsoleError';
  }
}

/**
 * What the card should say about a failed run. A 403 is either the quota
 * project's side (the API "has not been used ... or it is disabled" there, or
 * the service account lacks Service Usage Consumer on it): api_disabled; or the
 * service account not being a user on the property: no_access.
 */
export function classifySearchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = error instanceof SearchConsoleError ? error.status : 0;
  if (status === 403) {
    // The API off in the quota project, or no Service Usage Consumer on it, is
    // the project's side; anything else is the property not shared with us.
    const projectSide =
      /has not been used|is disabled|SERVICE_DISABLED|caller does not have required permission to use project|serviceusage/i;
    return projectSide.test(message) ? 'api_disabled' : 'no_access';
  }
  const text = message.replace(/\s+/g, ' ').trim().slice(0, 200) || 'unknown error';
  return status ? `HTTP ${status}: ${text}` : text;
}

// ---------------------------------------------------------------- parsing

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

type AnalyticsRow = { keys?: unknown[]; clicks?: unknown; impressions?: unknown };

function analyticsRows(json: unknown): AnalyticsRow[] {
  const rows = (json as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as AnalyticsRow[]) : [];
}

/** Totals from a query with no dimensions: one row, or none when there was no traffic. */
export function parseTotals(json: unknown): { clicks: number; impressions: number } {
  return analyticsRows(json).reduce<{ clicks: number; impressions: number }>(
    (sum, row) => ({ clicks: sum.clicks + num(row.clicks), impressions: sum.impressions + num(row.impressions) }),
    { clicks: 0, impressions: 0 }
  );
}

/** The most-shown searches. Google sorts by clicks, so the sort by impressions happens here. */
export function parseTopQueries(json: unknown, limit = TOP_QUERY_COUNT): TopQuery[] {
  return analyticsRows(json)
    .map((row) => ({
      query: typeof row.keys?.[0] === 'string' ? (row.keys[0] as string).trim() : '',
      impressions: num(row.impressions),
      clicks: num(row.clicks),
    }))
    .filter((row) => row.query)
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks || a.query.localeCompare(b.query))
    .slice(0, limit);
}

type RichItem = { issues?: Array<{ severity?: unknown }> };
type DetectedItem = { richResultType?: unknown; items?: RichItem[] };

/** One URL Inspection response down to what the card shows. */
export function parseInspection(slug: string, json: unknown): JobPageStatus {
  const result = (json as { inspectionResult?: Record<string, unknown> } | null)?.inspectionResult ?? {};
  const index = (result.indexStatusResult ?? {}) as { verdict?: unknown; coverageState?: unknown };
  const rich = result.richResultsResult as { detectedItems?: DetectedItem[] } | undefined;

  let jobPostingValid: boolean | null = null;
  if (rich && typeof rich === 'object') {
    const jobs = (Array.isArray(rich.detectedItems) ? rich.detectedItems : []).filter(
      (item) => typeof item.richResultType === 'string' && /job/i.test(item.richResultType)
    );
    jobPostingValid = jobs.some((group) =>
      (Array.isArray(group.items) ? group.items : []).some(
        (item) => !(item.issues ?? []).some((issue) => issue.severity === 'ERROR')
      )
    );
  }

  return {
    slug,
    indexed: index.verdict === 'PASS',
    coverage: typeof index.coverageState === 'string' ? index.coverageState : '',
    jobPostingValid,
  };
}

// ---------------------------------------------------------------- requests

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

async function postJson(
  fetchFn: FetchFn,
  url: string,
  auth: { token: string; quotaProject: string | null },
  body: unknown
): Promise<unknown> {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
      ...(auth.quotaProject ? { 'x-goog-user-project': auth.quotaProject } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = (await response.json().catch(() => null)) as { error?: { message?: unknown } } | null;
  if (!response.ok) {
    const message = typeof json?.error?.message === 'string' ? json.error.message : response.statusText;
    throw new SearchConsoleError(response.status, message || `Request failed (${response.status})`);
  }
  return json;
}

function analyticsQuery(range: DateRange, dimensions: string[] = [], rowLimit?: number) {
  return { ...range, type: 'web', ...(dimensions.length ? { dimensions } : {}), ...(rowLimit ? { rowLimit } : {}) };
}

/**
 * Every figure for one run: two totals, the top searches, and an inspection of
 * each job page. Any failed request fails the run (the caller keeps the last
 * good figures).
 */
export async function fetchSearchFigures(opts: {
  fetchFn: FetchFn;
  token: string;
  now: Date;
  /** x-goog-user-project; defaults to SEARCH_CONSOLE_QUOTA_PROJECT. Null or unset: no header. */
  quotaProject?: string | null;
  /** Absolute URLs of the job pages, by slug. */
  jobPages: Array<{ slug: string; url: string }>;
}): Promise<SearchFigures> {
  const { fetchFn, now } = opts;
  const auth = { token: opts.token, quotaProject: opts.quotaProject === undefined ? searchConsoleQuotaProject() : opts.quotaProject };
  const ranges = searchRanges(now);
  const analytics = (body: unknown) => postJson(fetchFn, SEARCH_ANALYTICS_URL, auth, body);

  const [last7, prev7, top] = await Promise.all([
    analytics(analyticsQuery(ranges.last7)),
    analytics(analyticsQuery(ranges.prev7)),
    // Enough rows that the sort by impressions sees the real top five.
    analytics(analyticsQuery(ranges.last28, ['query'], 1000)),
  ]);

  const jobPages = await Promise.all(
    opts.jobPages.map(async (page) =>
      parseInspection(
        page.slug,
        await postJson(fetchFn, URL_INSPECTION_URL, auth, {
          inspectionUrl: page.url,
          siteUrl: SEARCH_CONSOLE_PROPERTY,
          languageCode: 'en-US',
        })
      )
    )
  );

  const week = parseTotals(last7);
  const prior = parseTotals(prev7);
  return {
    clicks7: week.clicks,
    impressions7: week.impressions,
    clicksPrev7: prior.clicks,
    impressionsPrev7: prior.impressions,
    topQueries: parseTopQueries(top),
    jobPages,
  };
}
