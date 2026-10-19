import type { Firestore } from 'firebase-admin/firestore';
import { MARKET_JOBS, marketJobPath } from '@/app/_cinematic/marketJobs';
import { SITE_URL } from '@/app/_cinematic/nav';
import { classifySearchError, fetchSearchFigures, type FetchFn } from './searchConsole';
import { getSearchConsoleToken } from './googleToken';
import type { SearchFigures } from './searchStatsTypes';

// The daily Search Console pull behind the owner's "Hiring from search" card.
// One document, config/searchStats. A good run replaces it; a failed run keeps
// the last good figures and only records ok: false, the error and when it
// tried, so the card can say why it is waiting.
//
// SEARCH_STATS_OFF=true makes every run a dry run: the same Google reads,
// nothing written.

export const SEARCH_STATS_COLLECTION = 'config';
export const SEARCH_STATS_DOC = 'searchStats';

/** The five job pages, from the postings themselves. */
export function jobPageTargets(): Array<{ slug: string; url: string }> {
  return MARKET_JOBS.map((job) => ({ slug: job.slug, url: `${SITE_URL}${marketJobPath(job.slug)}` }));
}

export interface SearchStatsRun {
  ok: boolean;
  error?: string;
  dryRun: boolean;
  figures?: SearchFigures;
}

/** One Search Console call; a hung connection must not hold the cron to its limit. */
const SEARCH_FETCH_TIMEOUT_MS = 15_000;

export async function runSearchStats(deps: {
  db: Pick<Firestore, 'collection'>;
  now?: Date;
  fetchFn?: FetchFn;
  getToken?: () => Promise<string>;
  dryRun?: boolean;
}): Promise<SearchStatsRun> {
  const now = deps.now ?? new Date();
  const dryRun = deps.dryRun ?? process.env.SEARCH_STATS_OFF === 'true';
  const ref = deps.db.collection(SEARCH_STATS_COLLECTION).doc(SEARCH_STATS_DOC);

  let figures: SearchFigures;
  try {
    const token = await (deps.getToken ?? getSearchConsoleToken)();
    figures = await fetchSearchFigures({
      fetchFn: deps.fetchFn ?? ((input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(SEARCH_FETCH_TIMEOUT_MS) })),
      token,
      now,
      jobPages: jobPageTargets(),
    });
  } catch (cause) {
    const error = classifySearchError(cause);
    console.error('[search-stats] run failed:', error);
    // merge: the last good figures and their updatedAt stay as they were.
    if (!dryRun) await ref.set({ ok: false, error, checkedAt: now }, { merge: true });
    return { ok: false, error, dryRun };
  }

  if (!dryRun) await ref.set({ ...figures, ok: true, updatedAt: now, checkedAt: now });
  return { ok: true, dryRun, figures };
}
