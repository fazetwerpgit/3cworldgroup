'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthProvider } from '@/contexts/AuthContext';
import { AdminSalesBoard } from '@/components/sales/AdminSalesBoard';
import { InstallStatusSection } from '@/components/sales/InstallStatusSection';
import type { Sale } from '@/types';
import type { FiberOrder, FiberOrderStatus } from '@/types/fiberOrder';
import s from '@/components/portal/rep/rep.module.css';
import x from '@/components/portal/rep/rep-sales.module.css';

// Temporary harness (untracked, never committed): rep Sales C on mock data.
const d = (day: number, month = 8) => new Date(2026, month, day, 12);
const PLANS: Record<string, [string, string, number, number]> = {
  tf1: ['tfiber', 'T-Fiber 1 Gig', 80, 120],
  tf2: ['tfiber', 'T-Fiber 2 Gig', 110, 140],
  att: ['att', 'AT&T Fiber 1 Gig', 80, 90],
  fr: ['frontier', 'Frontier 1 Gig', 80, 80],
  xf: ['xfinity', 'Xfinity 1 Gig', 80, 60],
};
const rates = { tfiber: { tf1: 280, tf2: 310 }, att: { att: 225 }, frontier: { fr: 150 }, xfinity: { xf: 125 } };

function sale(id: string, name: string, plan: string, addr: string, sold: number, install: Date | null, extra: Partial<Sale> = {}): Sale {
  const [company, productName, price, points] = PLANS[plan];
  return {
    id,
    salesRepId: 'rep1',
    salesRepName: 'Marcus',
    customerName: name,
    customerPhone: '(555) 014-2290',
    customerAddress: addr,
    saleType: 'fiber' as Sale['saleType'],
    products: [{ productId: plan, productName, company, quantity: 1, unitPrice: price, totalPrice: price, points }],
    totalValue: price,
    totalPoints: points,
    commission: (rates as Record<string, Record<string, number>>)[company][plan],
    orderNumberOrBtn: `Order ${id.toUpperCase()}`,
    status: 'approved' as Sale['status'],
    saleDate: d(sold),
    installDate: install ?? undefined,
    notes: 'Gate code 4471. Home after 3 PM.',
    ...extra,
  } as Sale;
}

const REPS = ['Marcus', 'Dana Ruiz', 'Tyrell Banks', 'Priya Shah'];
const RAW: Sale[] = [
  sale('s1', 'Whitfield', 'xf', '88 Orchard Ln', 22, d(30)),
  sale('s2', 'Okafor', 'tf2', '610 Birch St', 21, null),
  sale('s3', 'Brennan', 'att', '3325 Hollis Rd', 20, d(26)),
  sale('s4', 'Nakamura', 'tf1', '2207 Linden Ave', 18, d(24)),
  sale('s5', 'Delacroix', 'fr', '45 Quarry Ct', 16, d(19)),
  sale('s6', 'Castellano', 'tf1', '1902 Elm Pl', 15, null, { status: 'cancelled' as Sale['status'], cancelReason: 'Customer backed out', cancellerName: 'Jacob' }),
  sale('s7', 'Alvarez', 'tf1', '1418 Maple Ct', 12, d(19)),
  sale('s8', 'Pruitt', 'tf2', '77 Ridge Way', 10, d(20)),
  sale('s9', 'Haskins', 'tf1', '509 Fern Dr', 8, d(22), { status: 'pending' as Sale['status'] }),
  sale('s10', 'Moreau', 'att', '1260 Vale St', 4, d(11)),
  sale('s11', 'Ferreira', 'tf1', '12 Cedar Ct', 28, d(5), { saleDate: d(28, 7) }),
];
const SALES: Sale[] = RAW.map((s, i) => ({ ...s, salesRepId: 'rep' + (i % 4), salesRepName: REPS[i % 4] } as Sale));

function order(id: string, addr: string, status: FiberOrderStatus, est: string | null): FiberOrder {
  return {
    id, status, rawStatus: status, repDealerId: '1', repName: 'Marcus', matchedUserId: 'rep1',
    orderDate: '2026-09-22', estInstallDate: est, activationDate: status === 'active' ? est : null,
    cancellationDate: null, deactivationDate: null, fiberPlan: '1 Gig', mrc: 80, address: addr, unit: null,
    city: 'Tulsa', state: 'OK', zip: null, breakageReason: null, breakageNotes: null, customerName: null,
    sourceSheet: 'x', reportReceivedAt: '2026-09-23T12:00:00Z', updatedAt: '2026-09-23T12:00:00Z',
  } as FiberOrder;
}

const ORDERS: FiberOrder[] = [
  order('o1', '610 Birch St', 'active', '2026-09-21'),
  order('o2', '2207 Linden Ave', 'pending_install', '2026-09-24'),
  order('o3', '1902 Elm Pl', 'cancelled', null),
  order('o4', '1418 Maple Ct', 'active', '2026-09-19'),
  order('o5', '77 Ridge Way', 'active', '2026-09-20'),
  order('o6', '509 Fern Dr', 'active', '2026-09-22'),
  order('o7', '901 Aspen Row', 'active', '2026-09-12'),
  order('o8', '44 Kettle Ln', 'pending_install', '2026-09-27'),
];
const UNMATCHED: FiberOrder[] = [{ ...order('u1', '3 Pine Hollow', 'active', '2026-09-14'), repName: 'J. Doe', matchedUserId: null } as FiberOrder];

function Harness() {
  const q = useSearchParams();
  const fiber = useMemo(
    () => ({ data: { scope: 'all' as const, lastReportAt: '2026-09-23T12:00:00Z', orders: ORDERS, unmatched: UNMATCHED }, loading: false, error: null, refetch: async () => {} }),
    []
  );
  void q;
  return (
    <div className={s.root} data-shell="rep">
      <main className={s.scroller} id="rep-main">
        <div className={s.main}>
          <div className={x.page}>
            <header className={x.head}>
              <h1 className={x.title}>Sales</h1>
              <div className={x.month}>
                <button type="button" className={x.monthBtn} aria-label="Previous month">‹</button>
                <span className={x.monthLabel}>September 2026</span>
                <button type="button" className={x.monthBtn} aria-label="Next month" disabled>›</button>
              </div>
            </header>
            <div className={x.mgmt}>
              <AdminSalesBoard
                sales={SALES}
                month={{ year: 2026, month: 8 }}
                fiber={fiber}
                payPlan={{ rates, payDelayDays: 14, hasPlan: true, compRole: null }}
              />
              <InstallStatusSection fiber={fiber} sales={SALES} ownerView={false} viewerId={null} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <AuthProvider>
      <Suspense>
        <Harness />
      </Suspense>
    </AuthProvider>
  );
}
