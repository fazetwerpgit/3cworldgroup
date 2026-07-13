# Sales "The Line" — Visual Parity Goal Contract

User picked mockup Option 3 "The Line: Sales" for `/portal/sales`. Client-locked
decision: **Approvals folds into Sales** (ANCHOR.md §9, campaign 2026-07-12).
Same contract style as `dashboard-the-line-goal.md` / `shell-the-rail-goal.md`:
implementation is verified 1:1 against the mockup by independent reviewers
until EXACT — not close enough.

## Source of truth

- Mockup: `design-mockups/sales-round1/option-3-the-line-sales.html`
- The mockup wins on any visual ambiguity not resolved by the sanctioned
  deviations below.
- Extraction reference (factual detail on both the mockup and the current
  implementation): Codex read-only audit, summarized into Part A/B below.

## Composition (top to bottom)

1. **Masthead**: `3C WORLD GROUP / THE LINE / SALES` brand mark left,
   `<MONTH YEAR> · <WEEKDAY>` date metadata right, lime hairline rule under
   it. Page renders inside the real portal shell (PortalHeader/PortalSidebar);
   the mockup's own masthead is the PAGE's top element within that shell —
   same pattern as Dashboard and Sales's existing command-band header.
2. **Command band / hero**: role-scoped kicker + heading + one context
   sentence + `Log sale` pill button (routes to `/portal/sales/new`, gated
   `sales:write`) on the left; giant metallic count-up hero numeral (monthly
   value) right-aligned, caption `Monthly value · $ / mo`. Manager copy:
   kicker `Management / priority flow`, heading templated on board count
   (`"<N> sales on the board."`), context mentions submissions in flight.
   Rep copy: kicker `Field sales / your flow`, heading/number scoped to the
   rep's own sales, context notes pending stays visible but review is
   manager-only.
3. **KPI broadcast cells**: 4-column hairline-divided grid — `Value MTD`,
   `Sales on board`, `Pending review`, `Commission MTD` — each with a bold
   value line and a muted supporting-copy line (lime inline emphasis for
   deltas/counts). See "Sanctioned deviations" for what's real vs. mockup
   fixture on this row.
4. **Pending-approvals queue (`.flow`)** — folded-in per the client decision,
   rendered for users with `sales:approve`; hidden or reduced to "Your
   pending" framing for reps without that permission:
   - Manager: kicker `Priority ordered / manager queue`, heading `Needs your
     attention`, subhead `<N> pending · oldest first`, guidance text.
   - Rep: kicker `Your sales / pending status`, heading `Your pending`,
     subhead `<N> pending · awaiting review`, guidance noting review is
     manager-only.
   - Rows: number chip (01/02/…), icon, customer + rep + product/provider +
     price + points, age chip (`Today` / `<n>d idle`, amber ≥7d, red ≥14d),
     manager-only inline `Approve`/`Reject` (stop propagation), row click
     opens detail sheet. Sorted pending-only, oldest (most idle) first.
5. **Ledger**: kicker/heading (manager: `The ledger / all statuses` /
   `The rest of the month`; rep: `Your ledger / all statuses` / `Your
   sales`), dynamic subhead `<count> recent records · click a row to
   inspect`, status tabs (`All`, `Pending` w/ count chip, `Approved`,
   `Rejected`, `Cancelled`, horizontally scrollable on mobile), table with
   columns Customer / Rep / Date / Value / Commission / Status / Actions,
   manager quiet `Edit`/`Delete` (hover-reveal) on non-pending rows and
   `Approve`/`Reject` on pending rows, totals footer (`<count> visible` +
   total value + total commission), empty states (`No pending sales in your
   book.` / `No <status> sales in this view.`).
6. **Detail sheet** (overlay): fixed right-side sheet, `min(510px,100%)`
   desktop / full-width mobile, dark bespoke background
   (`linear-gradient(180deg,#071833,#030916 78%)`), backdrop `rgba(0,0,0,.57)`,
   slide-in from `translateX(102%)`, close via X / backdrop / Escape.
   Sections: `Customer` (name, phone link, address), `Plans sold` (product,
   provider, price, points — one row per real `SaleProduct`, not the
   mockup's single-plan object), summary cells (`Monthly value`,
   `Commission`, `Points`), `Order / proof` (order#/BTN or proof screenshot
   via existing `/api/portal/forms/attachment` + `ChatLightbox`), `Rep
   notes`, actions, Previous/Next navigation (wraps, follows active
   filtered/scoped list), `Open full page ↗` link to `/portal/sales/[id]`.
   Manager-only: `Approve sale`/`Reject sale` on pending, `Edit`/`Delete`
   (admin-only per current UI gating) on all statuses.

## Desktop / mobile reflow (exact mockup breakpoints)

### `max-width: 800px`
Command-band top becomes block layout; hero numeral moves below text,
left-aligned; H1 `clamp(43px,13vw,65px)`; KPI grid becomes 2 columns;
priority rows become two-line grid with actions on row 2; ledger table
header disappears, rows become 5-column two-row layout; totals become 3
columns; quiet row actions stay visible (no hover-only on touch).

### `max-width: 560px`
Shell top padding 24px; command-top padding 35px; context font 13px; KPI
values 20px; tabs horizontally scrollable with fade mask; priority rows
become bordered cards (amber left rail, margin 7px 0, padding 11px 9px);
ledger rows become bordered status-edged cards (status-colored left rail,
margin 8px 0, padding 12px 10px); detail sheet full-width, padding 18px;
toast becomes left/right-inset centered at 12px.

No horizontal scroll anywhere at any width (campaign rule).

## Design tokens (exact, from mockup)

```css
--stage: #030916;
--panel: #0A1F44;
--panel2: #0d2857;
--ink: #f4f7fa;
--muted: #9caabd;
--lime: #8dc63f;
--amber: #e0ad54;
--red: #e87578;
--line: rgba(231,237,244,.14);
--soft: rgba(231,237,244,.08);
--metal: linear-gradient(180deg,#fff,#dbe4ed 38%,#7f8c9b 80%,#f5f7f8);
```

Hero numeral: `clamp(64px,9vw,118px)`, weight 900, letter-spacing `-.11em`,
line-height `.78`, metallic gradient background-clip. KPI numerals: 23px,
weight 900, letter-spacing `-.08em`. Money = `$` + `toLocaleString('en-US')`,
no decimal cents. Count-up: starts at 0, 650ms, ease-out cubic
`1 - Math.pow(1-p,3)`, reruns on every render, skipped under
`prefers-reduced-motion`. Fonts: body `"Trebuchet MS","Segoe UI",Arial,
sans-serif`; numerals/dates/kickers/status = `ui-monospace, Consolas,
monospace`. Hairlines: standard `1px solid var(--line)`, soft row divider
`1px solid var(--soft)`, lime section divider `1px solid var(--lime)`;
grids use `gap:1px` with border color as grid background; square corners
except pills/avatars. `.shell`: `width:min(1180px,100%); margin:auto;
padding:28px clamp(13px,4vw,58px) 42px`.

Status badge styles: Pending = amber border/bg-.12/`#f0c36d` text; Approved
= lime border/bg-.12/`#8dc63f` text; Rejected = red border/bg-.12/`#f18d90`
text; Cancelled = standard-line border/white-.06 bg/muted text.

## Sanctioned deviations from the mockup

- **Providers**: use the app's real provider constants — TFiber (T-Mobile),
  AT&T Fiber, Frontier Fiber, Xfinity. Do NOT ship the mockup's Brightspeed
  or Metronet (fixture-only, don't exist in the app's provider list).
- **Product model**: keep the real multi-`SaleProduct` model and
  server-side points calculation (`POST /api/portal/sales` derives
  `totalPoints` from products). The mockup's single-plan-object-per-sale
  ("Plans sold" showing one row) is fixture simplification; render one row
  per real `SaleProduct`.
- **Value field**: `totalValue` is the real field behind the mockup's
  "Value"/"value MTD" language. **Commission is NOT calculated by the
  create API** (`commission` exists as a Sale field but create doesn't
  populate it) — do not invent or fabricate commission numbers anywhere
  (KPI cell, ledger column, detail sheet, totals footer). DECIDED: keep
  the mockup's Commission column/cell/summary in the layout, but render
  an em dash `—` wherever the sale's `commission` field is null/absent;
  show a real dollar figure only when the field genuinely holds one.
  Totals footer sums only real values and shows `—` when there are none.
  The `Commission MTD` KPI cell shows `—` with its muted support line.
  Never `$0` (reads as a computed zero) and never an invented number.
- **Approvals fold-in** — `/portal/approvals` (currently gated
  `sales:approve`, showing pending-sale cards + reject modal) redirects
  into `/portal/sales`, ideally preserving manager context (e.g.
  `?status=pending`). Per extraction B10/B11, ALL existing entry points
  must keep working and must be updated to the new destination/labels, not
  silently left dangling:
  - Dashboard queue row: `Review pending sales (<count>)`, href
    `/portal/approvals` → redirect target (Sales).
  - Command palette page destination `Pending Approvals` and action
    `Review pending sales` → update destination/label to Sales.
  - `QuickActions.tsx` → `Approve Sales` action → update destination.
  - Sale-submission notification to the assigned manager
    (`sale_pending` → `link: '/portal/approvals'`) → update link.
  - `portalNavGroups` entries (desktop sidebar + mobile "More" sheet) that
    reference Approvals → update or remove per the fold-in.
  - Terminology DECIDED: keep the word "Approvals" in user-facing labels
    ("Pending Approvals", "Review pending sales", "Approve Sales") — it
    now describes the pending queue INSIDE Sales, and every one of those
    entry points routes to `/portal/sales?status=pending`. The
    `portalNavGroups` "Pending Approvals" entry is REMOVED entirely: the
    shell contract (`shell-the-rail-goal.md`) marked it transitional
    "until the Sales pending view ships" — this slice ships it.
- **Action gating**: Approve/Reject gated `sales:approve` (roles: admin,
  operations, l1_manager, l2_manager, ibo_level_1–4, general_manager,
  office_manager; `gm_in_training` excluded). Edit/Delete stay admin-only
  in the UI (current behavior), even though the mockup shows them as
  general manager-visible prototype actions. Status changes happen ONLY
  via `POST /api/portal/sales/approve` (accepts only `approved`/
  `rejected`, pending-only transitions) — the sale `PUT` allowlist
  excludes `status`. Do NOT build a status dropdown that implies it works;
  the current edit page's status selector is known-broken (extraction B6/
  B8) — remove it or make it genuinely wire to the approve API, don't
  reproduce the illusion.
- **Dashboard pending-count mismatch** (hazard B11.3) — DECIDED: fix it
  in this slice. The dashboard queue row links straight into the Sales
  pending queue, so a manager seeing `Review pending sales (0)` above an
  org-wide queue holding items is visibly wrong. For users with
  `sales:approve`, the dashboard's pending-count fetch drops the
  `salesRepId=<current user>` scoping (org-wide `status=pending` count);
  reps keep the per-rep count. This is the ONE sanctioned exception to
  Hard Rule 2 — the minimal fetch/param change in the dashboard page,
  nothing else on that page moves.
- **Create-flow validation preserved exactly** (extraction B5): address
  required; at least one plan required; product sold required; sale date
  required, not future-dated; install date required in create UI (may be
  blank in edit); **order number/BTN OR proof screenshot required**
  (interim rule per client — see `project-sales-carrier-proof-mapping`
  memory, carrier→field mapping still owed); authenticated user required;
  server ignores client-supplied rep identity, derives from token; server
  recalculates points from products; client supplies `totalValue`.
- KPI cell values: manager headline board numbers (Value MTD delta,
  Pending review "oldest idle" copy, etc.) must be computed from real
  fetched sales, not the mockup's prototype constants. Rep metrics are
  scoped to the rep's own sales the same way the mockup recomputes for
  its hardcoded "Jordan Blake" rep view.
- Empty/loading states: geometry-true skeletons for KPI cells, queue rows,
  and ledger rows (campaign pattern from Dashboard/Sales-list precedent);
  mockup's literal empty-copy strings (`No pending sales in your book.` /
  `No <status> sales in this view.`) preserved.
- Detail sheet becomes the mockup's bespoke dark right-side sheet in place
  of today's shared shadcn/Radix `Sheet` + light/dark portal tokens
  (extraction B4/B11.10) — this is the intended visual change, not a
  regression.
- Light theme must keep working via the portal `ThemeContext` (dark is the
  1:1-verified target per campaign rule; light needs to be coherent, not
  verified 1:1).
- lucide-react icons replace the mockup's inline SVGs (same glyph intent).
- Count-up numerals and rise/stagger animations skipped under
  `prefers-reduced-motion` (respect the exemption pattern in
  `globals.css` `@layer base`).
- Toast pattern (`Sale approved`/`Sale rejected`, 1.8s) ships for real
  approve/reject actions; the mockup's prototype-only toasts (`Demo edit
  action`, `Demo delete action`, `Demo action — Log sale form would open
  here`, `Demo action — full sale page would open here`) do NOT ship —
  those buttons route to the real `/portal/sales/new`,
  `/portal/sales/[id]/edit`, and `/portal/sales/[id]` pages instead.
- No route changes beyond the `/portal/approvals` → `/portal/sales`
  redirect; no new APIs; no Firestore/data-shape changes (ANCHOR.md §1/§2).

## HARD RULES (campaign-wide, binding)

1. **Big numerals never clipped.** Every large gradient/metallic numeral
   (background-clip:text) — the hero MTD value, KPI cell values wherever
   they use the metallic/tabular treatment — MUST use the shared
   `.portal-metallic-num` class from `globals.css` (padding
   `.25em .13em 0 0` + matching negative margins; mobile ≤460px drops
   right padding). Verify step MUST include screenshotting each big
   numeral at 1440 AND 390 and confirming no glyph is chopped on any edge.
   This is a user-mandated rule — numbers have been repeatedly cut off on
   this campaign.
2. **Zero `page.tsx` edits outside the sales/approvals routes.** Touch
   only `src/app/portal/sales/**` and `src/app/portal/approvals/**` (plus
   their supporting `src/components/sales/**`). Sanctioned exceptions,
   exhaustive: (a) the dashboard pending-count fetch change above;
   (b) entry-point retargeting (command palette destination/action,
   `QuickActions.tsx`, `sale_pending` notification link, removal of the
   `portalNavGroups` "Pending Approvals" entry) — retarget/remove those
   references only, no other edits in those files. The Rail (shell:
   `PortalHeader`, `PortalSidebar`, `MobileBottomNav`, portal `layout.tsx`)
   is otherwise untouched — do not duplicate or re-mount shell chrome.
3. **Leaderboard is deployed — never touch it.** No edits to
   `src/components/leaderboard/**` or `/portal/leaderboard`.
4. **Dark theme via `localStorage['3c-theme']`.** Both themes must render
   correctly; dark is the 1:1-verified target.
5. **Respect the reduced-motion exemption pattern** in `globals.css`
   `@layer base` (see `project-reduced-motion-gotcha` memory — Windows
   reduce-motion freezes all animations unless exempted correctly; test
   against the full compiled CSS, not source).

## Verify loop (mandatory)

1. Codex implements. Gates: `npx tsc --noEmit`, targeted eslint (files
   changed in this slice only), `npm run build`, `git diff --check`.
2. Signed-in Playwright session on :3000, dark mode
   (`localStorage['3c-theme']='dark'`). Before judging any screenshot,
   spot-check one changed element's computed style against the source
   (stale-dev-server guard — see `project-stale-dev-server-css` memory):
   if computed styles don't match source, kill the node child on :3000,
   delete `.next`, cold-start, and re-screenshot.
3. Screenshot the implementation at 1440px (manager view + rep view) and
   390px (manager view at minimum; rep view if time allows), covering:
   masthead + command band + KPI cells, pending-approvals queue, ledger
   with an open detail sheet, and the 800px intermediate breakpoint if the
   two-line priority-row / 5-col ledger reflow is in question.
4. Fresh Opus reviewer diffs every screenshot against
   `design-mockups/sales-round1/option-3-the-line-sales.html` (rendered)
   and this contract's sanctioned-deviations list; every visual difference
   not on the sanctioned list is a defect. Numeral-clipping check (Hard
   Rule 1) is explicit in every round.
5. Also verify no regressions: all six `/portal/approvals` entry points
   from B10 route correctly post-fold-in; approve/reject still writes the
   real audit trail and notifies the rep; create-flow validation (B5)
   still enforced; edit page no longer implies a working status dropdown
   it doesn't have.
6. Codex fixes; repeat with a FRESH reviewer until PASS (zero unsanctioned
   diffs, zero clipped numerals, zero broken entry points). Commit locally
   only. Push only on the user's explicit "deploy".
