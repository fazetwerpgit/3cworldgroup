import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OwnerDashboardState } from '@/hooks/useOwnerDashboard';
import type { ProblemRow } from '@/lib/owner/companySummary';

const state = vi.hoisted(() => ({
  dash: null as unknown as OwnerDashboardState,
  role: 'owner' as string,
}));

vi.mock('@/hooks/useOwnerDashboard', () => ({ useOwnerDashboard: () => ({ ...state.dash, retry: vi.fn() }) }));
vi.mock('@/components/portal/PushPromptBanner', () => ({ default: () => null, usePushPromptVisible: () => [null, vi.fn()] }));
vi.mock('@/components/portal/AddToHomeScreenBanner', () => ({ default: () => null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isRole: (...roles: string[]) => roles.includes(state.role) }) }));
vi.mock('@/components/portal/rep/RepDashboard', () => ({ RepDashboard: () => <p>rep-dashboard</p> }));

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
  (['payrollDisputes', 'bugReports', 'pendingSignups'] as const).map((key) => ({
    key,
    count: counts[key] ?? 0,
    href: `/portal/admin/${key}`,
  }));

beforeEach(() => {
  state.role = 'owner';
  state.dash = {
    money: { status: 'ready', data: MONEY },
    problems: { status: 'ready', data: problems({ payrollDisputes: 2 }) },
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

  it('lists only non-zero problems, each linking to its page', () => {
    const html = renderToStaticMarkup(<OwnerDashboard />);
    expect(html).toContain('Open pay disputes');
    expect(html).toContain('href="/portal/admin/payrollDisputes"');
    expect(html).not.toContain('bug report');
    expect(html).not.toContain('All clear');
  });

  it('says All clear once when every count is zero', () => {
    state.dash.problems = { status: 'ready', data: problems({}) };
    const html = renderToStaticMarkup(<OwnerDashboard />);
    expect(html.match(/All clear/g)).toHaveLength(1);
  });

  it('shows Couldn’t load · Retry for a failed section, never zeros', () => {
    state.dash.money = { status: 'error' };
    state.dash.problems = { status: 'error' };
    const html = renderToStaticMarkup(<OwnerDashboard />);
    expect(html).toContain('Couldn&#x27;t load company money');
    expect(html).toContain('Couldn&#x27;t load what needs attention');
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
