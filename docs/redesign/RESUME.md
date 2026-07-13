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
NOW: MEMBER PAGES round in flight. Inventory DONE (settings = long
card stack, editable/read-only mixed, bug report buried; onboarding =
8-item checklist entry_level_rep only, dup progress, horizontal step
scroll, e-sign items look dead; signup = split AuthShell, no confirm
password/strength/after-submit clarity). Brief written:
design-mockups/member-round1/BRIEF.md (all hard rules baked in:
paint-fix numeral, plain numbers, mobile h1 clamp, pill positions,
segmented pickers; 3 views per file Settings/Onboarding/Signup).
3 mockups BUILT + verified + SENT 2026-07-13 in
design-mockups/member-round1/ (option-1-the-locker,
option-2-the-ledger, option-3-the-line-member; each = 3 views
Settings/Onboarding/Signup via pill nav). Fix during verify: generic
`.show{position:absolute...}` CSS rule (password show/hide) also
captured `.choice-note.show` in opts 2+3 → appearance note rendered
jammed at card top-right; scoped rule to `.password .show`. Mobile
scrollWidth 375 on all, no mojibake/undefined. Screenshots
mem-opt{1,2,3}-{settings,onboarding,signup}-1440.png +
mem-opt{1,2,3}-{,onboarding-}390.png at repo root; sent as 3 attach
batches of 5. Attach files ALSO failed to open for user → published all 15
shots as one Artifact gallery page (works):
https://claude.ai/code/artifact/f006f3da-2b2a-4738-8675-0b698335bbb7
(built via scratchpad build-gallery.ps1 — System.Drawing resize→JPEG
q72→base64 data URIs; ~1MB page). USER then said he can open sent
HTML files "almost all the time" → STANDING PRACTICE (in memory too):
send the mockup .html files themselves via SendUserFile attach;
screenshots are for my verification only; Artifact gallery = backup.
The 3 member .html files were re-sent as files 2026-07-13.
MEMBER PICK MADE 2026-07-13: option-3 The Line: Member
(member-round1/option-3-the-line-member.html). NEW CAMPAIGN RULE from
user: use the real 3C logo wherever it applies at implementation time
(mockups' "3C" square is placeholder only).
NOW: OPS/ADMIN QUEUES round in flight. Inventory DONE (9 admin pages,
4+ different layouts: pipeline+recruiting bespoke workbenches,
onboarding = cards + embedded ActionQueue, 5 form queues + bug-reports
share ReviewList with only new→handled; nobody has search/filters/
sort; evidence detached from rows). Brief written:
design-mockups/ops-round1/BRIEF.md — 4 views per mockup (Ops home
queue index NEW / Review queue shared pattern demo=payroll disputes /
Onboarding review / Pipeline board), establishes ONE queue design all
9 pages adopt; recruiting reuses patterns at implementation. All hard
rules baked in incl. new rule 7 (never style bare utility classes like
.show — scope to component). 3 mockups BUILT + verified + .HTML FILES SENT 2026-07-13
(option-1-the-desk, option-2-the-docket, option-3-the-line-ops; 4
views each via .view-switch [data-view] buttons). Fixes during
verify: (a) all 3 shared jammed pipeline labels ("MANAGERDana R.") →
appended `.rep-cell .meta{display:block;margin-bottom:4px}`; (b) opt2
hero numeral clipped by boxed masthead → grid column 180px→auto +
font clamp 150→124px; (c) opt2 Georgia italic "2" ball-terminal made
23 read as "2.3" → font swapped to Cambria upright, letter-spacing
-.02em (NOTE: Georgia numerals are old-style — avoid for big counts).
Screenshots ops-opt{1,2,3}-{home,review,onboarding,pipeline}-1440.png
+ mobile at repo root (my verify only). OPS PICK MADE 2026-07-13 — a
MIX: Ops home from option-1-the-desk + Review queue from
option-3-the-line-ops + Onboarding review from option-1-the-desk +
Pipeline from option-3-the-line-ops. (No hybrid file built yet — build
one only if needed at implementation; the four source views are the
contract.) Committed.
NEXT ACTION: ADMIN MANAGEMENT round IN FLIGHT (final mockup round).
Inventory DONE 2026-07-13 (Codex read-only): 8 pages, 7 different
layout patterns; NO text search anywhere; 4 delete-confirm styles
(email-templates delete = NO confirm); save models inconsistent
(global fake save on settings — handleSave only sleeps 1s, notif
toggles + Reset buttons have NO handlers); user detail asks for raw
Manager ID instead of a named picker; ops role route-allowed on users
pages but link hidden. Brief WRITTEN:
design-mockups/admin-round1/BRIEF.md — 4 views per mockup (People =
users list / Person = detail+new / Catalog = shared list-of-things
pattern demo=email-templates with adoption strip for chat-channels+
form-options+university / Settings = honest per-section save + typed
RESET danger room). Hard rules copied from ops brief + new rule 9 (no
Georgia for big numerals). 3 mockups BUILT + verified + .HTML FILES
SENT 2026-07-13 (option-1-the-roster, option-2-the-registry,
option-3-the-line-admin; 4 views each via [data-view] pill nav). Verify
clean on all 3: scrollWidth 375 at 390, no undefined/NaN/mojibake, pill
below brand, delete-confirm strips + typed-RESET + named manager picker
+ adoption strip all present. Minor cosmetic notes (not blockers): opt2
catalog grid has one empty cell (3 template cards in 2×2); settings
points min/default/max inputs wrap 2+1 in all options. Screenshots
adm-opt{1,2,3}-{people,person,catalog,settings}-1440.png +
adm-opt{1,2,3}-390.png at repo root (my verify only).
ADMIN PICK MADE 2026-07-13: option-1 The Roster ALL FOUR VIEWS
(admin-round1/option-1-the-roster.html) — user liked it "all the way
through", no mix. Committed 106501b. ALL MOCKUP ROUNDS NOW DONE.
IMPLEMENTATION PHASE STARTED 2026-07-13: user confirmed SHELL (The
Rail, shell-round1/option-1-the-rail.html) implements FIRST.
Extraction DONE. GOAL CONTRACT WRITTEN:
docs/redesign/shell-the-rail-goal.md — key calls baked in: swap
internals of PortalHeader/PortalSidebar/MobileBottomNav ONLY (zero
page edits, ~19 direct mounts stay); one nav config feeds sidebar +
sheet + CommandPalette; left drawer DELETED → 5-slot bottom bar
(Dashboard/Sales/Chat/Leaderboard/More) + 83vh sheet; TRANSITIONAL:
forms stay 5 links until Forms hub ships, Pending Approvals link
stays until Sales pending view ships, bottom slot 4 = Leaderboard
until Forms hub; real /logo.png; no fake badges; rail collapse
persisted 3c-rail-collapsed; body data-hooks + chat-thread hiding
must keep working. Round 1: Codex implemented (5 files:
PortalHeader/PortalSidebar/MobileBottomNav/CommandPalette/globals.css,
all gates PASS, zero page edits, nav config = portalNavGroups exported
from PortalSidebar). Opus reviewer round 1 found 6 defects + 2
borderline: (1) bottom bar dumped whole first nav group + More
offscreen — must be exactly Dash/Sales/Chat/Board/More; (2) chunky OS
scrollbar on rail (worst collapsed); (3) footer overlaps scrolled nav;
(4) collapsed icons off-center; (5) brand title must be '3C World
Group / Employee Portal'; (6) bell must be unboxed icon; (7) search
placement vs mockup; (8) active lime rail 6px top/bottom inset.
Sheet = fully compliant. Codex fixed all 8 (gates PASS); I removed
leftover demo subtitle "Spotlight Arena · shell preview" from header.
Round-2 Opus review = FALSE FAIL: 2-day-old dev server served stale
globals.css (fixes were in file but not rendered; hard reload no help
— had to kill node + fresh npm run dev; gotcha saved to memory
project-stale-dev-server-css). After restart all fixes verified live
via computed styles. I also fixed mobile brand truncation ("3C WORLD
GROUP / E…" → wraps 2 lines, white-space:normal in the 430px media
block). Round-3: 7/8 PASS, one left (footer translucent + didn't
cover rail bottom) → fixed (full-bleed left/right/bottom:0, solid
rgb(3,9,22), hairline inset 13px via ::before). Round-4 Opus verdict:
PASS, zero defects, no regressions. Final gates ALL PASS after my CSS
edits. SHELL COMMITTED 7438d7e (local only, NOT pushed).
Shell deploy: user chose LOCAL ONLY for now ("locally ship so i can
check it out") 2026-07-13 — checking at localhost:3000; prod push
still needs explicit "deploy".
USER-REPORTED BUG FIXED + COMMITTED 0499338 2026-07-13: dashboard
masthead "0" was clipped (background-clip:text paint box). Fix = new
REUSABLE class `.portal-metallic-num` in globals.css (padding .25em
.13em 0 0 + negative margins; ≤460px drops right padding) applied to
the dashboard hero numeral. Verified whole at 1440 + 390 via
screenshots + computed styles. NEW CAMPAIGN HARD RULE (user explicit:
"we need to make sure the big numbers arent getting cut off like they
have been"): EVERY big gradient numeral on every implemented page MUST
use .portal-metallic-num, and every verify round MUST screenshot each
big numeral at 1440 AND 390 and confirm no glyph chop — bake this into
every goal contract from Sales onward. ALSO: dev-server staleness
playbook extended (memory project-stale-dev-server-css): TaskStop
leaves orphan node child on :3000 (Stop-Process the child PID), and
Turbopack persistent cache can serve stale CSS even after restart —
delete .next + cold start.
NOW: SALES implementation round IN FLIGHT (incl. Approvals fold-in per
locked client decision). Codex read-only extraction DONE
(tasks/b25o416hm.output — full mockup spec Part A + implementation map
Part B incl. hazards B11.1-B11.10: /portal/approvals link inventory,
provider-name mismatch mockup vs real constants, totalValue vs value,
commission not computed, PUT excludes status, per-rep dashboard count
vs org-wide queue). GOAL CONTRACT WRITTEN + FINALIZED:
docs/redesign/sales-the-line-goal.md (Sonnet drafted, I resolved the 3
open calls: commission renders em-dash `—` never $0/fake; all
"Approvals" labels KEPT but retarget to /portal/sales?status=pending +
portalNavGroups Pending Approvals entry REMOVED per shell transitional
note; dashboard pending-count FIXED org-wide for sales:approve in this
slice — the one sanctioned exception to the file-scope hard rule,
alongside entry-point retargets in palette/QuickActions/notification).
CODEX IMPLEMENTATION DONE 2026-07-13 (session
019f5d4b-76e8-77c2-a4d7-e1197a6e0eda; run was killed twice by harness
reaping old-session background tasks — finished via DETACHED
Start-Process with log at scratchpad logs/codex-sales.log; NOTE
detached PS logs are UTF-16, grep needs conversion). ALL GATES PASS
(tsc/eslint/build/diff --check), NOT committed. 11 files: sales page +
SalesTable (queue+ledger) + SaleDetailSheet (bespoke dark) +
globals.css sales-line-* + approvals→redirect + dashboard org-wide
pending count + CommandPalette/QuickActions retargets + edit page
status-dropdown removed + [id] page fake $0 commission removed + sales
API route = notification-link retarget only (sanctioned). My verify
shots taken (dark, admin): sales-impl-1440-{top,ledger,sheet}.png +
sales-impl-390-{top,ledger}.png at repo root — hero 1,250 whole,
commission em-dashes, empty queue copy right, mobile scrollWidth 375,
5 .portal-metallic-num on page. Dev server RUNNING DETACHED on :3000
(log scratchpad logs/devserver.log; killed-orphan playbook applied
twice). NOW: fresh Opus reviewer ROUND 1 running (checklist incl.
numeral rule + entry-point retargets). Then: fix defects → re-review →
commit local → user "deploy" → push. Remaining build
order after Sales: Chat → Calls → Forms hub+5 forms (flips nav
transitional items per shell-the-rail-goal.md) → Resources → Member →
Ops queues → Admin mgmt. Dashboard built (05cb166) awaiting deploy
decision alongside shell.
NOTE user asked mid-run if reviewer should be Fable ("if i remember
correctly") — corrected: standing rule = reviewers on Opus, never
Fable; user did not push back.
Per-page gate applies to every page after: goal contract → Codex
implements → Opus 1:1 verify → gates → user says "deploy" → push. →
implementation phase per page (goal contract → Codex implements →
Opus 1:1 verify → gates → user says "deploy" → push).

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
