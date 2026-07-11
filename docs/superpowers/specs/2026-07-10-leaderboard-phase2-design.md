# Leaderboard Phase 2 — Rank History, Arrows, Sparklines, Streaks

Date: 2026-07-10
Status: approved by user (approach + scope), spec pending user review
Predecessor: `docs/redesign/leaderboard-2c-spec.md` (Broadcast redesign, commit
7ea24cd) and `docs/redesign/ANCHOR.md` §9 "Locked leaderboard pattern v2".

## Goal

Add the three history-dependent features deferred from the Broadcast redesign:

1. **Movement arrows** — rank change since end of yesterday (▲2 / ▼1 / – / NEW).
2. **7-day rank sparkline** — tiny inline trend line per row.
3. **Selling-day streak** — "🔥 N-day streak" chip.

Explicitly OUT of scope (user-approved): expandable week-by-week detail rows;
bonus-points wiring (still pending client sign-off); any visual redesign of the
page beyond adding these three elements.

## Approach decision (user-approved): compute history on the fly

No snapshot collection, no cron. The API already loads **all** approved sales
(`sales` where `status == 'approved'`, limit 5000) and filters/aggregates in
code. History for any past day is derivable by replaying that same dataset with
an earlier cutoff. Consequences:

- Arrows and sparklines are populated from day one (retroactive).
- Self-healing: late-approved sales retroactively correct history.
- No new Firestore collections, rules, indexes, or scheduled jobs.
- Rejected alternative: nightly `leaderboardSnapshots` cron — starts empty,
  competes for the single Vercel Hobby daily cron, extra failure mode.

## Business rules (user decisions, locked)

- **Streak** = consecutive *selling days*: days with ≥1 approved sale.
- **Weekends never break a streak** (Fri → Mon is consecutive). A weekend day
  *with* a sale still counts +1.
- **Arrows compare against end of yesterday.**

## Server changes — `src/app/api/portal/leaderboard/route.ts`

Extend each leaderboard entry and `currentUser` with:

```ts
movement: number | null; // +2 = climbed 2 since yesterday; null = NEW (unranked yesterday)
spark: (number | null)[]; // 7 entries, oldest→newest; rank as of end of that day; null = unranked that day
streakDays: number;       // consecutive selling days per rules above
```

Computation (pure functions in a new `src/lib/leaderboard/history.ts`, unit-
testable, no Firestore imports — the route passes in a plain array of
`{salesRepId, salesRepName, saleDate: Date, totalPoints}`):

- `ranksAsOf(sales, periodStart, cutoff, metric)` — aggregate sales with
  `periodStart <= saleDate < cutoff`, sort by metric (same tie behavior as the
  live sort), return `Map<repId, rank>`.
- **Movement**: `ranksAsOf(..., endOfYesterday)` vs current rank. Unranked
  yesterday → `movement: null` (render NEW). If `endOfYesterday < periodStart`
  (first day of a period), every movement is null.
- **Sparkline**: for each of the last 7 calendar days `d`,
  `ranksAsOf(..., endOf(d))`; days before `periodStart` → null.
- **Streak** (period-independent, uses the full approved-sales set): walk
  calendar days backward from today. Day has a sale → streak +1. Saturday or
  Sunday without a sale → skip (no break). Today without a sale → skip once
  (grace — the day isn't over). Any other saleless weekday → stop. Cap the walk
  at 365 days.

**Day bucketing timezone**: all "day" boundaries (endOfYesterday, sparkline
days, streak days) use a single constant `LEADERBOARD_TZ = 'America/New_York'`
(company timezone), bucketed via `Intl.DateTimeFormat` day keys — NOT server
UTC, which would misfile evening sales onto the next day. The existing
period-start logic is untouched (stays as-is; changing it is out of scope).

Perf: replay sorts ~8× per request over ≤5000 in-memory sales — trivial at
current team size; no additional Firestore reads.

## Client changes

`src/components/leaderboard/LeaderboardTable.tsx` (+ `page.tsx` type plumbing,
`useLeaderboard` types if defined there):

- **Movement cell**: `▲2` (green `text-[#8dc63f]`-family per existing tokens),
  `▼1` (amber/red per existing palette), `–` (slate) for 0, `NEW` chip for
  null. Compact, sits beside the rank number; follows the Broadcast table's
  existing type scale.
- **Sparkline**: inline SVG polyline, ~64×20px, no chart library. Y axis is
  rank **inverted** (line going up = climbing). Gaps (nulls) break the line.
  Hidden on mobile (<sm) to protect the 390px layout.
- **Streak chip**: `🔥 N-day streak` — shown only when `streakDays >= 2`
  (every row saying "1-day streak" is noise). Placement consistent with
  existing gap-to-next chips.
- Podium (top 3) rows may show movement + streak; sparkline is table-only.
- Skeletons updated to match new geometry (phase-1 review caught exactly this
  class of defect — don't repeat it).

No changes to: period/metric controls, weekly challenge, ticker, Firestore
rules, or any other page.

## Error handling

- History computation failure must not take down the leaderboard: wrap the
  enrichment; on error, log and return entries with `movement: null`,
  `spark: []`, `streakDays: 0`. UI treats empty spark as "no line".
- UI renders nothing (not "NEW") when the whole movement column is null on the
  first day of a period — a board of all-NEW chips on the 1st is misleading;
  detect via `entries.every(e => e.movement === null)` and render `–` instead.

## Testing & verification

- Unit tests for `history.ts`: streak weekend-skip, today-grace, break on
  saleless weekday; movement vs yesterday incl. NEW and first-of-period;
  sparkline nulls before periodStart; timezone bucketing around midnight ET.
- Gates: `npx tsc --noEmit`, targeted eslint, full test suite, `npm run build`.
- Signed-in screenshot verification, light+dark, desktop+390px (per redesign
  quality bar), self-critique before presenting.
- Independent Claude (opus) diff review before declaring done.

## Deployment note

Ships on master like phase 1 — but master is currently **1 commit ahead
(7ea24cd) and NOT pushed**; pushing auto-deploys phase 1 + 2 together. Deploy
remains a separate user decision.
