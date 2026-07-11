# Leaderboard "Broadcast" implementation spec (2026-07-10)

Implement the client-approved "Broadcast" leaderboard design into the real portal
page. Visual reference: the approved mockup at
`C:/Users/jacob/AppData/Local/Temp/claude/C--Users-jacob-dev-3cworldgroup/11c6bab0-b4e0-4cbd-a72b-cfa42762a84e/scratchpad/mockup-2c-broadcast.html`
— open/read it; match its composition and feel, adapted to the constraints below.

## Files in scope (only these)
- `src/app/portal/leaderboard/page.tsx` (restructure)
- `src/components/leaderboard/LeaderboardTable.tsx` (evolve; you may split new
  presentational components into `src/components/leaderboard/` if it keeps files small)

Do NOT touch: `src/app/api/**`, `src/hooks/useLeaderboard.ts` behavior (you may
call the hook twice — it returns independent state instances), auth/roles,
routes, Firestore, global tokens.

## Hard constraints (from docs/redesign/ANCHOR.md)
- Brand: navy #0A1F44, lime #8dc63f (hover #7ab82e); lime = accent discipline;
  never white text on lime (use navy text). Gold/silver/bronze allowed ONLY for
  top-3 identity (the existing `medal` map is the pattern).
- LIGHT theme is the default; dark mode via existing `dark:` variants. The navy
  command band stays navy in both themes (see current page.tsx). Every new
  surface must be styled for BOTH themes following the existing file's idiom
  (slate-* light values + `dark:` token variants).
- Cards `rounded-lg`, thin borders, `shadow-sm`. Motion 120–300ms ease-out.
  Page/section entrances use the existing `.portal-enter/-2/-3/-4` utilities.
- Numerals: `portal-display portal-num` classes (Archivo, tabular).
- No emojis. Inline SVG or lucide-react icons only. No new dependencies.
- ASCII-safe source: use JSX entities (&middot; etc.) or escaped unicode, and
  make sure no mojibake can occur.

## Data reality (IMPORTANT — the mockup shows features we cannot ship yet)
`useLeaderboard` returns entries of `{ rank, salesRepId, salesRepName,
totalSales, totalPoints }` for the selected period, plus `currentUser` (the
caller's own standing even when outside top N). There is NO history data.
Therefore OMIT from this implementation: rank-movement arrows, 7-day
sparklines, streaks, expandable week-by-week row details, "% of team goal".
Do not fake them. The design must read complete without them.

## Page structure (top to bottom)
1. **Masthead (navy command band)** — keep the existing band (eyebrow, title,
   intro, YOUR RANK / POINTS / SALES numerals) and ADD:
   a. Under "Your rank", a micro progress line "X pts to #N" toward the next
      rank (computed from the entry above the user; hide if user is #1 or
      unranked). Thin lime bar, numerals right.
   b. A docked WEEKLY CHALLENGE strip as a separate row at the band's bottom
      edge (slightly lighter navy e.g. white/5 overlay, hairline top border
      white/10): icon chip + "Weekly challenge" eyebrow + "Close 3 sales by
      Sunday" + segmented 3-step progress + "N of 3 closed" + countdown
      ("2d 14h left", computed to end of Sunday local time). Progress = the
      user's approved sales THIS WEEK: call `useLeaderboard()` a second time
      (separate instance) fetching `('week','totalSales', 1)` and read its
      `currentUser`/`getUserRank`. Auth-gate this fetch exactly like the main
      one (wait for `user`). When target met, the strip states it plainly
      ("Challenge complete — 3 of 3"). NO bonus-points chip (not wired into
      scoring yet). Define `const WEEKLY_CHALLENGE = { targetSales: 3 }` at
      top of page.tsx so it is tunable.
2. **Controls row** — unchanged (period tabs + metric segmented control).
3. **Podium** — keep the locked pattern (2-1-3 order, winner elevated,
   lime top edge on #1, medal ring+chip) and add the Broadcast touches:
   line-art crown SVG top-right of #1's card only; big numerals count up on
   load/period change (respect prefers-reduced-motion: skip animation);
   a shared hairline baseline "platform" under the three cards on sm+.
4. **"Across the board" ticker band** — one full-width panel: left rail label
   "ACROSS THE BOARD" (11px uppercase), then 4 stat cells divided by hairlines
   (stack to 2x2 on mobile, snap-scroll row is fine too):
   - "Top closer" — rep with most sales this period + count.
   - "Closest race" — the adjacent pair with the smallest metric gap
     ("#4 vs #5", "15 pts apart"); skip pairs with 0-value members.
   - "Your climb" — current user's gap to next rank ("15 pts to #4"); if #1,
     "Leading by X"; if unranked, "First sale puts you on the board".
   - "Team pulse" — total points this period across entries + "N reps on the
     board" + days left in the period (computed; for 'all' period show just
     totals).
   All values derive from the already-fetched entries — no extra requests.
   If fewer than 2 entries, hide cells that don't apply gracefully.
5. **"The chase" table (ranks 4+)** — one continuous list (keep no-shame
   neutrality) with the Broadcast chase treatment:
   - Every row: rank square, avatar initials, name (+You badge), metric
     numeral + unit, and a right-aligned muted "gap to next" chip
     ("15 pts to #4" style on the user's row in lime; others "20 pts" muted).
   - The user's row plus its immediate neighbors (rank above and below) get
     the inline chase treatment: a 2px baseline progress bar at the row's
     bottom edge showing that rep's metric as a fraction of the next-rank
     rep's metric (lime fill for the user, slate for neighbors), animated
     from 0 on mount. User row: lime left edge (border-l-2) + subtle lime
     tint bg (existing pattern).
   - Staggered row entrance (CSS, 30-50ms steps), subtle hover bg shift.
   - Gap chip and chase math live in the component; guard division by zero.
6. **Footnote** — unchanged copy.
7. **Skeleton** — update `BoardSkeleton` to be geometry-true to the NEW layout
   (challenge strip line in band, ticker band block, chase rows), zero layout
   shift on load. **Empty state** — keep the existing one.

## Quality gates (run yourself before finishing)
```
npx tsc --noEmit
npx eslint src/app/portal/leaderboard/page.tsx src/components/leaderboard
```
Both must pass clean. Do not run the full build. Do not commit.

## Output
Report: files changed, any judgment calls you made, gate results.
