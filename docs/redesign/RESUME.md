# RESUME — read this and continue without being asked

This file is auto-injected at session start. It is the live state of the
portal redesign campaign. Resume the "NEXT ACTION" immediately; do not ask
the user to re-explain or to point you at docs.

Updated: 2026-07-13 (update this file at EVERY milestone: pick made, page
started, implementation done, deploy — not just at session end).

## NEXT ACTION

RESOURCES PICK MADE 2026-07-13: option-3 The Line: Resources
(design-mockups/resources-round1/option-3-the-line-resources.html) —
hub + University toggle + Rep/Admin pay switch. Fix during verify:
mobile role pill overlapped header brand in all 3 → top:62px left:9px.
NOW: MEMBER PAGES round in flight (settings incl. report-a-bug,
onboarding checklist, signup). Step 1: Codex read-only inventory of
those pages → step 2: brief + 3 mockups in
design-mockups/member-round1/ → screenshot 1440+390 (mobile
viewport-only, scrollTo(0,0), check scrollWidth) → self-critique →
send ATTACH batches → pick → commit. Bake into brief: plain numbers
(no leading zeros), numeral top-aligned + paint-fix padding
(.25em .13em 0 0 / -.25em -.13em 0 0, lh .78, mobile padding-right:0),
mobile h1 clamp(36px,10.5vw,54px), view/role pills top:72px right
(desktop) / 62px (mobile) with role pill left at 62px on mobile,
no 'undefined', segmented picker pattern where choices exist.

## Older context

Calls HYBRID APPROVED by user 2026-07-13
(design-mockups/calls-round2/hybrid-the-line-calls.html). Fixes applied
during verify: weekday case-mismatch ("UNDEFINED" everywhere), card clock
numerals clipped ("10:0" → resized per breakpoint), hero "2" numeral
ink-chopped by background-clip box (padding/margin paint-area fix +
line-height .78, top-aligned with headline). Committed. NOW: FORMS mockup round in flight.
Inventory done (5 native forms: fiber-report, expedite-order,
payroll-dispute, leads-request, manager-interview; all share one pattern;
no forms landing page exists). USER APPROVED adding a Forms home page
(hub listing all 5) 2026-07-13. 3 mockups BUILT + verified + SENT 2026-07-13 in
design-mockups/forms-round1/ (option-1-form-desk, option-2-paper-trail,
option-3-the-line-forms), each = hub view + payroll-dispute fill view
with a fixed top-right view toggle. Fixes applied during verify: view
toggle moved below header (was overlapping header meta in all 3), opt-2
mobile headline overflow (13vw→11vw), 1px mobile overflow from numeral
paint-fix padding (mobile override padding-right:0). GOTCHA: PowerShell
Get-Content -Raw + Set-Content corrupts UTF-8 (mojibake) — fixed via
1252→UTF8 byte round-trip; use [IO.File] with explicit UTF8 for bulk
edits. Screenshots: forms-opt{1,2,3}-{hub,fill}-{1440,390}.png at repo
root. PICK MADE: option-3 The Line: Forms (committed 6317004) with changes:
(a) counts as plain numbers — NO LEADING ZEROS (new campaign-wide rule:
masthead numerals and stat counts show 5 not 05), (b) form fill must be
genuinely better-organized — numbered sections (who you are / what
happened / proof) + tidy segmented choice-picker pattern (this pattern
will later fix the messy carrier/plan buttons in the sale form; user
called current forms 'a jumble'). Round-2 BUILT + verified + SENT
(design-mockups/forms-round2/the-line-forms-final.html): plain 5s,
numbered fill sections (who you are / what happened / proof),
segmented campaign picker with dependent sub-row (the pattern that
will fix Log a Sale's carrier/plan jumble at Sales implementation).
Fix during verify: mobile h1 13vw→10.5vw (clipped after 05→5 made the
line longer). SIDEBAR + shell round: inventory DONE (sidebar w-60 navy, 4 collapsible
groups, header w/ search+bell+avatar, mobile = drawer + 4-slot bottom
bar w/ naming drift; pain: no desktop collapse, dup icons, bottom bar
misses most pages). Codex building 3 mockups in
design-mockups/shell-round1/ (option-1-the-rail = classic + icon-rail
collapse; option-2-command-deck = 64px icon rail + flyouts;
option-3-the-line-shell = numbered broadcast index, family favorite).
Each: shell around placeholder page, Rep/Manager/Admin role switch,
mobile 5-slot bottom bar + full-nav sheet. Nav notes baked in: Forms
group → single Forms link w/ badge 5 (hub approved); Pending Approvals
NOT in nav (moves into Sales). BUILT + verified + SENT 2026-07-13 (8 screenshots as attach batches;
inline render reportedly not opening for user — use display:attach).
Fixes during verify: opt2 flyout now starts closed (added 'closed'
class + mouseenter opens), opt3 .main-kicker CSS rule was missing
(jammed text). Mobile shots = viewport-only (fullPage paints fixed
bottom bar mid-content). WAITING user pick → commit shell-round1 →
next: RESOURCES (University+Links merge — propose with mockups, needs
user approval).

NOTE design rule added: the big metallic count numeral in mastheads is
top-aligned with the headline (applies to every future page mockup).

## Campaign state (mockups-first, implement later)

User direction: run ALL pages' mockup rounds first, one page at a time,
3 mockups each; implement + 1:1 verify + deploy later, per page, when the
user says so. The user is non-technical — plain language, business
decisions only, one question at a time.

Picks so far (all "The Line" family — dark Spotlight Arena):
- Dashboard: option-3 The Line — IMPLEMENTED locally (commit 05cb166,
  parity PASS), deploy PARKED. Not pushed.
- Sales: option-3 The Line: Sales — picked 2026-07-13, not implemented.
  Approvals page folds into Sales pending view (user-approved merge).
- Team Chat: option-3 The Line: Chat — picked 2026-07-13, not implemented.
  Includes mobile fix: visible ⋯ on own bubbles → action sheet (replaces
  buggy long-press).
- Calls Schedule: HYBRID picked+approved 2026-07-13 (calls-round2/
  hybrid-the-line-calls.html), not implemented.
- Forms: The Line: Forms APPROVED 2026-07-13 (forms-round2/
  the-line-forms-final.html — hub + sectioned fill + segmented picker),
  not implemented.
- Sidebar + shell: option-1 The Rail PICKED 2026-07-13 (shell-round1/
  option-1-the-rail.html; commit 0521283), not implemented.
- Resources: USER APPROVED hub merge 2026-07-13 (Links + Shorts + Pay
  Structure in one Resources hub; University stays its own page with a
  doorway card on the hub; /portal/shorts already just redirects to a
  University tab). Codex building 3 mockups in
  design-mockups/resources-round1/ (option-1-field-kit,
  option-2-the-stacks, option-3-the-line-resources), each = hub view +
  University view toggle + Rep/Admin switch for the Pay section.
  Remaining: screenshot 1440+390 (mobile shots viewport-only) →
  self-critique → send as ATTACH batches → pick → commit. Then: Member
  pages (settings, onboarding, signup).
- SCOPE RULING (user, 2026-07-13): EVERY portal page gets the redesign,
  including the sidebar/nav shell itself, form-options, chat-channels,
  user management, email-templates — everything. Full inventory in the
  campaign spec §Page order (10 rounds). Remaining after Forms:
  Sidebar+shell → Resources (University+Links merge candidate; +shorts,
  pay-structure) → Member pages (settings, onboarding, signup) →
  Ops/admin queues → Admin management. Leaderboard DONE/deployed — never
  touch.

## Key files

- Campaign plan + picks: docs/superpowers/specs/2026-07-12-portal-redesign-campaign-design.md
- Design constraints + locked client decisions: docs/redesign/ANCHOR.md (§9)
- Family design language sources: design-mockups/dashboard-round1/option-3-the-line.html,
  design-mockups/sales-round1/option-3-the-line-sales.html,
  design-mockups/chat-round1/option-3-the-line-chat.html,
  design-mockups/leaderboard-round5/spotlight-arena.html
- Dashboard goal contract (pattern to copy per page at implementation time):
  docs/redesign/dashboard-the-line-goal.md

## Standing rules (do not re-ask)

- Dark-first everywhere; light mode stays working as a toggle.
- Merges/structure changes: flag plainly + get user approval BEFORE mocking.
- Implementation gate per page: goal contract → Codex implements → fresh
  Opus 1:1 screenshot-verify until EXACT (not close enough) → gates
  (tsc/eslint/build/diff-check) → user says "deploy" → push (push = prod).
- Mockup process: Codex (gpt-5.6-luna) builds from a self-contained brief;
  screenshot 1440 + 390 (390 first-class); self-critique; send numbered
  options as files; user picks or mixes.
- Orchestration: main loop judges; Codex executes; Opus verifies; subagents
  never on Fable; keep main-loop context lean (delegate reads).
- Verification recipe: dev server usually already on :3000 (check before
  starting another); automation browser stays signed in as the user; dark
  via localStorage 3c-theme; API mocks via page.route with REAL field names
  (leaderboard: {leaderboard, currentUser, totalRanked}; stats: {stats:{...}}).
