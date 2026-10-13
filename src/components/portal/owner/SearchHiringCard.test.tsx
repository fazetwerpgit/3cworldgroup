// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchStatsResponse } from '@/lib/search/searchStatsTypes';
import { emptyCounts } from '@/lib/search/ownerSearchStats';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'id-token' }));

import { SearchHiringCard } from './SearchHiringCard';

const NOW = Date.parse('2026-10-13T15:00:00Z');

const FULL: SearchStatsResponse = {
  applications: {
    last7: { ...emptyCounts(), google: 2, direct: 3, other: 1 },
    last30: { ...emptyCounts(), google: 5, direct: 9, other: 2, unknown: 4 },
  },
  search: {
    ok: true,
    updatedAt: '2026-10-13T11:00:00Z',
    checkedAt: '2026-10-13T11:00:00Z',
    clicks7: 18,
    impressions7: 1240,
    clicksPrev7: 12,
    impressionsPrev7: 1300,
    topQueries: [
      { query: 'door to door sales jobs dallas', impressions: 300, clicks: 4 },
      { query: 'fiber sales jobs', impressions: 200, clicks: 1 },
      { query: '3c world group', impressions: 100, clicks: 9 },
      { query: 'fourth search', impressions: 50, clicks: 0 },
    ],
    jobPages: [
      { slug: 'dallas', indexed: true, coverage: 'Submitted and indexed', jobPostingValid: true },
      { slug: 'houston', indexed: true, coverage: 'Submitted and indexed', jobPostingValid: false },
      { slug: 'southern-california', indexed: true, coverage: 'Submitted and indexed', jobPostingValid: null },
      { slug: 'lansing', indexed: false, coverage: 'Discovered - currently not indexed', jobPostingValid: null },
      { slug: 'grand-rapids', indexed: false, coverage: 'URL is unknown to Google', jobPostingValid: null },
    ],
  },
};

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

async function show(body: unknown, status = 200) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
  await act(async () => {
    root.render(<SearchHiringCard />);
  });
  await act(async () => {});
}

const text = () => container.textContent?.replace(/\s+/g, ' ') ?? '';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal('fetch', fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockReset();
});

describe('SearchHiringCard', () => {
  it('asks the owner endpoint with the id token', async () => {
    await show(FULL);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/owner/search-stats',
      expect.objectContaining({ headers: { Authorization: 'Bearer id-token' } })
    );
  });

  it('shows applications by channel, Google search and job pages', async () => {
    await show(FULL);
    const t = text();
    expect(t).toContain('Hiring from search');
    expect(t).toContain('Applications, last 7 days');
    expect(t).toContain('Google 2·Direct 3·Other 1');
    expect(t).not.toContain('Indeed');
    expect(t).toContain('20 in the last 30 days');
    expect(t).toContain('1,240 showings');
    expect(t).toContain('18 clicks');
    expect(t).toContain('−5%');
    expect(t).toContain('+50%');
    expect(t).toContain('Job pages on Google3 of 5');
    expect(t).toContain('door to door sales jobs dallas·fiber sales jobs·3c world group');
    expect(t).not.toContain('fourth search');
    expect(t).toContain('Updated 4h ago');
  });

  it('opens the city list from the job pages row', async () => {
    await show(FULL);
    const button = container.querySelector('button[aria-expanded]') as HTMLButtonElement;
    const list = container.querySelector('ul') as HTMLUListElement;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(list.hidden).toBe(true);
    act(() => button.click());
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(list.hidden).toBe(false);
    const rows = [...list.querySelectorAll('li')].map((li) => li.textContent?.replace(/\s+/g, ' '));
    expect(rows).toEqual([
      'DallasIndexed·Job listing valid',
      'HoustonIndexed',
      'Southern CaliforniaIndexed',
      'LansingNot yet',
      'Grand RapidsNot yet',
    ]);
  });

  it('shows Google always, even at zero', async () => {
    await show({ ...FULL, applications: { last7: emptyCounts(), last30: emptyCounts() } });
    expect(text()).toContain('Google 0');
    expect(text()).toContain('0 in the last 30 days');
  });

  it('says the first update is coming before the cron has run', async () => {
    await show({ ...FULL, search: null });
    expect(text()).toContain('First update arrives tomorrow morning');
    expect(text()).not.toContain('showings');
    expect(text()).not.toContain('Updated');
  });

  it.each([
    ['no_access', 'Waiting on Search Console access'],
    ['api_disabled', 'Search Console API is off'],
  ])('explains %s instead of showing numbers', async (error, message) => {
    await show({ ...FULL, search: { ok: false, error, updatedAt: null, checkedAt: '2026-10-13T11:00:00Z' } });
    expect(text()).toContain(message);
    expect(text()).not.toContain('showings');
    expect(text()).toContain('Last checked 4h ago');
  });

  it('keeps the last good numbers when a later run fails', async () => {
    await show({ ...FULL, search: { ...FULL.search!, ok: false, error: 'no_access' } });
    expect(text()).toContain('1,240 showings');
    expect(text()).toContain('Updated 4h ago · Waiting on Search Console access');
  });

  it('offers Retry when the request fails', async () => {
    await show({ error: 'Forbidden' }, 403);
    expect(text()).toContain('Couldn\'t load hiring from search');
  });
});
