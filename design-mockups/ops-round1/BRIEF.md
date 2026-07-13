# Ops/Admin Work Queues — Round 1 Mockup Brief

Build THREE self-contained HTML mockups (vanilla JS, zero external assets)
in design-mockups/ops-round1/:

- option-1-the-desk.html — practical operations-desk take
- option-2-the-docket.html — calm case-file/docket take
- option-3-the-line-ops.html — "The Line" broadcast family take (dark Spotlight Arena)

Each file contains FOUR VIEWS switched by a fixed pill nav (no reloads):
Ops home / Review queue / Onboarding review / Pipeline. Default = Ops home.
These establish ONE shared queue design that all nine admin pages will adopt
(recruiting + the other form queues reuse the same patterns at implementation).

## Family design language (dark-first)

Deep navy/near-black (#030916-ish) grounds, lime accent (#a3e635-ish), metallic
silver display numerals, mono uppercase kickers, hairline rules. Big editorial
masthead per view: lime + white two-line display headline, muted intro, huge
metallic count numeral right, TOP-ALIGNED with the headline. Option 3 = closest
sibling of the picked pages (numbered sections, broadcast ticker). Options 1–2
same palette, different composition. Brand block: a "3C" square placeholder
(real logo lands at implementation).

## HARD RULES (each has failed a previous round — bake in)

1. Metallic numeral (background-clip:text): `line-height:.78; padding:.25em .13em 0 0;
   margin:-.25em -.13em 0 0;` + `@media(max-width:460px){.display{padding-right:0;margin-right:0}}`.
2. Plain numbers everywhere (7, not 07) except option-3 section labels ("01 / ...").
3. Mobile h1: `clamp(36px,10.5vw,54px)`. ZERO horizontal scroll at 390 (check body.scrollWidth).
4. Fixed view-switch pill: desktop `top:72px;right:14px`, mobile `top:62px;right:9px;
   max-width:calc(100vw - 18px)`. Nothing fixed may overlap the header brand row.
5. No "undefined"/"NaN" in any rendered string.
6. Segmented choice-picker pattern for any pick-one control.
7. CSS class scoping: NEVER style a bare utility class like `.show` with
   position/absolute — scope every rule to its component (`.password .show`).
   Generic single-word classes leak across components.
8. Tables/wide content scroll inside their own container, never the page body.

## View 1 — OPS HOME (new page: one front door for all queues)

A queue index that answers "what needs me right now":
- Masthead numeral = total items waiting (e.g. 23). Headline about running the desk.
- A "needs you now" strip: total new across queues, oldest waiting item age, e.g.
  "6 new today · oldest waiting 3 days".
- Grid/list of the 9 queues, each with: name in plain words, new count (plain
  number), oldest-item age, one-line description, and status (clear / backed up).
  Queues: Onboarding review (4 new) · Pipeline (2 need action) · Recruiting
  (3 submitted) · Fiber reports (5) · Expedite orders (2) · Payroll disputes (3) ·
  Leads requests (1) · Manager interviews (1) · Bug reports (2).
- Queues with 0 new show a quiet "clear" state, not an alarm.

## View 2 — REVIEW QUEUE (the shared pattern; demo = Payroll disputes)

This is the ONE design all form queues + bug reports adopt. Fixes: evidence
detached from rows, "handled" too coarse, no filters/search.
- Toolbar: search box, status segmented picker (New / In progress / Done — richer
  than today's new/handled), campaign filter pills (Fiber/Mobile/Internet/TV),
  CSV export button.
- Rows (6 demo disputes): who submitted, contractor, campaign + period, order
  type, install date, age ("2h ago" / "3 days"), status chip. EVIDENCE ATTACHED
  TO THE ROW: screenshot thumbnail chip inline; clicking expands the row into a
  detail panel (demo: one row pre-expanded) with the screenshot preview, all
  fields, a notes box, and actions: Start (→ In progress), Resolve, Send back to
  rep with reason (required).
- New rows visually louder than done rows; done rows compress.
- Mobile: rows become cards, toolbar wraps, detail panel becomes full-width sheet.

## View 3 — ONBOARDING REVIEW (fixes: two queue models mixed, no filters, wall of long cards)

- Masthead numeral = submissions waiting (e.g. 4). FIFO order kept, oldest first.
- Filter row: person picker pills, category pills (Tax / Legal / Banking / License),
  at-risk toggle.
- Each submission row: person (avatar initial + name), item name, category,
  waiting time, sensitive-lock glyph where applicable, file/reference chips
  inline. Expanded demo row shows: preview area, reference text, Approve button,
  Reject with required-reason field.
- Separate small "activation ready" rail: people with all items approved →
  "Activate" action with claim state ("I've got it" → claimed by Dana R.).
- Include one at-risk person flagged loudly.

## View 4 — PIPELINE (fixes: table overflow, no filters, modal-heavy)

- Masthead numeral = reps needing action (e.g. 2).
- Stage strip as segmented picker with counts (plain numbers): Processing 3 ·
  Need Logins 2 · Cleared to Sell 4 · Active 12 · Decommissioned 1. Selecting a
  stage filters the board (demo: Processing selected).
- Reps as rows in a scannable board (NOT a cramped table): name + role + IBO
  flag, manager, onboarding progress (4/8), channels state (per-carrier chips:
  Xfinity cleared · Frontier submitted · Brightspeed not started — clicking a
  chip cycles its status in the demo), approved sales count, and inline actions:
  Field train, Decommission (opens inline reason panel with reason picker +
  notes, demo expandable), Reinstate on the decommissioned rep.
- Search box + manager filter pills.

## Process

Test at http://localhost:8899/ops-round1/<file>.html (server already running,
rooted at design-mockups/). UTF-8 clean (proper · — characters). Keep each file
under ~1400 lines. When done, list the three file paths + deviations.
