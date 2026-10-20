// @vitest-environment jsdom
//
// The Sales tab by role: a fiber rep gets today's Sales list under sales:read;
// a solar-only rep gets My leads plus the next consultation under solar:read.

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  shellPermissions: [] as Array<string[] | undefined>,
}));

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));
vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="board" /> }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: env.user,
    hasPermission: (perm: string) => perm !== 'sales:read:all',
    isRole: () => false,
  }),
}));
vi.mock('@/components/portal/rep/RepShell', () => ({
  RepShell: ({ children, permissions }: { children: ReactNode; permissions?: string[] }) => {
    env.shellPermissions.push(permissions);
    return <>{children}</>;
  },
}));
vi.mock('@/components/portal/rep/MonthPicker', () => ({ MonthPicker: () => <div data-testid="picker" /> }));
vi.mock('@/components/sales/InstallStatusSection', () => ({ InstallStatusSection: () => null }));
vi.mock('@/components/sales/SalesTable', () => ({
  SalesTable: () => <div data-testid="fiber-sales" />,
  SalesViewTabs: () => null,
}));
vi.mock('@/components/portal/rep/CarrierNotice', () => ({ CarrierNotice: () => null }));
vi.mock('@/components/portal/rep/PayHelpSheet', () => ({ PayHelpSheet: () => null }));
vi.mock('./PayoutCard', () => ({ PayoutCard: () => null }));
vi.mock('@/hooks/useSales', () => ({
  useSales: () => ({
    sales: [{ id: 's1', saleDate: new Date().toISOString(), status: 'approved', salesRepId: 'u1' }],
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
  useCompPlan: () => ({ rates: null, payDelayDays: 0, hasPlan: false, compRole: null, loading: false, error: null, retry: vi.fn(), ownerPricing: null }),
}));
vi.mock('@/hooks/useFiberStatus', () => ({
  useFiberStatus: () => ({ data: null, staleAt: null, refetch: () => Promise.resolve() }),
}));
vi.mock('@/hooks/useRefreshOnResume', () => ({ useRefreshOnResume: () => {} }));
vi.mock('@/components/portal/solar/SolarMyLeads', () => ({
  useMyLeads: () => ({ leads: [{ id: 'l1' }], failed: false, retry: vi.fn() }),
  SolarNextConsult: ({ onOpen }: { onOpen: (id: string) => void }) => (
    <button type="button" data-testid="next-consult" onClick={() => onOpen('l1')}>
      Next consultation
    </button>
  ),
  SolarMyLeads: () => <section data-testid="my-leads" />,
  SolarLeadSheet: () => <div data-testid="lead-sheet" />,
}));

import SalesPage from './page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`);

beforeEach(() => {
  env.shellPermissions = [];
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the Sales tab by role', () => {
  it('a fiber-only rep: today\'s Sales list under sales:read, nothing solar, no switch', () => {
    env.user = { uid: 'u1', role: 'rep', fieldRole: 'ae_tier_1' };
    act(() => root.render(<SalesPage />));
    expect(env.shellPermissions.at(-1)).toEqual(['sales:read']);
    expect(q('fiber-sales')).not.toBeNull();
    expect(q('my-leads')).toBeNull();
    expect(container.querySelector('[aria-label="Sales"]')).toBeNull();
  });

  it('a solar-only rep: My leads and the next consultation under solar:read, no switch', () => {
    env.user = { uid: 'u1', solarRole: 'entry_canvasser' };
    act(() => root.render(<SalesPage />));
    expect(env.shellPermissions.at(-1)).toEqual(['solar:read']);
    expect(container.querySelector('h1')?.textContent).toBe('Sales');
    expect(q('next-consult')).not.toBeNull();
    expect(q('my-leads')).not.toBeNull();
    expect(q('fiber-sales')).toBeNull();
    expect(container.querySelector('[aria-label="Sales"]')).toBeNull();
    // A lead opens its details sheet.
    act(() => (q('next-consult') as HTMLButtonElement).click());
    expect(q('lead-sheet')).not.toBeNull();
  });
});
