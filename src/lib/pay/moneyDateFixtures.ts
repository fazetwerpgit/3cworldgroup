// Shared fixtures for the money and date tests (moneyDate.test.ts,
// chicagoClock.test.ts). Test-only: nothing in the app imports this.
import { afterAll, beforeAll } from 'vitest';
import type { CompPlanCompanyRates, FiberOrder, Sale } from '@/types';
import plan from '@/data/compPlan.generated.json';

const rates = (plan as unknown as { rates: Record<string, CompPlanCompanyRates> }).rates;

/** The comp sheet's AE Tier 1 slice (T-Fiber 300 = 67.5, 500 = 97.5). */
export const AE1 = rates.ae_tier_1;
/** The comp sheet's AE Tier 2 slice (T-Fiber 300 = 90). */
export const AE2 = rates.ae_tier_2;

/** A calendar day stored at noon UTC, the way the server stores sale dates. */
export const noonUtc = (day: string) => new Date(`${day}T12:00:00Z`);

let n = 0;

export function sale(over: Partial<Sale> & { productIds?: string[] } = {}): Sale {
  n += 1;
  const { productIds, ...rest } = over;
  const ids = productIds ?? ['tfiber-300'];
  return {
    id: `s${n}`,
    salesRepId: 'repA',
    salesRepName: 'Avery Adams',
    status: 'approved',
    saleDate: new Date('2026-10-10T12:00:00Z'),
    customerAddress: '1 Main St, Lansing, MI 48823',
    customerName: 'Pat Customer',
    totalPoints: 3,
    totalValue: 45,
    products: ids.map((productId) => ({
      productId,
      productName: productId,
      company: productId.split('-')[0],
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      points: 3,
    })),
    ...rest,
  } as unknown as Sale;
}

export function order(over: Partial<FiberOrder>): FiberOrder {
  n += 1;
  return { id: `o${n}`, status: 'active', ...over } as unknown as FiberOrder;
}

/** Runs the enclosing describe block's tests with process.env.TZ set to `tz`. */
export function useTimeZone(tz: string): void {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.TZ;
    process.env.TZ = tz;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}
