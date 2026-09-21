/**
 * The five markets the public cinematic site names, in one place.
 *
 * Home's explorer renders them; /apply reads `?market=<slug>` off the link the
 * explorer builds and prefills its City field with `applyCity`. Keeping the
 * list here is what makes those two agree — a link can only carry a slug that
 * exists in this file, and an unrecognised `?market=` prefills nothing rather
 * than dropping arbitrary query text into a form field.
 *
 * `note` is geography and nothing else. Nothing in this codebase establishes
 * territory, density, build-out or recruiting volume in any of these places,
 * so nothing here claims any of it; the shared line about client demand in
 * LocationExplorer is the only thing the panel says about openings.
 */
export type Market = {
  /** URL slug, carried by `?market=`. */
  slug: string;
  /** Tab headline and panel heading. */
  name: string;
  /** Tab second line and panel eyebrow. A state, or "Region" where the market is one. */
  region: string;
  /** Spoken and alt-text form: "Dallas, Texas" for a city, the bare name for a region. */
  label: string;
  /** What /apply drops into its City field. The reader can overwrite it. */
  applyCity: string;
  /** Geography only. No claim about the work. */
  note: string;
  /** 1600px tier in /public/redesign/v2/photos. */
  image: string;
};

export const MARKETS: readonly Market[] = [
  {
    slug: "dallas",
    name: "Dallas",
    region: "Texas",
    label: "Dallas, Texas",
    applyCity: "Dallas",
    note: "North Texas, on the prairie at the center of the Dallas-Fort Worth metroplex.",
    image: "/redesign/v2/photos/city-dallas-1600.webp",
  },
  {
    slug: "houston",
    name: "Houston",
    region: "Texas",
    label: "Houston, Texas",
    applyCity: "Houston",
    note: "Southeast Texas, spread across the Gulf coastal plain along Buffalo Bayou.",
    image: "/redesign/v2/photos/city-houston-1600.webp",
  },
  {
    slug: "southern-california",
    name: "Southern California",
    region: "Region",
    label: "Southern California",
    applyCity: "Southern California",
    note: "The southern counties of California, from the coast inland to the San Bernardino range.",
    image: "/redesign/v2/photos/city-southern-california-1600.webp",
  },
  {
    slug: "lansing",
    name: "Lansing",
    region: "Michigan",
    label: "Lansing, Michigan",
    applyCity: "Lansing",
    note: "Mid-Michigan, the state capital, on the Grand and Red Cedar rivers.",
    image: "/redesign/v2/photos/city-lansing-1600.webp",
  },
  {
    slug: "grand-rapids",
    name: "Grand Rapids",
    region: "Michigan",
    label: "Grand Rapids, Michigan",
    applyCity: "Grand Rapids",
    note: "West Michigan, on the Grand River, half an hour inland from Lake Michigan.",
    image: "/redesign/v2/photos/city-grand-rapids-1600.webp",
  },
] as const;

/** The apply link for a market: the same /apply page, with the market named. */
export function applyHrefForMarket(slug: string): string {
  return `/apply?market=${encodeURIComponent(slug)}`;
}

/** Resolves a `?market=` value, or null if it names nothing this site offers. */
export function findMarket(slug: string | null | undefined): Market | null {
  if (!slug) return null;
  return MARKETS.find((market) => market.slug === slug.toLowerCase()) ?? null;
}
