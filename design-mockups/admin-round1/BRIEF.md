# Admin Management — Round 1 Mockup Brief

Build THREE self-contained HTML mockups (vanilla JS, zero external assets)
in design-mockups/admin-round1/:

- option-1-the-roster.html — practical people-and-records take
- option-2-the-registry.html — calm card-catalog/records-office take
- option-3-the-line-admin.html — "The Line" broadcast family take (dark Spotlight Arena)

Each file contains FOUR VIEWS switched by a fixed pill nav (no reloads):
People / Person / Catalog / Settings. Default = People.
These establish ONE shared management design that all eight admin pages adopt
(users list, users/[id], users/new, chat-channels, form-options,
email-templates, admin/university, admin/settings).

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
9. Numeral font: NO Georgia for big counts (old-style numerals misread —
   "23" looked like "2.3"). Use the family metallic display treatment.

## ONE consistency contract (bake into every view — these fix real audit findings)

- Text SEARCH on every list (today: zero pages have it).
- ONE delete/confirm pattern: inline confirm strip on the row ("Delete? Yes /
  Cancel") — today it's 4 different styles incl. NO confirm on email-template
  delete. Show it in every view that deletes.
- ONE save story: row/card edits save inline with a quiet "Saved" tick;
  settings save per-section (no giant global Save button).
- ONE empty state pattern: quiet line + primary action.
- Mobile: every table becomes cards; no wrapping-flex jumble.

## View 1 — PEOPLE (users list)

- Masthead numeral = total members (e.g. 34). Headline about the roster.
- Toolbar: text search (name/email), role filter pills, status segmented picker
  (All / Pending / Active / Inactive), clear filters.
- "Needs a decision" strip on top: pending users surfaced first (e.g. 3 pending),
  each with Approve (assign role via segmented picker in an inline panel) or
  Accept action — never buried in a table column.
- Member rows/cards (10 demo users): avatar initial + online dot, name, email,
  role chip, status chip, hire date, actions: Edit → Person view, Deactivate /
  Activate, Delete (inline confirm). Demo: one row's inline delete-confirm open.
- Empty-filter state distinct from empty-directory state.
- Mobile: cards, toolbar wraps.

## View 2 — PERSON (user detail — same layout serves users/new)

- Masthead: person's name as headline, role + status chips under it; numeral =
  e.g. their approved sales 12 (any honest count).
- Numbered sections (who they are / their role / sensitive records):
  1. Account: email (locked when editing), name, phone, address/city/state/zip.
  2. Role & status: role via segmented picker groups, status segmented picker,
     Manager as a NAMED person picker (search-select showing manager names —
     today admins type a raw Manager ID).
  3. Sensitive records (admin-only, visually vaulted): masked SSN ****1234 +
     DL ****5678, lock glyph, "Reveal" with a beat of friction (confirm inline).
- Sticky save bar appears when a field is dirty: Cancel / Save changes.
- A small "creating new?" note: same form, empty, plus password field — show a
  toggle or annotation demonstrating the New User variant.

## View 3 — CATALOG (the shared "manage a list of things" pattern; demo = Email templates)

This ONE pattern gets adopted by chat-channels, form-options, and university
at implementation — include a small strip showing those three adopting it
(one demo card each, same anatomy).
- Masthead numeral = template count (e.g. 9).
- Toolbar: search, category filter pills (Recruiting / Onboarding / Performance
  / General).
- Template cards: name, category chip, subject line, 2-line body preview,
  updated-when, actions: Copy (copies subject+body), Edit, Delete (inline
  confirm — today delete is instant, no confirm!).
- Edit/create expands IN PLACE into an editor panel (no modal): name, category
  segmented picker, subject, body, token chips ({{rep_name}} {{manager_name}}
  {{company}} {{date}}) that insert on click, Save / Cancel. Demo: one card
  pre-expanded in edit mode.
- Adoption strip "same pattern, other rooms": one chat-channel card (name,
  audience chip, member count, Archive/Delete), one form-options card
  (Internet Providers: value chips + add input + inline save), one university
  card (title, carrier chip, PDF badge, Published toggle, Edit).
- Empty state: quiet line + "Start from a template" starter chips.

## View 4 — SETTINGS (admin settings, honest + safe)

- Masthead numeral = e.g. 3 sections. Headline about the control room.
- No fake global Save. Three numbered sections, each saving itself with a
  quiet "Saved" tick:
  1. Company: company name, support email, default role for new users
     (segmented picker).
  2. Sales & points: auto-approve toggle, points min/default/max as three
     plain number inputs, leaderboard periods as segmented multi-toggles
     (Day Week Month Quarter Year All-time).
  3. Alerts: the notification toggles (New sale / Approved / Rejected /
     Leaderboard changes) — toggles actually flip in the demo.
- DANGER ROOM separated at the bottom: Reset sales / Reset leaderboard, each
  requiring typed confirmation ("type RESET") in an inline panel — demo one
  open. Loud but contained.
- Mobile: sections stack, no horizontally-scrolling tabs.

## Process

Test at http://localhost:8899/admin-round1/<file>.html (server rooted at
design-mockups/; start one if not running). UTF-8 clean (proper · — characters).
Keep each file under ~1500 lines. When done, list the three file paths +
deviations.
