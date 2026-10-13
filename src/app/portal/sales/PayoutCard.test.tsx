// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FiberOrder, Sale, SaleProduct } from '@/types';
import { datedSales, undatedSales } from '@/lib/pay/payGroups';
import { formatPayoutWindow, isTFiberSale, payoutsInMonth } from '@/lib/pay/payoutWindow';
import { applyCarrierInstallDates } from '@/lib/sales/carrierInstall';
import { PayoutCard } from './PayoutCard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12, 0, 0);
const OCT = { year: 2026, month: 9 };
const NOV = { year: 2026, month: 10 };
const NOW = d(2026, 10, 13);
const rates = { tfiber: { 'tfiber-1gig': 130 } };

function product(company: string, productId: string): SaleProduct {
  return { company, productId, productName: productId, quantity: 1, unitPrice: 0, totalPrice: 0, points: 0 };
}

let seq = 0;
function sale(overrides: Partial<Sale> = {}): Sale {
  seq += 1;
  return {
    id: `s${seq}`,
    salesRepId: 'me',
    salesRepName: 'Me',
    customerName: `Customer ${seq}`,
    saleType: 'new_service',
    products: [product('tfiber', 'tfiber-1gig')],
    totalValue: 60,
    totalPoints: 8,
    status: 'approved',
    saleDate: d(2026, 9, 20),
    createdAt: d(2026, 9, 20),
    updatedAt: d(2026, 9, 20),
    ...overrides,
  } as Sale;
}

const order = (fields: Partial<FiberOrder>) => fields as FiberOrder;

/** The Sales page's pipeline: carrier dates applied, cancelled and undated out, the month's windows. */
function pagePayouts(sales: Sale[], fiberBySale = new Map<string, FiberOrder>(), month = OCT) {
  const effective = applyCarrierInstallDates(sales, fiberBySale);
  return payoutsInMonth(datedSales(effective, fiberBySale), rates, month, NOW);
}

// As of Oct 13: Oct 7–11 (past) ×1, Oct 14–18 ×2 installed, Oct 28–Nov 3 ×1 scheduled.
const OCT_SALES = [
  sale({ installDate: d(2026, 9, 25) }),
  sale({ installDate: d(2026, 10, 2) }),
  sale({ installDate: d(2026, 10, 6), customerName: 'Late Week One' }),
  sale({ installDate: d(2026, 10, 19) }),
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // The count-up has already played this session: values show outright.
  window.sessionStorage.setItem('3c:countup:sales-pay', '1');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.sessionStorage.clear();
});

type Payouts = ReturnType<typeof pagePayouts>;

function render(payouts: Payouts, resetKey = '2026-9', extra: { undatedCount?: number } = {}) {
  act(() =>
    root.render(
      <PayoutCard
        payouts={payouts}
        resetKey={resetKey}
        undatedCount={extra.undatedCount}
        saleCount={4}
        monthName="October 2026"
        hasPlan
        planLoading={false}
        planError={false}
        onRetryPlan={() => undefined}
        onHelp={() => undefined}
      />
    )
  );
}

const kicker = () => container.querySelector('section p')!.textContent;
const position = () => container.querySelector('[role="group"] span')?.textContent ?? null;
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const amount = () => container.querySelector('[aria-live="polite"]')!.textContent;
const well = () => container.querySelector('ul')?.textContent ?? '';
const click = (label: string) => act(() => button(label)!.click());

describe('PayoutCard stepping', () => {
  it('opens on the next payout of the month and steps later, earlier and stops at both ends', () => {
    render(pagePayouts(OCT_SALES));
    expect(kicker()).toBe('Est. payout · Oct 14–18');
    expect(position()).toBe('2 of 3');
    expect(amount()).toContain('260');

    click('Later payout');
    expect(kicker()).toBe('Est. payout · Oct 28–Nov 3');
    expect(position()).toBe('3 of 3');
    expect(amount()).toContain('130');
    expect(container.textContent).toContain('1 install in this payout');
    expect(well()).toContain('1 scheduled');
    expect(button('Later payout')!.disabled).toBe(true);
    click('Later payout');
    expect(position()).toBe('3 of 3');

    click('Earlier payout');
    click('Earlier payout');
    expect(kicker()).toBe('Est. payout · Oct 7–11 · past');
    expect(position()).toBe('1 of 3');
    expect(well()).toContain('1 installed');
    expect(well()).not.toContain('scheduled');
    expect(button('Earlier payout')!.disabled).toBe(true);
  });

  it('never prints a single pay date and keeps the estimate wording', () => {
    render(pagePayouts(OCT_SALES));
    expect(container.textContent).toContain('est.');
    expect(container.textContent).not.toMatch(/\bpaid\b/i);
    expect(kicker()).toMatch(/\d+–\d+/);
  });

  it('marks the amount as a polite live region', () => {
    render(pagePayouts(OCT_SALES));
    expect(container.querySelector('[aria-live="polite"]')!.getAttribute('aria-atomic')).toBe('true');
  });

  it('hides the stepper when the month has one payout', () => {
    render(pagePayouts([sale({ installDate: d(2026, 10, 2) })]));
    expect(kicker()).toBe('Est. payout · Oct 14–18');
    expect(button('Later payout')).toBeNull();
    expect(button('Earlier payout')).toBeNull();
    expect(position()).toBeNull();
  });

  it('goes back to the default payout when the month changes', () => {
    render(pagePayouts(OCT_SALES));
    click('Earlier payout');
    expect(position()).toBe('1 of 3');

    // November: Nov 7–11 (late-Oct install) and Nov 14–18, both ahead.
    const nov = pagePayouts([...OCT_SALES, sale({ installDate: d(2026, 10, 24) }), sale({ installDate: d(2026, 11, 3) })], undefined, NOV);
    render(nov, '2026-10');
    expect(kicker()).toBe('Est. payout · Nov 7–11');
    expect(position()).toBe('1 of 2');

    render(pagePayouts(OCT_SALES), '2026-9');
    expect(position()).toBe('2 of 3');
  });

  it('keeps the picked payout across a data refresh of the same month', () => {
    render(pagePayouts(OCT_SALES));
    click('Later payout');
    render(pagePayouts([...OCT_SALES, sale({ installDate: d(2026, 10, 9) })]));
    expect(kicker()).toBe('Est. payout · Oct 28–Nov 3');
    expect(position()).toBe('4 of 4');
  });

  it('says which sales moved in from an earlier payout, and how many are not dated yet', () => {
    const pushed = sale({ customerName: 'Carla Diaz', installDate: d(2026, 10, 9), installDatePreviousDate: d(2026, 10, 3) });
    render(pagePayouts([pushed]), '2026-9', { undatedCount: 2 });
    expect(container.textContent).toContain('Moved in from an earlier payout: Carla Diaz');
    expect(container.textContent).toContain('2 T-Fiber sales not dated yet');
  });

  it('says so when the month has no T-Fiber payouts', () => {
    render([]);
    expect(kicker()).toBe('Est. payout');
    expect(container.textContent).toContain('No T-Fiber payouts this month');
  });
});

describe('Sales page payout data', () => {
  it('puts a newly logged sale with a future install date in its window, as scheduled', () => {
    const fresh = sale({ installDate: d(2026, 10, 27), saleDate: d(2026, 10, 13) });
    // An Oct 27 install pays Nov 7–11: not an October payout, a November one.
    expect(pagePayouts([fresh])).toEqual([]);
    const [nov] = pagePayouts([fresh], undefined, NOV);
    expect(formatPayoutWindow(nov.window)).toBe('Nov 7–11');
    expect(nov).toMatchObject({ count: 1, scheduled: 1, amount: 130 });
  });

  it('leaves undated sales out of every window; the page counts them for the note', () => {
    const undated = sale({});
    expect(pagePayouts([undated])).toEqual([]);
    expect(undatedSales([undated, sale({ installDate: d(2026, 10, 2) })], new Map()).filter(isTFiberSale)).toHaveLength(1);
  });

  it('moves a sale to the window of the carrier activation date', () => {
    const typed = sale({ installDate: d(2026, 10, 2) }); // typed: Oct 14–18
    const fiber = new Map([[typed.id!, order({ status: 'active', activationDate: '2026-10-09' })]]);
    const result = pagePayouts([typed], fiber);
    expect(result.map((p) => formatPayoutWindow(p.window))).toEqual(['Oct 21–25']);
  });

  // A customer who disconnects after install stays in its install window (the
  // 120-day chargeback is its own line, lib/pay/chargeback); a cancel before
  // install never pays.
  it('drops portal-cancelled and carrier-cancelled sales from the windows, keeps churned', () => {
    const kept = sale({ installDate: d(2026, 10, 2) });
    const cancelled = sale({ installDate: d(2026, 10, 2), status: 'cancelled' });
    const churned = sale({ installDate: d(2026, 10, 3) });
    const carrierCancelled = sale({ installDate: d(2026, 10, 4) });
    const fiber = new Map([
      [churned.id!, order({ status: 'churned' })],
      [carrierCancelled.id!, order({ status: 'cancelled' })],
    ]);
    const [window] = pagePayouts([kept, cancelled, churned, carrierCancelled], fiber);
    expect(window.count).toBe(2);
    expect(window.sales).toEqual([kept, churned]);
  });
});
