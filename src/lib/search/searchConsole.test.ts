import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  classifySearchError,
  fetchSearchFigures,
  pacificDay,
  parseInspection,
  parseTopQueries,
  parseTotals,
  searchConsoleQuotaProject,
  SearchConsoleError,
  searchRanges,
  SEARCH_ANALYTICS_URL,
  URL_INSPECTION_URL,
  type FetchFn,
} from './searchConsole';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('date ranges', () => {
  it('uses the Pacific date, not UTC', () => {
    // 03:00 UTC on Oct 13 is still Oct 12 in Los Angeles.
    expect(pacificDay(new Date('2026-10-13T03:00:00Z'))).toBe('2026-10-12');
    expect(pacificDay(new Date('2026-10-13T08:00:00Z'))).toBe('2026-10-13');
  });

  it('moves across month and year ends', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('ends every window two days before today', () => {
    expect(searchRanges(new Date('2026-10-13T12:00:00Z'))).toEqual({
      last7: { startDate: '2026-10-05', endDate: '2026-10-11' },
      prev7: { startDate: '2026-09-28', endDate: '2026-10-04' },
      last28: { startDate: '2026-09-14', endDate: '2026-10-11' },
    });
  });
});

describe('parsing', () => {
  it('reads totals, and zero for a week with no rows', () => {
    expect(parseTotals({ rows: [{ clicks: 18, impressions: 1240, ctr: 0.01 }] })).toEqual({ clicks: 18, impressions: 1240 });
    expect(parseTotals({ responseAggregationType: 'byProperty' })).toEqual({ clicks: 0, impressions: 0 });
    expect(parseTotals(null)).toEqual({ clicks: 0, impressions: 0 });
  });

  it('sorts searches by impressions and keeps five', () => {
    const rows = [
      { keys: ['a'], clicks: 9, impressions: 10 },
      { keys: ['b'], clicks: 1, impressions: 500 },
      { keys: ['c'], clicks: 0, impressions: 40 },
      { keys: ['d'], clicks: 0, impressions: 30 },
      { keys: ['e'], clicks: 0, impressions: 20 },
      { keys: ['f'], clicks: 0, impressions: 60 },
      { keys: [''], clicks: 0, impressions: 900 },
    ];
    expect(parseTopQueries({ rows }).map((q) => q.query)).toEqual(['b', 'f', 'c', 'd', 'e']);
  });

  it('reads an indexed page with a valid job posting', () => {
    const json = {
      inspectionResult: {
        indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed' },
        richResultsResult: {
          verdict: 'PASS',
          detectedItems: [
            { richResultType: 'Breadcrumbs', items: [{ name: 'x' }] },
            { richResultType: 'Job posting', items: [{ name: 'Sales Rep', issues: [{ severity: 'WARNING' }] }] },
          ],
        },
      },
    };
    expect(parseInspection('dallas', json)).toEqual({
      slug: 'dallas',
      indexed: true,
      coverage: 'Submitted and indexed',
      jobPostingValid: true,
    });
  });

  it('reads a job posting with errors as not valid, and no rich results as unknown', () => {
    const broken = {
      inspectionResult: {
        indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed' },
        richResultsResult: {
          detectedItems: [{ richResultType: 'Job posting', items: [{ issues: [{ severity: 'ERROR' }] }] }],
        },
      },
    };
    expect(parseInspection('houston', broken).jobPostingValid).toBe(false);

    const notIndexed = {
      inspectionResult: {
        indexStatusResult: { verdict: 'NEUTRAL', coverageState: 'Discovered - currently not indexed' },
      },
    };
    expect(parseInspection('lansing', notIndexed)).toEqual({
      slug: 'lansing',
      indexed: false,
      coverage: 'Discovered - currently not indexed',
      jobPostingValid: null,
    });
  });
});

describe('classifySearchError', () => {
  it('sorts a 403 into api_disabled or no_access', () => {
    expect(
      classifySearchError(
        new SearchConsoleError(
          403,
          'Google Search Console API has not been used in project 123 before or it is disabled. Enable it by visiting ...'
        )
      )
    ).toBe('api_disabled');
    expect(
      classifySearchError(
        new SearchConsoleError(403, 'Caller does not have required permission to use project gen-lang-client-1.')
      )
    ).toBe('api_disabled');
    expect(classifySearchError(new SearchConsoleError(403, 'Permission denied: serviceusage.services.use'))).toBe(
      'api_disabled'
    );
    expect(
      classifySearchError(
        new SearchConsoleError(403, "User does not have sufficient permission for site 'sc-domain:3cworldgroup.com'.")
      )
    ).toBe('no_access');
  });

  it('keeps any other failure as a short message', () => {
    expect(classifySearchError(new SearchConsoleError(500, 'Backend Error'))).toBe('HTTP 500: Backend Error');
    expect(classifySearchError(new Error('invalid_grant'))).toBe('invalid_grant');
  });
});

// ---------------------------------------------------------------- fetch

const PAGES = [
  { slug: 'dallas', url: 'https://www.3cworldgroup.com/opportunities/dallas' },
  { slug: 'houston', url: 'https://www.3cworldgroup.com/opportunities/houston' },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function googleFetch() {
  return vi.fn<FetchFn>(async (url, init) => {
    const body = JSON.parse(String(init.body));
    if (url === SEARCH_ANALYTICS_URL) {
      if (body.dimensions) return jsonResponse({ rows: [{ keys: ['door to door sales jobs'], clicks: 3, impressions: 90 }] });
      return jsonResponse({
        rows: [body.startDate === '2026-10-05' ? { clicks: 18, impressions: 1240 } : { clicks: 12, impressions: 1000 }],
      });
    }
    if (url === URL_INSPECTION_URL) {
      return jsonResponse({
        inspectionResult: {
          indexStatusResult: body.inspectionUrl.endsWith('dallas')
            ? { verdict: 'PASS', coverageState: 'Submitted and indexed' }
            : { verdict: 'NEUTRAL', coverageState: 'URL is unknown to Google' },
        },
      });
    }
    throw new Error(`unexpected ${url}`);
  });
}

const headersOf = (init: RequestInit) => init.headers as Record<string, string>;

describe('fetchSearchFigures', () => {
  it('asks Google for both weeks, the top searches and each job page', async () => {
    const fetchFn = googleFetch();
    const figures = await fetchSearchFigures({
      fetchFn,
      token: 'tok',
      now: new Date('2026-10-13T12:00:00Z'),
      jobPages: PAGES,
    });
    expect(figures).toEqual({
      clicks7: 18,
      impressions7: 1240,
      clicksPrev7: 12,
      impressionsPrev7: 1000,
      topQueries: [{ query: 'door to door sales jobs', impressions: 90, clicks: 3 }],
      jobPages: [
        { slug: 'dallas', indexed: true, coverage: 'Submitted and indexed', jobPostingValid: null },
        { slug: 'houston', indexed: false, coverage: 'URL is unknown to Google', jobPostingValid: null },
      ],
    });
    expect(fetchFn).toHaveBeenCalledTimes(5);
    const inspect = fetchFn.mock.calls.find(([url]) => url === URL_INSPECTION_URL)!;
    expect(JSON.parse(String(inspect[1].body))).toMatchObject({ siteUrl: 'sc-domain:3cworldgroup.com' });
    expect(headersOf(inspect[1]).Authorization).toBe('Bearer tok');
  });

  it('sends no x-goog-user-project when SEARCH_CONSOLE_QUOTA_PROJECT is unset', async () => {
    vi.stubEnv('SEARCH_CONSOLE_QUOTA_PROJECT', '');
    expect(searchConsoleQuotaProject()).toBeNull();
    const fetchFn = googleFetch();
    await fetchSearchFigures({ fetchFn, token: 'tok', now: new Date('2026-10-13T12:00:00Z'), jobPages: PAGES });
    for (const [, init] of fetchFn.mock.calls) {
      expect(Object.keys(headersOf(init)).map((k) => k.toLowerCase())).not.toContain('x-goog-user-project');
    }
  });

  it('sends x-goog-user-project on every request when SEARCH_CONSOLE_QUOTA_PROJECT is set', async () => {
    vi.stubEnv('SEARCH_CONSOLE_QUOTA_PROJECT', 'billing-project-1');
    const fetchFn = googleFetch();
    await fetchSearchFigures({ fetchFn, token: 'tok', now: new Date('2026-10-13T12:00:00Z'), jobPages: PAGES });
    expect(fetchFn).toHaveBeenCalledTimes(5);
    for (const [, init] of fetchFn.mock.calls) {
      expect(headersOf(init)['x-goog-user-project']).toBe('billing-project-1');
    }
  });

  it('fails with the status and Google message on a 403', async () => {
    const fetchFn = vi.fn<FetchFn>(async () =>
      jsonResponse({ error: { code: 403, message: 'User does not have sufficient permission for site.' } }, 403)
    );
    const failure = await fetchSearchFigures({ fetchFn, token: 't', now: new Date(), jobPages: PAGES }).catch((e) => e);
    expect(failure).toBeInstanceOf(SearchConsoleError);
    expect(failure.status).toBe(403);
    expect(classifySearchError(failure)).toBe('no_access');
  });
});
