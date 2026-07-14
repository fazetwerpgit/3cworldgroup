# Calls Schedule "Hybrid: The Line" — Visual Parity Goal Contract (DRAFT)

User picked the round-2 hybrid mockup for `/portal/calls`. Same contract style
as `chat-the-line-goal.md` / `sales-the-line-goal.md` / `dashboard-the-line-goal.md`
/ `shell-the-rail-goal.md`: implementation is verified 1:1 against the mockup
by independent reviewers until EXACT — not close enough.

> **FINAL** (2026-07-13): all four OPEN CALLs are RESOLVED — see
> "Orchestrator rulings" at the end of this document. The rulings are binding
> and override any conflicting sentence in the draft body.

## Source of truth

- Mockup: `design-mockups/calls-round2/hybrid-the-line-calls.html`
- The mockup wins on any visual ambiguity not resolved by the sanctioned
  deviations below.
- Extraction reference (factual detail on both the mockup and the current
  implementation): Codex read-only audit, summarized into Part A/B below.

## Composition (top to bottom)

1. **Masthead**: `3C WORLD GROUP / THE LINE` brand mark left (lime square
   marker + glow), right-side metadata `Calls broadcast · America/Chicago`
   (hidden ≤760px). Bottom 1px lime border. Page renders inside the real
   portal shell (PortalHeader/PortalSidebar); the mockup's fixed top-right
   Rep/Manager/Admin switch is a **prototype view toggle only** — see
   Sanctioned deviations.
2. **Command band**: kicker `03 / The Line / recurring calls`, headline
   `<N> calls on the board today.` (count + "today." lime), context sentence,
   top-aligned right-side metallic hero numeral (today's visible call count)
   with caption `visible calls · <WEEKDAY>`.
3. **Next-call broadcast strip**: 5-column grid (label / title+meta /
   countdown / arrow / Join Meet), lime border, lime-to-navy gradient
   background — shows the next upcoming call for the signed-in user's real
   visibility scope, live countdown, real Join Meet link.
4. **Admin/operations management strip**: hidden by default, shown only for
   users who can manage calls; lime-left-border bar with "Operations desk"
   copy + `Add Call` button opening the create-call modal.
5. **Air Times section**: kicker `Week strip / select a broadcast day`,
   heading `Air times`, 7-column week strip (weekday, TODAY/full name, call
   count, selection state), interactive day filter.
6. **Selected-day pane**: pane title (selected weekday, "/ today" in lime for
   the current day), pane note (`N visible call(s) · America/Chicago`),
   2-column grid of call cards (time column with metallic clock numeral +
   ON AIR/COMPLETED + timezone label, copy column with title/audience
   pill/description/actions).
7. **Empty state**: dashed-border centered panel, calendar icon, "Call
   schedule not published yet." — mapped to the REAL empty-schedule state
   (see deviations), not the mockup's manual preview toggle.
8. **Footer**: `Times shown in CT · Google Meet links only.` left; right side
   is mockup-only chrome (`Preview empty state · Click any day to filter`) —
   see deviations for what ships.
9. **Add Call modal**: dialog with starter-template buttons (Manager Sync /
   IBO Leadership / New Rep Onboarding), title/day/time/link/audience/
   description fields, Cancel/Save — maps to the real create-call `Dialog`
   already in `page.tsx`.

## Desktop / mobile reflow (exact mockup breakpoints)

Per the extraction (B-33), the mockup's actual breakpoints are `760px` and
`430px` (not 720px/460px as elsewhere in the campaign) — use the mockup's own
values, not the campaign's usual round numbers. Implementation must carry
these exactly:

### `max-width: 760px`
Shell top padding 24px; mast gets 155px right padding, mast metadata hides;
command-top becomes block layout; hero numeral left-aligns, 29px top margin,
89px size; broadcast strip becomes `1fr auto` (label spans both columns, Join
Meet moves to column 2/row 2, arrow hidden); management-bar text top-aligns,
caps at 190px; week strip becomes 4 columns (7 days wrap to two rows, with
border-logic exceptions: tab 4 loses right border, tabs 5+ lose bottom
border, tab 6 restores right border); cards become 1 column; card time column
125px, card min-height 174px, time numeral 35px; footer stacks (8px gap);
modal padding 17px; form grid becomes 1 column.

### `max-width: 430px`
Shell horizontal padding 12px; mast label 10px/1.2 line-height; role-switch
repositions (mockup-only, not shipped — see deviations); headline
`clamp(43px,13vw,66px)`; context 12px; broadcast padding 13px/12px, title
13px, countdown 10px; hero numeral 83px; week strip -1px horizontal margin;
tabs 11px/8px padding, weekday 8px, date 10px, count 8px; pane header
top-aligns, pane title 22px, pane note max-width 135px/1.35 line-height; card
columns become 103px + flexible; time column padding 16px/11px, numeral 30px;
copy padding 16px/12px, title 13px, description 10px; Join buttons 42px min
height; modal title 22px.

No horizontal scroll anywhere at any width (campaign rule).

## Design tokens (exact, from mockup)

```css
--stage: #030916;
--panel: #0A1F44;
--panel2: #0d2857;
--ink: #f4f7fa;
--muted: #9caabd;
--lime: #8dc63f;
--line: rgba(231,237,244,.14);
--soft: rgba(231,237,244,.08);
--metal: linear-gradient(180deg,#fff 0%,#dbe4ed 38%,#7f8c9b 80%,#f5f7f8 100%);
--red: #e87578;
```

Body font `"Trebuchet MS","Segoe UI",Arial,sans-serif`; numerals/metadata/
kickers `ui-monospace, Consolas, monospace`, uppercase with letter-spacing.
Hero numeral: `clamp(70px,9vw,119px)`, weight 900, line-height `.78`,
letter-spacing `-.13em`, metallic gradient background-clip. Card clock
numeral: `clamp(38px,3.2vw,46px)`, weight 900, line-height `.8`,
letter-spacing `-.14em`, same metallic treatment. Headline `h1`: 
`clamp(45px,7.8vw,98px)`, line-height `.82`, letter-spacing `-.1em`,
uppercase. Section heading (`Air times`) 22px, `-.05em`. Pane title 27px,
`-.07em`. Card title 16px, `-.03em`. Background carries a faint 56px grid
texture at `.23` opacity fading toward the bottom, plus a lime radial glow
top-center and a navy radial glow at 18%/53%. Hairlines 1px using
`--line`/`--soft`. New calls-specific rules should be namespaced
`calls-line-*` in `globals.css` alongside the existing `.portal-*` utility
conventions, not scattered inline styles (extraction B-31: current portal
uses Archivo/portal-display + Tailwind primitives; assign this page's
typography at the calls callsite only).

## Numeral clipping fix (carry over exactly)

Two different, deliberate clipping strategies exist in the mockup — both must
survive implementation unmodified:

- **Hero numeral** (`.hero-number .display`): uses the shared paint-area fix
  — `padding: .25em .13em 0 0` + `margin: -.25em -.13em 0 0` — i.e. the
  standard `.portal-metallic-num` treatment already in `globals.css`. Use
  that class here rather than re-deriving the padding/margin values inline.
- **Card clock numeral** (`.air-time strong`): does **NOT** use the
  padding/margin fix. Its anti-clipping comes entirely from `min-width:0`,
  `minmax(0,1fr)` grid tracks, reduced time-column widths at each breakpoint,
  smaller breakpoint font sizes, reduced padding, and allowed line-wrapping
  (the AM/PM suffix visibly wraps to its own line at narrow widths in the
  mockup's own render). **Do not add `overflow` clipping or force
  `white-space: nowrap` around the clock column** — that would cut off the
  metallic glyphs or the wrapped AM/PM line. Do not force this numeral onto
  `.portal-metallic-num` if that class's padding model conflicts with the
  card's own layout math — verify empirically per breakpoint instead of
  assuming the shared class is a drop-in fit here (see OPEN CALL below).

## Sanctioned deviations from the mockup

- **Role switch is not real auth.** The mockup's fixed top-right
  Rep/Manager/Admin pill toggle is a prototype view switch (extraction Part
  A "Fixed role preview switch"). Do NOT ship a UI control that fakes role
  changes. The real page already gates visibility server-side (GET
  `/api/portal/calls` filters manager-only calls per role; `canManage` drives
  Add/Remove visibility) — render based on the signed-in user's actual role,
  no client toggle. Per the chat/sales precedent (interactive toggle removed,
  static role chip kept for the visual affordance) — see **OPEN CALL 1**
  below for whether Calls follows the same pattern or drops the chip
  entirely, since the mockup's switch has no masthead-position equivalent
  here (it's a floating fixed element, not part of the masthead row).
- **Real calls, not mockup fixtures.** The 11 hardcoded demo calls (rotated
  by `(day + today) % 7`, extraction B-1/B-2/B-7/B-9) are prototype fixtures.
  Render real `scheduledCalls` from GET `/api/portal/calls?userId=<uid>`,
  sorted by `CALL_DAY_ORDER` then time (server-side, not rotated). Do not
  hardcode the mockup's demo titles/times/Meet links/counts.
- **Day values**: mockup uses numeric day offsets 0–6 relative to "today";
  real `CallDay` is fixed lowercase strings `monday`–`sunday` (extraction
  B-1). Map the week-strip's 7 columns to the real day values in
  `CALL_DAY_ORDER`, not an offset rotation. The mockup's "today" highlighting
  and default-selected day map onto the real current weekday in
  `America/Chicago`.
- **Audience values**: mockup uses uppercase `EVERYONE`/`MANAGERS` demo
  strings; real values are lowercase `all`/`managers` with real labels
  "Everyone" / "Managers only" from `CallAudienceLabels` (extraction B-3,
  B-27). Use the real labels in the audience pill and the create-call form's
  audience select, not the mockup's uppercase demo copy.
- **Field name**: mockup's JS uses `meet`; real data field is `meetLink`
  (extraction B-4). No mockup-copy leakage into real field names.
- **Timezone**: mockup hardcodes "AMERICA / CHICAGO" display copy for every
  card. Real `ScheduledCall` has a `timezone` field that may be empty or
  differ from Chicago; the create form silently defaults to
  `America/Chicago` but has no timezone input today (extraction B-5, B-6).
  DECIDED for this slice: keep the mockup's static "AMERICA / CHICAGO" /
  `(timezone) / every {weekday}` real-formatter suffix behavior — i.e.
  preserve the current `formatTime` output exactly, restyled into the
  mockup's card layout; do not add a timezone selector UI (out of scope,
  no such field exists in the mockup either).
- **Time format**: mockup renders 12-hour, CT-suffix-stripped time inside
  cards (e.g. "8:30 AM"); real `formatTime` produces 12-hour text plus a
  separate `(timezone) / every {weekday}` suffix (extraction B-6). Keep the
  real formatter's output; lay it out to match the mockup's visual split
  (numeral line + metadata line below), not the mockup's literal string.
- **Past/on-air/DONE computation**: the mockup computes "ON AIR" vs.
  "COMPLETED" and swaps Join Meet for a DONE checkmark based on the current
  time vs. the call's scheduled time (extraction B-13). The current real
  page has no such computation — it always renders Join Meet for every
  active call regardless of time. **OPEN CALL 2** below — this is real new
  client-side logic, not a pure reskin; needs an explicit decision on
  whether it ships this slice.
- **Countdown / hero "visible calls" numeral / next-call strip**: the
  mockup's hero count, weekday note, next-call title/meta/countdown are all
  computed client-side from the rotated demo data (extraction B-12). The
  real page has no next-call/countdown feature today. Implement these as
  real derived values from the fetched `calls` list (today's visible count,
  soonest upcoming call by day+time comparison in `America/Chicago`,
  live-updating countdown) — this is new-but-derived-only logic (no new
  API, no new Firestore fields), consistent with "recompose, don't
  fabricate." Reruns every second like the mockup, skipped/frozen under
  `prefers-reduced-motion` per the reduced-motion exemption pattern.
- **Week strip counts & selection**: mockup's day tabs are clickable and
  filter the single selected day's cards (extraction B-11). The current real
  page instead renders every non-empty day group at once with no
  interaction. **OPEN CALL 3** below — day-tab click-filtering is new
  interaction behavior, not present in the current page; needs a decision on
  whether to adopt the mockup's single-selected-day filtering (dropping
  "show all days at once") or keep all-days-visible and use the week strip
  as a scroll-to-day jump nav instead.
- **All seven days always shown vs. empty days removed**: the mockup always
  renders all 7 weekday tabs including empty ones (extraction B-10); the
  current real page removes empty weekday groups entirely. Per the mockup's
  own opacity-.5 "empty" tab styling, the week strip is designed to always
  show all 7 — carry the mockup's behavior (show all 7 tabs, empty ones
  dimmed via `.empty`), and use the **selected-day pane's own empty state**
  (mockup's dashed-border "not published yet" panel) for a day with zero
  visible calls, rather than hiding the tab.
- **Manager-call visibility predicate**: unchanged from today — real API
  grants manager-only-call visibility to `l1_manager`, `l2_manager`,
  `ibo_level_1`–`ibo_level_4`, plus platform roles (admin/operations);
  `general_manager`, `office_manager`, `gm_in_training` are excluded
  (extraction B-15) — do not expand this predicate as part of a visual
  redesign, matching the sales/chat precedent of leaving role predicates
  alone.
- **Management access**: mockup gates Add/Remove UI on role `admin` only
  (its 3-way Rep/Manager/Admin switch). Real management access is
  `canManage` from the API, granted to platform roles `admin` **and**
  `operations` (extraction B-16) — field managers can view manager calls but
  cannot create/delete them. Gate the Add Call button / management strip /
  per-card Remove button on the real `canManage` flag, not a role-name
  string match.
- **Create/Delete stay real CRUD.** Mockup Add/Remove only mutate an
  in-memory demo array (extraction B-17). Keep POST `/api/portal/calls`
  (day/time/audience/Google-Meet-URL server validation) and DELETE
  `/api/portal/calls` (hard Firestore delete) exactly as implemented,
  restyled into the mockup's modal and Remove-button treatment. Preserve the
  existing "Adding…"/"Removing…" disabled-button loading states (extraction
  page-states list) inside the mockup's button styling.
- **No edit UI.** Mockup has no edit behavior; neither does the current real
  page (no PUT/PATCH route). Do not imply editing exists (extraction B-18) —
  no edit affordance ships in this slice.
- **Empty state**: mockup's empty state is a manual preview-only toggle
  (footer "Preview empty state" link) with static demo copy (extraction
  B-20). The footer toggle does **not** ship — it's prototype chrome with no
  real-data equivalent. The mockup's dashed-panel visual (icon + "Call
  schedule not published yet." + supporting copy) becomes the REAL empty
  state, shown when the API returns zero visible active calls, preserving
  the current page's existing split copy for managers/admins (who see the
  `REQUIRED_CALLS` starter-template list) versus regular viewers (who see
  plain empty copy) — see extraction "Current page states" list. Footer's
  "Click any day to filter" copy only ships if OPEN CALL 3 resolves toward
  keeping day-filtering; otherwise drop that footer fragment.
- **Loading state**: mockup has no loading state (extraction B-21) — keep
  the current page's existing skeleton while GET is pending, restyled to the
  mockup's card geometry (geometry-true skeleton, campaign pattern).
- **Error states**: mockup has no error state (extraction B-22) — keep the
  current GET/POST/DELETE `Alert`/`AlertDescription` error handling exactly,
  restyled to the dark token set.
- **Auth/permission enforcement**: mockup has no redirect or permission
  logic (extraction B-23) — keep `ProtectedRoute` (auth-only, no
  role/permission prop today) exactly as implemented; do not add or remove
  gating as part of this reskin.
- **Form field mapping**: real form fields differ from the mockup's labels
  per extraction B-26 — implementer must map each mockup form field to its
  real counterpart (title, day select using real `CallDay` values via
  `CALL_DAY_ORDER`, time input, Google Meet link with real
  `https://meet.google.com/...` validation, audience select using
  `CallAudienceLabels`, description). The starter-template buttons
  (Manager Sync / IBO Leadership / New Rep Onboarding) map onto the real
  `REQUIRED_CALLS` starter list already in `page.tsx` — do not invent a
  second, different starter set; reconcile the mockup's 3 named starters
  against whatever `REQUIRED_CALLS` currently contains (see **OPEN CALL 4**
  if they don't line up 1:1).
- **Google-Meet-only validation**: mockup states "Google Meet links only" as
  a visual contract with demo URLs (extraction B-28). Real API already
  validates the `https://meet.google.com/...` pattern server-side and
  produces an error otherwise — keep that validation, surface its error
  through the existing error-alert pattern.
- **Fields not shown in the mockup**: `createdByName`, `active`, `createdAt`,
  `updatedAt`, and the Firestore ID are real fields the mockup never
  displays (extraction B-29). None need to be surfaced in the UI — this
  matches current behavior (the page's local type doesn't render
  `createdByName` either) — no deviation needed, just don't drop them from
  the data model in transit.
- **No notification integration** ships as part of this slice (extraction
  B-30) — there is no current call-specific notification producer; none is
  being added here.
- Empty/loading states: geometry-true skeletons (campaign pattern), not the
  mockup's manual-toggle demo state.
- Light theme must keep working via the portal `ThemeContext` (dark is the
  1:1-verified target per campaign rule; light needs to be coherent, not
  verified 1:1).
- lucide-react icons already imported by the page (`AlertCircle`,
  `CalendarClock`, `Clock3`, `ExternalLink`, `Plus`, `ShieldCheck`,
  `Trash2`, `Users`) replace the mockup's inline SVGs (same glyph intent) —
  reuse these rather than adding new icon imports where a mapping exists.
- Animations/transitions skipped under `prefers-reduced-motion` (respect the
  exemption pattern in `globals.css` `@layer base`); the mockup's own
  reduced-motion rule (`*,*:before,*:after{transition:none!important}`) is
  consistent with this — the countdown/live re-render should also stop
  visibly animating (no forced re-paint churn) under reduced motion, even
  though the underlying data can still refresh.
- No route changes, no new APIs, no Firestore/data-shape changes (ANCHOR.md
  §1/§2 — this is a visual reskin plus the client-side-only derived
  countdown/next-call/on-air logic called out above, not a backend change).
  `/portal/calls` stays in `portalNavGroups`, `PortalSidebar`,
  `MobileBottomNav` (via More sheet), and `CommandPalette` exactly as today.

## OPEN CALL 1 — Role affordance: chip, toggle, or nothing

The mockup's role switch is a **fixed, floating top-right control** — not
part of the masthead row like chat's Rep/Manager pill was. Options:

- **(a)** Drop it entirely — no role-switch analog ships. The real page
  already adapts visibility per role; there's nothing for a chip to toggle
  or display that isn't already obvious from what's on screen (managers see
  the management strip, admins see Add Call).
- **(b)** Follow the chat/sales precedent — render a static, non-interactive
  role chip in the same fixed-position pill styling, labeled with the
  signed-in user's real role group.
- **(c)** Repurpose the fixed-position slot for something real, e.g. a
  timezone indicator (`America/Chicago`) since the page is inherently
  timezone-sensitive.

Recommendation: (a) — chat/sales needed the chip because their toggle
occupied prominent masthead real estate that would otherwise look broken if
just deleted; here it's a small floating control with no real-role-name
payoff strong enough to justify a permanent screen fixture. Needs orchestrator
sign-off.

## OPEN CALL 2 — Past/on-air/DONE computation

This is genuinely new client logic not in the current page (extraction
B-13): compute whether each call's scheduled time has passed "today" and
swap Join Meet → DONE checkmark, dim the card. Two paths:

- **(a) Ship it.** It's derived-only (no new API/field), matches "recompose
  don't restyle," and is core to what makes the mockup's board feel like a
  live signal instead of a static list.
- **(b) Defer it.** Treat calls as recurring-weekly with no "this instance is
  over" concept in the data model — a call at "today 2pm" recurs every week,
  so "DONE" framing might mislead reps into thinking the call won't happen
  next week. Ship the visual card treatment but always render Join Meet
  (current real behavior), dropping only the ON AIR/COMPLETED/DONE swap.

Recommendation: (a), scoped narrowly — compute past/on-air purely from
"has today's occurrence's start time already passed in America/Chicago,"
reset every day at midnight CT (the recurrence continues); this mirrors how
the mockup itself treats it (rotates demo data daily) and doesn't require
any data-model change. Needs orchestrator sign-off since it's the one place
this slice adds behavior beyond a pure reskin.

## OPEN CALL 3 — Week-strip day filtering vs. show-all-days

Current real page shows every non-empty day at once; mockup filters to one
selected day via the week strip (extraction B-11). Two paths:

- **(a) Adopt the mockup's filtering** — click a day tab, see only that
  day's cards below, matching the mockup exactly including the "Today
  preselected" default. Cleanest 1:1 match; changes real interaction model.
- **(b) Keep show-all-days**, repurpose the week-strip as a scroll-to-day
  jump nav (click a tab, page scrolls to that day's section, all days remain
  rendered) — preserves the current information density (nothing hidden)
  at the cost of not being a literal reskin of the mockup's filtering
  behavior.

Recommendation: (a) — the entire "Air times" section is built around a
single selected-day pane in the mockup (pane title, pane note, single card
grid); reverse-engineering a show-all-days variant fights the mockup's
layout rather than reskinning it, and the week-strip counts still let a rep
see at a glance which days have calls without opening each one. Needs
orchestrator sign-off since it changes real interaction behavior, matching
the bar for OPEN CALL 2.

## OPEN CALL 4 — Starter-template reconciliation

The mockup's 3 modal starter buttons are `Manager Sync` / `IBO Leadership` /
`New Rep Onboarding` with specific seeded values. The current page's
`REQUIRED_CALLS` list (extraction B-8) is confirmed to be **a different,
8-item list** with no real times or Meet links — it's described as "a
starter template, not a schedule data source," and is also shown when the
empty state renders for managers/admins. Needs a decision:

- **(a)** Keep `REQUIRED_CALLS` as the empty-state starter list (unchanged,
  8 items) AND separately seed the mockup's 3 named starter buttons inside
  the Add Call modal with the mockup's literal demo values (title/day/time/
  audience/description) as quick-fill conveniences — two independent lists
  serving two different UI locations, both preserved.
- **(b)** Reconcile them into one list — read `REQUIRED_CALLS`'s actual
  current contents and either trim the modal to whichever 3 of the 8 map
  closest to the mockup's named starters, or expand the modal's starter row
  to all 8.

Confirmed by reading `page.tsx:62-90`: `REQUIRED_CALLS` is an unrelated
5-item onboarding-week checklist (`Onboarding Call`, `Day 1 Training Call`,
`Day 2 Pitch Practice`, `Day 3 Rebuttals and Closing Practice`, ...), all
audience `all`, spread Monday–Wednesday+ — it does not overlap in name, day,
or purpose with the mockup's `Manager Sync` / `IBO Leadership` / `New Rep
Onboarding` starters. This confirms recommendation (a): they are genuinely
independent lists serving different UI locations (empty-state admin
seed-checklist vs. modal quick-fill shortcuts) with no collision to
reconcile. Orchestrator sign-off still requested since this changes what the
modal's starter row seeds versus the mockup's literal 3 buttons, but the
data itself is now verified, not assumed.

## HARD RULES (campaign-wide, binding)

1. **Big numerals never clipped.** Every large gradient/metallic numeral
   (background-clip:text) — the command-band hero numeral and every card's
   clock numeral — MUST render correctly at 1440 AND 390 with no glyph
   chopped on any edge. The hero numeral uses the shared
   `.portal-metallic-num` class from `globals.css` (padding
   `.25em .13em 0 0` + matching negative margins; mobile ≤460px drops right
   padding). The card clock numeral uses its own documented non-padding
   anti-clipping strategy (see "Numeral clipping fix" section above) — do
   not force it onto `.portal-metallic-num` without verifying the card
   layout still fits; verify empirically, not by assumption. This is a
   user-mandated rule — numbers have been repeatedly cut off on this
   campaign.
2. **Tailwind preflight resets h1–h6 to font-weight 400.** Every display
   heading ported from the mockup — command-band `h1` (extraction B-32
   explicit), `Air times` `h2`, pane title `h3`, card title `h4`, modal
   `h2` — relies on browser-default bold in the standalone mockup and MUST
   declare `font-weight` explicitly in the implementation. Verify computed
   weight in-browser for each.
3. **Counts render as plain numbers.** Stat/hero counts (today's call count,
   week-strip per-day counts, pane note counts) render with no leading
   zeros. The kicker's `03 /` index numbering is design chrome and DOES keep
   its literal format from the mockup (it is not a data-driven count).
4. **Big metallic masthead numerals are top-aligned with the headline.**
   The hero numeral's `.command-top { align-items: flex-start }` behavior
   must be preserved exactly — verify visually, not just via the CSS
   property being present.
5. **Carry over the clock-numeral clipping fix exactly** per the "Numeral
   clipping fix" section above — this is the campaign's per-breakpoint
   sizing/wrapping strategy specific to this page's card layout, distinct
   from the standard `.portal-metallic-num` fix, and must not be collapsed
   into a single shared treatment without per-breakpoint verification.
6. **Dark theme via `localStorage['3c-theme']`** is the 1:1-verified target;
   light mode must stay coherent and working.
7. **Reduced-motion**: any animation (countdown re-render, hover states,
   card transforms, toast) must use the campaign's exemption pattern in
   `globals.css` `@layer base` (see `project-reduced-motion-gotcha`
   memory — Windows reduce-motion freezes all animations unless exempted
   correctly; test against the full compiled CSS, not source).
8. **File scope.** Touch only:
   - `src/app/portal/calls/page.tsx`
   - Any new components extracted specifically for this page, if placed
     under a `src/components/calls/**` directory created for this slice
   - `calls-line-*` styles added to `globals.css` (namespaced, alongside
     existing `.portal-*` conventions)
   - **Zero edits outside this list.** No edits to `src/types/calls.ts`,
     `src/app/api/portal/calls/route.ts`, `src/lib/users/restampDisplayName.ts`,
     or any shared primitive (`PortalHeader.tsx`, `PortalSidebar.tsx`,
     `PortalPageHeader.tsx`, `ProtectedRoute.tsx`, `Alert`, `Badge`,
     `Button`, `Card`/`CardContent`, `Dialog` primitives, `Input`, `Label`,
     `NativeSelect`, `Skeleton`, `Textarea`) unless a sanctioned deviation
     above explicitly requires it — this is a visual reskin, not a
     data/behavior change beyond the narrowly-scoped derived logic in
     Sanctioned deviations / OPEN CALL 2. Shared primitives used by other
     pages get restyled at the callsite only (extraction "Shared-component
     hazards" list — `PortalPageHeader` in particular is reused by training,
     forms, settings, and admin pages; do not touch it globally for Calls).
9. **Leaderboard is deployed — never touch it.** No edits to
   `src/components/leaderboard/**` or `/portal/leaderboard`.

## Preserved behaviors (from extraction Part B — must keep working)

- `ProtectedRoute` loading/auth-redirect behavior (auth-only gate, no
  role/permission prop today).
- Page loading skeleton while GET is pending.
- GET/POST/DELETE error `Alert`/`AlertDescription`.
- Empty-schedule state, including the admin/manager-only `REQUIRED_CALLS`
  starter list and the different copy for managers/admins vs. regular
  viewers.
- "Adding…" (disabled) create-button state; "Removing…" (disabled)
  delete-button state.
- No-calls-visible state when every returned call is filtered out by
  audience.
- Role-based manager-call visibility (`l1_manager`, `l2_manager`,
  `ibo_level_1`–`4`, platform roles; excludes `general_manager`,
  `office_manager`, `gm_in_training`).
- `canManage`-gated Add Call / Remove controls (admin + operations, not
  field managers).
- Server-side day/time/audience/Google-Meet-URL validation on create.
- Hard Firestore delete on remove.
- No edit UI/route (unchanged — do not imply editing works).
- All five real entry points into `/portal/calls`: `portalNavGroups` (desktop
  sidebar + `CommandPalette` "Calls Schedule" + `MobileBottomNav` More
  sheet), Dashboard queue card ("Open today's calls" / "Current schedule ·
  join links ready" / "CALLS"), and the Dashboard hero CTA ("Open today's
  calls"). None of these need retargeting (extraction B confirms no route
  change), but confirm they still resolve correctly post-reskin.

## Verify loop (mandatory)

1. Codex implements. Gates: `npx tsc --noEmit`, targeted eslint (files
   changed in this slice only), `npm run build`, `git diff --check`.
2. Signed-in Playwright session on `:3000`, dark mode
   (`localStorage['3c-theme']='dark'`). Before judging any screenshot,
   spot-check one changed element's computed style against the source
   (stale-dev-server guard — see `project-stale-dev-server-css` memory): if
   computed styles don't match source, kill the node child on `:3000`,
   delete `.next`, cold-start, and re-screenshot.
3. Screenshot the implementation at 1440px AND 390px covering: masthead +
   command band + hero numeral, next-call broadcast strip, management strip
   (as an admin/operations user), week strip with a day selected, selected-
   day card grid (including at least one metallic clock numeral per
   screenshot), empty state, and the Add Call modal open. Capture both rep
   view (no management strip, no Remove buttons) and manager/admin view.
4. Numeral integrity: confirm no glyph chopped on any edge for the hero
   numeral and every visible card clock numeral, at both 1440 and 390 (Hard
   Rule 1) — explicit check every round.
5. Computed font-weight check on every display heading (Hard Rule 2) —
   explicit check every round.
6. `scrollWidth` check at 390px confirming no horizontal scroll (campaign
   rule) — explicit check every round.
7. Fresh Opus reviewer diffs every screenshot against
   `design-mockups/calls-round2/hybrid-the-line-calls.html` (rendered) and
   this contract's sanctioned-deviations/OPEN CALL resolutions; every visual
   difference not on the sanctioned list is a defect.
8. Also verify no regressions: all five real entry points into
   `/portal/calls` still resolve; create/delete still write to Firestore and
   respect server-side validation; role-based visibility (manager-only
   calls, `canManage` gating) still matches the predicates in "Preserved
   behaviors" above; empty state still shows the right copy per role.
9. Codex fixes; repeat with a FRESH reviewer until PASS (zero unsanctioned
   diffs, zero clipped numerals, zero broken entry points/regressions).
   Commit locally only. Push only on the user's explicit "deploy".

## Orchestrator rulings (BINDING — resolve all OPEN CALLs)

- **OPEN CALL 1 → (a).** Drop the role-switch affordance entirely. No
  floating control, no static chip. The page renders per the signed-in
  user's real role; nothing else ships. (Chat's static chip existed because
  its toggle occupied masthead real estate; this one is a floating dev
  control with no layout hole left behind.)
- **OPEN CALL 2 → (a). Ship the past/on-air/DONE computation**, scoped
  exactly as recommended: client-side only, "has today's occurrence's start
  time already passed in America/Chicago," resets at midnight CT, no new
  API/fields. ON AIR window and DONE swap follow the mockup's visuals.
  Under prefers-reduced-motion any pulsing/ticking visual is frozen per the
  campaign exemption pattern (state still computed, just not animated).
- **OPEN CALL 3 → (a). Adopt the mockup's single-selected-day filtering.**
  Week strip tabs are clickable; default selection = today (America/
  Chicago); the "Air times" pane shows only the selected day, matching the
  mockup including the Today affordance and the footer "Click any day to
  filter" copy. All-days-at-once view is retired.
- **OPEN CALL 4 → (a). Two independent lists, both preserved.**
  `REQUIRED_CALLS` stays exactly as-is as the managers/admins empty-state
  starter checklist. The Add Call modal ships the mockup's 3 named quick-fill
  starters (Manager Sync / IBO Leadership / New Rep Onboarding) with the
  mockup's seeded values adapted to REAL form value enums (lowercase day/
  audience values, valid time format); the Meet-link field is left blank by
  starters (real validation requires a genuine https://meet.google.com/ link
  — starters must not seed a fake one). The draft-body sentence "do not
  invent a second, different starter set" is overridden by this ruling.
