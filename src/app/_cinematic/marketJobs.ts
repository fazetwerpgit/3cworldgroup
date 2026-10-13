import { MARKETS, type Market } from "./markets";
import { SITE_URL } from "./nav";
import type { JsonLd } from "./jsonLd";

/**
 * The opening in each market, as /opportunities/[slug] shows it and as its
 * JobPosting structured data describes it. One entry per market in markets.ts;
 * updating a posting means editing it here and nowhere else.
 *
 * Every line is the owner's (2026-10). Carriers are not named: the public site
 * names products, never providers ("each from the provider that serves that
 * market", on /services). T-Mobile Fiber is not sold in Dallas, so nothing for
 * Dallas says fiber. No pay figure appears anywhere, by rule.
 */

/** When these postings went up. Open-ended: no validThrough. */
export const DATE_POSTED = "2026-10-13";

export type MarketJob = {
  slug: string;
  /** The job title, as the H1's first line and JobPosting.title. */
  role: string;
  /** The H1's second line after "in": "Houston, TX", or the region's name. */
  place: string;
  /** Search title and description. */
  metaTitle: string;
  metaDescription: string;
  /** Two or three sentences under the H1. */
  intro: string;
  /** The terms, in page order. */
  terms: { title: string; body: string }[];
  /** For JobPosting.jobLocation. A region with no single city has no locality. */
  address: { locality?: string; region: string };
};

const PAY = "1099 independent contractor, commission only, uncapped. There is no base pay.";

/** The four markets Will leads share one shape; only the place changes. */
function fiberMarket(slug: string, name: string, place: string, address: MarketJob["address"]): MarketJob {
  return {
    slug,
    role: "Fiber Internet Sales Rep",
    place,
    metaTitle: `Fiber Internet Sales Jobs in ${place} | 3C World Group`,
    metaDescription: `Now hiring door-to-door fiber internet sales reps in ${place}. Sell fiber internet, solar and home security as a 1099 contractor, commission only, with training in ${name}.`,
    intro: `3C World Group is hiring door-to-door sales reps in ${name}, where demand for fiber internet is strong. The ${name} market is led by Will.`,
    terms: [
      { title: "What you sell", body: "Fiber internet, solar, and home security and alarms." },
      { title: "Training", body: `Training and team meetups are held in ${name}.` },
      { title: "Leads", body: `Your leads are placed where they work best for you, in and around ${name}.` },
      { title: "Pay", body: PAY },
    ],
    address,
  };
}

export const MARKET_JOBS: readonly MarketJob[] = [
  {
    slug: "dallas",
    role: "Door-to-Door Sales Rep",
    place: "Dallas, TX",
    metaTitle: "Door-to-Door Sales Jobs in Dallas, TX | 3C World Group",
    metaDescription:
      "Now hiring door-to-door sales reps in Dallas, TX. Sell home security, internet and solar as a 1099 contractor, commission only, with training in Dallas.",
    intro:
      "3C World Group is hiring door-to-door sales reps in Dallas and the smaller cities around it. You sell home security, internet and solar to households.",
    terms: [
      { title: "What you sell", body: "Home security and alarms, internet, and solar." },
      { title: "Training", body: "Training and team meetups are held in Dallas." },
      { title: "Leads", body: "Your leads are placed where they work best for you, in and around Dallas." },
      { title: "Pay", body: PAY },
    ],
    address: { locality: "Dallas", region: "TX" },
  },
  fiberMarket("houston", "Houston", "Houston, TX", { locality: "Houston", region: "TX" }),
  fiberMarket("southern-california", "Southern California", "Southern California", { region: "CA" }),
  fiberMarket("lansing", "Lansing", "Lansing, MI", { locality: "Lansing", region: "MI" }),
  fiberMarket("grand-rapids", "Grand Rapids", "Grand Rapids, MI", { locality: "Grand Rapids", region: "MI" }),
];

export const marketJobPath = (slug: string) => `/opportunities/${slug}`;

/** A market's posting with the market it belongs to, or null for an unknown slug. */
export function findMarketJob(slug: string): { job: MarketJob; market: Market } | null {
  const job = MARKET_JOBS.find((entry) => entry.slug === slug);
  const market = MARKETS.find((entry) => entry.slug === slug);
  return job && market ? { job, market } : null;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** JobPosting.description: the page's own visible text, in its order, as HTML. */
export function jobDescriptionHtml(job: MarketJob): string {
  const terms = job.terms.map((term) => `<h3>${escapeHtml(term.title)}</h3><p>${escapeHtml(term.body)}</p>`);
  return [`<p>${escapeHtml(job.intro)}</p>`, ...terms].join("");
}

export function jobPostingJsonLd(job: MarketJob): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.role,
    description: jobDescriptionHtml(job),
    datePosted: DATE_POSTED,
    employmentType: "CONTRACTOR",
    directApply: true,
    url: `${SITE_URL}${marketJobPath(job.slug)}`,
    hiringOrganization: {
      "@type": "Organization",
      name: "3C World Group",
      sameAs: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        ...(job.address.locality ? { addressLocality: job.address.locality } : {}),
        addressRegion: job.address.region,
        addressCountry: "US",
      },
    },
  };
}
