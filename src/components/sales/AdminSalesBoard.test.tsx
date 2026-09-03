// @vitest-environment jsdom
//
// The board merges two feeds that arrive on different clocks: the sales the
// reps logged and the carrier's all-time report. This covers the join that
// broke when only one of them was month-bounded — a sale logged in a PAST
// month whose carrier order sits in the CURRENT month has to read as one
// `agreed` row, not as a red "Never logged" accusation plus a sale row
// somewhere else.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FiberOrder, Sale } from '@/types';
import type { MonthKey } from '@/lib/sales/monthWindow';

// The viewer's platform role, swapped per test. `owner` sits ABOVE admin, so
// the Submitted tab cannot be gated on a permission — admins hold every one an
// owner does.
const viewer = vi.hoisted(() => ({ role: 'admin' as 'admin' | 'owner' }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'admin1', displayName: 'Jacob', role: viewer.role },
    isRole: () => true,
  }),
}));
vi.mock('@/hooks/useSalePaid', () => ({
  useSalePaid: () => ({ paidBySale: {}, togglePaid: vi.fn() }),
}));
vi.mock('@/lib/firebase/config', () => ({ auth: null }));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'test-token' }));
// Both are chrome around the list under test, and both pull in the radix
// dialog; the rows are what this file is about. The link dialog's props are
// captured instead of rendered, because WHICH sales it is offered is the whole
// of R2 and the select itself is not.
const captured = vi.hoisted(() => ({
  link: null as null | { candidates: Array<{ sale: Sale; hint: string }> },
}));
vi.mock('./SaleDetailSheet', () => ({ SaleDetailSheet: () => null }));
vi.mock('./UnloggedOrders', () => ({
  UnassignedOrders: () => null,
  LinkOrderDialog: (props: { candidates: Array<{ sale: Sale; hint: string }> }) => {
    captured.link = props;
    return null;
  },
}));

import { AdminSalesBoard } from './AdminSalesBoard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

/** The Nth month back from today, on `day`, at local noon — how sale dates are stored. */
function monthsAgo(months: number, day: number) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - months, day, 12, 0, 0);
}

function isoDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function thisMonth(): MonthKey {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

const ADDRESS = '4120 Wentworth Avenue';

// Sold last month, installed this month — the ordinary case, and the one the
// month-bounded admin fetch used to hide from its own carrier order.
const backDatedSale = {
  id: 's1',
  salesRepId: 'r1',
  salesRepName: 'Wil Teasdale',
  customerName: 'Dana Reyes',
  customerAddress: ADDRESS,
  totalValue: 90,
  status: 'approved',
  saleDate: monthsAgo(1, 20),
  installDate: monthsAgo(0, 4),
  products: [],
} as unknown as Sale;

const carrierOrder = {
  id: 'TMO1',
  status: 'active',
  rawStatus: 'Active',
  repDealerId: '4721016',
  repName: 'Wil Teasdale',
  matchedUserId: 'r1',
  orderDate: isoDay(monthsAgo(0, 2)),
  estInstallDate: isoDay(monthsAgo(0, 4)),
  activationDate: isoDay(monthsAgo(0, 4)),
  mrc: 90,
  address: ADDRESS,
} as unknown as FiberOrder;

const refetch = vi.fn(async () => {});

async function render(
  sales: Sale[],
  orders: FiberOrder[],
  month: MonthKey | undefined,
  extra?: { truncated?: boolean }
) {
  await act(async () => {
    root.render(
      <AdminSalesBoard
        sales={sales}
        month={month}
        truncated={extra?.truncated}
        fiber={{
          data: { scope: 'all', lastReportAt: null, orders, unmatched: [] },
          loading: false,
          error: null,
          refetch,
        }}
      />
    );
  });
}

/** The "Not in the portal" figure — a fact on the board, never an alarm. */
function notInPortal() {
  return [...container.querySelectorAll('.sales-board-fig')]
    .find((fig) => fig.querySelector('span')?.textContent === 'Not in the portal');
}

/** Opens the one rep row so its customers are on screen. */
async function openRep() {
  const rep = container.querySelector<HTMLButtonElement>('.sales-board-rep')!;
  await act(async () => rep.click());
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  refetch.mockClear();
  viewer.role = 'admin';
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('AdminSalesBoard merged rows', () => {
  it('joins a past-month sale to a current-month carrier order as one row', async () => {
    await render([backDatedSale], [carrierOrder], thisMonth());

    // The sale's month is what the row files under, so on the current month the
    // pair is out of view entirely — reported, never silently dropped.
    expect(container.querySelector('.sales-board-scope')?.textContent).toContain('+1 older');
    expect(container.textContent).not.toContain('not logged here');
    expect(notInPortal()?.querySelector('strong')?.textContent).toBe('0');
  });

  it('shows the pair as a single agreed row in the month it was sold', async () => {
    const sold = thisMonth();
    sold.month -= 1;
    await render([backDatedSale], [carrierOrder], sold);

    expect(container.querySelectorAll('.sales-board-rep')).toHaveLength(1);
    await openRep();

    const rows = container.querySelectorAll('.sales-board-sale');
    expect(rows).toHaveLength(1);
    expect(rows[0].className).not.toContain('never-logged');
    expect(rows[0].textContent).toContain('Dana Reyes');
    expect(container.querySelector('.sales-board-sale.never-logged')).toBeNull();
    // Same money on both sides, so no "Check" line.
    expect(container.querySelector('.sales-board-sale-note.gap')).toBeNull();
  });

  // R2: the sale and its carrier order straddle a month boundary, which is the
  // ordinary case the address guess misses. The picker has to reach across it.
  it('offers the rep sales from every month, not the month on screen', async () => {
    const augustSale = {
      ...backDatedSale,
      id: 's2',
      customerName: 'Priya Nandal',
      customerAddress: '18 Willow Court',
      installDate: null,
    } as unknown as Sale;
    const septemberOrder = { ...carrierOrder, id: 'TMO3', address: '4120 Wentworth Avenue' };

    await render([augustSale], [septemberOrder], thisMonth());
    await openRep();

    const ask = container.querySelector<HTMLButtonElement>('.sales-board-rowact-btn')!;
    await act(async () => ask.click());

    expect(captured.link?.candidates.map((entry) => entry.sale.id)).toContain('s2');
    // The list spans months, so each row says which one it belongs to.
    expect(captured.link?.candidates[0].hint).toContain('not in the report');
  });

  // The copy must be true whether the named sale was deleted or another order
  // already claimed it, so it names the link, never the sale's fate.
  it('says a broken link is not in effect without guessing why', async () => {
    const broken = {
      ...carrierOrder,
      id: 'TMO4',
      saleLink: { saleId: 'deleted-sale', by: 'admin1', byName: 'Jacob', at: '2026-09-01' },
    };
    await render([], [broken], thisMonth());
    await openRep();

    const row = container.querySelector('.sales-board-sale.never-logged.link-broken')!;
    expect(row.textContent).toContain('Link broken');
    expect(row.textContent).toContain("This link isn't active");
    expect(row.textContent).toContain('Re-link this order');
    expect(row.textContent).not.toContain('deleted');
  });

  it('renders a dismissed order quietly and drops it from Not logged', async () => {
    const dismissed = {
      ...carrierOrder,
      id: 'TMO5',
      saleLink: { saleId: null, by: 'admin1', byName: 'Jacob', at: '2026-09-01' },
    };
    await render([], [dismissed], thisMonth());

    expect(container.querySelector('.sales-board-fig.alert')).toBeNull();
    const head = container.querySelector('.sales-board-drawer-head')!;
    await act(async () => (head as HTMLButtonElement).click());

    const row = container.querySelector('.sales-board-sale.dismissed')!;
    expect(row.textContent).toContain('Not a sale');
    expect(container.querySelector('.sales-board-sale.never-logged')).toBeNull();
  });

  // Undo has to CLEAR the link. Writing saleId: null again would re-assert the
  // dismissal the row already carries, which is the no-op R3 removed.
  it('undoes a dismissal by clearing the link, then refetches past the cache', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const dismissed = {
      ...carrierOrder,
      id: 'TMO6',
      saleLink: { saleId: null, by: 'admin1', byName: 'Jacob', at: '2026-09-01' },
    };
    await render([], [dismissed], thisMonth());
    const head = container.querySelector<HTMLButtonElement>('.sales-board-drawer-head')!;
    await act(async () => head.click());

    const undo = container.querySelector<HTMLButtonElement>('.sales-board-sale.dismissed .sales-board-rowact-btn')!;
    expect(undo.textContent).toContain('Undo');
    await act(async () => undo.click());

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/portal/sales/status/link');
    expect(JSON.parse(init.body as string)).toEqual({ orderId: 'TMO6', clear: true });
    expect(refetch).toHaveBeenCalledWith({ fresh: true });

    vi.unstubAllGlobals();
  });

  it('says the figures are incomplete when the book was cut short', async () => {
    await render([backDatedSale], [], thisMonth(), { truncated: true });

    const warning = container.querySelector('.sales-board-warning')!;
    expect(warning.textContent).toContain('incomplete');
    expect(warning.textContent).toContain('not in the portal');
  });

  it('still calls out an order no sale explains', async () => {
    const orphan = { ...carrierOrder, id: 'TMO2', address: '77 Cedar Lane' };
    await render([], [orphan], thisMonth());
    await openRep();

    expect(container.querySelector('.sales-board-sale.never-logged')?.textContent)
      .toContain('Not in the portal');
    expect(container.querySelector('.sales-board-rep-flag')?.textContent)
      .toContain('1 not in the portal');
    expect(notInPortal()?.querySelector('strong')?.textContent).toBe('1');
    // The figure states a fact: most of these were very likely paid outside the
    // portal and simply never entered, so nothing here may read as a debt.
    expect(notInPortal()?.className).not.toContain('alert');
    expect(container.textContent).not.toContain('owed');
  });
});

// R6: the carrier feed reaches back to 2025-11, long before anyone logged a
// sale here. Those rows are not an accusation and must not read as one.
describe('carrier orders from before the portal', () => {
  const before = {
    ...carrierOrder,
    id: 'TMO7',
    orderDate: '2025-11-14',
    estInstallDate: '2025-11-20',
    activationDate: '2025-11-20',
    address: '901 Old Mill Road',
  } as unknown as FiberOrder;

  it('keeps them out of the rep list, out of red, and out of Not logged', async () => {
    await render([], [before], { year: 2025, month: 10 });

    expect(notInPortal()?.querySelector('strong')?.textContent).toBe('0');
    expect(container.querySelector('.sales-board-sale.never-logged')).toBeNull();
    expect(container.querySelector('.sales-board-rep')).toBeNull();
    expect(container.textContent).not.toContain('not logged here');
  });

  it('keeps them reachable in their own quiet drawer', async () => {
    await render([], [before], { year: 2025, month: 10 });

    const head = [...container.querySelectorAll('.sales-board-drawer-head')]
      .find((node) => node.textContent?.includes('From before the portal')) as HTMLButtonElement;
    expect(head).toBeTruthy();
    // Muted, not an alert: this drawer is history, not work.
    expect(head.className).not.toContain('alert');
    expect(head.textContent).toContain('There is nothing to do with these');

    await act(async () => head.click());
    const row = container.querySelector('.sales-board-sale.historic')!;
    expect(row.textContent).toContain('901 Old Mill Road');
    expect(row.textContent).toContain('Before the portal');
  });
});

// Jacob's point: 3C is only just starting to log sales here, so a carrier
// install with no sale is not evidence a rep went unpaid. Only the rows from
// months a rep was demonstrably logging in are worth a second look.
describe('not-logged rows split at the month reps started logging', () => {
  const since = {
    ...carrierOrder,
    id: 'TMO8',
    orderDate: '2026-08-11',
    estInstallDate: '2026-08-15',
    activationDate: '2026-08-15',
    address: '18 Marbury Court',
  } as unknown as FiberOrder;

  const before = {
    ...carrierOrder,
    id: 'TMO9',
    orderDate: '2026-05-06',
    estInstallDate: '2026-05-12',
    activationDate: '2026-05-12',
    address: '204 Halsey Street',
  } as unknown as FiberOrder;

  async function openNeverDrawer() {
    const head = [...container.querySelectorAll('.sales-board-drawer-head')]
      .find((node) => node.textContent?.includes('Carrier installed it')) as HTMLButtonElement;
    expect(head).toBeTruthy();
    await act(async () => head.click());
    return head;
  }

  it('puts the suspicious months first and the rest quietly under them', async () => {
    await render([], [since, before], undefined);
    const head = await openNeverDrawer();

    // Nothing on the drawer may read as money owed.
    expect(head.textContent).toContain('May already have been paid outside the portal');
    expect(head.className).not.toContain('alert');

    const groups = [...container.querySelectorAll('.sales-board-drawer-sub')]
      .map((node) => node.textContent ?? '');
    expect(groups[0]).toContain('Since reps started logging');
    expect(groups[0]).toContain('1');
    expect(groups[1]).toContain('Before that');
    expect(groups[1]).toContain('1');

    // The August row carries the emphasis; the May row is held back.
    const quiet = container.querySelector('.sales-board-group-quiet')!;
    expect(quiet.textContent).toContain('204 Halsey Street');
    expect(quiet.textContent).not.toContain('18 Marbury Court');
  });

  it("reports each group's own out-of-month rows rather than hiding them", async () => {
    await render([], [since, before], { year: 2026, month: 8 });
    await openNeverDrawer();

    const groups = [...container.querySelectorAll('.sales-board-drawer-sub')]
      .map((node) => node.textContent ?? '');
    expect(groups[0]).toContain('Since reps started logging');
    expect(groups[0]).toContain('+1 older');
    expect(groups[1]).toContain('Before that');
    expect(groups[1]).toContain('+1 older');
  });
});

function tabLabels() {
  return [...container.querySelectorAll('.sales-line-tab')].map((tab) => tab.textContent);
}

async function openSubmitted() {
  const tab = [...container.querySelectorAll('.sales-line-tab')]
    .find((node) => node.textContent === 'Submitted') as HTMLButtonElement;
  await act(async () => tab.click());
}

describe('Submitted tab (owners only)', () => {
  const other = {
    ...backDatedSale,
    id: 's9',
    customerName: 'Marcus Hale',
    customerAddress: '77 Cedar Lane',
    saleDate: monthsAgo(0, 6),
  } as unknown as Sale;
  const inMonth = { ...backDatedSale, id: 's8', saleDate: monthsAgo(0, 2) } as unknown as Sale;

  it('is not offered to an admin', async () => {
    viewer.role = 'admin';
    await render([inMonth], [], thisMonth());

    expect(tabLabels()).not.toContain('Submitted');
    expect(container.querySelector('.sales-board-sub-row')).toBeNull();
  });

  it('is offered to an owner and lists the raw submissions', async () => {
    viewer.role = 'owner';
    // backDatedSale was sold LAST month, so it is out of view and must be counted.
    await render([inMonth, other, backDatedSale], [], thisMonth());

    expect(tabLabels()).toContain('Submitted');
    await openSubmitted();

    const rows = container.querySelectorAll('.sales-board-sub-row');
    expect(rows).toHaveLength(2);
    // Address leads the row: it is the column Jacob reads down.
    expect(rows[0].querySelector('.sales-board-sub-addr')?.textContent).toBe('77 Cedar Lane');
    // Out-of-month submissions are reported, never dropped.
    expect(container.querySelector('.sales-board-scope')?.textContent).toContain('+1 older');
  });

  it('filters on address and customer name', async () => {
    viewer.role = 'owner';
    await render([inMonth, other], [], thisMonth());
    await openSubmitted();

    const search = container.querySelector<HTMLInputElement>('.sales-board-search input')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(search, 'cedar');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const rows = container.querySelectorAll('.sales-board-sub-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Marcus Hale');
  });
});
