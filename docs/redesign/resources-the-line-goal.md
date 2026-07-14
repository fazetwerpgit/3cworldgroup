# Resources "The Line" — Visual Parity Goal Contract (DRAFT)

User picked the mockup `option-3-the-line-resources.html` for the Resources
area. Same contract style as `forms-the-line-goal.md` / `calls-the-line-goal.md`
/ `chat-the-line-goal.md` / `shell-the-rail-goal.md`: implementation is
verified 1:1 against the mockup by independent reviewers until EXACT — not
close enough.

This round merges 3 pages into a new hub (Links + Shorts + Pay Structure,
user-approved merge) with University staying its own page reached via a
doorway card, plus a real Rep/Admin pay-view split. It is bigger than a
single-page reskin: a NEW Resources hub, a restyled University page, and a
coordinated retarget of every entry point that currently points at Links,
Shorts, Pay Structure, or University.

## Source of truth

- Mockup: `design-mockups/resources-round1/option-3-the-line-resources.html`
  (two toggled views inside one file: "Resources hub" and "University",
  switched by a mockup-only prototype pill — see Sanctioned deviations).
- The mockup wins on any visual ambiguity not resolved by the sanctioned
  deviations below.
- Extraction reference (factual detail on both the mockup and the current
  implementation): Codex read-only audit, summarized into Part A/B below.

## Hub route — OPEN CALL 1

Extraction B-11 lists three real options with no clear winner from the data
alone:

- **(a)** `/portal/resources` owns the hub; University stays a page-local
  view/query-state toggle inside the same route (mirrors the mockup's own
  in-document toggle literally).
- **(b)** `/portal/resources` owns the hub; `/portal/resources/university`
  becomes University's new canonical route (nested under Resources).
- **(c)** `/portal/resources` owns the hub; `/portal/training` remains
  University's canonical route unchanged (matches today's route, only the
  hub is new).

Old-route disposition (applies under any of the above):

- `/portal/links` → redirect to `/portal/resources` (hub anchor).
- `/portal/pay-structure` → redirect to `/portal/resources` (hub anchor,
  or a query-state that scrolls to the pay lane).
- `/portal/shorts` → currently redirects to `/portal/training?tab=shorts`
  (extraction B-1/B-3, hazard B-1); must keep resolving to *something* that
  still shows the "no shorts published" real empty state — either the hub's
  Shorts lane or University's Shorts tab, whichever survives.
- `/portal/training/[id]` (detail page) is unaffected by any of these
  options — it stays exactly where it is (see OPEN CALL 3 on whether it's
  touched visually at all).

Recommendation: **(c)** — keeps the existing, working `/portal/training`
route and its bookmarks/detail-page relationship completely intact (avoids
compounding hazard B-19's "old direct URLs" problem with a route rename),
and treats the hub's "University" as what the task brief calls it: "its own
page" reached via a doorway card, not a tab of the hub. `/portal/links` and
`/portal/pay-structure` become simple redirects to `/portal/resources`
since those two pages are genuinely absorbed. Needs orchestrator sign-off —
this determines the file-scope hard rule below and the nav-group shape.

## Rep/Admin pay switch — real predicate, not a toggle — DECIDED

The mockup's pay lane switch is a **client-only demo toggle** with no
masthead-position equivalent (extraction A-7: `.admin-mode` class flip via
JS `setRole()`). Per campaign precedent (chat and calls both dropped fake
role-preview toggles; calls' OPEN CALL 1 ruled "no floating control, no
static chip") and hazard B-11 ("a client-side Rep/Admin switch must not
grant or imply admin privileges"), this ships with **no interactive
control**. The rep-card vs. admin-grid split is driven entirely by the
real, already-existing pay-structure permission model:

- Users who are **not** platform role (`admin`/`operations`) — i.e. the
  page's `scope: "own"` response — always see the **Rep card** (mockup's
  `.rep-pay` block): their own tier's real rate from `config/commission`,
  restyled into the mockup's card, including the honest zero-placeholder
  values if `ratesArePending()` is true (see Real data mapping).
- **`operations`** users see the **Admin rate grid** (mockup's `.admin-pay`
  block, all tiers) exactly as the current `/portal/pay-structure` page
  already grants them — but **without** the "Edit rates" action, matching
  today's `isAdmin`-gated edit button.
- **`admin`** users see the same Admin rate grid **with** "Edit rates"
  wired to the real existing edit/save/cancel flow (extraction B-4),
  restyled into the mockup's button treatment (the mockup's button is
  visually non-functional; the real one is not).
- Binding, not an open call — the mapping is dictated by the pay-structure
  page's existing server-enforced permission model (hazard B-11 forecloses
  any client-toggle alternative).

## Composition — Hub view

Mockup masthead (`3C WORLD GROUP / THE LINE` brand mark + role-switch pill
+ view-switch pill) is prototype chrome standing in for the real shell —
**none of it ships**. The page renders inside the real
`PortalHeader`/`PortalSidebar`/`MobileBottomNav`; implementation starts at
the hero header (`.line-head`).

1. **Hero header**: eyebrow `Resources / The Line / signal open`, two-line
   headline (`Keep the signal.` lime / `Move the work.`), context sentence,
   top-aligned right-side metallic hero numeral (real "resource lanes open"
   count — see Real data mapping) with caption `resource lanes` / `open
   now`.
2. **Resources summary strip**: 3-column grid, hairline-divided —
   `Learning items` (count + note), `Field tools` (count + note),
   `Pay structure` (count + note) — see Real data mapping for what each
   number derives from.
3. **Two-column lane grid** (per the mockup's literal DOM nesting, verified
   against the source HTML — not just the extraction's prose summary):
   - **Left lane** ("University"): lane header (title `University`, meta
     `Training lane` / `<N> of <M> complete`) → **University doorway card**
     (eyebrow, two-line heading, description, path-progress bar, `Enter
     University →` button that navigates to the real University route) →
     **Shorts section** nested directly under the doorway card in the same
     left lane (title `Shorts`, `View all in University ↗` link, 3-column
     thumbnail strip on desktop / 2-column on mobile with the 3rd hidden).
   - **Right lane** ("Field tools"): lane header (title `Field tools`, meta
     `External links` / `opens in new tab`) → **tool-list** of external
     link rows → **Pay structure section** nested directly under the
     tool-list in the same right lane (title `Pay structure`, eyebrow
     `Static demo` — does NOT ship, see deviations — rep card or admin
     grid per the real predicate above).
4. **Footer**: right span (`Make the next move legible.`) ships as tone
   copy; left span (`The Line / resources broadcast / static demo`) ships
   with `static demo` dropped — see deviations.

## Composition — University view

Per OPEN CALL 3 below, this section's implementation scope depends on that
ruling; the visual spec is captured here regardless so it's ready either
way.

1. **University hero**: eyebrow `University / training broadcast / my
   path`, two-line headline (`Learn the line.` / `Keep moving.`), context
   sentence, top-aligned metallic numeral (real incomplete-items count via
   `getIncompleteRequired()`/equivalent) with caption `items left` / `on
   your path`.
2. **Required strip** (amber-accented, conditional): `Required training is
   waiting.` + real count of incomplete required items — hidden entirely
   when 0 (mockup has no "zero required" state; extension of the mockup's
   own conditional logic, not a fabrication).
3. **Path progress bar**: real `<completed> of <total> complete` from
   `getOverallProgress()`.
4. **Toolbar**: `My Path` / `Shorts` tabs; carrier filter chips (real
   `TRAINING_CATEGORIES` values/labels — however many exist, not the
   mockup's fixed 3 — see Real data mapping); type filter chips (`All
   types` / `Video` / `Document` / `Quiz` / `Link` — matches the real
   4-value type enum + "All" exactly, no generalization needed here).
5. **Module/card grid**: 3-column desktop / 2-column tablet / 1-column
   mobile, real published `training` resources via `ResourceGrid`/
   `ResourceCard` data, restyled into the mockup's card anatomy (type icon,
   tag, title, state pill with the amber-required treatment, progress bar).
6. **Shorts tab**: real "No shorts published" empty state (extraction B-3
   already implements this copy) restyled into the mockup's `Shorts
   library` / `Fast cuts / field pace` section chrome — see Real data
   mapping on why the mockup's 3 demo short cards do not ship here either.
7. **University footer**: mirrors hub footer styling; static tone copy
   left span ships, right span becomes real `<N> of <M> complete` (not the
   mockup's fixed "8 of 12").

## Desktop / mobile reflow (exact mockup breakpoints)

Per extraction A-3/A-9/A-10, this mockup's breakpoints are **800px and
460px**.

### `max-width: 800px`
Hero header becomes block; hero numeral left-aligns with 27px top margin;
summary strip becomes 2 columns (3rd signal spans both); lane grid becomes
1 column; University toolbar becomes block, filter groups left-align with
12px top margin; University card grid becomes 2 columns.

### `max-width: 460px`
Hero top padding 35px; hero headline `clamp(36px,10.5vw,54px)`; hero
context 12px font; summary strip 1 column, 80px min-height per signal, 3rd
signal no longer spans; doorway padding 17px, doorway heading 36px; Shorts
strip 2 columns (3rd short hidden); Pay rate grid 2 columns; footer stacks
(block, 7px top margin on 2nd span); role-switch pill (mockup-only, not
shipped) sits at `top:62px;left:9px` to clear the header brand — **not
applicable since the pill doesn't ship**, but the same header-brand
clearance constraint applies to any fixed-position chrome introduced this
round (there should be none per Sanctioned deviations); University hero top
padding 27px margin block layout; University toolbar margin-top 21px, tabs
10px bottom margin, filter groups block with 6px top margin, filter padding
6px 7px / 8px font; University card grid 1 column; card min-height 149px.

No horizontal scroll anywhere at any width (campaign rule).

## Design tokens (exact, from mockup)

```css
--stage: #030916;
--panel: #0a1f44;
--ink: #f2f6fa;
--muted: #9caabd;
--lime: #a3e635;
--line: rgba(231,237,244,.15);
--soft: rgba(231,237,244,.08);
--metal: linear-gradient(180deg,#fff 0%,#dbe4ed 38%,#7f8c9b 80%,#f5f7f8 100%);
--amber: #efc46f; /* used for Required-item accents on this page — unlike Forms, this IS used here */
```

System font stack for body/labels; `ui-monospace, Consolas, monospace` for
numerals/metadata/kickers, uppercase with letter-spacing. Hero numeral
(`.display`): `clamp(70px,9vw,120px)`, weight 900, line-height `.78`,
letter-spacing `-.13em`. Summary-strip/signal numerals: 31px, weight 900,
line-height `.8`, letter-spacing `-.1em`, same metallic treatment. Doorway
heading `clamp(32px,4.8vw,56px)`, line-height `.82`, letter-spacing `-.1em`
— no explicit weight (Hard Rule 2 applies). Hub/lane `h2`s (`University`,
`Field tools`, `Shorts`, `Pay structure`, doorway `h2`, University `h1`,
University card `h3`) have no explicit font-weight in the mockup (extraction
A-14 lists every one) — Hard Rule 2 applies to all of them. New
resources-specific rules should be namespaced `resources-line-*` in
`globals.css` alongside existing `.portal-*` conventions.

## Numeral clipping fix (carry over exactly)

The hero numeral (`.display`) and the summary-strip numerals both use the
**same** paint-area fix: `padding: .25em .13em 0 0` + `margin: -.25em -.13em
0 0` — the shared `.portal-metallic-num` class already in `globals.css`.
Same single-strategy situation as Forms (not the two-strategy situation
Calls had) — use `.portal-metallic-num` for both instances, verify
empirically at 1440 and 390. At ≤460px the mockup drops right
padding/margin to zero for the hero numeral — replay exactly. The
University hero numeral uses the identical `.display` class/strategy.

## Real data mapping (what each mockup number/string becomes)

- **Hero "resource lanes open" count**: real count of top-level resource
  lanes the signed-in user can access on the hub (University doorway,
  Field tools, Pay structure — realistically always 3 for every
  authenticated user since none of these three are role-gated on the hub
  itself), not the mockup's static "3" *by coincidence* — must be computed,
  not hardcoded, per campaign convention even where the number won't
  currently vary.
- **Learning items**: real count of published training resources visible
  to the signed-in user (via `useTraining`/`fetchResources`), not the
  mockup's static "12". Note: `<N> complete · <M> on your path` sub-copy
  derives from the same real progress data as the University hero.
- **Field tools**: real `quickLinks.length` from the current Links page's
  hardcoded array (currently 3) — this ships as the real array content
  (see next bullet), not the mockup's demo count.
- **Pay structure**: static "1" — there is exactly one pay-structure lane
  on the hub, this is a structural fact, not a measured metric (same
  reasoning Forms used for its "Manager only" chrome vs. live counts) — no
  live data source needed.
- **Field tools content — carrier mismatch (hazard B-2/B-3)**: the
  mockup's 3 tool rows (Xfinity Availability Check / Frontier
  Serviceability / Brightspeed Coverage Map, with Xfinity/Frontier/
  Brightspeed URLs) are demo content invented for the mockup. Ship the
  REAL `quickLinks` array content instead — currently TFiber Service
  Check, AT&T Fiber Availability, Frontier Availability with their real
  URLs (t-mobile.com/isp, att.com/internet/fiber, frontier.com) — restyled
  into the mockup's row anatomy (icon, title, "Serviceability/Coverage /
  open in new tab" meta pattern generalized to whatever `category` string
  each real link carries, arrow). Never ship the mockup's literal
  Xfinity/Frontier/Brightspeed row content as if real.
- **Pay structure rep card / admin grid values**: real `config/commission`
  data via the existing commission API — including the honest possibility
  that `ratesArePending()` is true and rates are all 0% (extraction
  confirms `DEFAULT_COMMISSION` is zero placeholders today). Do **not**
  ship the mockup's literal 40% / 45%+5% / 50%+8% / 55%+10% demo numbers.
  If rates are pending, ship the existing page's pending-rate copy/state
  restyled into the mockup's card, not a fabricated percentage.
- **University hero "items left" numeral + required strip**: real
  `getIncompleteRequired()` (or equivalent) count, not the mockup's static
  "4" / "2 required items incomplete".
- **University path progress**: real `getOverallProgress()` fraction, not
  the mockup's static "8 of 12 complete" / 66.666% fill.
- **University card grid**: real published `training` resources (title,
  type, category, duration, state, progress) via existing
  `ResourceGrid`/`ResourceCard` data — not the mockup's 6 static demo
  cards (hazard B-6: no verified Firestore records match those exact
  titles/states/percentages).
- **University carrier filter chips**: real `TRAINING_CATEGORIES` values
  (att / tfiber / verizon_frontier / xfinity / directv today) with real
  labels — not the mockup's fixed 3-chip Xfinity/Frontier/Brightspeed set
  (hazard B-4). However many categories exist in real config render as
  chips; do not force-fit to 3.
- **University type filter chips**: `All types` / `Video` / `Document` /
  `Quiz` / `Link` map 1:1 onto the real type enum (`video`/`document`/
  `link`/`quiz`) — no mismatch here, ship as spec'd.
- **Hub Shorts lane + University Shorts tab**: the mockup's 3 short cards
  (thumbnails, durations, titles) have **no real source** — no Shorts
  collection, hook, API route, or playback implementation exists
  (hazards B-7, B-8). See **OPEN CALL 2** for how this ships.
- **"Static demo" labels** on the Pay lane eyebrow and hub footer do NOT
  ship — mockup dev/demo affordances with no real counterpart (same
  pattern as Forms' "Static demo data" removal).

## Sanctioned deviations (structural / cross-cutting)

- **Mockup masthead does not ship.** Real `PortalHeader`/`PortalSidebar`/
  `MobileBottomNav` render instead. Hero header is the first real element.
- **Role-switch pill does not ship** — see "Rep/Admin pay switch" above
  (DECIDED, not an open call).
- **View-switch pill (`Resources hub` / `University` fixed pill) does not
  ship.** It's the mockup's own internal demo toggle between its two
  states; the real app uses real navigation (see OPEN CALL 1 for exact
  route shape) — no floating dev control ships, matching the Forms
  precedent for its `Forms home`/`Form fill` toggle.
- **Real submission/data flow preserved exactly**: existing `useTraining`
  hook methods, existing commission GET/PUT flow (loading/error/success/
  pending-rate/edit/cancel/saving/last-updated states), existing
  `userProgress` writes on resource completion — restyled into the
  mockup's visuals, not replaced with new client architecture.
- **University detail page (`/portal/training/[id]`) behaviors preserved
  exactly**: native video playback, iframe video, PDF iframe, image
  display, external-link buttons, missing-content state, mark-complete —
  none of this is represented in the mockup (hazard B-24) and none of it
  is removed. See OPEN CALL 3 on whether this page's *visuals* are touched
  this round; its *behavior* is out of scope regardless.
- **Admin University Content page (`/portal/admin/university`) is
  untouched** — explicitly out of scope per the extraction's own
  instruction; it remains the source of truth for the real `training`
  collection shape this round consumes (hazard B-25).
- **Loading/empty/error/permission states preserved, restyled.**
  `ProtectedRoute` behavior, commission API's loading/error/pending-rate
  states, training API's empty state ("No training resources are
  available yet."), Shorts' real empty state ("No shorts published...") —
  all keep working exactly as today, restyled into the new visual frame
  (the mockup shows none of these — they must be added, not dropped).
- **Role gating unchanged.** Links: `links:read` permission, no edit UI.
  Pay structure: field users get `scope:"own"`, platform roles get
  `scope:"all"`, only `admin` gets edit — server-enforced, unchanged.
  Training: `training:read` permission. University Content admin page:
  `admin`/`operations` roles, unchanged and untouched.
- **Commission tier/role enum unchanged.** Real tiers stay `entry_rep`,
  `l1_manager`, `l2_manager`, `ibo_level_1`–`ibo_level_4` (hazard B-10: the
  broader `FieldRole` union includes `entry_level_rep`, `general_manager`,
  `gm_in_training`, `office_manager`, which can produce missing/empty pay
  data for those users today — this is a pre-existing gap, not something
  this slice fixes; do not silently invent rates for untiered roles).
- lucide-react icons replace the mockup's inline SVGs (same glyph intent).
- Animations/transitions skipped under `prefers-reduced-motion` (respect
  the exemption pattern in `globals.css` `@layer base`); the mockup's
  300ms "rise" reveal is disabled under reduced motion per its own rule,
  consistent with campaign pattern.
- No Firestore/data-shape changes, no new collections, no new API routes
  beyond what OPEN CALL 2's resolution might require (ANCHOR.md §1/§2) —
  this is a visual reskin + consolidation, not a backend change.
- Light theme must keep working via the portal `ThemeContext` (dark is the
  1:1-verified target per campaign rule; light needs to be coherent, not
  verified 1:1).

## Nav / entry-point retargets

- **`portalNavGroups` Resources group** (`CommandPalette.tsx`, consumed by
  `PortalSidebar` and `MobileBottomNav`'s More sheet — extraction B-10)
  currently lists 3 items: University → `/portal/training`, Links →
  `/portal/links`, Pay Structure → `/portal/pay-structure`. Per the
  approved merge scope (Links + Shorts + Pay Structure merge into the hub;
  University stays its own page), this collapses to **2 items**: `Resources`
  → the hub route (per OPEN CALL 1's resolution), and `University` →
  its own route (unchanged if OPEN CALL 1 resolves to (c), or updated if
  (a)/(b)). Links and Pay Structure no longer appear as separate nav
  entries — they're reachable only via the hub's lane sections.
- **Mobile bottom-bar**: Resources/University are not in the 5 fixed slots
  today (Dashboard/Sales/Team Chat/Leaderboard/More — extraction B-10) and
  stay that way; both remain reachable via the More sheet. No slot change
  needed, unlike Forms (which claimed a fixed slot). This nav-config edit
  (if any) is confined to the More sheet's `portalNavGroups` consumption.
- **CommandPalette** automatically reflects the collapsed group once
  `portalNavGroups` changes — verify it shows `Resources` and `University`
  as two distinct searchable destinations, not three, and that `University
  Content` (the separate Operations-only admin entry) is unaffected.
- **QuickActions**: defines an unused `Training Library → /portal/training`
  entry but is not currently mounted anywhere (extraction B-20) — no
  change required; do not newly mount `<QuickActions />` as part of this
  slice (that would be scope creep beyond a reskin).
- **Dashboard**: has no current Resources/Links/Shorts/Pay-Structure/
  University entry point (extraction B-10) — no change required; do not
  add one speculatively.
- **Notifications**: no current producer targets these routes (extraction
  B-21) — no change required.

## OPEN CALL 2 — Shorts: honest-empty vs. omit-this-round

No real Shorts collection, hook, API route, thumbnail source, or playback
implementation exists anywhere in the app today (hazards B-7, B-8); the
current University Shorts tab already renders a real, honest empty state
("No shorts published" / "...will appear here once Operations publishes
them."). Options for the hub's Shorts lane (A-5) and the University Shorts
tab (A-11):

- **(a)** Ship the Shorts lane/tab shell (title, "View all in University"
  link, section chrome) with the REAL empty state in place of the mockup's
  3 demo thumbnail cards — matches "recompose, don't fabricate," costs
  nothing new, and is honest about there being no content yet.
- **(b)** Omit the Shorts lane from the hub entirely this round (keep it
  only inside University's Shorts tab, where the real empty state already
  exists) — reduces the hub to 2 sub-sections per lane (doorway-only left,
  tool-list+pay-only right) until real Shorts content exists, on the
  theory that an empty lane on the primary hub view reads worse than one
  buried a click away in University.

Recommendation: **(a)** — the mockup's own Shorts placement (nested
directly under the University doorway, with a "View all in University"
escape hatch) already anticipates a possibly-thin state; showing the real
"No shorts published" copy in the mockup's card-shell geometry is
consistent with how Forms/Calls handled every other real-empty-state case
in this campaign, and doesn't require inventing content. Needs
orchestrator sign-off since dropping the lane (b) is also defensible and
changes the hub's visual density.

## OPEN CALL 3 — University page: restyle this round, or hub + doorway only

The task scope line says "University stays its own page with a doorway
card on the hub," but does not by itself settle whether `/portal/training`
gets the mockup's full "Learn the line" visual treatment (hero, required
strip, toolbar, card grid, Shorts tab — A-9 through A-12) in this same
round, or whether only the hub ships now and University is restyled in a
later round (matching the campaign's one-archetype-per-round pattern in
ANCHOR.md §6).

- **(a)** Ship both this round. The mockup fully specs University's visual
  treatment already (this extraction documents it exhaustively); shipping
  the hub's doorway card without a matching University page would produce
  a jarring style seam the moment a rep clicks through. Detail page
  (`/portal/training/[id]`) stays unrestyled — the mockup has no detail-view
  spec at all (extraction never mentions one), so that page is out of
  scope regardless of this ruling.
- **(b)** Ship hub-only this round; University list page keeps its current
  visual treatment for now, restyled in a dedicated future round. Keeps
  this slice's diff smaller and matches the campaign's per-round page
  cadence more literally.

Recommendation: **(a)** — the mockup's own file bundles both views under
one design language specifically because the doorway card is the hub's
only bridge to University; shipping a hub that visually promises a
"Learn the line" experience and then dropping the user into the old
navy-card design would read as broken, not deferred. The extra surface
area (University hero/toolbar/card-grid) is a straightforward application
of the same tokens/patterns already being built for the hub, not new
design work. Needs orchestrator sign-off since it roughly doubles this
round's file/component surface versus (b), and directly determines the
file-scope hard rule below.

## HARD RULES (campaign-wide, binding)

1. **Big numerals never clipped.** The hero numeral, the 3 summary-strip
   numerals, the University hero numeral — ALL use the shared
   `.portal-metallic-num` class. Verify at 1440 AND 390, no glyph chopped
   on any edge. User-mandated — numbers have been repeatedly cut off on
   this campaign.
2. **Tailwind preflight resets h1–h6 to font-weight 400.** Every display
   heading — hub `h1`, doorway `h2`, lane `h2`s (University/Field tools/
   Shorts/Pay structure), University `h1`, University card `h3` (extraction
   A-14 lists all of these explicitly as relying on browser-default bold)
   — MUST declare `font-weight` explicitly. Verify computed weight
   in-browser for each.
3. **Counts render as plain numbers.** Hero count, summary-strip values,
   University "items left" numeral, path-progress fractions — no leading
   zeros, computed from real data per "Real data mapping" above, never the
   mockup's static figures.
4. **Big metallic hero numerals are top-aligned with the headline** — both
   the hub hero and the University hero's numeral-top-alignment behavior
   must be preserved exactly, verify visually.
5. **Dark theme via `localStorage['3c-theme']`** is the 1:1-verified
   target; light mode must stay coherent and working.
6. **Reduced-motion**: the "rise" reveal animation and any hover/focus
   transition must use the campaign's exemption pattern in `globals.css`
   `@layer base` (see `project-reduced-motion-gotcha` memory).
7. **File scope.** Exact list depends on OPEN CALL 1 (route shape) and
   OPEN CALL 3 (University in/out this round) — the orchestrator ruling on
   those two determines the final list. Provisionally, assuming OPEN CALL
   1→(c) and OPEN CALL 3→(a):
   - `src/app/portal/resources/page.tsx` (new hub page)
   - `src/app/portal/training/page.tsx` (University list — restyled)
   - `src/app/portal/links/page.tsx` (becomes a redirect to the hub)
   - `src/app/portal/pay-structure/page.tsx` (becomes a redirect to the hub)
   - `src/app/portal/shorts/page.tsx` (redirect target updated per hazard
     B-1's resolution)
   - Any new components extracted specifically for this slice, if placed
     under a `src/components/resources/**` subdirectory created for this
     slice (e.g. hub `DoorwayCard`, `ToolRow`, `PayLane` components) —
     reuse `src/components/training/ResourceGrid.tsx` and
     `ResourceCard.tsx` as-is (restyled at callsite via props/className,
     not forked), do not duplicate their data-fetching logic.
   - `resources-line-*` styles added to `globals.css` (namespaced,
     alongside existing `.portal-*` conventions)
   - `src/components/portal/CommandPalette.tsx` — ONLY the `portalNavGroups`
     Resources group definition (collapse from 3 items to `Resources` +
     `University`), nothing else in that file.
   - **Zero edits outside this list.** No edits to
     `src/app/api/portal/training/**`, `src/app/api/portal/commission/**`,
     `src/hooks/useTraining.ts`, `src/app/portal/training/[id]/page.tsx`
     (detail page, out of scope regardless of OPEN CALL 3), `src/app/portal/
     admin/university/page.tsx`, `src/types/commission.ts`,
     `src/types/training.ts` (or wherever the real type/enum definitions
     live), or any shared primitive (`PortalHeader.tsx`, `PortalSidebar.tsx`,
     `MobileBottomNav.tsx`, `PortalPageHeader.tsx`, `ProtectedRoute.tsx`,
     `Card`/`CardContent`, `Badge`, `Button`, `Tabs`/`TabsList`/
     `TabsTrigger`/`TabsContent`, `NativeSelect`, `Skeleton`, `Alert`/
     `AlertDescription`) unless a sanctioned deviation above explicitly
     requires it. Shared primitives get restyled at the callsite only.
8. **Leaderboard is deployed — never touch it.** No edits to
   `src/components/leaderboard/**` or `/portal/leaderboard`.
9. **Admin University Content page is untouched.** `/portal/admin/
   university`, its nav entry, and its upload/publish/delete workflow are
   NOT part of this slice (extraction B-25 — the new hub must keep
   consuming its output shape unchanged).

## Preserved behaviors (from extraction Part B — must keep working)

- `ProtectedRoute` permission gates exactly as documented: `links:read`
  (Links, absorbed into hub), `training:read` (University), the
  commission API's own scope/role-based field-vs-platform split, and
  University Content's `admin`/`operations` role gate (untouched page).
- Commission GET (`scope:"own"` vs `"all"`), PUT (403 for non-admin),
  loading/error/success/pending-rate/edit/cancel/saving/last-updated
  states — exactly as implemented today, restyled.
- Training resource fetch (`GET /api/portal/training`, published-only
  filter, category/type/required query filters, in-memory filtering,
  `order`-sorted results) and progress fetch/write (`userProgress`
  collection, `completed`/`progress`/`lastAccessedAt` fields) — unchanged.
- University detail page's full content-type handling (native video,
  iframe video, PDF iframe, image, external-link, missing-content,
  mark-complete) — untouched regardless of OPEN CALL 3's resolution on the
  list page.
- `/portal/shorts`'s real behavior — currently a redirect resolving to a
  real (if empty) Shorts surface — must keep resolving to a real surface
  after this slice, not 404 or dead-end (hazard B-1).
- Admin University Content page's full upload/create/publish/edit/delete
  workflow, storage path format, and allowed-type/size validation —
  entirely untouched (out of scope, extraction B-8/B-25).
- `quickLinks`' real 3-entry content (TFiber, AT&T Fiber, Frontier) and
  URLs — carried into the hub's Field tools lane verbatim, not replaced
  with the mockup's demo carriers.
- Existing test/route expectations for commission PUT authorization and
  training resource visibility filtering keep passing unmodified.

## Verify loop (mandatory)

1. Codex implements. Gates: `npx tsc --noEmit`, targeted eslint (files
   changed in this slice only), `npm run build`, `git diff --check`.
2. Signed-in Playwright session on `:3000`, dark mode
   (`localStorage['3c-theme']='dark'`). Before judging any screenshot,
   spot-check one changed element's computed style against the source
   (stale-dev-server guard — see `project-stale-dev-server-css` memory): if
   computed styles don't match source, kill the node child on `:3000`,
   delete `.next`, cold-start, and re-screenshot.
3. Screenshot the implementation at 1440px AND 390px covering: the
   Resources hub (hero + summary strip + both lanes, doorway card, Shorts
   lane in its real-empty or real-content state, Field tools rows, Pay
   lane in BOTH rep-card and admin-grid states — sign in as both a field
   role and an admin/operations user), and — if OPEN CALL 3 resolves
   toward shipping it — the University page (hero, required strip if
   applicable, toolbar with filters applied, card grid, Shorts tab).
4. Numeral integrity: confirm no glyph chopped on any edge for every
   metallic numeral (hub hero, 3 summary-strip values, University hero if
   in scope), at both 1440 and 390 (Hard Rule 1) — explicit check every
   round.
5. Computed font-weight check on every display heading (Hard Rule 2) —
   explicit check every round.
6. `scrollWidth` check at 375px confirming no horizontal scroll (campaign
   rule) — explicit check every round.
7. Fresh Opus reviewer diffs every screenshot against
   `design-mockups/resources-round1/option-3-the-line-resources.html`
   (rendered) and this contract's sanctioned-deviations/OPEN CALL
   resolutions; every visual difference not on the sanctioned list is a
   defect.
8. Nav-flip verification: confirm `portalNavGroups` Resources group shows
   `Resources` + `University` (not 3 old entries), confirm
   `/portal/links` and `/portal/pay-structure` redirect correctly, confirm
   `/portal/shorts` still resolves to a real (non-404) surface, confirm
   `University Content` admin entry is unaffected.
9. Regression verification: commission GET/PUT still enforces real
   permissions and writes to `config/commission` correctly; training
   resource fetch/progress-write still works; University detail page's
   video/PDF/image/link/mark-complete behaviors are unchanged; admin
   University Content page and its workflow still work.
10. Codex fixes; repeat with a FRESH reviewer until PASS (zero unsanctioned
    diffs, zero clipped numerals, zero broken entry points/regressions).
    Commit locally only. Push only on the user's explicit "deploy".

## Orchestrator rulings (BINDING — 2026-07-13, resolve all OPEN CALLs)

1. **Hub route → (c).** `/portal/resources` is the only NEW route.
   `/portal/training` remains University's canonical route (bookmarks and
   the `/portal/training/[id]` detail relationship untouched). Old-route
   disposition: `/portal/links` → redirect to `/portal/resources`;
   `/portal/pay-structure` → redirect to `/portal/resources` (pay section;
   use an anchor/param only if the hub supports landing on it cleanly —
   plain hub redirect is acceptable); `/portal/shorts` keeps its existing
   redirect to `/portal/training?tab=shorts` unchanged. No 404s.
2. **Shorts lane → (a).** Ship the hub Shorts lane with the honest real
   empty state ("No shorts published" copy per mockup tone). No fabricated
   shorts. Campaign precedent: honest empty states everywhere.
3. **University scope → (a).** `/portal/training` gets the mockup's full
   visual treatment this round (hero, required strip, toolbar/filters, card
   grid, Shorts tab) — avoiding a style seam between hub doorway and
   destination. `/portal/training/[id]` detail page stays OUT of scope
   (mockup specs no detail view); only ensure links to it keep working.
   Hard Rule 7's provisional file-scope list (written assuming 1→c, 3→a)
   is hereby CONFIRMED as final.
4. Confirmed as already-decided (not open): the Rep/Admin pay switch does
   NOT ship as an interactive toggle; the pay view renders per the real
   commission permission model (field roles = own tier; operations = all
   tiers read-only; admin = all tiers with real edit access).
