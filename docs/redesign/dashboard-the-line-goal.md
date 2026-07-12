# Dashboard "The Line" — Visual Parity Goal Contract

User picked mockup Option 3 "The Line" (2026-07-12) for `/portal/dashboard`.
Same contract style as `leaderboard-spotlight-arena-goal.md`: the
implementation must be verified 1:1 against the reference screenshots by
independent reviewers until EXACT — not close enough.

## Source of truth

- Mockup: `design-mockups/dashboard-round1/option-3-the-line.html`
  (post-polish version, defects fixed 2026-07-12)
- Reference screenshots (in `.superpowers/sdd/shots/`):
  - `dashboard-ref-desktop.png` — rep view, 1440px
  - `dashboard-ref-mobile.png` — rep view, 390px
  - `dashboard-ref-desktop-manager.png` — manager view, 1440px

## Composition (top to bottom, rep view)

1. Masthead strip: lime square mark + "3C WORLD GROUP / THE LINE" kicker left,
   date · weekday right, lime hairline rule under it.
2. Broadcast command block: eyebrow kicker ("FIELD SALES / BROADCAST"),
   giant uppercase greeting with lime name ("GOOD MORNING, MARCUS."),
   one contextual sentence, outlined lime pill button "OPEN TODAY'S CALLS";
   right side: giant metallic count-up numeral (approved points) with caption
   "APPROVED POINTS · RANK #N OF M" clear below it.
3. Connected KPI strip, 4 hairline-divided navy cells: Approved Points,
   Sales This Month, Pending Approvals, Leaderboard Rank — small display
   numerals + unit smalls + one meta line each; lime used only for deltas/
   Top 10.
4. "PRIORITY ORDERED / NEXT ACTIONS" + "WHAT'S NEXT" heading; right-aligned
   "REP VIEW · N ITEMS" meta. Queue rows: lime-ringed 01/02/03 priority tick,
   line icon, bold title + meta line, right pill chip (2:30 PM / RESUME /
   RECRUITING...), chevron; hairline dividers between rows. Admin signups row
   (manager/admin only) carries a lime left edge + faint tint.
5. Leaderboard ticker band: 5 hairline-divided cells (rank number, name,
   pts); current user's cell is solid lime with navy text + "You" chip.
6. Footer hairline row: "Monthly leaderboard · approved points only." left;
   "Last refreshed …  · View all standings →" right.

## Role ordering (client-locked)

- Rep: command block → KPI strip → queue → ticker. Queue = Open today's
  calls, Continue onboarding (entry_level_rep only), Send recruit invite
  (manager+ only — see gating below; plain entry_rep may show calls only).
- Manager/admin/operations: queue FIRST ("NEEDS YOUR ATTENTION"), then
  command block → KPI strip → ticker. Queue = Review pending sales (count),
  signups awaiting role assignment (admin only), Open today's calls,
  Send recruit invite.

## Mobile (390px)

Single column; KPI strip 2x2; queue chips drop under the title, chevron stays
right; ticker reflows to a 2-column grid (You cell never clipped); no
horizontal scroll anywhere.

## Sanctioned deviations from the mockup

- The page renders inside the real portal shell (sidebar/header/bottom nav);
  the mockup's own masthead strip is the PAGE's top element within the shell.
- Real data everywhere via the EXISTING sources: `/api/portal/sales/stats`,
  `/api/portal/leaderboard`, `usePendingSignupsCount`, `useAuth` +
  `getEffectiveRole`; real user name, real date, real time-of-day greeting,
  real counts in queue rows and subheads. No new APIs, no route changes.
- Real role/permission gating decides which queue rows and orderings render
  (`hasPermission('sales:approve')`, `isRole(...)` exactly as the current
  page does). The mockup's Rep/Manager toggle chip does NOT ship.
- Contextual sentence under the greeting is role-appropriate copy derived
  from live counts (manager copy mentions approvals/signups only when
  nonzero); "Continue onboarding" only for entry_level_rep.
- Empty/loading states: geometry-true skeletons for KPI cells, queue rows,
  ticker cells; mini-leaderboard empty state text preserved from current page.
- Count-up numerals skipped under prefers-reduced-motion.
- Light theme must keep working via the portal ThemeContext (dark is the
  1:1-verified default; light needs to be coherent, not verified 1:1).
- lucide-react icons replace the mockup's inline SVGs (same glyph intent).

## Verify loop (mandatory)

1. Codex implements. Gates: `npx tsc --noEmit`, targeted eslint,
   `npm run build`, `git diff --check`.
2. Signed-in Playwright session on :3000, dark mode
   (`localStorage['3c-theme']='dark'`), leaderboard/stats mocked via
   page.route with REAL field names where live data is too thin.
3. Screenshot implementation at 1440px (rep + manager) and 390px (rep);
   fresh Opus reviewer diffs vs the three reference images; every visual
   difference not on the sanctioned list is a defect.
4. Codex fixes; repeat with a FRESH reviewer until PASS (zero unsanctioned
   diffs). Only then report PASS to the user. Push only on the user's
   explicit "deploy".
