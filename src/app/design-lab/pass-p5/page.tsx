'use client';

import { AuthProvider } from '@/contexts/AuthContext';
import { OwnerDashboard } from '@/components/portal/owner/OwnerDashboard';
import { APPLICATION_COUNT_KEYS } from '@/lib/search/searchStatsTypes';
import s from '@/components/portal/rep/rep.module.css';

// Login-free harness for taste pass P5: the owner dashboard on mock data.
// ?state=loading | error shows those states. The company book renders at
// /design-lab/sales-c-admin and announcements at /design-lab/announce.
const fig = (installs: number, revenue: number, commissions: number, chargebacks = 0) => ({
  installs,
  chargebacks,
  revenue,
  commissions,
  margin: revenue - commissions,
});

const SUMMARY = {
  money: {
    week: { current: fig(14, 6420, 2110), prior: fig(11, 5060, 1690), priorEnd: '2026-10-08T17:00:00.000Z' },
    month: { current: fig(112, 51300, 16900, 2), prior: fig(98, 44750, 14060), priorEnd: '2026-09-15T17:00:00.000Z' },
    unpricedInstalls: 2,
    unratedInstalls: 0,
    reportAt: '2026-10-16T12:00:00.000Z',
  },
  markets: {
    markets: [
      { market: 'Michigan', count: 24 },
      { market: 'Texas', count: 20 },
      { market: 'Oklahoma', count: 9 },
    ],
    total: 53,
    placedByRep: 0,
  },
  problems: [
    { key: 'overdueInstalls', count: 3, href: '/portal/sales', oldestDays: 6 },
    { key: 'calloutsNotLogged', count: 2, href: '/portal/sales', reps: [{ name: 'Dana Ruiz', count: 1 }, { name: 'Marcus', count: 1 }] },
    { key: 'unloggedOrders', count: 0, href: '/portal/sales' },
    { key: 'stalledOnboarding', count: 1, href: '/portal/admin/onboarding', oldestDays: 4 },
  ],
  recruiting: {
    applications: { thisWeek: 11, lastWeek: 14 },
    interviews: { thisWeek: 4, lastWeek: 6 },
    activations: { thisWeek: 2, lastWeek: 3 },
    firstInstalls: { thisWeek: 1, lastWeek: 2 },
  },
};

const counts = (o: Record<string, number>) => ({ ...Object.fromEntries(APPLICATION_COUNT_KEYS.map((k) => [k, 0])), ...o });
const SEARCH = {
  applications: {
    last7: counts({ google: 2, direct: 3, other: 1 }),
    last30: counts({ google: 5, direct: 9, other: 2, unknown: 4 }),
  },
  search: {
    ok: true,
    updatedAt: '2026-10-16T11:00:00Z',
    checkedAt: '2026-10-16T11:00:00Z',
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
      { slug: 'lansing', indexed: false, coverage: 'Discovered - currently not indexed', jobPostingValid: null },
    ],
  },
};

if (typeof window !== 'undefined') {
  const mode = new URLSearchParams(window.location.search).get('state');
  window.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (mode === 'loading') return new Promise<Response>(() => {});
    if (mode === 'error') return new Response('{"error":"x"}', { status: 500 });
    const json = url.includes('/owner/summary')
      ? SUMMARY
      : url.includes('/owner/search-stats')
        ? SEARCH
        : url.includes('/onboarding/review')
          ? { items: [] }
          : url.includes('/recruiting/invites')
            ? { invites: [] }
            : url.includes('/pipeline')
              ? { candidates: [] }
              : {};
    return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

export default function Page() {
  return (
    <AuthProvider>
      <div className={s.root} data-shell="rep">
        <main className={s.scroller} id="rep-main">
          <div className={s.main}>
            <OwnerDashboard />
          </div>
        </main>
      </div>
    </AuthProvider>
  );
}
