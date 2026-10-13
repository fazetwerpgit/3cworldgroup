import type { Firestore } from 'firebase-admin/firestore';
import { storedSource } from '@/lib/forms/applicationSource';
import { SEARCH_STATS_COLLECTION, SEARCH_STATS_DOC } from './searchStats';
import {
  APPLICATION_COUNT_KEYS,
  type ApplicationCounts,
  type JobPageStatus,
  type SearchStatsResponse,
  type SearchStatsView,
  type TopQuery,
} from './searchStatsTypes';

// The read side of the owner's "Hiring from search" card: config/searchStats
// as written by the cron, plus public applications by channel over the last 7
// and 30 days. Applications from before sources were recorded ('website' or
// nothing) count as unknown, never as direct.

const DAY_MS = 24 * 60 * 60 * 1000;

export function emptyCounts(): ApplicationCounts {
  return Object.fromEntries(APPLICATION_COUNT_KEYS.map((key) => [key, 0])) as ApplicationCounts;
}

export function countApplications(
  rows: Array<{ createdAtMs: number | null; source: unknown }>,
  now: Date
): { last7: ApplicationCounts; last30: ApplicationCounts } {
  const last7 = emptyCounts();
  const last30 = emptyCounts();
  const since7 = now.getTime() - 7 * DAY_MS;
  const since30 = now.getTime() - 30 * DAY_MS;
  for (const row of rows) {
    if (row.createdAtMs === null || row.createdAtMs < since30) continue;
    const key = storedSource(row.source)?.channel ?? 'unknown';
    last30[key] += 1;
    if (row.createdAtMs >= since7) last7[key] += 1;
  }
  return { last7, last30 };
}

const toIso = (value: unknown): string | null => {
  const date =
    value instanceof Date
      ? value
      : typeof (value as { toDate?: unknown } | null)?.toDate === 'function'
        ? (value as { toDate: () => Date }).toDate()
        : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** The stored doc down to what the card reads. Null when the cron has never run. */
export function serializeSearchStats(data: Record<string, unknown> | undefined): SearchStatsView | null {
  if (!data) return null;
  const view: SearchStatsView = {
    updatedAt: toIso(data.updatedAt),
    checkedAt: toIso(data.checkedAt),
    ok: data.ok === true,
  };
  if (typeof data.error === 'string' && data.error) view.error = data.error;
  for (const key of ['clicks7', 'impressions7', 'clicksPrev7', 'impressionsPrev7'] as const) {
    if (isNum(data[key])) view[key] = data[key];
  }
  if (Array.isArray(data.topQueries)) {
    view.topQueries = (data.topQueries as TopQuery[]).filter((q) => typeof q?.query === 'string' && q.query);
  }
  if (Array.isArray(data.jobPages)) {
    view.jobPages = (data.jobPages as JobPageStatus[])
      .filter((page) => typeof page?.slug === 'string')
      .map((page) => ({
        slug: page.slug,
        indexed: page.indexed === true,
        coverage: typeof page.coverage === 'string' ? page.coverage : '',
        jobPostingValid: typeof page.jobPostingValid === 'boolean' ? page.jobPostingValid : null,
      }));
  }
  return view;
}

export async function loadOwnerSearchStats(db: Firestore, now = new Date()): Promise<SearchStatsResponse> {
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const [statsSnap, applicationsSnap] = await Promise.all([
    db.collection(SEARCH_STATS_COLLECTION).doc(SEARCH_STATS_DOC).get(),
    // createdAt is what /api/public/applications writes. Only the source is read.
    db.collection('applications').where('createdAt', '>=', since30).select('source', 'createdAt').get(),
  ]);
  const rows = applicationsSnap.docs.map((doc) => {
    const data = doc.data();
    const iso = toIso(data.createdAt);
    return { createdAtMs: iso ? Date.parse(iso) : null, source: data.source };
  });
  return {
    search: serializeSearchStats(statsSnap.exists ? statsSnap.data() : undefined),
    applications: countApplications(rows, now),
  };
}
