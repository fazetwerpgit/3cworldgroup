import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OwnerDashboardState } from '@/hooks/useOwnerDashboard';
import type { ProblemRow } from '@/lib/owner/companySummary';
import type { QueueCard } from '@/components/portal/admin-d/opsQueues';

const state = vi.hoisted(() => ({
  dash: null as unknown as OwnerDashboardState,
  role: 'owner' as string,
  queues: null as QueueCard[] | null,
}));

vi.mock('@/hooks/useOwnerDashboard', () => ({ useOwnerDashboard: () => ({ ...state.dash, retry: vi.fn() }) }));
vi.mock('@/components/portal/PushPromptBanner', () => ({ default: () => null, usePushPromptVisible: () => [null, vi.fn()] }));
vi.mock('@/components/portal/AddToHomeScreenBanner', () => ({ default: () => null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isRole: (...roles: string[]) => roles.includes(state.role) }) }));
vi.mock('@/components/portal/rep/RepDashboard', () => ({ RepDashboard: () => <p>rep-dashboard</p> }));
vi.mock('@/components/portal/admin-d/opsQueues', () => ({
  useOpsQueues: () => ({ cards: state.queues, loading: false, refreshedAt: null, refresh: vi.fn() }),
}));

import { OwnerDashboard } from './OwnerDashboard';
import DashboardPage from '@/app/portal/dashboard/page';

const figures = (installs: number, revenue: number, commissions: number) => ({
  installs,
  revenue,
  commissions,
  margin: revenue - commissions,
});
const MONEY = {
  week: { current: figures(14, 6420, 2110), prior: figures(11, 5060, 1690), priorEnd: '2026-09-15T17:00:00.000Z' },
  month: { current: figures(112, 51300, 16900), prior: figures(98, 44750, 14060), priorEnd: '2026-08-22T17:00:00.000Z' },
  unpricedInstalls: 0,
  unratedInstalls: 0,
  reportAt: null,
};
const RECRUITING = {
  applications: { thisWeek: 11, lastWeek: 14 },
  interviews: { thisWeek: 4, lastWeek: 6 },
  activations: { thisWeek: 2, lastWeek: 3 },
  firstInstalls: { thisWeek: 1, lastWeek: 2 },
};
const problems = (counts: Partial<Record<ProblemRow['key'], number>>): ProblemRow[] =>
  (['carrierCancellations', 'stalledOnboarding', 'missingInstallDate', 'payrollDisputes'] as const).map((key) => ({
    key,
    count: counts[key] ?? 0,
    href: `/portal/check/${key}`,
  }));
const queue = (key: string, label: string, count: number, extra: Partial<QueueCard> = {}): QueueCard => ({
  key,
  label,
  href: `/portal/admin/onboarding?tab=${key}`,
  hub: '/portal/admin/onboarding',
  count,
  oldestWaitMs: null,
  newToday: null,
  error: false,
  ...extra,
});
const DAY = 1000 * 60 * 60 * 24;

beforeEach(() => {
  state.role = 'owner';
  state.queues = [
    queue('review', 'Onboarding review', 2, { newToday: 1, oldestWaitMs: 3 * DAY }),
    queue('pipeline', 'Onboarding pipeline', 0),
    queue('payroll-disputes', 'Payroll disputes', 4, { hub: '/portal/admin/requests' }),
  ];
  state.dash = {
    money: { status: 'ready', data: MONEY },
    problems: { status: 'ready', data: problems({ stalledOnboarding: 3, carrierCancellations: 5 }) },
    recruiting: { status: 'ready', data: RECRUITING },
  };
});

describe('OwnerDashboard', () => {
  it('shows estimated money in $12,480 form with the disclaimer', () => {
    const html = renderToStaticMarkup(<OwnerDashboard />);
    expect(html).toContain('$34,400');
    expect(html).toContain('$51,300');
    expect(html).toContain('Est. margin');
    expect(html).toContain('Estimates from installs');
  });

  it('puts the change on the two hero figures only; table cells say vs the prior value', () => {
    const html = renderToStaticMarkup(<OwnerDashboard />);
    expect(html.match(/aria-label="[+−-]?\d+%/g)).toEqual(['aria-label="+12%', 'aria-label="+27%']);
    expect(html).toContain('$44,750<span aria-hidden="true"> prior</span>');
  });

  it('lists the onboarding work with something waiting, each linking to its tab', () => {
    const html = renderToStaticMarkup(<OwnerDashboard />);
    expect(html).toContain('Needs attention');
    expect(html).toContain('href="/portal/admin/onboarding?tab=review"');
    expect(html).toContain('3d');
    expect(html).toContain('Stuck in onboarding 3+ days');
    expect(html).toContain('href="/portal/check/stalledOnboarding"');
    // 2 to review + 3 stuck; nothing else counts toward the total.
    expect(html).toMatch(/<b>5<\/b> waiting · 1 new today · 1 over 2 days/);
  });

  it('leaves out empty rows, the Requests queues and the sales checks', () => {
    const html = renderToStaticMarkup(<OwnerDashboard />);
    expect(html).not.toContain('Onboarding pipeline');
    expect(html).not.toContain('Payroll disputes');
    expect(html).not.toContain('Carrier cancellations');
    expect(html).not.toContain('install date');
    expect(html).not.toContain('Nothing waiting');
  });

  it('says Nothing waiting once every onboarding row is zero', () => {
    state.queues = [queue('review', 'Onboarding review', 0), queue('payroll-disputes', 'Payroll disputes', 4, { hub: '/portal/admin/requests' })];
    state.dash.problems = { status: 'ready', data: problems({}) };
    const html = renderToStaticMarkup(<OwnerDashboard />);
    expect(html.match(/Nothing waiting/g)).toHaveLength(1);
    expect(html).not.toContain('waiting ·');
  });

  it('shows Couldn’t load · Retry for a failed section, never zeros', () => {
    state.dash.money = { status: 'error' };
    state.dash.problems = { status: 'error' };
    const html = renderToStaticMarkup(<OwnerDashboard />);
    expect(html).toContain('Couldn&#x27;t load company money');
    expect(html).toContain('Couldn&#x27;t load this queue');
    expect(html).toContain('Stuck in onboarding 3+ days');
    expect(html).not.toContain('$0');
    expect(html).toContain('Applications');
  });

  it('renders skeletons while loading', () => {
    state.dash = { money: { status: 'loading' }, problems: { status: 'loading' }, recruiting: { status: 'loading' } };
    const html = renderToStaticMarkup(<OwnerDashboard />);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('$');
  });
});

describe('/portal/dashboard', () => {
  it('gives the owner the company view', () => {
    expect(renderToStaticMarkup(<DashboardPage />)).toContain('Company dashboard');
  });

  it.each(['admin', 'operations', 'ae_tier_1'])('keeps the rep dashboard for %s', (role) => {
    state.role = role;
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(html).toContain('rep-dashboard');
    expect(html).not.toContain('Company dashboard');
  });
});
