# Admin Management "The Line" — Visual Parity Goal Contract (DRAFT)

FINAL round of the campaign. User picked the mockup
`option-1-the-roster.html` (all 4 views approved). Same contract style as
`ops-the-line-goal.md` / `member-the-line-goal.md` / `forms-the-line-goal.md`
/ `resources-the-line-goal.md` / `calls-the-line-goal.md` /
`chat-the-line-goal.md` / `shell-the-rail-goal.md`: implementation is
verified 1:1 against the mockup by independent reviewers until EXACT — not
close enough.

This round covers 8 real routes under `src/app/portal/admin/**` behind 4
mockup views: **People** (users list), **Person** (user detail, shared
layout with `users/new`), **Catalog** (a shared "manage a list of things"
pattern demoed on email templates, adopted by 3 more real pages this round),
and **Settings** (admin settings / control room). Settings is the one view
where the mockup's honest-per-section-save affordance has **no real backend
behind it today** — see Composition — Settings for the binding treatment.

## Source of truth

- Mockup: `design-mockups/admin-round1/option-1-the-roster.html` (one file,
  4 views — People / Person / Catalog / Settings — switched by a mockup-only
  prototype pill nav; see Pill nav below).
- Brief: `design-mockups/admin-round1/BRIEF.md`.
- The mockup wins on any visual ambiguity not resolved by the sanctioned
  deviations or rulings below.
- Extraction reference (factual detail on both the mockup and the current
  implementation): Codex read-only audit. Full log:
  `admin-extract-report.txt` (session scratchpad), hazards cited as B-1
  through B-12.

## Pill nav — DECIDED, does not ship

Matches every prior round's precedent (Forms' pill, Resources' pill, Ops's
would-be pill, Member's pill): the fixed view-switch pill nav (People /
Person / Catalog / Settings) is prototype-only chrome for demoing 4 views in
one HTML file. The 4 views are 8 genuinely separate real routes today and
stay that way — no floating dev-toggle control ships, no client-side tab
routing. Not an open call.

Mockup masthead (3C-square brand row + brand-meta "management desk ·
preview data · 2026" + footer) is prototype chrome standing in for the real
shell — **none of it ships**. Every page renders inside the real
`PortalHeader`/`PortalSidebar` (via the existing `admin/layout.tsx`); each
composition below starts at the hero/kicker, not the masthead. Restyle to
the real `public/logo.png` per campaign rule wherever the mockup's `3C`
placeholder square appears in any component that DOES ship (none identified
in this mockup, since the masthead itself doesn't ship).

## Composition — People view (`users/page.tsx`)

1. **Hero**: kicker `admin management / the roster`, headline `Keep the
   roster` (lime) / `close to the work.` (plain), intro sentence, quick-rail
   chips = real `<N> members / <M> pending` (lime) + `updated moments ago`
   (static tone copy is fine — no real "last poll" timestamp exists), hero
   numeral = real total user count, label `members on file`.
2. **Toolbar**: search input (real name/email filter, already implemented),
   role filter pill-row (All roles / Admin / Operations / Field rep — real
   `roleFilter` values, restyled from whatever control exists today),
   status segmented (All / Pending / Active / Inactive — real
   `statusFilter`), `Clear` button resets both + search text — all real,
   UI-only restyle of existing `users`/`roleFilter`/`statusFilter` state.
3. **"Needs a decision" strip** (sits above the main list): real pending
   signups — **same source the dashboard's pending count already uses**
   (per orchestrator ruling), i.e. real `status:'pending'` users, not a new
   endpoint or `ActionQueue`'s `alertTasks`. Each row: avatar-initial +
   name (+ online-dot if the app already tracks presence) + email +
   real "requested `<relative time>`" from real `createdAt`; actions =
   `Assign role` (inline segmented Field rep/Operations/Admin picker,
   default Field rep) + `Accept` — both wired to the existing real
   `handleApproveConfirm`/`handleAcceptConfirm` handlers (`users/page.tsx`
   122-176), UI-only restyle. Right meta = real waiting count.
4. **Section head**: kicker `01 / member records`, h2 `Everyone on the
   line.`, right meta = real filtered record count (`people-count`
   equivalent), `sorted by attention` stays static tone copy.
5. **People list**: horizontal-scroll container (`overflow-x:auto` on the
   list only, never the page body — Hard Rule 9), real rows from
   `UserTable.tsx`'s existing field set (`uid, displayName, email, role,
   fieldRole, status, hireDate, lastActiveAt`) restyled into the mockup's
   grid columns (name / role / status / hire-date / approved-sales /
   actions). Approved-sales column: confirm the exact existing field/query
   this number already comes from elsewhere in the app before implementing
   (e.g. an existing per-user sales count) — never fabricate a placeholder.
   Row actions: `Person` (navigate to Person view), `Deactivate`↔`Activate`
   (real `handleStatusChange`, UI-only restyle), `Delete` → **inline
   confirm-strip** (`grid-column:1/-1`, red top border, "Delete `<Name>`?"
   / Cancel / Yes) **replacing today's full-screen modal**, wired to the
   existing real `handleDeleteConfirm` — pure UI change, no new write path.
6. **Empty states**: both real states the mockup demonstrates — filtered-
   empty (`No people match this filter.` + `Clear filters`) and true-empty
   (`No members yet. Invite the first person to start the directory.`) —
   both restyled, not collapsed into one.
7. **Mobile (≤900px / ≤760px)**: role/status/hire/sales columns hide at
   900px (name + actions only survive); at ≤760px the row grid becomes
   `minmax(0,1fr) auto` with row-actions spanning full width below — carry
   over exactly, no separate card markup, same row DOM CSS-collapsed.

## Composition — Person view (`users/[id]/page.tsx` + `UserForm.tsx`,
`users/new/page.tsx` shares this layout)

1. **Hero**: kicker `person record / approved sales`, headline
   `<real name>.` (lime) / `Make the record useful.` (plain), intro
   sentence, quick-rail = real role chip / real status chip / real
   `<employment type> / <uid-derived reference>` chip, hero numeral = real
   approved-sales count for this person (same source note as People view's
   column — confirm before implementing), label `approved sales`.
2. **Two-column layout** (main 1.4fr + aside .6fr; mobile stacks to 1 col).
3. **Main panel, section `01 / account`**: `Who they are.` — real 2-col
   form-grid: Name (editable), Phone (editable), Email (readonly + lock
   glyph — matches today's real locked-email behavior exactly), Hire date
   (readonly), Address (full-width, editable). This is a UI-only restyle —
   `UserForm.tsx`'s existing editable-vs-locked split is already correct.
4. **Main panel, section `02 / role & status`**: `Place them on the line.`
   — Role segmented (Field rep / L1 manager / L2 manager / Operations /
   Admin — the real 5-option role set, restyled from the existing
   `<select>` into the mockup's segmented pattern per Hard Rule — never a
   native `<select>` for a pick-one control per the mockup's own hard
   rules). Status segmented (Pending / Active / Inactive). **Manager
   picker**: replaces the raw free-text `managerId` `<Input>` with a
   name-search picker backed by the **existing** `GET
   /api/portal/auth/users` endpoint (client-side query, role-filtered to
   manager-eligible roles: `l1_manager`/`l2_manager`/`operations`/`admin`)
   — no new route. Search input + clickable name+role-chip results; picking
   one still writes the same `managerId` field UserForm writes today.
5. **Main panel, section `03 / sensitive records`** (`.vault` amber-tinted
   treatment): SSN/DL masked values + lock glyphs, `Reveal for this
   session` action opening the mockup's two-step confirm panel — this is a
   **pure reskin of the existing, real, audit-logged reveal flow**
   (`GET /api/portal/admin/sensitive/[uid]` + `?reveal=true`, Firebase
   ID-token gated, writes to `sensitiveAccessLog`, `role==='admin'`-gated
   render). Never bypass, shortcut, or duplicate that endpoint or the audit
   write — the mockup's "Continue" step maps 1:1 to the real reveal call.
6. **"Creating new?" note / New User variant**: dashed-border toggle
   revealing one extra field, `Temporary password` (password input) — this
   is `users/new/page.tsx`'s existing thin-`UserForm`-wrapper behavior;
   ship as the mockup's inline toggle rather than a separate route-level
   layout, since both routes already render the same `UserForm`.
7. **Aside panel**: `record posture` copy, quick-rail (`<N> sales` lime
   chip, real territory/region chip if that field exists on the user
   record — confirm field name before implementing, do not invent one),
   `saved lines` sub-section with an inline save-confirmation slot (only
   shows a "Saved" state after a real successful save, never pre-filled).
8. **Sticky save bar**: shows only when the form is real-dirty (existing
   dirty-tracking or newly added client-side dirty flag on
   name/phone/address/password/manager fields), `Cancel` / `Save changes`
   wired to the existing real edit (`PUT /api/portal/auth/users/:uid`) and
   create (`POST /api/portal/auth/create-user`) handlers — UI restyle only.

## Composition — Catalog view (shared pattern: email templates + 3 more
real pages adopt it this round)

The mockup demos ONE catalog instance (email templates) plus an
"illustrative, not a live nav" 3-card adoption strip proving the pattern
generalizes. **Per orchestrator ruling, this round goes further than the
mockup's illustrative strip: chat-channels, form-options, and university
content admin all really adopt the Catalog anatomy this round** — all 4 are
in the 8-page scope, not just email-templates.

Build one shared, props-driven component (working name `AdminCatalogList`,
suggested path `src/components/admin/AdminCatalogList.tsx`) — per the
mockup's own brief intent ("implementation should extract a genuinely
shared component, not 4 independent look-alikes"). Each of the 4 real pages
renders its own real fields/actions through it; do not force a field a page
doesn't have.

1. **Hero** (per page): kicker `catalog / <page's real noun>`, headline
   `Keep every record` (lime) / `ready to reuse.` (plain), intro sentence
   (page-appropriate, may reuse each page's existing intro copy), hero
   numeral = real item count on that page, label `<page's real noun> on
   file`.
2. **Toolbar**: search input (real per-page searchable field), category/
   type pill-row **only where a real closed-enum field exists** (email
   templates: real `category` enum; chat-channels/form-options/university:
   use whatever real categorical field each already has, or omit the
   pill-row if none exists — never invent a filter dimension).
3. **Catalog grid** (2-col desktop, 1-col ≤900px, hairline gaps): one card
   per real item — eyebrow category, h3 name/title, status chip (real
   active/draft, published/unpublished, or archived/active per page's real
   model), subject/description line, meta row (real updated-when + any
   real secondary metric), actions row matching each page's real
   capabilities:
   - **email-templates**: Copy / Edit / Delete — Delete gets the mockup's
     inline confirm-strip **for the first time** (today: zero confirm,
     instant delete — pure UI fix wrapping the existing real
     `handleDelete`, no backend change).
   - **chat-channels**: Archive / Delete — inline confirm-strip already
     exists here (`confirmDeleteId` pattern) and is the reference
     implementation; restyle into the shared component's visual language,
     reuse the real `archiveChannel`/`deleteChannel` handlers unchanged.
   - **form-options**: Add value / Save inline (no delete — real
     value-remove-then-save-per-card behavior only); restyle
     `saveValues` per-card save into the shared card actions row. The
     embedded `<FormAlertsCard />` component stays as-is, restyled at its
     callsite, not folded into the shared catalog card.
   - **university**: Edit + Publish toggle (real `togglePublish`) +
     Delete → inline confirm-strip **replacing today's `window.confirm()`**
     — the confirm copy MUST preserve the real storage-deletion warning
     ("This also removes the uploaded file") per-instance, not a generic
     "Delete this?" — the shared component must accept per-page confirm
     copy, not hardcode one string.
4. **In-place editor** (no modal — opens inline under the grid): real
   per-page editable fields (email-templates: name/category/subject/body +
   token chips `{{rep_name}} {{manager_name}} {{company}} {{date}}` that
   append into the body textarea on click; university: title/category/
   description/required flag/file upload via the existing real
   `useTrainingUpload` hook, restyled — never forked). Save/Cancel wired to
   each page's real existing save handler.
5. **Empty state**: the mockup's quiet-empty pattern (`No <items> match.` +
   starter chips or a single primary CTA, per page's real true-empty vs
   filtered-empty distinction) — restyle, don't drop either state.
6. **Auth pattern note**: chat-channels and form-options use `authedFetch`
   with a real Firebase ID token; email-templates and university use the
   `requestedBy` query-param pattern. The shared `AdminCatalogList`
   component/hook must support **both** real auth patterns per-instance —
   it cannot assume one auth style. This is an implementation constraint,
   not an open call.

## Composition — Settings view (`settings/page.tsx`)

**Honest-inert treatment — binding.** `settings/page.tsx` has NO real
backend write path for anything on the page today (no settings collection,
no GET/PUT/POST endpoint) and its notification toggles + both Reset buttons
have literally no `onClick` at all (fully dead, not stubbed). The redesign
ships the mockup's per-section layout, but **every control whose real
handler does not exist today renders visibly INERT**:

- Disabled control + a plain "Not wired up yet" note in the mockup's
  small-print style, on: the company/support-email/default-role fields
  (section `01`), the auto-approve toggle + points min/default/max inputs +
  leaderboard-periods multi-toggle (section `02`), all 4 notification
  toggles (section `03`), and the entire danger room (both Reset cards
  ship their typed-`RESET` input + `Confirm reset` button visually, but
  both the input and button are **disabled** with the same "Not wired up
  yet" note — the danger-room UI ships, its interaction does not).
- **No fake "Saved" tick anywhere.** No per-section save button fires a
  timeout-then-success toast against nothing. If a section has zero real
  fields to save (all of them, today), its `Save <section>` button is
  disabled with the same inert treatment, not wired to a fake success
  state.
- **No typed-RESET flow wired to nothing.** The danger-room's typed-`RESET`
  gate ships visually (per the mockup) but both inputs stay disabled — no
  client-side illusion of a working destructive action.
- Building real settings persistence and real reset-sales/reset-leaderboard
  endpoints is **explicitly OUT of this round** — flagged as follow-up
  work (reset endpoints in particular need their own
  authorization/audit-trail design as destructive actions, not just a
  typed-RESET client gate).
- If extraction/implementation surfaces a section with a genuinely real
  handler not caught above, that section gets the mockup's real per-section
  save — but per current findings (B-1/B-2), that set is empty.

1. **Hero**: kicker `admin settings / control room`, headline `Tune the
   control` (lime) / `without hiding the risk.` (plain), intro sentence,
   hero numeral = static `3` (structural fact — 3 real section cards),
   label `sections to tune`.
2. **Settings grid** (3-col desktop → 1-col ≤900px): sections `01 /
   company`, `02 / sales & points`, `03 / alerts` per the mockup's field
   layout — all inert per above.
3. **Danger room**: `Reset sales` / `Reset leaderboard` cards, both inert
   per above (leaderboard card may still ship pre-opened in its
   `.danger-confirm` state visually, matching the mockup's demo, since
   the input is disabled regardless of open/closed state).
4. **Role gate preserved exactly**: settings keeps its existing bespoke
   `useAuth().isRole('admin')` check + manual "Access Denied" card
   fallback (not `ProtectedRoute`) — restyle the denial card's visuals,
   keep its logic untouched (no unification with the other 7 pages'
   `ProtectedRoute` gate this round).

## Real data mapping (what each mockup number/string becomes)

- **People hero numeral / quick-rail counts**: real total user count, real
  pending count — never the mockup's static `34`/`3`.
- **People "needs a decision" strip**: real `status:'pending'` users from
  the same source the dashboard's pending count uses — not a new query.
- **People list counts, approved-sales column**: real per-user data;
  confirm the exact existing source for approved-sales before implementing.
- **Person hero numeral**: real approved-sales count for that specific
  user.
- **Person manager picker results**: real users from the existing `GET
  /api/portal/auth/users` endpoint, filtered client-side to manager-
  eligible roles — never the mockup's static 3-name demo list.
- **Person sensitive records**: real masked SSN/DL from the existing
  sensitive endpoint — never a placeholder pattern like the mockup's
  `****1234`/`****5678` unless that IS the real masking format already
  returned by the API (confirm before assuming literal parity).
- **Catalog hero numerals / grid**: real per-page item counts and real
  items — never the mockup's static `9`/4 demo cards.
- **Settings hero numeral**: static `3` (structural fact, same reasoning
  Member's Settings used for its static `5` — no live data source needed).
- **Settings field values**: display real current values where a field
  reads from somewhere real today (none currently persist, per B-1) — if a
  field has no real backing value, it must not render a fabricated
  placeholder default; render empty/disabled with the inert note.

## Sanctioned deviations (structural / cross-cutting)

- **Mockup masthead/ticker/pill-nav does not ship** on any of the 4 views.
  Real `PortalHeader`/`PortalSidebar` render instead (via `admin/layout.tsx`,
  unchanged).
- **Settings inert treatment is mandatory**, not optional polish — see
  Composition — Settings. Do not ship a fake "Saved" tick or a typed-RESET
  flow wired to nothing.
- **Security hazard B-7 is NOT fixed this round.** Today an `operations`
  user can reach `/portal/admin/users` and `/portal/admin/users/[id]` by
  direct URL even though the sidebar nav hides the link (nav group is
  admin-only, page guard is admin+operations), and `UserForm`'s role
  `<select>` is unrestricted (includes admin/operations options reachable
  by an operations user). Role-logic changes are out of campaign scope per
  ANCHOR §5. **The redesign MUST NOT WIDEN this**: no new nav links exposing
  the Users pages to operations beyond today's reach, the role
  dropdown/segmented's option set stays exactly as today, no softening of
  any existing guard. This is being reported to the user separately as a
  security-fix candidate, not resolved here.
- **B-6 gating inconsistency preserved exactly, not unified.** Each of the
  8 pages keeps its existing gate exactly as-is: `users*`/
  `email-templates`/`university` = `ProtectedRoute
  roles={['admin','operations']}`; `chat-channels`/`form-options` =
  `ProtectedRoute roles={['admin']}` (operations excluded); `settings` =
  bespoke `isRole('admin')` + denial card (no `ProtectedRoute`). No
  harmonization this round.
- **Manager picker writes the same field as today** (`managerId`), sourced
  from the existing `GET /api/portal/auth/users` endpoint client-side — no
  new route, no schema change.
- **Sensitive-record reveal is a pure reskin.** The real audit-logged
  reveal flow (`/api/portal/admin/sensitive/[uid]` + `sensitiveAccessLog`)
  is reused exactly; never bypassed, duplicated, or shortcut.
- **Delete-confirm standardization is a pure-UI fix, sanctioned by the
  mockup's own brief** ("today delete is instant, no confirm!"). All 4
  previously-inconsistent delete/remove patterns (People's full-screen
  modal, email-templates' zero-confirm, university's `window.confirm()`,
  form-options' N/A) converge onto chat-channels' already-real inline
  confirm-strip pattern, restyled — no backend change on any of the 4.
- **Catalog auth-pattern duality preserved.** The shared component/hook
  supports both the ID-token (`authedFetch`) and `requestedBy` query-param
  real auth patterns, per real endpoint — never assume uniformity.
- **Loading/error/empty states preserved, restyled.** None of the 4 mockup
  views show these (all-happy-path demo) — every real page's existing
  loading, error, and true-empty state must be added into the new visual
  frame.
- **admin/layout.tsx's outer `ProtectedRoute` stays role-less** (any
  authenticated user) — per-page guards remain the sole line of defense,
  unchanged this round; not touched or "fixed" as part of this reskin
  (B-8 structural note, out of scope).
- Light theme must keep working via the portal `ThemeContext` (dark is the
  1:1-verified target per campaign rule; light needs to be coherent, not
  verified 1:1).
- lucide-react icons replace the mockup's inline SVGs (lock glyphs on
  Person view's locked/vaulted fields, etc.).
- Animations/transitions skipped under `prefers-reduced-motion` (respect
  the exemption pattern in `globals.css` `@layer base` — see
  `project-reduced-motion-gotcha` memory).
- No Firestore/data-shape changes, no new collections, no new API routes
  (manager picker and everything else reuses existing endpoints), no
  role-logic changes (ANCHOR.md §5) — this is a visual reskin + a shared
  Catalog component + one honest-inert Settings page, not a backend
  architecture change.

## Nav / entry points (no changes required this round)

All 8 routes already exist and are already reachable via
`PortalSidebar`/`CommandPalette` exactly as today (Admin-only group:
User Management, Chat Channels, Form Options, System Settings; Operations
group: Email Templates, University). No route renames, no nav-group edits,
no `PortalSidebar.tsx`/`CommandPalette.tsx` changes this round — unlike
Ops's round, this one adds no new page.

## Desktop / mobile reflow (exact mockup breakpoints)

Breakpoints are **900px and 760px**, plus **460px** for the anti-clip
numeral rule — confirm exact values in the mockup source before
implementing (extraction did not enumerate every breakpoint per view;
verify empirically against the rendered mockup at each width rather than
assuming parity with other rounds' 760/460 pair).

### `max-width: 900px`
People-list role/status/hire/sales columns hide (name + actions survive).
Catalog grid drops to 1 column. Settings grid drops to 1 column.

### `max-width: 760px`
People-list row grid becomes `minmax(0,1fr) auto`, row-actions span full
width below. Person layout stacks to 1 column. Adoption/catalog secondary
groupings drop to 1 column where still 2-col at 900px.

### `max-width: 460px`
Metallic numeral (`.display`) padding-right/margin-right reset to zero
(anti-clip pattern, same as every other campaign page). Toolbar search
inputs go full-width.

No horizontal scroll anywhere at any width (campaign rule) — EXCEPT the
People list's own `.people-shell`/list container, which is explicitly
allowed to scroll horizontally within itself (`overflow-x:auto`) per the
mockup's hard rule; the page body itself never scrolls horizontally.

## Design tokens (from mockup — reconcile lime hex before implementing)

```css
--bg: #030916;
--panel: #081a35;
--panel-2: #0d2447;
--ink: #f5f8fb;
--muted: #94a6bb;
--soft: #6d8097;
--line: rgba(217,229,240,.15);
--red: #ff7b7b;
--amber: #f7c96b;
--blue: #86b9ff;
--metal: linear-gradient(180deg,#ffffff,#d9e1e8,#7f8d9c,#f4f7fa);
```

**Lime — do not ship the mockup's literal `#a3e635` as a second value.**
Use whatever hex the already-shipped dark-campaign pages (sales/
leaderboard "Broadcast" pattern, Ops's `.line` treatment) already use for
lime in `globals.css` — confirm the exact token/hex in the codebase before
implementing rather than introducing a competing lime value. If the
existing shipped dark lime and the mockup's `#a3e635` are already the same
value, this is a non-issue; verify, don't assume.

Radius: this mockup uses **hard-edged panels, no `border-radius`
anywhere** — a deliberate "records office" squared-off look, diverging from
ANCHOR §3's `rounded-lg` default for portal cards. See **OPEN CALL 1**.

Font: body = `"Trebuchet MS","Segoe UI",sans-serif`; all-caps mono labels/
kickers/numerals/buttons = `ui-monospace`/Consolas. The mockup's big H1
uses this generic sans stack directly, **not** `.portal-display`
(Archivo) used elsewhere in the dark campaign. See **OPEN CALL 1**.

New admin-specific rules should be namespaced `admin-line-*` in
`globals.css` alongside existing `.portal-*` conventions — all other
`globals.css` sections stay frozen (campaign hard rule).

## Numeral clipping fix (carry over exactly)

Same paint-area fix as every other page this campaign: `padding: .25em
.13em 0 0` + `margin: -.25em -.13em 0 0` via the existing
`.portal-metallic-num` class in `globals.css`, for every hero numeral on
all 4 views. Verify empirically at 1440 and 390. At ≤460px the mockup
drops right padding/margin to zero — replay exactly. Section-label
numbering (`01 /`, `02 /`, `03 /`) keeps its literal zero-padded format as
design chrome, not a data-driven count — this does not violate the
plain-number-counts hard rule.

## New shared component: AdminCatalogList

Working name `AdminCatalogList` (suggested path
`src/components/admin/AdminCatalogList.tsx`, styles namespaced
`admin-line-*` in `globals.css`), built to implement the Catalog view
pattern once and share it across email-templates, chat-channels,
form-options, and university content admin — **all 4 adopted this round**,
per orchestrator ruling (not just email-templates as the mockup's literal
demo, and not left as the mockup's illustrative-only 3-card strip).
Props-driven per queue/page (title, item fields, category taxonomy if any,
status model, action set, confirm copy, auth pattern) — not 4 copy-pasted
components. If any one page's real data shape cannot map cleanly onto the
shared card/editor anatomy, flag that specific page for a follow-up
decision rather than forcing a bad fit or silently dropping functionality
(mirrors the same instruction given for Ops's `OpsQueueList`).

## OPEN CALL 1 — Squared/hard-edge cards + non-Archivo H1 vs ANCHOR §3 defaults

The approved mockup uses zero `border-radius` anywhere (a deliberate
"records office" look) and its H1 does not reference `.portal-display`
(Archivo), diverging from ANCHOR §3's `rounded-lg` card default and the
dark campaign's established Archivo display-heading pattern used on
Dashboard/Ops/Sales/Leaderboard. Options:

- **(a)** Ship as spec'd — accept the squared, non-Archivo look as the
  intentional Admin/Catalog archetype variant. This was the picked option
  (all 4 views approved as-is), and this campaign has precedent for
  per-page voice deviations being accepted once confirmed intentional
  (Member's non-standard Georgia/Courier New font stack was accepted
  outright in that round's ruling #3: "keep the mockup's own stack, it is
  the approved design and internally consistent").
- **(b)** Reconcile to ANCHOR §3 defaults — apply `rounded-lg` to admin
  cards and `.portal-display` (Archivo) to admin H1s, overriding the
  mockup's literal styling to match the rest of the dark campaign's type
  system.

Recommendation: **(a)** — the mockup was explicitly approved in full
(all 4 views), the squared aesthetic reads as a deliberate archetype choice
for a "records desk" area distinct from Dashboard/Ops's command-center
tone, and Member's precedent already establishes that this campaign ships
an approved mockup's own internally-consistent type/shape system rather
than silently normalizing it. Needs orchestrator sign-off since it is a
literal-fidelity vs. system-consistency trade-off, and it is the one
genuinely open judgment call this extraction leaves (everything else was
pre-ruled).

## HARD RULES (campaign-wide, binding)

1. **Big numerals never clipped.** Every hero numeral uses
   `.portal-metallic-num`. Verify at 1440 AND 390, no glyph chopped on any
   edge.
2. **Tailwind preflight resets h1–h6 to font-weight 400.** Every heading —
   `h1`, `.section-head h2`, `.panel-head h2`, `.decision-head h3`,
   `.template-top h3`, `.settings-card h2`, `.danger-room h2`,
   `.adoption-card h3` and equivalents — MUST declare `font-weight`
   explicitly (recommend 900, matching the mockup's kicker weight) or it
   renders thin/broken. Verify computed weight in-browser on every view.
3. **No Georgia/old-style-numeral font on any count.** Use the metallic
   display treatment (mono/tabular), never serif, on every numeral.
4. **Counts render as plain numbers** (7 not 07) — EXCEPT this mockup's
   section labels, which use `01 /`, `02 /`, `03 /` numbered-section format
   as design chrome, not a data-driven count.
5. **Segmented `[aria-pressed]` button-group for every pick-one control**
   (role, status, category, default-role, etc.) — never a native
   `<select>` for these. `.multi-toggle` (leaderboard periods) is the one
   genuinely multi-select group and must be a visually/behaviorally
   distinct primitive, not the same component with a boolean prop.
6. **No "undefined"/"NaN" ever rendered** — check explicitly on Person's
   manager picker and Catalog's token counts once wired to real data.
7. **SSN/DL reveal stays the real, audit-logged, admin-only flow** — never
   bypassed, duplicated, or shortcut. No decrypt/reveal affordance
   anywhere else in the admin area.
8. **Wide content scrolls inside its own container** (`.people-shell` on
   desktop uses `overflow-x:auto`), never the page body.
9. **No horizontal scroll on the page body anywhere at any width** —
   confirm via `scrollWidth` check at 375px on all 8 pages.
10. **Settings inert controls are genuinely non-functional** — disabled
    attribute present, not just visually muted; confirm no `onClick`/state
    mutation fires from any inert control.
11. **Security hazard B-7 is not widened.** No new nav path from
    operations to Users pages; role dropdown/segmented option set
    unchanged; no guard softened. (Not fixed either — see Sanctioned
    deviations.)
12. **Role gating unchanged per action, not just per page** — the mockup
    shows every action to everyone in its demo; the real implementation
    must preserve each page's exact existing role gate (B-6, preserved
    as-is).
13. **Leaderboard is deployed — never touch it.** No edits to
    `src/components/leaderboard/**` or `/portal/leaderboard`.
14. **File scope.** Touch only:
    - `src/app/portal/admin/users/page.tsx`
    - `src/app/portal/admin/users/[id]/page.tsx`
    - `src/app/portal/admin/users/new/page.tsx`
    - `src/app/portal/admin/email-templates/page.tsx`
    - `src/app/portal/admin/chat-channels/page.tsx`
    - `src/app/portal/admin/form-options/page.tsx`
    - `src/app/portal/admin/university/page.tsx`
    - `src/app/portal/admin/settings/page.tsx`
    - `src/components/admin/UserForm.tsx` (manager picker + segmented role/
      status controls; no new fields beyond the mockup's spec)
    - `src/components/admin/UserTable.tsx` (restyled, real props unchanged)
    - `src/components/admin/AdminCatalogList.tsx` (new, shared Catalog
      component)
    - `admin-line-*` styles added to `globals.css` (namespaced, all other
      sections frozen)
    - **Zero edits outside this list.** No edits to
      `src/app/api/portal/**` (all endpoints reused exactly as they are),
      `src/app/portal/admin/layout.tsx`, `src/components/portal/
      PortalSidebar.tsx`, `src/components/portal/CommandPalette.tsx`, or
      any shared primitive (`PortalHeader.tsx`, `PortalPageHeader.tsx`,
      `ProtectedRoute.tsx`, `Card`/`CardContent`, `Button`, `NativeSelect`,
      `Textarea`) unless a sanctioned deviation above explicitly requires
      it. Shared primitives get restyled at the callsite only.

## Preserved behaviors (from extraction Part B — must keep working)

- Users: `GET /api/portal/auth/users` (role/status/requestedBy filters),
  `PUT /api/portal/auth/users/:id` (status change / approve field role /
  accept), `DELETE /api/portal/auth/users/:id?requestedBy=` — all real
  handlers (`handleStatusChange`, `handleAcceptConfirm`,
  `handleApproveConfirm`, `handleDeleteConfirm`) unchanged.
- UserForm: edit → `PUT /api/portal/auth/users/:uid`; create → `POST
  /api/portal/auth/create-user`; both redirect to `/portal/admin/users` on
  success, unchanged.
- Sensitive reveal: `GET /api/portal/admin/sensitive/:id?requestedBy=` +
  `?reveal=true` variant, Firebase ID-token gated, `sensitiveAccessLog`
  write on every reveal, admin-only render gate — unchanged.
- Email templates: `GET /api/portal/email-templates?userId=`, `POST`
  (create/update keyed by `id` presence), `DELETE` (body `{templateId,
  requestedBy}`) — `handleSave` unchanged; `handleDelete` unchanged, only
  gains a confirm step in front of it.
- Chat channels: `GET /api/portal/chat/channels/manage`, `POST` (create),
  `PATCH` (edit / archive-restore), `DELETE` (body `{id}`) — `authedFetch`
  with real Firebase ID token, `createChannel`/`saveChannel`/
  `archiveChannel`/`deleteChannel` unchanged.
- Form options: `GET /api/portal/forms/options`, `PUT
  /api/portal/forms/options` (`{key, values}` per card) via `saveValues` —
  unchanged; embedded `<FormAlertsCard />` unchanged.
- University: `GET /api/portal/training?all=true&requestedBy=`, `POST
  /api/portal/training` (create), `PUT /api/portal/training/:id`
  (`togglePublish`, `saveEdit`), `DELETE /api/portal/training/:id
  ?requestedBy=` — `useTrainingUpload` hook unchanged; delete confirm copy
  keeps the real "This also removes the uploaded file" warning.
- Role gates exactly as today per page (see B-6/Sanctioned deviations) —
  unchanged.
- Existing test/route expectations for all of the above keep passing
  unmodified.

## Verify loop (mandatory)

1. Codex implements. Gates: `npx tsc --noEmit`, targeted eslint (files
   changed in this slice only), `npm run build`, `git diff --check`.
2. Signed-in Playwright session on `:3000` (admin role for all 8 pages;
   also test operations role on the pages it can reach — users/[id],
   email-templates, university — to confirm B-7 is not widened), dark mode
   (`localStorage['3c-theme']='dark'`). Before judging any screenshot,
   spot-check one changed element's computed style against the source
   (stale-dev-server guard — see `project-stale-dev-server-css` memory): if
   computed styles don't match source, kill the node child on `:3000`,
   delete `.next`, cold-start, and re-screenshot.
3. Screenshot the implementation at 1440px AND 390px covering: People
   (toolbar, needs-a-decision strip, list with an open delete confirm-strip,
   both empty states), Person (both column stacks, locked vs editable
   fields, manager picker open, vault reveal two-step, sticky save bar
   visible), Catalog on all 4 real pages (grid + inline editor + confirm-
   strip open, at least email-templates and university since they change
   the most), and Settings (all 3 section cards showing inert controls +
   "Not wired up yet" notes, danger room with both reset cards' typed-RESET
   inputs visibly disabled).
4. Numeral integrity: confirm no glyph chopped on any edge for every hero
   numeral, at both 1440 and 390 — explicit check every round.
5. Computed font-weight check on every display heading — explicit check
   every round.
6. `scrollWidth` check at 375px confirming no horizontal scroll on all 8
   pages (People's own list container is exempt per its own
   `overflow-x:auto`, the page body is not).
7. Fresh Opus reviewer diffs every screenshot against
   `design-mockups/admin-round1/option-1-the-roster.html` (rendered, per
   view) and this contract's sanctioned-deviations/OPEN CALL resolution;
   every visual difference not on the sanctioned list is a defect.
8. Behavior verification: confirm SSN/DL reveal only reachable via the
   real audit-logged flow; confirm no Settings control persists anything
   or shows a fake "Saved"/reset-confirmed state; confirm B-7 is not
   widened (operations still cannot see the Users nav link, role
   dropdown options unchanged); confirm role gating per page matches
   today exactly (B-6 preserved, not unified); confirm all 4 Catalog pages
   render via `AdminCatalogList` with zero regressions in their real field
   sets and real auth patterns.
9. Regression verification: users approve/accept/status-change/delete
   still write correctly; UserForm create/edit still call the correct
   real endpoints; email-templates/chat-channels/form-options/university
   saves and deletes still call their correct real endpoints with
   unchanged payload shapes; sensitive reveal still audit-logs correctly.
10. Codex fixes; repeat with a FRESH reviewer until PASS (zero unsanctioned
    diffs, zero clipped numerals, zero broken entry points/regressions,
    zero fake-persisted Settings state). Commit locally only. Push only on
    the user's explicit "deploy".

## Orchestrator rulings (BINDING — pre-made, resolve the load-bearing calls)

1. **Fake settings page → honest-inert treatment.** Ships the mockup's
   per-section layout; any control with no real handler today renders
   visibly INERT (disabled + "Not wired up yet" note) — notification
   toggles, both Reset buttons, and the fake global/per-section save all
   included, since no section currently has real persistence. No fake
   "Saved" tick, no typed-RESET flow wired to nothing. Real persistence
   and reset endpoints are explicit follow-up work, out of this round.
2. **Security hazard B-7 (operations can reach user-edit by URL and grant
   any role) is NOT fixed this round** — role-logic changes are out of
   campaign scope — but the redesign MUST NOT WIDEN it: no new nav links
   exposing Users pages to operations, role dropdown options unchanged, no
   guard softened. Reported to the user separately as a security-fix
   candidate.
3. **B-6 gating inconsistency: preserve each page's existing gate exactly
   as-is** (including settings' bespoke `isRole` denial card — restyle
   the card, keep the logic). No unification this round.
4. **Email-templates delete gets the mockup's inline confirm-strip** (a
   pure-UI defect fix the mockup itself specs — sanctioned). All 4
   delete/remove-confirm styles standardize onto the mockup's confirm-strip
   pattern across the catalog-pattern pages.
5. **Manager picker: name-search picker replacing the raw Manager ID
   input, backed by the EXISTING `GET /api/portal/auth/users` endpoint**
   (no new route needed). Writes the same field it does today.
6. **Vaulted SSN/DL two-step reveal in Person view: reuse the EXISTING
   audit-logged reveal flow/endpoint exactly** (`/api/portal/admin/
   sensitive/[uid]` + `sensitiveAccessLog`). The mockup's two-step UI is a
   reskin of that flow. Never bypass or duplicate the audit write.
7. **People view's pending-approvals strip: real pending-signups data**
   (same source the dashboard count uses). **Catalog adoption: chat-
   channels, form-options, university content admin all adopt the catalog
   pattern THIS round** (they're in the 8-page scope).
8. All standard campaign hard rules verbatim (preflight font-weight,
   no-Georgia numerals, metallic anti-clip 1440/390, plain-number counts,
   dark 1:1 + light coherent, reduced-motion, `admin-line-*` CSS namespace
   appended with all other sections frozen, leaderboard untouched, real 3C
   logo rule, shared primitives restyled at callsite only, every hazard
   B-n resolved or OPEN CALL) — folded into HARD RULES above.

## Orchestrator ruling on OPEN CALL 1 (FINAL, binding)

**OPEN CALL 1 — squared cards + non-Archivo H1: SHIP AS SPEC'D.** The
Roster was approved by the user across all four views ("all the way
through", no mix); its zero-radius cards and its own H1 stack are the
approved design, per the Member-round precedent (mockup's own stack is
kept when internally consistent). Do NOT swap in `rounded-lg` or
`.portal-display`. Scope note: the squared/hard-edge treatment applies
ONLY inside the `admin-line-*` namespace — never leak resets that
square off cards elsewhere in the portal.

**Lime hex (drafter's build note → now BINDING):** do not introduce the
mockup's literal `#a3e635` as a second lime. Before styling, check
globals.css for the lime value the shipped dark pages already use and
reuse that token/value exactly.
