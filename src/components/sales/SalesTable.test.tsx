// @vitest-environment jsdom
//
// The rep's own Sales page: the "Plan mix" line over the ledger's month, and an
// est. chargeback row in the Pay view's disconnect month (the 120-day rule).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FiberOrder, FiberStatusResponse, Sale } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'rep1', displayName: 'Braeden', role: 'rep' }, isRole: () => false }),
}));
const view = vi.hoisted(() => ({ readOnly: false, paidUid: undefined as string | null | undefined }));
vi.mock('@/hooks/useSalePaid', () => ({
  useSalePaid: (uid: string | null) => {
    view.paidUid = uid;
    return { paidBySale: {}, togglePaid: vi.fn() };
  },
}));
vi.mock('@/contexts/ViewAsContext', () => ({ useViewAsReadOnly: () => view.readOnly }));
vi.mock('@/lib/firebase/config', () => ({ auth: null }));
vi.mock('./SaleDetailSheet', () => ({ SaleDetailSheet: () => null }));

import { SalesTable } from './SalesTable';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);
const product = (productId: string) => ({
  company: 'tfiber',
  productId,
  productName: productId,
  quantity: 1,
  unitPrice: 0,
  totalPrice: 0,
  points: 8,
});

function sale(id: string, address: string, productId: string, over: Partial<Sale> = {}): Sale {
  return {
    id,
    salesRepId: 'rep1',
    salesRepName: 'Braeden Carter',
    customerName: `Customer ${id}`,
    customerAddress: address,
    saleType: 'new_service',
    products: [product(productId)],
    totalValue: 60,
    totalPoints: 8,
    status: 'approved',
    saleDate: noon(2026, 9, 2),
    installDate: noon(2026, 9, 6),
    createdAt: noon(2026, 9, 2),
    updatedAt: noon(2026, 9, 2),
    ...over,
  } as Sale;
}

const order = (address: string, over: Partial<FiberOrder>): FiberOrder =>
  ({
    id: `o-${address}`,
    status: 'active',
    address,
    matchedUserId: 'rep1',
    orderDate: '2026-09-02',
    estInstallDate: null,
    activationDate: null,
    cancellationDate: null,
    deactivationDate: null,
    ...over,
  }) as FiberOrder;

const SALES = [
  sale('a', '1 Oak St', 'tfiber-1gig'),
  sale('b', '2 Oak St', 'tfiber-1gig'),
  sale('c', '3 Oak St', 'tfiber-2gig'),
  // Disconnected 14 days after install: off the board and the mix, charged back in September.
  sale('d', '4 Oak St', 'tfiber-300', { customerName: 'Stephen Nolan' }),
];
const FIBER = {
  orders: [
    order('1 Oak St', { activationDate: '2026-09-06' }),
    order('2 Oak St', { activationDate: '2026-09-06' }),
    order('3 Oak St', { activationDate: '2026-09-06' }),
    order('4 Oak St', { status: 'churned', activationDate: '2026-09-06', deactivationDate: '2026-09-20' }),
  ],
  lastReportAt: '2026-09-21T12:00:00.000Z',
  lastReportAsOf: '2026-09-20',
} as unknown as FiberStatusResponse;

function render(payView: boolean) {
  act(() => {
    root.render(
      <SalesTable
        sales={SALES}
        payView={payView}
        month={{ year: 2026, month: 8 }}
        payPlan={{ rates: { tfiber: { 'tfiber-1gig': 140, 'tfiber-2gig': 160, 'tfiber-300': 70 } }, payDelayDays: 0, hasPlan: true }}
        fiber={{ data: FIBER, loading: false, error: null }}
      />
    );
  });
}

beforeEach(() => {
  view.readOnly = false;
  view.paidUid = undefined;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SalesTable', () => {
  it('shows the plan mix of the month, counted like the Board', () => {
    render(false);
    expect(container.querySelector('[data-testid="plan-mix"]')?.textContent).toBe('Plan mix 2× 1 Gig, 1× 2 Gig.');
    // The charged-back sale stays in the ledger, read calmly.
    expect(container.textContent).toContain('Cancelled after install · chargeback');
  });

  it('nets an est. chargeback row into the disconnect month of the Pay view', () => {
    render(true);
    const row = container.querySelector<HTMLElement>('[data-part="chargeback-row"]')!;
    expect(row.textContent).toContain('Stephen N.');
    expect(row.textContent).toContain('−$70');
    expect(row.textContent).toContain('Cancelled within 120 days of install');
    expect(container.textContent).toContain('Est. chargebacks · Sep');
    // 140 + 140 + 160 + 70 installed, − 70 charged back.
    expect(container.textContent).toContain('$440');
    expect(container.textContent).not.toMatch(/pays on|pay date/i);
  });

  it('the rep\'s own Pay view has the private Paid ticks', () => {
    render(true);
    expect(view.paidUid).toBe('rep1');
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(0);
  });

  it('owner viewing as the rep (read only): no Paid ticks, and the rep\'s private ticks are not read', () => {
    view.readOnly = true;
    render(true);
    expect(view.paidUid).toBeNull();
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(container.textContent).toContain('$440');
  });

  it('VoiceOver can reach the Paid tick: no row is a role="button", and each row opens through a real button', () => {
    render(true);
    const rows = container.querySelectorAll<HTMLElement>('[data-part="pay-row"]');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.getAttribute('role')).toBeNull();
      expect(row.querySelector('button')).not.toBeNull();
    }
    for (const box of container.querySelectorAll('input[type="checkbox"]')) {
      expect(box.closest('[role="button"]')).toBeNull();
    }
    render(false);
    for (const row of container.querySelectorAll<HTMLElement>('[data-part="sale-row"]')) {
      expect(row.getAttribute('role')).toBeNull();
      expect(row.querySelector('button')?.textContent).toBeTruthy();
    }
  });
});
