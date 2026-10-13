import { getPlanById, type Sale } from '@/types/sales';

// Plan mix: how many of each internet tier a set of sales holds, as COUNTS only
// (never money), so it is safe for every rep to see about everyone. One helper
// for the leaderboard rows and the rep's own Sales view, fed the same counted
// set each already ranks or totals (boardCountedSales).
//
// The tier comes from the product catalog's speed (FIBER_PLANS), so the same
// speed on two carriers is one tier: AT&T 1000 and TFiber 1 Gig are both
// "1 Gig". Decisions:
//   - A product the catalog does not know, or one that is not an internet tier
//     (an add-on, a mobile line, TV), is skipped. A sale with no recognizable
//     internet tier adds nothing, rather than an "Other" that says nothing a
//     rep can act on. (Live data, 2026-10-13: every logged sale has one.)
//   - A sale counts each distinct tier it holds once, whatever the quantity.

export interface PlanMixEntry {
  /** "300", "500", "1 Gig", "2 Gig", "5 Gig". */
  tier: string;
  count: number;
}

type SaleProducts = Pick<Sale, 'products'>;

const SPEED = /^\s*(\d+(?:\.\d+)?)\s*(mbps|gbps)\s*$/i;

/** Catalog speed in Mbps ("1 Gbps" → 1000), or null when it is not an internet speed. */
function speedMbps(speed: string | undefined): number | null {
  const match = SPEED.exec(speed ?? '');
  if (!match) return null;
  const value = Number(match[1]) * (match[2].toLowerCase() === 'gbps' ? 1000 : 1);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** "300" under a gig, "1 Gig" / "2 Gig" from a gig up. */
function tierLabel(mbps: number): string {
  if (mbps < 1000) return String(mbps);
  const gig = mbps / 1000;
  return `${Number.isInteger(gig) ? gig : gig.toFixed(1)} Gig`;
}

/** A product's tier and its speed, or null when it is not a known internet tier. */
export function productTier(productId: string | null | undefined): { tier: string; mbps: number } | null {
  const plan = productId ? getPlanById(productId) : undefined;
  if (!plan || plan.category === 'extra') return null;
  const mbps = speedMbps(plan.speed);
  return mbps === null ? null : { tier: tierLabel(mbps), mbps };
}

/** Tier counts, most sold first, then the faster tier first on a tie. */
export function planMix(sales: readonly SaleProducts[]): PlanMixEntry[] {
  const tiers = new Map<string, { count: number; mbps: number }>();
  for (const sale of sales) {
    const seen = new Set<string>();
    for (const product of sale.products || []) {
      const tier = productTier(product?.productId);
      if (!tier || seen.has(tier.tier)) continue;
      seen.add(tier.tier);
      const entry = tiers.get(tier.tier) ?? { count: 0, mbps: tier.mbps };
      entry.count += 1;
      tiers.set(tier.tier, entry);
    }
  }
  return [...tiers.entries()]
    .sort(([, a], [, b]) => b.count - a.count || b.mbps - a.mbps)
    .map(([tier, { count }]) => ({ tier, count }));
}

/** "10× 1 Gig · 6× 2 Gig · 4× 300", or '' when there is nothing to show. */
export function formatPlanMix(mix: readonly PlanMixEntry[] | null | undefined): string {
  return (mix ?? []).map((entry) => `${entry.count}× ${entry.tier}`).join(' · ');
}
