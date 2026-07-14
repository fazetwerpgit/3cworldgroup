# Ops/Admin Queues "The Line" — Visual Parity Goal Contract (DRAFT)

User picked a MIX from ops-round1: **option-1** ("The Desk") supplies the Ops
home and Onboarding review views; **option-3** ("The Line Ops") supplies the
Review queue (demoed on Payroll Disputes) and Pipeline views. Same contract
style as `member-the-line-goal.md` / `forms-the-line-goal.md`:
implementation is verified 1:1 against the mockup by independent reviewers
until EXACT — not close enough.

This round is the campaign's largest blast radius so far: (1) a brand-new
Ops home landing page with no existing analog, (2) a full rewrite of the
shared `ReviewList.tsx` component into a new queue component, swapped into
**6** consumer pages atomically, (3) two fully custom real pages (Onboarding
review, Pipeline) rebuilt against mockup views whose real data models are
materially richer than the mockup's demo, (4) one page (Recruit
Onboarding / Recruiting Command Center) that has no mockup analog at all and
is explicitly out of scope for redesign this round.

## Source of truth

- Mockups: `design-mockups/ops-round1/option-1-the-desk.html` (Ops home,
  Onboarding review views) and `design-mockups/ops-round1/option-3-the-line-ops.html`
  (Review queue — demo data = Payroll Disputes — and Pipeline views).
- The mockup wins on any visual ambiguity not resolved by the sanctioned
  deviations below.
- Extraction reference (factual detail on both mockups and the current
  implementation): Codex read-only audit, summarized into Part A/B below.
  Full log: `ops-extract-report.txt` (session scratchpad), hazards cited as
  B-1 through B-14.

## Chrome reconciliation — DECIDED, binding

The two source files use different chrome: option-1 ("The Desk") has no
ticker, a plain hero, Trebuchet/Segoe headline font, and `1/2/3/4` kicker
numbering; option-3 ("The Line Ops") adds a persistent ticker bar, a
bordered/glowing hero box, Arial Narrow headline font, `01/02/03/04` kicker
numbering, and accented queue-card/stage-strip borders. Extraction flagged
this as unresolved (B-14) and asked the contract to pick one.

**Ruling: apply option-3's full `.line` treatment uniformly across all four
adopted views** (Ops home, Onboarding review, Review queue, Pipeline) —
ticker bar, bordered hero box with the "LIVE / OPS SIGNAL" corner tag, Arial
Narrow headline family, leading-zero kicker numbering (`01 /`, `02 /`, `03
/`, `04 /`), accented queue-card left border + "QUEUE / LIVE" kicker,
lime-topped stage-strip. Option-1's picked views (Ops home, Onboarding
review) are recomposed under option-3's token/chrome layer, not shipped in
their plainer option-1 styling. This is the governing chrome for the whole
ops area — when the shared queue component fans out to the remaining 5
`ReviewList`-consumer pages later this round, they inherit the same `.line`
treatment, not option-1's. Not an open call.

Brand text/title/footer use option-3's copy family ("THE LINE OPS", not
"THE DESK") since option-3's chrome is now governing — restyle to the real
brand mark (`public/logo.png`) per campaign rule regardless of source file.

## Composition — Ops home (NEW page, no existing route)

Mockup masthead (brand-mark square + ticker) is prototype chrome standing in
for the real shell — **it does not ship**. The page renders inside the real
`PortalHeader`/`PortalSidebar`; implementation starts at the hero.

1. **Hero**: kicker `01 / The Line / broadcast floor`, two-line headline
   `Hold` (lime) / `the line.`, intro sentence, top-aligned metallic hero
   numeral (real sum of all open items across all queues this user can see)
   with label `items waiting`. Bordered hero box + `LIVE / OPS SIGNAL`
   corner tag per the reconciliation ruling.
2. **Home strip** (3-cell hairline grid, 1.2fr/1fr/1fr): cell 1 (accent,
   lime-left-border) = `Needs you now` / real "N new today" / real oldest-
   wait age across all queues; cell 2 = real count of active queues this
   user can see (max 9); cell 3 = real count of "backed up" queues (see
   Real data mapping for the backed-up threshold).
3. **Section head**: kicker `Queue index / every lane`, h2 `What needs me`,
   right meta `Sorted by urgency`.
4. **Queue grid**: one queue-card per queue this user's role can access, in
   the mockup's fixed order (Onboarding review, Pipeline, Recruiting, Fiber
   reports, Expedite orders, Payroll disputes, Leads requests, Manager
   interviews, Bug reports) — real name, real live count, real one-line
   description (may reuse each page's existing intro copy or adapt per
   mockup voice), real oldest-wait age, real clear/backed-up status pill.
   Card links to the queue's real route.
5. **Quiet rail**: `Empty queues stay quiet — 0 new means clear, never an
   alarm.` (ships as static tone copy) / right side real "Last refresh"
   timestamp (not the mockup's static "just now").

Role gating: only queue-cards for queues the signed-in user can access
render (mirrors `PortalSidebar`'s existing per-item role gate) — an
operations-only user does not see a card for a queue gated to
`managerRoles`, and the hero/strip counts only sum accessible queues. See
**OPEN CALL 5** for the "Recruiting" card's link target and count source.

## Composition — Onboarding review (real page, `/portal/admin/onboarding`)

Same masthead-does-not-ship rule; page renders inside the real portal shell,
starting at the hero.

1. **Hero**: kicker `03 / The Line / people on deck`, headline `Clear`
   (lime) / `the people.`, intro sentence, hero numeral = real count of
   pending submissions, label `submissions waiting`.
2. **Filter row**: `Person` pill-row — real list of distinct submitters in
   the current queue (not the mockup's static Dana R./Marcus L. pair);
   `Category` pill-row — real `OnboardingCategory` enum values; `At-risk
   only` toggle — real `atRisk` boolean filter, same alarming red visual
   language as the mockup.
3. **Row list**: one row per real submission (`userId`+`itemId` pair) —
   avatar initials + real name (+ ` · AT RISK` suffix when `atRisk`), real
   item label as sub-text, real category + real "N days/hours waiting"
   (computed from real `submittedAt`), sensitive-lock indicator (real
   `sensitive` boolean → static Lock glyph, see Sanctioned deviations —
   **never** an interactive decrypt affordance), evidence chip(s) per the
   row's real `referenceKind` (see Real data mapping — this replaces the
   mockup's single generic file-chip + ref-chip with the 3 real render
   branches), status chip (waiting/approved).
4. **Expanded detail panel**: LEFT = reference-card rendering the correct
   one of the 3 real `referenceKind` branches (storage file-thumbnail grid
   w/ 15-min-signed-URL copy, e-sign badge + reference string, or plain
   manual/vendor reference text) in the mockup's Georgia-italic-quote
   visual container where the content is prose; RIGHT = detail-copy with
   real 2×2 fields (Person / Category / Waiting / Access), real notes
   textarea, Approve button (single click, real `POST
   /api/portal/onboarding/review` with `status:'approved'`), and Reject —
   see Sanctioned deviations (stays a modal, not the mockup's inline
   sendback field).
5. **Activation-ready rail**: real `<ActionQueue />` (`src/components/admin/ActionQueue.tsx`)
   restyled into the mockup's activation-rail visual — real multi-task
   list (not a single hardcoded person), real claim/activate flow with real
   409-conflict handling, restyled `I've got it` / `Activate` buttons.

## Composition — Review queue (NEW shared component, 6 consumer pages)

Demoed in the mockup against Payroll Disputes' shape; the new component
ships this pattern to all 6 real `ReviewList` consumers (Fiber reports,
Expedite orders, Payroll disputes, Leads requests, Manager interviews, Bug
reports), each rendering its own real fields — see **OPEN CALLs 3 and 6**.

1. **Hero**: kicker `02 / The Line / evidence relay`, headline `Call` (lime)
   / `the proof.`, intro sentence, hero numeral = real count of un-resolved
   items in this queue, label matches the queue's real terminology (e.g.
   "items need action").
2. **Toolbar**: search input (real per-queue searchable fields — see
   **OPEN CALL 6**), status segmented picker, `Export CSV` (reuse the real
   CSV download the current `ReviewList` already offers, restyled).
3. **Filter line**: real per-queue filter pills where a real filterable
   field exists (e.g. Payroll's real `campaign` enum — not the mockup's
   demo Fiber/Mobile/Internet/TV values) plus a real live filtered count.
4. **Row list**: person/subject cell, order/subject-detail cell, real
   secondary cell (campaign, area, etc. — whatever each queue's real second
   dimension is), evidence chip(s) matching the queue's real evidence shape
   (0/1/3 fields — see **OPEN CALL 3**), status chip, chevron. New rows
   louder (lime-washed), done/handled rows compressed — carried over
   exactly.
5. **Expanded detail panel**: LEFT = evidence preview appropriate to what
   the queue actually has (screenshot preview for Payroll, one of 3 upload
   slots for Leads, signature-image render for Manager Interviews, "no
   evidence" honest empty state for Fiber reports/Bug reports); RIGHT =
   real 2×2 fields for that queue, notes, and the 3 real actions (Start/
   Resolve/Send back) — see Sanctioned deviations for how these map to the
   real status model.

## Composition — Pipeline (real page, `/portal/admin/pipeline`)

Same masthead-does-not-ship rule.

1. **Hero**: kicker `04 / The Line / stage board`, headline `Move` (lime) /
   `the line.`, intro sentence, hero numeral = real count of reps needing
   action in the selected stage (mirrors today's page).
2. **Stage strip**: real 5-stage enum (`processing`, `need_logins`,
   `cleared_to_sell`, `active`, `decommissioned`) with real per-stage counts
   — see **OPEN CALL 4** on the always-one-selected vs clearable filter
   behavior.
3. **Toolbar**: search (real reps/managers), manager pill-row (real
   distinct manager list, not the mockup's static Dana R./Marcus L. pair).
4. **Rep board**: replaces today's `<table>` with the mockup's non-tabular
   stacked `.rep-row` board (fixes the real table-overflow problem the
   brief cites) — rep-title (avatar + name + real `IBO` badge + role
   subtext), Manager, Progress (real onboarding fraction + bar), Channels
   (real per-carrier chip row, click-to-cycle — see Sanctioned deviations),
   Approved sales (real number), rep-actions (Field Train, Decommission).
5. **Decommission inline panel**: real reason picker sourced from the real
   `DecommissionReason` enum (not the mockup's 4 hardcoded demo reasons —
   confirm exact values/labels in `src/types` before building; do not ship
   guessed labels) + required notes textarea, restyled into the mockup's
   inline panel per Sanctioned deviations.
6. **Reinstate**: appended action on decommissioned reps, real single-click
   `DELETE /api/portal/pipeline/decommission`.

## New shared component: OpsQueueList

Working name `OpsQueueList` (file suggestion:
`src/components/forms/OpsQueueList.tsx`, styles namespaced `ops-line-*` in
`globals.css`), built fresh to implement the Review queue mockup pattern:
evidence-in-row, search/filter/sort, expand-to-detail-panel, real status
states. **All 6 `ReviewList` consumers are swapped to it in this round,
atomically** (per orchestrator direction — no incremental per-page
rollout). `ReviewList.tsx` is deleted only once zero consumers remain
(confirm via a repo-wide grep before deletion). If any one consumer's real
data shape cannot map cleanly onto the new component's row/detail anatomy
(e.g. Leads Request's 3 upload slots + conditional fields), flag that
specific page for a follow-up decision rather than forcing a bad fit — do
not silently drop functionality to make the row anatomy work.

Props-driven, generic per queue (title, columns, evidence shape, filter
config, status model, action set) — not 6 copy-pasted components.

## Real data mapping (what each mockup number/string becomes)

- **Ops home hero numeral / "items waiting"**: real sum of open items across
  every queue this user can access — see **OPEN CALL 1** on how this is
  computed (client-side parallel fetch vs new aggregation endpoint).
- **Ops home "backed up" threshold**: no existing definition anywhere in the
  codebase (extraction B-1) — define as a queue whose oldest item exceeds a
  set age threshold (recommend 2 days, matching the majority of the
  mockup's own "backed up" demo rows, which range 2–3 days vs "clear" rows
  at 4–6 hours–1 day) — cosmetic threshold, not security-relevant; flag the
  exact number for orchestrator confirmation in review rather than treating
  it as an open call that blocks implementation.
- **Ops home per-queue oldest-wait age**: real min(now − createdAt) across
  each queue's open items.
- **Onboarding review filters (Person/Category)**: real distinct values
  from current open submissions, not the mockup's static 2-person/5-category
  demo lists.
- **Onboarding review evidence**: real 3-branch `referenceKind` model
  (`storage`/`esign`/`manual`-or-`vendor`) — never collapsed into the
  mockup's single generic file-chip pattern (extraction B-4).
- **Onboarding "sensitive" glyph**: real `submission.sensitive` boolean →
  static Lock icon only, exactly matching today's real behavior. No
  decrypt/reveal affordance anywhere in this queue (see Hard Rules).
- **Review queue per-page columns**: real per-form field inventory (see
  extraction Part B section 2) — Fiber reports/Bug reports have zero
  evidence fields, Payroll has one screenshot, Leads has three upload
  slots, Manager interviews has a signature data URL, not a screenshot.
  Never fabricate an evidence field a queue doesn't have.
- **Pipeline stage counts / channel states / decommission reasons**: real
  `PipelineRep[]` data and real `DecommissionReason` enum — never the
  mockup's 6 static demo reps or 4 static demo reasons.
- **All 9 queue counts on Ops home**: real live counts per queue, refreshed
  per real "last refresh" timestamp — never the mockup's hardcoded 4/2/3/
  5/2/3/1/1/2 figures.

## Sanctioned deviations (structural / cross-cutting)

- **SSN/DL decrypt is completely out of scope — hard rule, not a
  deviation to negotiate.** The mockup's sensitive-lock glyph (▣) stays
  purely visual in every queue it appears. The real audit-gated
  reveal/decrypt flow lives entirely in
  `src/app/portal/admin/users/[id]/page.tsx` +
  `src/app/api/portal/admin/sensitive/[uid]/route.ts` (verified-admin-only,
  every reveal audit-logged to `sensitiveAccessLog`) and is **not** touched,
  linked, duplicated, or shortcut from any queue redesigned this round.
- **Onboarding review's reject flow stays a modal** (restyled to the
  mockup's visual language), not the mockup's inline sendback text field.
  Real behavior: modal with required-reason textarea, row removed from the
  list on success. The mockup's lighter inline pattern is not adopted here
  because it would require the row-stays-visible/status-flips-in-place
  behavior the real API doesn't implement — restyle the modal, don't fake
  an inline flow.
- **Review queue's "Send back to rep" stays functionally equivalent to
  today's binary mark-handled model**, restyled with the mockup's visual
  language — see **OPEN CALL 2** for exactly how the 3-state New/In
  progress/Done visual maps onto the real 2-state new/handled data model
  without a Firestore schema change (ANCHOR.md forbids data-shape changes).
- **Pipeline's Channels and Decommission actions stay modals** (restyled to
  the mockup's visual language — dropdown/reason-picker content unchanged),
  not the mockup's inline click-to-cycle chip / inline expand panel. The
  inline pattern is a genuine UX simplification the mockup proposes but it
  removes 2 real modal flows' worth of interaction; keeping them as
  restyled modals preserves the real confirmation/dropdown-selection
  behavior exactly. (If the orchestrator later wants the inline
  simplification, that is a follow-up scope decision, not assumed here.)
- **Onboarding review keeps its real 3-way reference model** (storage/
  esign/manual-vendor) rendered inside the mockup's visual language — the
  mockup's single generic evidence pattern does not ship as-is.
- **Recruiting Command Center (`/portal/admin/recruiting`) is NOT
  redesigned this round.** No mockup view maps to its 3-section anatomy
  (invite-creation form / raw applications table / invite queue table).
  It only receives entry-point/link consistency (e.g., if the Ops home
  "Recruiting" queue-card links into it, that link and any shared token
  styling stay coherent) — no component rewrite, no chrome reskin of the
  page itself this round.
- **Uneven evidence shapes render honestly.** The new `OpsQueueList`
  component must render exactly what each queue really has — zero fields
  for Fiber/Bug reports, one for Payroll, three for Leads, a signature
  image for Manager Interviews — never a fabricated evidence chip to make
  rows look visually uniform across queues.
- **Loading/empty/error states preserved, restyled.** None of the 4
  mockup views show these (all-happy-path demo) — every real page's
  existing loading spinner, error banner, and true-empty state must be
  added into the new visual frame (extraction B-10).
- **Role gating unchanged per action, not just per page.** Approve/reject,
  decommission/reinstate, channels-edit remain gated exactly as today's
  `ProtectedRoute` roles prop per page — the mockup shows every action to
  everyone in its demo; the real implementation must not.
- Light theme must keep working via the portal `ThemeContext` (dark is the
  1:1-verified target per campaign rule; light needs to be coherent, not
  verified 1:1).
- lucide-react icons replace the mockup's inline glyphs/SVGs (Lock for
  sensitive, checkmark/circle for status, etc.).
- Animations/transitions skipped under `prefers-reduced-motion` (respect
  the exemption pattern in `globals.css` `@layer base` — see
  `project-reduced-motion-gotcha` memory).
- No Firestore/data-shape changes, no new collections, no role-logic
  changes (ANCHOR.md §5) beyond what **OPEN CALL 1** and **OPEN CALL 2**
  explicitly resolve — this is a visual reskin + one new landing page + one
  shared-component rewrite, not a backend architecture change.
- Notification deep-links (`ActionQueue` task `link` field) must keep
  resolving to the correct item after any URL/anchor restructuring in
  Onboarding review (extraction B-12).

## Nav / entry points

- **New sidebar entry**: `Ops home` → `/portal/admin`, added to the
  Operations group in `PortalSidebar.tsx`, gated `platformRoles`,
  positioned first in the group (front door for the other 8 items).
- **Existing 8 queue links** (Onboarding Review, Fiber Reports, Expedite
  Orders, Payroll Disputes, Manager Interviews, Leads Requests, Recruiting
  Pipeline, Bug Reports) keep their current routes and current role gates —
  no route renames.
- **Recruit Onboarding** keeps its current route/gate (`managerRoles`) and
  is out of scope for redesign (see Sanctioned deviations) but stays
  reachable from the sidebar as today.
- **University Content** and **Email Templates** are not queues — excluded
  from this round entirely, unchanged.
- **CommandPalette**: add an entry for the new Ops home page; existing 9
  queue entries stay as today (extraction confirms most don't currently
  have dedicated palette entries beyond the admin/users badge — adding Ops
  home is additive, not a fix to that pre-existing gap unless trivial).

## Desktop / mobile reflow (exact mockup breakpoints, both source files identical)

Breakpoints are **760px, 900px (partial), and 460px** — confirmed identical
between option-1 and option-3's shared base CSS.

### `max-width: 900px`
Review-row and rep-grid drop their 4th column (secondary cell / progress
cell respectively) to keep 4 visible columns.

### `max-width: 760px`
View-switch (not shipped) would reposition — not applicable, no floating
dev control ships. Hero becomes block, hero-count moves below and
left-aligns. Home-strip becomes 1 column. Queue-grid becomes 2 columns.
Row-main (review/onboarding) collapses to `minmax(0,1fr) auto` — only the
first cell (person) and status-chip/chevron survive; secondary cells hide
until the row expands. Detail panels drop to 1 column. Stage-strip becomes
3 columns with a top hairline on row 2. Rep-grid collapses to 2 columns
(name + auto); Manager/Progress cells hide, Channels cell moves to a
full-width row below, rep-actions becomes full width. Decom-panel drops to
1 column.

### `max-width: 460px`
Metallic numeral (`.display`) padding-right/margin-right reset to zero
(anti-clip pattern, same as every other campaign page). Queue-grid becomes
1 column. Hero-count `.display` font-size 88px. Detail-fields grid becomes
1 column. Stage-strip buttons shrink padding/font.

No horizontal scroll anywhere at any width (campaign rule).

## Design tokens (exact, from mockup, option-3's `.line` values govern per the reconciliation ruling)

```css
--bg: #02060e;        /* .line override of the base --bg:#030916 */
--panel: #081a35;
--panel-2: #0d2447;
--panel-3: #102c55;
--ink: #f5f8fb;
--muted: #94a6bb;
--soft: #6d8097;
--line: rgba(217,229,240,.15);
--line-strong: rgba(163,230,53,.65);
--lime: #a3e635;
--lime-soft: rgba(163,230,53,.11);
--red: #ff7b7b;
--amber: #f7c96b;
--blue: #86b9ff;
--metal: linear-gradient(180deg,#ffffff 0%,#d9e1e8 34%,#7f8d9c 78%,#f4f7fa 100%);
```

Body background under `.line`: `radial-gradient(circle at 50% -5%,
rgba(163,230,53,.16), transparent 25%), radial-gradient(circle at 100% 55%,
rgba(52,106,171,.18), transparent 30%), #02060e` (governing per
reconciliation ruling, not option-1's plainer version).

Base font: `"Trebuchet MS","Segoe UI",sans-serif` for body; `.line`
overrides **h1 only** (not weight) to `"Arial Narrow","Bahnschrift
Condensed","Trebuchet MS",sans-serif`. Kicker/meta text:
`font:900 9px ui-monospace,Consolas,monospace; letter-spacing:.14em;
text-transform:uppercase`. New ops-specific rules should be namespaced
`ops-line-*` in `globals.css` alongside existing `.portal-*` conventions —
all other `globals.css` sections stay frozen (campaign hard rule).

Georgia appears exactly once, in both source files identically: the
onboarding reference-card's italic quote
(`.reference-card .quote{font:italic 14px/1.35 Georgia,serif}`) — this is
prose, not a numeral, and does not violate the Georgia-numeral ban. Do not
extend Georgia to any other element.

## Numeral clipping fix (carry over exactly)

Both the hero numeral (`.display`) and the queue-card count (`.queue-count`)
use the shared paint-area fix: `padding: .25em .13em 0 0` + `margin: -.25em
-.13em 0 0` — use the existing `.portal-metallic-num` class in
`globals.css` for both. `.line`'s hero-numeral override changes font-family
and size only, not the clip-fix mechanics — verify empirically at 1440 and
390 regardless. At ≤460px the mockup drops right padding/margin to zero —
replay exactly.

## OPEN CALL 1 — Ops home data aggregation strategy

Ops home is a brand-new page needing live counts, oldest-wait age, and a
clear/backed-up status across 9 different data sources (6 `ReviewList`
form endpoints, 1 onboarding endpoint, 1 pipeline endpoint, 1 recruiting
endpoint) — none of which currently expose "oldest waiting age" or a
backed-up boolean (extraction B-1). Options:

- **(a)** Client-side: fetch all 9 endpoints in parallel on page load,
  compute oldest-age/backed-up/counts in the browser. Zero new API surface,
  but duplicates threshold logic across the client, is slower on first
  paint, and re-derives the same computation on every visit.
- **(b)** Add one new, additive, read-only aggregation endpoint (e.g. `GET
  /api/portal/admin/ops-home`) that queries the same 9 underlying
  collections server-side and returns the pre-computed summary. Does not
  modify any existing route's contract or behavior — purely additive — but
  is new backend surface, which ANCHOR.md's "visual reskin only" framing
  doesn't explicitly authorize.

Recommendation: **(b)** — the computation (oldest-age, backed-up threshold)
is genuinely new business logic that belongs in one server-side place, not
duplicated across a client bundle; "additive, read-only, doesn't touch any
existing route" is a materially smaller ask than the kind of change
ANCHOR.md §5 forbids ("changing routes, route data, API contracts").
Needs explicit orchestrator sign-off since it's the one part of this round
that isn't purely visual.

## OPEN CALL 2 — Review queue 3-state visual vs 2-state real data model

The mockup's Review queue toolbar has a 4-state segmented picker (All/New/
In progress/Done); the real `ReviewList`/API status model today is a flat
2-state `new`/`handled` (extraction B-2). Introducing a persisted "in
progress" value is a Firestore schema change across all 6 form
collections, which ANCHOR.md forbids without separate approval. Options:

- **(a)** Ship the 3-way visual exactly, but "In progress" is a
  **client-side-only, non-persisted** state (e.g. a local "Start" click
  optimistically labels the row "In progress" for the current session/until
  refresh) that still round-trips as `new` server-side until Resolve is
  clicked (which writes `handled`). No schema change; the visual promise
  ("in progress") does not fully survive a refresh, which needs an honest
  micro-copy treatment (e.g. a subtitle noting it's a working label) if the
  reviewer/orchestrator wants that gap called out to reps.
- **(b)** Do the schema migration (new `status:'in_progress'` value, one
  migration touching 6 collections) — matches the mockup's model exactly
  and persists across refresh, but requires explicit approval as a
  data-shape change under ANCHOR.md §1/§5, outside this contract's
  authority to grant unilaterally.

Recommendation: **(a)** — stays inside the "visual reskin, not backend
change" boundary this campaign has held everywhere else; a true persisted
3-state model is a legitimate product improvement but belongs in its own
explicitly-approved slice, not smuggled into a redesign round. Needs
orchestrator sign-off.

## OPEN CALL 3 — Evidence widget shape per queue (0/1/3 evidence fields)

The mockup demos exactly one evidence shape (single chip + preview) against
Payroll Disputes. The other 5 real queues have 0 (Fiber, Bug reports), 1
(Payroll — already covered), 3 (Leads: hostile/blind-knock/lasso uploads),
or a signature image (Manager Interviews) instead of a chip. Options:

- **(a)** Zero-evidence queues render the row/detail panel with the
  evidence slot fully omitted (no empty placeholder chip) — honest, no
  fabricated affordance. Multi-evidence queues (Leads) render up to 3 chips
  stacked/wrapped in the same slot the mockup shows one chip in. Signature
  queues (Manager Interviews) render the signature image in the same
  slot the mockup's screenshot preview uses.
- **(b)** Zero-evidence queues render a muted "No evidence attached"
  placeholder chip for visual row-height consistency across all 6 queues.

Recommendation: **(a)** — matches the "uneven evidence shapes render
honestly" sanctioned deviation already locked above; a placeholder chip
implying evidence exists where it never can would read as a bug once
someone clicks it. Needs orchestrator sign-off only on the visual
consistency trade-off (row heights will differ slightly queue to queue).

## OPEN CALL 4 — Pipeline stage-strip filter behavior

The mockup's stage strip always has exactly one stage selected (no "clear
filter" state). Today's real pipeline page's stage cards already support
click-to-filter AND click-again-to-clear (extraction, section 4). Options:

- **(a)** Match the mockup exactly — always-one-selected, no clear state.
- **(b)** Keep today's real clearable behavior (click the active stage
  again to see all reps across all stages) restyled into the mockup's
  visual — a small functional upgrade over the literal mockup.

Recommendation: **(b)** — the real behavior already exists and is strictly
more useful (seeing all reps at once is a real workflow need); dropping it
to match the mockup literally would be a regression for zero visual cost
(the strip still always shows one stage "pressed" whenever a filter is
active, and shows none pressed when cleared, which reads as a natural
extension of the mockup's own segmented-picker convention used elsewhere).
Needs orchestrator sign-off since it's a literal-fidelity vs. functionality
trade-off.

## OPEN CALL 5 — Ops home "Recruiting" card target

The mockup's Ops home queue grid includes a "Recruiting" card (3 items,
"New applicants waiting for a clean next move") separate from "Pipeline."
The real codebase has two candidate destinations: `Recruiting Pipeline`
(`/portal/admin/pipeline` — already mapped to the mockup's Pipeline view)
and `Recruit Onboarding` / Recruiting Command Center
(`/portal/admin/recruiting` — out of scope for redesign this round, has an
invite-queue table that's the closest real analog to "new applicants").
Options:

- **(a)** "Recruiting" card links to `/portal/admin/recruiting`, count
  sourced from that page's real invite-queue "submitted" status count —
  keeps Pipeline and Recruiting as two distinct home cards matching the
  mockup's 9-card list, but links into a page this round doesn't redesign.
- **(b)** Drop the "Recruiting" card from Ops home entirely this round
  (8 cards instead of 9) since its real destination isn't redesigned and
  linking a shiny new home page into an unredesigned page reads
  inconsistent — re-add once Recruit Onboarding gets its own round.

Recommendation: **(a)** — the mockup explicitly lists 9 cards and Ops
home's whole purpose is being the front door to every queue; linking into
an unredesigned destination page is normal (Onboarding review's activation
rail already links into `ActionQueue` targets that aren't part of this
visual pass either) — the card's own visual is what's being redesigned,
not necessarily its destination. Needs orchestrator sign-off on the count
source specifically (submitted-status invites vs. some other real number).

## OPEN CALL 6 — Search/filter field scope per Review-queue consumer

The mockup only specs search/filter fields for Payroll Disputes (search:
person/contractor/order; filter: campaign). The other 5 queues have
different real field sets with no mockup-specified search/filter scope.
Options:

- **(a)** Minimum consistent baseline: search always covers the primary
  person/rep-name field; a filter pill-row ships only where a queue has a
  real closed-enum field analogous to Payroll's campaign (e.g. Leads'
  `campaign`, Manager Interviews' `provider`) — omit the filter row
  entirely for queues without one (Fiber reports, Bug reports, Expedite
  Orders have no obvious closed-enum second dimension).
- **(b)** Every queue gets a filter row regardless, picking whatever field
  is closest even if it's a weaker fit, to keep all 6 toolbars visually
  identical.

Recommendation: **(a)** — consistent with this contract's "recompose,
don't fabricate" pattern used throughout (matches Forms' OPEN CALL 2
resolution: let structure follow real data, not force uniformity). Needs
orchestrator sign-off since it means the 6 queue toolbars won't be
pixel-identical to each other (some have a filter row, some don't).

## HARD RULES (campaign-wide, binding)

1. **Big numerals never clipped.** Hero numeral and queue-card count both
   use `.portal-metallic-num`. Verify at 1440 AND 390, no glyph chopped on
   any edge.
2. **Tailwind preflight resets h1–h6 to font-weight 400.** Every display
   heading (all 4 views' H1 pairs, `section-head h2`, `activation-head h3`,
   `detail-copy h3`, `proof-preview h4`) MUST declare `font-weight`
   explicitly (recommend 900, matching the kicker/label weight already used
   throughout) — verify computed weight in-browser, don't assume the source
   CSS survives the port unchanged.
3. **Georgia is never used for a numeral.** Its one legitimate use
   (onboarding reference-card italic quote) is prose and must not be
   extended to any count/numeral anywhere in the ops area.
4. **Counts render as plain numbers.** Hero counts, queue-card counts,
   stage counts, strip cell counts — no leading zeros — EXCEPT the kicker/
   section numbering (`01 /`, `02 /`, etc.), which keeps its literal
   zero-padded mockup format as design chrome, not a data-driven count.
5. **SSN/DL decrypt stays completely out of this round.** No queue may
   surface a decrypt/reveal affordance, link to one, or shortcut the
   existing verified-admin-only + audit-logged flow on
   `admin/users/[id]`. The sensitive-lock glyph is purely visual everywhere
   it appears.
6. **Big metallic hero numeral is top-aligned with the headline** on all
   four views — verify visually.
7. **Dark theme via `localStorage['3c-theme']`** is the 1:1-verified
   target; light mode must stay coherent and working.
8. **Reduced-motion**: any reveal/hover/focus transition must use the
   campaign's exemption pattern in `globals.css` `@layer base` (see
   `project-reduced-motion-gotcha` memory).
9. **No horizontal scroll anywhere at any width** — confirm via
   `scrollWidth` check at 375px on every one of the 9 pages plus Ops home.
10. **Leaderboard is deployed — never touch it.** No edits to
    `src/components/leaderboard/**` or `/portal/leaderboard`.
11. **File scope.** Touch only:
    - `src/app/portal/admin/page.tsx` (new Ops home page)
    - `src/app/portal/admin/onboarding/page.tsx`
    - `src/app/portal/admin/pipeline/page.tsx`
    - `src/app/portal/admin/fiber-reports/page.tsx`
    - `src/app/portal/admin/expedite-orders/page.tsx`
    - `src/app/portal/admin/payroll-disputes/page.tsx`
    - `src/app/portal/admin/manager-interviews/page.tsx`
    - `src/app/portal/admin/leads-requests/page.tsx`
    - `src/app/portal/admin/bug-reports/page.tsx`
    - `src/components/forms/OpsQueueList.tsx` (new, replaces
      `src/components/forms/ReviewList.tsx` — delete `ReviewList.tsx` only
      once zero consumers remain)
    - `src/components/admin/ActionQueue.tsx` — restyled at callsite only,
      reuse its existing data/claim/activate logic as-is
    - `src/components/portal/PortalSidebar.tsx` — ONLY to add the new "Ops
      home" nav entry, nothing else in that file
    - `src/components/portal/CommandPalette.tsx` — ONLY to add an Ops home
      entry, nothing else in that file
    - `ops-line-*` styles added to `globals.css` (namespaced, alongside
      existing `.portal-*` conventions — all other sections frozen)
    - If **OPEN CALL 1** resolves to (b): one new additive route, e.g.
      `src/app/api/portal/admin/ops-home/route.ts` — read-only, no writes,
      no change to any existing route.
    - **Zero edits outside this list.** No edits to
      `src/app/api/portal/onboarding/**`, `src/app/api/portal/pipeline/**`,
      `src/app/api/portal/forms/**` (except the additive route above if
      OPEN CALL 1→(b)), `src/app/portal/admin/recruiting/page.tsx`,
      `src/app/portal/admin/users/**`, `src/app/portal/admin/email-templates/**`,
      `src/app/portal/admin/university/**`, or any shared primitive
      (`PortalHeader.tsx`, `PortalPageHeader.tsx`, `ProtectedRoute.tsx`,
      `Card`/`CardContent`, `Button`, `NativeSelect`, `Textarea`,
      `FileUpload.tsx`, `SignaturePad.tsx`) unless a sanctioned deviation
      above explicitly requires it. Shared primitives get restyled at the
      callsite only.

## Preserved behaviors (from extraction Part B — must keep working)

- Onboarding review: `GET /api/portal/onboarding/review`, `POST
  /api/portal/onboarding/review` (approve single-click, reject via modal
  with required reason, row removed from list on success), the 3 real
  `referenceKind` render branches, `ActionQueue`'s claim/activate flow with
  real 409-conflict handling.
- Pipeline: `GET /api/portal/pipeline`, `POST
  /api/portal/pipeline/field-train`, Channels modal (`GET`/`POST
  /api/portal/pipeline/channels`, `NativeSelect` per-channel status),
  Decommission modal (`POST /api/portal/pipeline/decommission`, real
  `DecommissionReason` enum), Reinstate (`DELETE
  /api/portal/pipeline/decommission`).
- All 6 `ReviewList` consumers: their existing per-form REST endpoints
  (`GET`/`POST /api/portal/forms/{slug}/review`), existing CSV download,
  existing real field sets exactly as documented in extraction Part B
  section 2 — no field renamed, dropped, or added.
- Role gating exactly as today per page (`platformRoles` for 8 pages,
  `managerRoles` for Recruit Onboarding — unchanged and out of scope).
- Notification deep-links from `ActionQueue` tasks continue resolving to
  the correct item.
- SSN/DL encrypted-at-rest reveal flow on `admin/users/[id]` — entirely
  untouched, no overlap with this round (ANCHOR.md §9 lock).
- Existing test/route expectations for onboarding review, pipeline
  actions, and all 6 form-review endpoints keep passing unmodified.

## Verify loop (mandatory)

1. Codex implements. Gates: `npx tsc --noEmit`, targeted eslint (files
   changed in this slice only), `npm run build`, `git diff --check`.
2. Signed-in Playwright session on `:3000` (admin/operations role), dark
   mode (`localStorage['3c-theme']='dark'`). Before judging any screenshot,
   spot-check one changed element's computed style against the source
   (stale-dev-server guard — see `project-stale-dev-server-css` memory): if
   computed styles don't match source, kill the node child on `:3000`,
   delete `.next`, cold-start, and re-screenshot.
3. Screenshot the implementation at 1440px AND 390px covering: Ops home
   (hero + strip + full queue grid), Onboarding review (row list + expanded
   detail panel for each of the 3 real reference kinds if test data allows,
   activation rail), at least 2 representative Review-queue consumers
   (Payroll Disputes — has evidence + campaign filter; Leads Request — has
   the deepest 3-slot evidence surface) in both collapsed and expanded row
   states, and Pipeline (stage strip, rep board, Channels modal open,
   Decommission panel open).
4. Numeral integrity: confirm no glyph chopped on any edge for the hero
   numeral and every queue-card count, at both 1440 and 390 — explicit
   check every round.
5. Computed font-weight check on every display heading — explicit check
   every round.
6. `scrollWidth` check at 375px confirming no horizontal scroll on all 9
   pages plus Ops home — explicit check every round.
7. Fresh Opus reviewer diffs every screenshot against both
   `design-mockups/ops-round1/option-1-the-desk.html` and
   `option-3-the-line-ops.html` (rendered, per view) and this contract's
   sanctioned-deviations/OPEN CALL resolutions; every visual difference not
   on the sanctioned list is a defect.
8. Behavior verification: confirm SSN/DL decrypt is unreachable from every
   queue; confirm reject stays a modal on Onboarding review; confirm
   Channels/Decommission stay modals on Pipeline; confirm role gating per
   action matches today; confirm evidence renders honestly per queue (no
   fabricated chips); confirm all 6 `ReviewList` consumers now render via
   `OpsQueueList` with zero regressions in their real field sets.
9. Regression verification: onboarding approve/reject still writes
   correctly and removes rows on success; pipeline field-train/channels/
   decommission/reinstate still call the correct real endpoints; all 6
   form-review endpoints still return/accept the same payload shapes;
   in-portal/Postmark notification review-links still resolve; admin CSV
   exports still work per queue.
10. Codex fixes; repeat with a FRESH reviewer until PASS (zero unsanctioned
    diffs, zero clipped numerals, zero broken entry points/regressions).
    Commit locally only. Push only on the user's explicit "deploy".

## Orchestrator rulings (BINDING — 2026-07-14, resolve all OPEN CALLs)

1. **Ops home aggregation → (a) client-side.** Parallel-fetch the real
   queue endpoints from the new home page and compute "oldest wait age" /
   "backed up" as client-side DERIVED display logic. No new API routes —
   campaign precedent (calls countdown/on-air) is derived-only client
   logic; this is an admin-only page where the extra requests are
   acceptable. Batch/parallelize the fetches, tolerate individual
   failures (a queue card may show its own error state without killing
   the page).
2. **Status states → MODIFIED ruling: two real states only.** Do NOT ship
   a client-side-only non-persisted "In progress" — an ephemeral state
   that vanishes on reload lies to ops staff (violates the campaign's
   honest-data principle). Render the mockup's status-pill chrome with
   the two REAL states (New / Handled, mockup styling). The 3-pill
   layout simply has one fewer pill. This is a sanctioned deviation from
   the mockup — document it in the deviation list.
3. **Evidence widgets → render exactly what's real.** Zero-evidence
   queues get NO evidence slot (no placeholder chips); the signature
   queue renders its real signature image in the mockup's frame style.
4. **Pipeline stage strip → keep the real clearable behavior**
   (click-again-to-clear). Mockup's always-selected is prototype
   behavior.
5. **Ops home "Recruiting" card → links to Recruit Onboarding's invite
   queue** with the real submitted-status invite count. That page itself
   is NOT redesigned this round; only the card + link + count.
6. **Toolbars → per-queue real fields.** Each queue's search/filter
   toolbar reflects its own real field inventory; queues with nothing
   meaningful to filter get no filter row. Never invent filter fields.

