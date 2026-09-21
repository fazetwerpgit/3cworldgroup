# PRODUCT — 3C World Group homepage (cinematic field-sales direction)

Scope of this snapshot: **the homepage only** (`/`). All other public routes are
carried over unchanged from the polish snapshot.

## Who the page is for

Prospective **independent door-to-door sales reps** for telecom and home
security. Most arrive from a text, a referral, or a social post. They are
deciding whether this is a real job they want, not evaluating a technology
vendor.

Secondary, smaller audience: someone who already runs a sales crew and wants to
bring a team to 3C. They get one clear, subordinate path (Contact), never equal
billing with Apply.

## What the first five seconds must land

1. This is **face-to-face sales in neighborhoods** — you knock, you talk, you close.
2. What you'd sell: **fiber internet, TV, and home security** from established providers.
3. How you're paid: **1099 independent contractor, commission-only, uncapped**.
4. You are **trained and supported**, not dropped off with a clipboard.
5. **Apply** is one obvious tap away, from anywhere on the page.

## Established facts this page may state

Sourced only from copy already live in this codebase (`/apply`,
`/opportunities`, `/services`, `/terms`, root metadata):

- 1099 independent contractor role. (`src/app/apply/page.tsx`, `src/app/terms/page.tsx`)
- Commission-only with uncapped earnings; effort drives earnings. (`src/app/apply/page.tsx`)
- Training is provided: products, sales process, hands-on coaching, field support. (`src/app/opportunities/page.tsx`)
- Products represented: fiber internet, TV service, home security systems, and bundles, from leading providers. (`src/app/services/page.tsx`, root metadata)
- Path to start: apply online → conversation with the team → training → work in the field. (`src/app/opportunities/page.tsx`)
- Markets referenced on this homepage: Dallas TX, Houston TX, Southern California (region), Lansing MI, Grand Rapids MI. (market list set by the owner; city art in /public/redesign/v2/photos)
- Openings change by market based on client demand. (existing homepage copy)
- Advancement exists toward coaching and running a team. (existing homepage copy)

## Hard prohibitions on this page

- No invented people, photos of staff, testimonials, names, or quotes.
- No counts: no "X reps", "X doors", "X markets open", no tickers or counters.
- No earnings figures, ranges, averages, or "first week" numbers.
- No guaranteed schedules, guaranteed leads, guaranteed territory protection,
  guaranteed callback windows, or any promise of availability in a given city.
- No claim that choosing a city in the explorer routes, reserves, or pre-fills
  anything. It changes what you're reading; applying is the actual action.
- **No per-city descriptive copy.** Nothing in this codebase establishes
  anything about recruiting, territory, housing density, build-out or metro
  size in Dallas, Houston, Southern California, Lansing or Grand Rapids. Invented
  geography reads as filler and does not help anyone decide whether to apply.
  The explorer carries the five names, the five existing skyline images, and one
  shared, sourced line — openings change by market with client demand — and
  nothing else. (Removed at final review; see `docs/cinematic-review/FINAL-REVIEW.md`.)
- No real submissions from this page — the homepage links to `/apply` and
  `/contact`, it does not collect anything.

## Primary action

`Apply` → `/apply`, present in the header, the hero, the route sequence, the
location explorer, the two-doors block, and the closing. On mobile a compact
apply bar appears once the hero is scrolled past; the page reserves space for it
so it never covers content.

## Secondary actions

- `See the work` → in-page anchor to the work chapters (hero secondary).
- `See the career path` → `/opportunities`.
- `Bring a team` → `/contact` (team owners, deliberately quieter than Apply).
