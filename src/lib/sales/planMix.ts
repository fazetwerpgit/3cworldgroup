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

/** "1 Gig" → "1G"; "300" and "500" stay as they are. */
export function compactTier(tier: string): string {
  return tier.replace(/\s*Gig$/, 'G');
}

/** The compact line: "13×1G · 4×2G · 3×300". With `maxTiers`, only the first
 *  (most sold) tiers, then "+N" for the sales the rest hold: "13×1G · 4×2G +7". */
export function formatPlanMixCompact(
  mix: readonly PlanMixEntry[] | null | undefined,
  maxTiers?: number
): string {
  const entries = mix ?? [];
  const shown = maxTiers === undefined ? entries : entries.slice(0, Math.max(1, maxTiers));
  const rest = entries.slice(shown.length).reduce((sum, entry) => sum + entry.count, 0);
  const line = shown.map((entry) => `${entry.count}×${compactTier(entry.tier)}`).join(' · ');
  return rest > 0 ? `${line} +${rest}` : line;
}

/** Every way the line can be written, longest first, for a slot to take the
 *  first that fits its width: full, compact, top two +N, top one +N.
 *  Duplicates (a short mix compacts no further) are dropped; [] when empty. */
export function planMixForms(mix: readonly PlanMixEntry[] | null | undefined): string[] {
  const entries = mix ?? [];
  if (entries.length === 0) return [];
  const forms = [formatPlanMix(entries), formatPlanMixCompact(entries)];
  if (entries.length > 2) forms.push(formatPlanMixCompact(entries, 2));
  if (entries.length > 1) forms.push(formatPlanMixCompact(entries, 1));
  return [...new Set(forms)];
}
