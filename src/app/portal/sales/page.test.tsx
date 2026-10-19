// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentMonth, shiftMonth, type MonthKey } from '@/lib/sales/monthWindow';
import { monthParam } from '@/lib/sales/loggedSale';

const testState = vi.hoisted(() => ({
  canViewAll: true,
  search: '',
  pickers: [] as Array<{ month: MonthKey; max: MonthKey }>,
  sales: [] as unknown[],
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(testState.search),
}));

vi.mock('next/dynamic', () => ({
  default: () =>
    function DynamicStub() {
      return <div data-testid="board" />;
    },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'u1', role: testState.canViewAll ? 'admin' : 'rep' },
    hasPermission: (perm: string) => (perm === 'sales:read:all' ? testState.canViewAll : true),
    isRole: () => testState.canViewAll,
  }),
}));

vi.mock('@/components/portal/rep/RepShell', () => ({
  RepShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/portal/rep/MonthPicker', () => ({
  MonthPicker: ({ month, max }: { month: MonthKey; max: MonthKey }) => {
    testState.pickers.push({ month, max });
    return <div data-testid="picker" />;
  },
}));

vi.mock('@/components/sales/InstallStatusSection', () => ({ InstallStatusSection: () => null }));
vi.mock('@/components/sales/SalesTable', () => ({ SalesTable: () => null, SalesViewTabs: () => null }));
vi.mock('@/components/portal/rep/CarrierNotice', () => ({ CarrierNotice: () => null }));
vi.mock('@/components/portal/rep/PayHelpSheet', () => ({ PayHelpSheet: () => null }));
vi.mock('./PayoutCard', () => ({ PayoutCard: () => null }));

vi.mock('@/hooks/useSales', () => ({
  useSales: () => ({
    sales: testState.sales,
    truncated: false,
    loading: false,
    error: null,
    fetchSales: () => Promise.resolve(),
    deleteSale: vi.fn(),
    setSaleCancelled: vi.fn(),
    seeded: true,
  }),
}));

vi.mock('@/hooks/useCompPlan', () => ({
  useCompPlan: () => ({
    rates: null,
    payDelayDays: 0,
    hasPlan: false,
    compRole: null,
    loading: false,
    error: null,
    retry: vi.fn(),
    ownerPricing: null,
  }),
}));

vi.mock('@/hooks/useFiberStatus', () => ({
  useFiberStatus: () => ({ data: null, staleAt: null, refetch: () => Promise.resolve() }),
}));

vi.mock('@/hooks/useRefreshOnResume', () => ({ useRefreshOnResume: () => {} }));

import SalesPage from './page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  testState.pickers = [];
  testState.sales = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.history.replaceState(null, '', '/');
});

function open(search: string) {
  testState.search = search;
  window.history.replaceState(null, '', `/portal/sales${search}`);
  act(() => root.render(<SalesPage />));
}

describe('Sales page month from the URL', () => {
  const next = shiftMonth(currentMonth(), 1);

  it('pulls a pay-view link to next month back to this month on the company book', () => {
    testState.canViewAll = true;
    open(`?view=pay&month=${monthParam(next)}`);

    const last = testState.pickers.at(-1)!;
    expect(last.month).toEqual(currentMonth());
    expect(last.max).toEqual(currentMonth());
    const params = new URLSearchParams(window.location.search);
    expect(params.get('view')).toBeNull();
    expect(params.get('month')).toBeNull();
  });

  it('still lets a rep open their pay list on next month', () => {
    testState.canViewAll = false;
    // A rep's picker only shows once they have a sale on the books.
    testState.sales = [{ id: 's1', saleDate: '2026-01-15', customerName: 'Pat Doe', planType: 'fiber' }];
    open(`?view=pay&month=${monthParam(next)}`);

    const last = testState.pickers.at(-1)!;
    expect(last.month).toEqual(next);
    expect(last.max).toEqual(next);
    expect(new URLSearchParams(window.location.search).get('view')).toBe('pay');
  });
});
