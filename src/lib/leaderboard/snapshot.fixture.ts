import type { FiberOrder } from '@/types';
import type { RawSale } from '@/lib/leaderboard/snapshot';

export const NOW = new Date('2026-10-14T17:30:00.000Z'); // Wed Oct 14, 12:30pm CDT
const PLANS = ['tfiber-300', 'tfiber-500', 'tfiber-1gig', 'tfiber-2gig'];
const STATUSES = ['approved', 'approved', 'approved', 'pending', 'approved', 'cancelled', 'approved', 'rejected'];

function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

export function fixture(count: number): { docs: RawSale[]; orders: FiberOrder[] } {
  const rand = rng(42);
  const docs: RawSale[] = [];
  const orders: FiberOrder[] = [];
  for (let i = 0; i < count; i++) {
    const rep = Math.floor(rand() * 12);
    const daysAgo = Math.floor(rand() * 150);
    const saleDate = new Date(NOW.getTime() - daysAgo * 86_400_000 - Math.floor(rand() * 20) * 3_600_000);
    const backDated = rand() < 0.1;
    const createdAt = new Date(saleDate.getTime() + (backDated ? 3 * 86_400_000 : 3_600_000));
    const plan = PLANS[Math.floor(rand() * PLANS.length)];
    const address = `${100 + i} Elm St`;
    const data: Record<string, unknown> = {
      salesRepId: `rep${rep}`,
      salesRepName: rep === 3 ? '' : `Rep ${String.fromCharCode(65 + (rep % 7))}`,
      status: STATUSES[Math.floor(rand() * STATUSES.length)],
      saleDate,
      createdAt,
      installDate: new Date(saleDate.getTime() + 5 * 86_400_000),
      totalPoints: Math.floor(rand() * 4) * 3 + 1,
      customerAddress: address,
      customerName: 'Private Person',
      products: [{ productId: plan, productName: plan, company: 'tfiber', quantity: 1 }],
    };
    if (i % 37 === 0) Object.assign(data, { salesRepId: 'demo', salesRepName: 'Demo', demoAccount: true });
    docs.push({ id: `sale${String(i).padStart(5, '0')}`, data });

    const roll = rand();
    if (roll < 0.6) {
      const day = (offset: number) => new Date(saleDate.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
      const status = roll < 0.08 ? 'cancelled' : roll < 0.14 ? 'churned' : 'active';
      orders.push({
        id: `o-${i}`,
        status,
        address,
        matchedUserId: `rep${rep}`,
        orderDate: day(0),
        activationDate: status === 'cancelled' ? null : day(5),
        deactivationDate: status === 'churned' ? day(20) : null,
        cancellationDate: status === 'cancelled' ? day(2) : null,
        estInstallDate: null,
      } as unknown as FiberOrder);
    }
  }
  return { docs, orders };
}

