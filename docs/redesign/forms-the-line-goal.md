# Forms "The Line" — Visual Parity Goal Contract (DRAFT)

User picked the mockup `the-line-forms-final.html` for the Forms area. Same
contract style as `calls-the-line-goal.md` / `chat-the-line-goal.md` /
`shell-the-rail-goal.md`: implementation is verified 1:1 against the mockup
by independent reviewers until EXACT — not close enough.

This round is bigger than a single-page reskin: (1) a NEW Forms hub page
listing all 5 native forms, (2) one shared fill-page pattern applied to ALL
5 forms (fiber-report, expedite-order, payroll-dispute, leads-request,
manager-interview) — each with its own real field inventory, not a literal
copy of the mockup's single demo form, (3) the two transitional nav flips
promised in `shell-the-rail-goal.md`.

## Source of truth

- Mockup: `design-mockups/forms-round2/the-line-forms-final.html` (two
  toggled views inside one file: "Forms home" = hub, "Form fill" = the
  shared fill pattern, demoed only against Payroll Dispute's shape).
- The mockup wins on any visual ambiguity not resolved by the sanctioned
  deviations below.
- Extraction reference (factual detail on both the mockup and the current
  implementation): Codex read-only audit, summarized into Part A/B below.
- Shell precedent: `shell-the-rail-goal.md` — its transitional notes are
  quoted verbatim in "Nav flips" below; this slice discharges that
  transition, it does not re-litigate the shell itself.

## Hub route — DECIDED

`/portal/forms` at `src/app/portal/forms/page.tsx`. No page exists there
today (extraction B-1); the path is free and matches the mockup's own
implied naming. Binding, not an open call.

## Composition — Hub view ("Forms home")

Mockup masthead (`3C WORLD GROUP / THE LINE` brand mark + "Forms
broadcast · America/Chicago") is prototype chrome standing in for the real
shell — **it does not ship**. The page renders inside the real
`PortalHeader`/`PortalSidebar`/`MobileBottomNav` from the Shell contract;
implementation starts at the command band.

1. **Command band**: eyebrow `03 / The Line / forms broadcast`, headline
   `<N> forms on the board.` (count + "forms" lime), intro sentence, top-
   aligned right-side metallic hero numeral (real count of forms the
   signed-in user can access) with caption `forms available` / `the line is
   open`.
2. **Forms summary strip**: 3-column grid, hairline-divided — `Forms
   available` (count), `Guided routes` (count), `Manager only` (count) —
   see "Real data mapping" below for what each count actually derives from.
3. **Form list**: section header (eyebrow `Priority ordered / next request`
   / title `Choose your lane` left, `Five forms / ready to open` right),
   then 5 numbered rows (01–05), one per real form, in the mockup's fixed
   order: Fiber Report, Expedite Order, Payroll Dispute, Leads Request,
   Manager Interview.
4. **Row anatomy** (exact, per extraction A-5): number circle (29px, lime
   outline) → 17px lime stroke icon → title (14px, weight 900) + description
   (9px mono, muted) → audience/meta block (bold label line + uppercase mono
   description line) → `Open form` pill CTA (lime outline, lime-fill on
   hover) → chevron. Only the CTA is the click target per the mockup — but
   see **OPEN CALL 3** on whether the whole row also becomes clickable
   (mockup convention says CTA-only; campaign has not needed a ruling on
   this before since prior list pages used full-row click).
5. **Footer**: left `Open the lane. Leave the signal clear.` (ships as-is,
   it's tone copy, not data); right side is mockup-only chrome
   (`Representative fill: Payroll Dispute · static demo data`) — does not
   ship, see deviations.

## Composition — Fill view ("Form fill")

Shared pattern applied per-form; only Payroll Dispute's exact field set is
spec'd in the mockup (extraction A-6/A-7). The other 4 forms reuse the
**structural** pattern with their **own** real fields — see **OPEN CALL 1**
and **OPEN CALL 2** for how the flagship picker and section count
generalize.

1. **Fill header**: `← Back to forms` control (returns to hub, in-app
   navigation not a full page reload) → fill title (34px, uppercase, real
   form name) → right metadata (`Representative fill / lane <NN> of 5`,
   real 1-of-5 index per the hub's fixed order) — `Static demo data` label
   does NOT ship (see deviations).
2. **Fill body**: desktop 2-column grid (form column `1fr` + 185px right
   rail, 29px gap), each section: lime numbered eyebrow (`Section 01 / Who
   you are`, etc.) + form grid (2 equal columns, full-width fields span
   `1/-1`).
3. **Identity line**: `Submitting as <real signed-in name> · <real role
   label>` — replaces mockup's "Marcus Chen · Field contractor" with the
   authenticated user's actual display name and a role label appropriate to
   the signed-in user (not a hardcoded "Field contractor" string).
4. **Segmented choice-picker with dependent sub-row** (flagship pattern,
   spec'd exactly per extraction A-7): group label → N-column button grid of
   primary choices (`aria-pressed`, lime selected state) → dependent sub-row
   (lime left border, second-tier buttons) → summary text line → two hidden
   inputs mirroring the visible selection. See **OPEN CALL 1** — Payroll's
   real schema has no second tier, so this exact two-level shape needs a
   resolution before implementation.
5. **Proof / signature / conditional sections**: per-form content — file
   drop-zone (Payroll, Leads' 3 slots), textarea (Expedite), signature pad +
   rating + yes/no selects (Manager Interview), or no section 03 at all
   (Fiber Report has no upload and no required fields) — see **OPEN CALL
   2**.
6. **Action row**: `Preview success state` demo-only link does NOT ship
   (mockup dev affordance); primary submit button `Submit <verb> →` (verb
   matches the form: dispute / report / request / order / interview).
7. **Success state**: lime-bordered panel, circular check, heading, message
   — see **OPEN CALL 4** for whether a real reference id is shown.
8. **Right rail**: `Route status` / `Review note` / `Representative fill`
   labels stay as structural chrome; values become real per-form copy (see
   deviations) — `static demo data` value does NOT ship.

## Desktop / mobile reflow (exact mockup breakpoints)

Per extraction A-9, this mockup's breakpoints are **800px and 460px** —
different from Calls' 760/430. Use the mockup's own values.

### `max-width: 800px`
Command-top becomes block; hero numeral left-aligns, 28px top margin;
headline `clamp(36px,10.5vw,54px)`; signal strip becomes 2 columns (3rd
signal spans both); hub rows become `33px 22px minmax(0,1fr) 15px` / 8px
gap / 73px min-height / 8px vertical padding, with audience moving to
column 3 row 2, CTA to column 3 row 3 (left-aligned), chevron to column 4
row 1; fill body becomes 1 column, 22px gap; form rail swaps left border
for a 15px-padded top border; fill header top-aligns; fill metadata max-
width 175px.

### `max-width: 460px`
Shell horizontal padding 12px; view-switch repositions (mockup-only, not
shipped — see deviations); masthead irrelevant (not shipped, see above);
command top padding 35px; intro 12px; hero numeral 103px; signals 88px
min-height/12px padding/20px value/8px label+note; section header top-
aligns, metadata max-width 125px; hub rows `27px 20px minmax(0,1fr) 13px` /
7px gap, number circle 25px/9px text, title 12px, description+audience 8px,
CTA 8px/7px-8px padding, chevron 13px; fill header block layout, metadata
10px top margin left-aligned; fill title 30px; form grid 1 column, full-
width fields stop spanning; choice grid 2 columns/6px gap, choice buttons
10px 6px padding/9px font; dependent sub-row 2 equal columns/12px left
padding, period buttons 5px horizontal padding/8px font; action gap 8px,
primary button 10px 10px padding/8px font; footer stacks 8px gap; metallic
numeral right padding/margin reset to zero.

No horizontal scroll anywhere at any width (campaign rule).

## Design tokens (exact, from mockup)

```css
--stage: #030916;
--panel: #0a1f44;
--ink: #e7edf4;
--muted: #9caabd;
--lime: #a3e635;
--line: rgba(231,237,244,.15);
--soft: rgba(231,237,244,.08);
--metal: linear-gradient(180deg,#fff 0%,#dbe4ed 38%,#7f8c9b 80%,#f5f7f8 100%);
--amber: #efc46f; /* declared, unused in the rendered mockup — do not invent a use */
```

System font stack for body/labels; `ui-monospace, Consolas, monospace` for
numerals/metadata/kickers, uppercase with letter-spacing. Hero numeral
(`.display`): `clamp(70px,9vw,120px)`, weight 900, line-height `.78`,
letter-spacing `-.13em`. Summary strip numerals (`.signal-value`): 23px,
weight 900, line-height `.8`, letter-spacing `-.08em`. Both use the same
metallic gradient + `background-clip:text` treatment. Fill title 34px,
line-height `.88`, letter-spacing `-.08em`, uppercase — no explicit weight
in the mockup (Hard Rule 2 applies). Hub H2 ("Choose your lane") 23px,
letter-spacing `-.06em`, uppercase, no explicit weight (Hard Rule 2
applies). New forms-specific rules should be namespaced `forms-line-*` in
`globals.css` alongside existing `.portal-*` conventions, not scattered
inline styles.

## Numeral clipping fix (carry over exactly)

Both the hero numeral (`.display`) and the summary-strip numerals
(`.signal-value`) use the **same** paint-area fix: `padding: .25em .13em 0
0` + `margin: -.25em -.13em 0 0` — i.e. the shared `.portal-metallic-num`
class already in `globals.css`. Unlike Calls (which had a second,
non-padding clipping strategy for its card clock numeral), Forms has only
this one numeral treatment — use `.portal-metallic-num` for both instances,
verify empirically at 1440 and 390 regardless. At ≤460px the mockup drops
right padding/margin to zero while keeping the top paint-area fix — replay
that exactly.

## Real data mapping (what each mockup number/string becomes)

- **Forms available / hero count**: real count of forms the signed-in user
  can actually open (4 for regular reps, 5 for users who also pass the
  Manager Interview gate) — not the mockup's static "5".
- **Guided routes**: forms with structured (non-freeform) required fields
  — recommend counting the 4 non-Fiber-Report forms (Fiber Report has zero
  required fields per extraction B-3.1), but this is cosmetic copy, not
  security-relevant; implementer may pick a reasonable definition and note
  it, since the mockup itself doesn't define "guided" precisely.
- **Manager only**: count of forms gated to management roles today — that's
  1 (Manager Interview), matching the mockup's static "1" by coincidence,
  but must be computed from real role gates, not hardcoded.
- **"All lanes are live" / "Payroll includes proof" / "Final interview +
  signature"**: these are per-card supporting notes, not measured metrics —
  ship as static tone copy (they describe real, stable facts about the
  system: all 5 routes are live, Payroll does accept a screenshot, Manager
  Interview does end in a signature) — no live data source needed, extraction
  B-4 confirms this is acceptable as long as the underlying facts stay true.
- **Row order/content**: per extraction A-5's exact hub card content (title,
  description, audience, meta) ships verbatim per form — this is
  hand-authored marketing-style copy the mockup already wrote correctly for
  all 5 forms, not demo placeholder text. Audience labels reflect real
  gating: Fiber Report/Leads Request "Field reps", Expedite Order "Reps +
  managers", Payroll Dispute "All contractors", Manager Interview "Managers
  only".
- **Fill view identity line**: real signed-in user's display name + role
  label (not "Marcus Chen · Field contractor").
- **Fill view "lane N of 5"**: real 1-indexed position in the hub's fixed
  5-form order.
- **Campaign/period/order-type/reason values**: per-form real option lists
  (see per-form deviations below) — never the mockup's Fiber/Mobile/
  Internet/TV or New-fiber-sale/Upgrade/Reconnect demo values.

## Per-form sanctioned deviations (field inventory — from extraction B-3)

- **Fiber Report** (`fiberReports`, all fields optional server-side, no
  upload): `companySold` (select, options.providers), `dateKnocked`
  (text, MM/DD/YYYY placeholder), `packNumber`, `numberOfReps`,
  `doorsKnocked`, `customerContacts`, `numberOfSales`, `orderNumber`. No
  field is required — see **OPEN CALL 2** on how the 3-section/required-
  marker pattern applies when nothing is actually required.
- **Expedite Order** (`expediteOrders`): `customerName`* , `customerPhone`*,
  `customerEmail`, `address`/`city`/`state`/`zip` (state/zip validated only
  if present), `orderNumber`*, `expediteDates`* (textarea, not a date
  input — real field is free text up to 300 chars, not the mockup's
  `install date` date-picker convention), `reason`* (select, must exactly
  match `options.expediteReasons`). (* = required.)
- **Payroll Dispute** (`payrollDisputes`): `contractorName`*,
  `contractorEmail`*, `campaign`* (select, must exactly match
  `options.payrollCampaigns` — real values are T-Fiber, Frontier, AT&T,
  Verizon, Brightspeed, Centurylink/Quantum, Ripple, with admin overrides;
  NOT the mockup's Fiber/Mobile/Internet/TV), `typeOfOrder`* (free text,
  NOT the mockup's 3-option enum), `dateOfInstall`* (free text, MM/DD/YYYY
  placeholder), `orderScreenshotPath` (optional server-side despite the
  mockup marking proof required — one upload slot,
  `form-attachments/{uid}/payroll-dispute/`).
- **Leads Request** (`leadsRequests`, the most complex form — long
  conditional form per the mockup's own hub meta line): `campaign`*
  (select), `managerName`* (select), `managerEmail`* , `repFirstName`*,
  `repLastName`*, `location`* (select), `category` (optional,
  `LEADS_CATEGORIES`), `reason` (optional, `LEADS_REASONS`), plus
  conditional-on-selection fields: `specialRequest` (Location = "Special
  Request"), `leadPackCode` (3 specific categories), `situationDescription`
  (hostile/blind-knock reasons), `hostileUploadPath` /
  `blindKnockUploadPath` / `lassoUploadPath` (3 separate upload slots, each
  conditional on a different reason/category value), `newRepPhone` /
  `newRepEmail` (conditional on a new-rep reason/category). Conditional
  show/hide logic is re-derived server-side (`leadsConditions`) — inactive
  fields are dropped even if submitted. See **OPEN CALL 2** on where this
  much conditional surface fits inside the mockup's fixed 3-section shape.
- **Manager Interview** (`managerInterviews`): `provider`*, `jobPosition`*
  (select, `options.hireJobPositions`), `hiringManager`*, `hiringManagerEmail`*
  (real email-shape check applies — this form is the only one with real
  server email validation), `candidateFirstName`*, `candidateLastName`*,
  `candidateEmail`* (real email-shape check), `market`* (select — starts
  empty until an admin configures markets; submission is blocked until
  then, this is existing behavior, not a redesign bug), `didShow`*
  (Yes/No), `extendOffer`* (Yes/No), `rating` (1–5), plus
  promotion-only fields (`completedProduction`/`completedReading`/
  `completedTeamMetric`, shown only when `jobPosition` ≠ "Account
  Executive"), and `signatureDataUrl`* (PNG data URL via
  `SignaturePad.tsx`, ≤200KB decoded — this form has NO file drop-zone,
  its "proof" section is a signature capture, not the mockup's upload
  widget).

## Sanctioned deviations (structural / cross-cutting)

- **Mockup masthead does not ship.** Real `PortalHeader`/`PortalSidebar`/
  `MobileBottomNav` render instead (Shell contract already ships this).
  Command band is the first real element on the page.
- **View switch (`Forms home` / `Form fill` fixed pill) does not ship.**
  It's the mockup's own internal demo toggle between its two states; the
  real app already has two real routes (`/portal/forms` hub, per-form fill
  pages) — no floating dev control ships.
- **`Static demo data` labels, `Preview success state` link, and the hub
  footer's "Representative fill: Payroll Dispute · static demo data" line
  do NOT ship** — all three are mockup dev/demo affordances with no real
  counterpart.
- **Real submission flow preserved exactly per form**: existing
  `auth.currentUser.getIdToken()` → `POST` with Bearer token → saving
  state → done/reset-to-empty on success → inline error banner on failure
  (extraction B-4) restyled into the mockup's action-row/success-panel
  visuals. Do not replace with a new client architecture.
- **Success messaging stays honest.** The mockup's `Dispute received ·
  ticket PAY-2048` and `Typical response: one business day` are demo-only
  (extraction B-18) — the real API returns a Firestore doc id, not a
  ticket number, and makes no SLA promise. Ship per-form real success
  copy (e.g. "Report submitted." / "Request submitted." matching each
  page's existing banner text, extraction B-4) restyled into the mockup's
  panel, with the specific `Dispute received · ticket ####` framing
  dropped unless **OPEN CALL 4** resolves toward showing a real reference.
- **File upload widget stays the real `FileUpload.tsx`**, restyled to the
  mockup's drop-zone visual (dashed lime border, diagonal stripe texture,
  "Drop a screenshot or PDF here" copy) rather than replaced — preserve its
  idle/uploading/uploaded/error states, client-side downscale-over-cap
  behavior, and lightbox preview (extraction B-5). Real limits ship: **4MB
  max** (not the mockup's "10 MB max" — fix the displayed copy to match
  real validation), real MIME list `image/jpeg, image/png, image/webp,
  image/heic, image/heif, application/pdf` (broader than the mockup's
  png/jpeg/pdf-only copy — update the displayed hint text to match).
  Screenshot stays optional server-side for Payroll even though the
  mockup's label marks it with the required-field dot — drop the required
  dot for this field to avoid promising client-side enforcement the server
  doesn't apply.
- **No drafts/autosave.** Do not add a "Saved" indicator or imply
  refresh-safe recovery (extraction B-19) — this is a genuine capability
  gap, not a copy-only fix.
- **Loading/auth/permission/error states preserved, restyled.**
  `ProtectedRoute` loading behavior, saving-disabled submit buttons, API
  error banners (red border/bg/text), and option-loading fallback
  (`useFormOptions`) all keep working exactly as today (extraction B-11) —
  the mockup shows none of these, they must be added into the new visual
  frame, not dropped.
- **Role gating unchanged.** Fiber/Expedite/Payroll/Leads stay
  `ProtectedRoute` with no explicit roles + server `requireVerifiedUser`
  (token + users-doc match only, no `status==active` enforcement despite
  the helper's comment — extraction B-12, an existing gap, not something
  this slice fixes). Manager Interview keeps its existing page-role list
  (admin/operations/l1_manager/l2_manager/ibo_level_1–4) and server
  `requireVerifiedFieldManagerOrManagement` (which also accepts
  general_manager/office_manager, and does NOT include `gm_in_training`
  despite the page/palette role lists listing it — extraction B-13, see
  **OPEN CALL 5**).
- **Uploads stay Admin-SDK-only, exact-folder-scoped.** No client Storage
  writes, no public URLs, no arbitrary user-supplied paths (extraction
  B-15). Admin attachment viewing stays management-only via 15-minute
  signed URLs (extraction B-16) — do not change the review-side access
  boundary as part of this rep-facing reskin.
- **In-portal + Postmark alerts unbroken.** `notifySubmission(formKey,
  gate.name)` fires after every successful write exactly as today, keyed
  off the same 5 `formAlerts/{key}` toggle documents, same admin/operations
  recipient set, same review-link targets (extraction B-6) — do not rename
  keys, bypass the call, or let email failure block submission.
- **SSN/DL# encrypted-at-rest flow is completely untouched.** It lives in
  the separate onboarding flow (`userSensitive/{uid}`, AES-256-GCM,
  admin-only reveal, audit-logged) and has no overlap with these 5 forms
  (extraction B-14) — this contract does not touch it; called out per
  ANCHOR.md §9 lock and campaign hard rule for completeness.
- **Admin review pages (5 separate `/portal/admin/*` routes) are untouched**
  and stay separate from the rep hub (extraction B-23) — `ReviewList.tsx`,
  the 5 review pages, and their nav entries are out of scope.
- **gm_in_training role mismatch**: preserved as-is, not fixed in this
  slice (see **OPEN CALL 5**).
- Light theme must keep working via the portal `ThemeContext` (dark is the
  1:1-verified target per campaign rule; light needs to be coherent, not
  verified 1:1).
- lucide-react icons replace the mockup's inline SVGs (same glyph intent)
  — Fiber Report (document/report), Expedite Order (document/order),
  Payroll Dispute (document + lines), Leads Request (three request lines),
  Manager Interview (shield/check).
- Animations/transitions skipped under `prefers-reduced-motion` (respect
  the exemption pattern in `globals.css` `@layer base`); the mockup's
  300ms "rise" reveal on `.command`/`.signal-strip`/`.line-list`/`.fill`
  is disabled under reduced motion per its own rule, consistent with the
  campaign pattern.
- No route changes to the 5 existing form routes' underlying data/API
  contracts, no Firestore/data-shape changes (ANCHOR.md §1/§2) — this is a
  visual reskin + a new hub landing page, not a backend change.

## Nav flips (from `shell-the-rail-goal.md`, discharged by this slice)

Quoted from the shell contract's transitional notes:

> Forms: today's 5 form links (Fiber Report, Expedite Order, Payroll
> Dispute, Leads Request, Manager Interview w/ its role list).
> TRANSITIONAL: collapses to the single "Forms" hub link when the Forms
> page ships.

> Bottom bar slot 4 = Leaderboard until the Forms hub exists (mockup showed
> Forms); label "Leaderboard" may truncate to "Board" as today.

This slice ships the Forms hub, so both flips execute now:

- **`portalNavGroups` Forms group** (in `CommandPalette.tsx`, consumed by
  `PortalSidebar` and `MobileBottomNav`'s More sheet — extraction B-9)
  collapses from 5 direct links to one entry: `Forms` → `/portal/forms`.
  The 5 individual routes still exist and are still reachable — from the
  hub's row CTAs — they are simply no longer separately listed in the nav
  config. Manager Interview's role gate does not need to survive in the nav
  config once it's not a standalone nav item — the hub itself must apply
  the equivalent gating to whether/how the Manager Interview row renders
  (see **OPEN CALL 3**).
- **Mobile bottom-bar slot 4** changes from Leaderboard to Forms, href
  `/portal/forms`, per the shell contract's own stated plan. Leaderboard
  remains reachable via the sidebar/More sheet — it is not removed from
  the app, only from the fixed 5-slot bar. This nav-config edit is
  sanctioned; no Leaderboard page/component file is touched (campaign hard
  rule — Leaderboard is deployed, never edit `src/components/leaderboard/**`
  or `/portal/leaderboard`).
- **CommandPalette** automatically reflects the collapsed group once
  `portalNavGroups` changes (extraction B-9) — verify it shows one
  searchable "Forms" destination, not five, and that the 5 admin review
  destinations are unaffected.
- **QuickActions** has no existing form links (extraction B-9) — no change
  required there.
- **Admin navigation** (5 separate review links under Operations) is
  explicitly NOT collapsed — the nav flip is scoped to the rep-facing group
  only (extraction B-9 confirms, campaign hard rule below reinforces).

## OPEN CALL 1 — Segmented-picker generalization (flagship pattern)

The mockup specs a **two-level** picker exactly once: primary choice
(Fiber/Mobile/Internet/TV) → dependent period sub-row (July/June/May 2026)
→ two hidden inputs + summary text. Real Payroll Dispute's `campaign` field
is a **single-level** select against `options.payrollCampaigns` (T-Fiber,
Frontier, AT&T, Verizon, Brightspeed, Centurylink/Quantum, Ripple) with no
"period" concept anywhere in the schema (extraction B-6/B-7). Options:

- **(a)** Ship the picker as a single-level segmented control (primary
  choice buttons only, styled exactly per the mockup's first tier) for
  `campaign`, and drop the dependent sub-row entirely for Payroll — the
  visual pattern still reads as "flagship," just without a second tier that
  has no real data to represent.
- **(b)** Keep the two-level shape but repurpose the second tier for a real
  field that has a genuine parent/child relationship — no such field
  exists in Payroll's real schema today (checked: `typeOfOrder` is free
  text, `dateOfInstall` is free text, neither depends on `campaign`) — this
  option would require inventing a UI relationship the data doesn't have,
  which conflicts with "recompose, don't fabricate."
- **(c)** Reuse the two-level shape on a form that DOES have a real
  parent/child pair — Leads Request's `category`→conditional-field
  relationships are the closest real analog (e.g. category selection
  determines which upload slot or contact field appears) — apply the
  flagship picker there instead of Payroll, and give Payroll the simpler
  single-level treatment from (a).

Recommendation: **(a)** for Payroll (simplest, no fabrication), and
separately evaluate **(c)** for Leads Request's category/reason selects
under OPEN CALL 2 since that form's conditional complexity is the real
candidate for a multi-tier picker. Needs orchestrator sign-off since this
changes the flagship pattern's shape from the literal mockup.

## OPEN CALL 2 — Section-count/shape across 5 structurally different forms

The mockup's fixed "01 Who you are / 02 What happened / 03 Proof" shape was
authored against Payroll Dispute specifically. The other 4 forms don't fit
cleanly:

- **Fiber Report** has zero required fields and no upload — a "Proof"
  section and required-field dots (`●`) have nothing to attach to.
- **Expedite Order** has a 4-field address block (optional) plus 3 required
  fields (`orderNumber`, `expediteDates`, `reason`) and no upload — fits
  loosely into 2 sections, no natural "Proof" section.
- **Leads Request** has 8 core fields plus up to 7 conditional fields and
  3 separate upload slots depending on which reason/category is picked —
  meaningfully more complex than the mockup's fixed 3-section shape.
- **Manager Interview** has 13 fields including 3 promotion-conditional
  booleans, a 1–5 rating, and a signature pad instead of a file drop-zone.

Options:

- **(a)** Keep exactly 3 sections everywhere, relabeling contents loosely
  to fit ("Section 03" becomes "Proof" for Payroll/Leads, "Signature" for
  Manager Interview, is dropped/merged into Section 02 for Fiber Report and
  Expedite Order which have nothing proof-like) — maximizes visual
  consistency across all 5 fill pages, at the cost of some sections feeling
  empty (Fiber) or overcrowded (Leads' conditional fields all crammed into
  Section 02).
- **(b)** Let section count/labels flex per form's real shape (2 sections
  for Fiber Report and Expedite Order, 3 for Payroll, 4 for Leads Request
  splitting conditional fields into their own section, 3 for Manager
  Interview with "Signature" replacing "Proof") — keeps the numbered-
  eyebrow/lime-index visual language identical but lets structure follow
  data instead of forcing a uniform shape.

Recommendation: **(b)** — the section pattern (lime index + eyebrow +
2-column grid) is what makes this feel like "the shared pattern," not the
literal count of 3; forcing Fiber Report to invent a Proof section it
doesn't have would violate "recompose, don't fabricate," and Leads
Request's real complexity is exactly the kind of case the campaign has
handled before (see Calls' OPEN CALL resolutions) by following the data
rather than the mockup's single demoed instance. Needs orchestrator
sign-off since it's a generalization decision, not a literal 1:1 port.

## OPEN CALL 3 — Manager Interview hub-card gating for unauthorized viewers

Extraction B-22: the mockup's "Managers only" audience label on the
Manager Interview card is copy, not enforcement. For a signed-in rep who
does NOT pass the Manager Interview role gate, options:

- **(a)** Hide the row entirely from the hub list for ungated users (hub
  shows 4 rows, "Forms available" count reflects 4).
- **(b)** Show the row but visually locked (dimmed, no CTA, or CTA that
  explains the gate) — hub always shows 5 rows regardless of role.
- **(c)** Show the row with a working CTA that navigates to
  `/portal/manager-interview`, relying entirely on that page's own
  `ProtectedRoute` role check to bounce/block — matches today's
  `portalNavGroups` behavior where the item was already role-filtered
  before reaching the sidebar.

Recommendation: **(a)** — matches how `portalNavGroups` already filters
items by role before rendering today (extraction B-9), keeps the hub's
"Forms available" count honest (a rep literally has 4 forms available, not
5-with-a-locked-one), and avoids building new lock-UI the mockup never
designed. Needs orchestrator sign-off since it determines whether the hub
row count is role-dependent (visible complexity) or fixed-5-with-lock-state
(closer to literal mockup fidelity).

## OPEN CALL 4 — Success-state reference number

Extraction B-18: mockup shows a fake ticket (`PAY-2048`); real API returns
a Firestore document id (currently unused/undisplayed) and makes no SLA
promise. Options:

- **(a)** Show no reference at all — success message states what happened
  in plain language only ("Dispute received. We'll review the proof and
  follow up by email."), no id, no promise.
- **(b)** Surface the real Firestore doc id as a short reference string
  (e.g. "Reference: {id}") — this is real, already-returned data
  (derived-only, no new API), consistent with the campaign's "recompose
  don't fabricate" pattern (same reasoning Calls used to justify its
  countdown feature).

Recommendation: **(b)** — the API already returns the id in its response;
surfacing it costs nothing new and gives reps something concrete to
reference if they follow up, which is strictly better than the mockup's
fabricated PAY-2048 without inventing new backend behavior. Needs
orchestrator sign-off since Firestore ids are long/ugly (auto-generated,
not human-friendly like "PAY-2048") — worth confirming the raw id is an
acceptable substitute for a formatted ticket number, or whether (a) reads
cleaner.

## OPEN CALL 5 — `gm_in_training` role mismatch

Extraction B-13: Manager Interview's page-side role list and
`CommandPalette` role list both include `gm_in_training`, but the server
gate (`MANAGEMENT_FIELD_ROLES` via
`requireVerifiedFieldManagerOrManagement`) does not — a `gm_in_training`
user today would see the nav entry/page but get rejected on submit.
Options:

- **(a)** Leave the mismatch exactly as-is — this is a pre-existing bug
  unrelated to the visual reskin; fixing it is a role-logic change, which
  ANCHOR.md §5 explicitly disallows without separate approval ("changing
  routes, route data, API contracts... or role logic" is not allowed under
  the redesign's latitude).
- **(b)** Fix it now since the hub-row gating logic (OPEN CALL 3) already
  requires touching "who can see the Manager Interview row" — cheap to
  align while already in that code path.

Recommendation: **(a)** — ANCHOR.md's non-negotiables explicitly forbid
role-logic changes as part of this redesign; a hub-visibility decision
(OPEN CALL 3) reads the existing role predicate, it doesn't need to fix it.
Flagging because the code will be looked at anyway and it would be easy to
"accidentally" fix in passing — that must not happen without an explicit
approval outside this contract.

## HARD RULES (campaign-wide, binding)

1. **Big numerals never clipped.** The hero numeral, the 3 summary-strip
   numerals — ALL use the shared `.portal-metallic-num` class (see
   "Numeral clipping fix" above). Verify at 1440 AND 390, no glyph chopped
   on any edge. User-mandated — numbers have been repeatedly cut off on
   this campaign.
2. **Tailwind preflight resets h1–h6 to font-weight 400.** Every display
   heading — hub `h1` headline, hub `h2` "Choose your lane" (extraction
   B-21 explicit), fill `h2` title, section labels relying on
   `strong`/bold semantics in the success heading — MUST declare
   `font-weight` explicitly. Verify computed weight in-browser for each.
3. **Counts render as plain numbers.** Hero count, summary-strip values
   (Forms available / Guided routes / Manager only), "lane N of 5" — no
   leading zeros. The row numbering chrome (`01`–`05`) and section index
   chrome (`Section 01` / `Section 02` / `Section 03`) are design chrome
   and DO keep their literal zero-padded mockup format — they are not
   data-driven counts.
4. **Big metallic hero numeral is top-aligned with the headline** — the
   mockup's `.hero-number` `padding-top: 31px` desktop behavior must be
   preserved exactly, verify visually.
5. **Dark theme via `localStorage['3c-theme']`** is the 1:1-verified
   target; light mode must stay coherent and working.
6. **Reduced-motion**: the "rise" reveal animation and any hover/focus
   transition must use the campaign's exemption pattern in `globals.css`
   `@layer base` (see `project-reduced-motion-gotcha` memory — Windows
   reduce-motion freezes all animations unless exempted correctly; test
   against the full compiled CSS, not source).
7. **File scope.** Touch only:
   - `src/app/portal/forms/page.tsx` (new hub page)
   - `src/app/portal/fiber-report/page.tsx`
   - `src/app/portal/expedite-order/page.tsx`
   - `src/app/portal/payroll-dispute/page.tsx`
   - `src/app/portal/leads-request/page.tsx`
   - `src/app/portal/manager-interview/page.tsx`
   - Any new components extracted specifically for this slice's shared fill
     pattern, if placed under a `src/components/forms/**` subdirectory
     created for this slice (e.g. a shared `FillSection`, `ChoicePicker`,
     hub `FormRow` component) — reuse `src/components/forms/SignaturePad.tsx`
     as-is, do not fork it.
   - `forms-line-*` styles added to `globals.css` (namespaced, alongside
     existing `.portal-*` conventions)
   - `src/components/portal/CommandPalette.tsx` — ONLY the `portalNavGroups`
     Forms group definition (collapse to 1 entry) and `mobileSlotItems`
     slot 4 (Leaderboard → Forms), nothing else in that file.
   - **Zero edits outside this list.** No edits to any `src/app/api/portal/
     forms/**` route, `src/lib/forms/**` (submitForm, notifySubmission,
     resolveFormOptions, formOptionsRegistry, formOptions, reviewQuery,
     formUploads, managerInterview, leadsPredicates), any
     `src/app/portal/admin/*-reports|*-disputes|*-requests|*-orders|
     *-interviews/page.tsx`, `src/components/forms/ReviewList.tsx`, or any
     shared primitive (`PortalHeader.tsx`, `PortalSidebar.tsx`,
     `MobileBottomNav.tsx`, `PortalPageHeader.tsx`, `ProtectedRoute.tsx`,
     `Card`/`CardContent`, `Input`, `Label`, `Button`, `NativeSelect`,
     `Textarea`, `FileUpload.tsx`, `SignaturePad.tsx`) unless a sanctioned
     deviation above explicitly requires it — this is a visual reskin +
     new landing page, not a data/behavior change. Shared primitives used
     by other pages get restyled at the callsite only (extraction B-10 —
     `PortalPageHeader`, `Input`, `Textarea`, `Label`, `Button`,
     `NativeSelect`, `Card`/`CardContent`, and `FileUpload` are all reused
     well beyond Forms; do not touch them globally).
8. **Leaderboard is deployed — never touch it.** No edits to
   `src/components/leaderboard/**` or `/portal/leaderboard`, even though
   the mobile-slot nav-config edit removes its fixed-bar slot (that edit is
   in `CommandPalette.tsx`'s `mobileSlotItems`, not the leaderboard page).
9. **Admin review destinations are untouched.** The 5 `/portal/admin/*`
   review pages, their nav entries, and their notification review-links
   are NOT part of the nav collapse (extraction B-23) — verify they still
   resolve and still receive real submission notifications after this
   slice ships.

## Preserved behaviors (from extraction Part B — must keep working)

- Per-form field inventory, validation rules, and API payload shape exactly
  as documented per form above (extraction B-3.1–B-3.5) — no field
  renamed, dropped, or added; no validation rule loosened or tightened.
- `ProtectedRoute` loading/auth-redirect behavior (auth-only for 4 forms,
  role-gated for Manager Interview) on every one of the 5 fill pages.
- Submit flow: ID-token fetch → Bearer POST → saving-disabled button →
  done/reset-to-empty on success → inline error banner on failure, per
  form (extraction B-4).
- File upload: `FileUpload.tsx` idle/uploading/uploaded/error states,
  client downscale-over-cap behavior, lightbox preview, replace-on-reupload
  (extraction B-5) — for Payroll's 1 slot and Leads' 3 slots (hostile,
  blind-knock, lasso), each independently.
- `SignaturePad.tsx` for Manager Interview's signature capture, unchanged.
- In-portal bell + Postmark email alerts via `notifySubmission`, per-form
  `formAlerts/{key}` toggle, admin/operations recipient set, review-link
  targets (extraction B-6) — for all 5 forms.
- Admin-SDK-only Storage writes, exact caller-owned folder paths, 15-minute
  signed-URL admin viewing (extraction B-15/B-16).
- Role gating exactly as documented (extraction B-8): 4 general forms via
  `requireVerifiedUser` (no active-status enforcement, existing gap kept);
  Manager Interview via page role list + `requireVerifiedFieldManagerOrManagement`
  server gate, including the existing `gm_in_training` mismatch (OPEN CALL
  5 — leave as-is).
- Existing test payload expectations (extraction B-24) — route auth,
  collection selection, required-field checks, option validation, email
  validation, manager-decision validation all keep passing unmodified.
- No drafts/autosave (extraction B-19) — do not imply persistence that
  doesn't exist.
- SSN/DL# encrypted-at-rest onboarding flow — entirely untouched, no
  overlap with this slice (extraction B-14, ANCHOR.md §9).

## Verify loop (mandatory)

1. Codex implements. Gates: `npx tsc --noEmit`, targeted eslint (files
   changed in this slice only), `npm run build`, `git diff --check`.
2. Signed-in Playwright session on `:3000`, dark mode
   (`localStorage['3c-theme']='dark'`). Before judging any screenshot,
   spot-check one changed element's computed style against the source
   (stale-dev-server guard — see `project-stale-dev-server-css` memory): if
   computed styles don't match source, kill the node child on `:3000`,
   delete `.next`, cold-start, and re-screenshot.
3. Screenshot the implementation at 1440px AND 390px covering: the Forms
   hub (all 5 rows, command band + hero numeral + summary strip), and at
   least 2 representative fill pages — Payroll Dispute (has the segmented
   picker + upload) and Leads Request (has the deepest conditional-field
   surface) — including the segmented picker in both its default and a
   changed-selection state, one upload slot in idle and uploaded states,
   and the success panel.
4. Numeral integrity: confirm no glyph chopped on any edge for the hero
   numeral and all 3 summary-strip numerals, at both 1440 and 390 (Hard
   Rule 1) — explicit check every round.
5. Computed font-weight check on every display heading (Hard Rule 2) —
   explicit check every round.
6. `scrollWidth` check at 375px confirming no horizontal scroll (campaign
   rule) — explicit check every round.
7. Fresh Opus reviewer diffs every screenshot against
   `design-mockups/forms-round2/the-line-forms-final.html` (rendered) and
   this contract's sanctioned-deviations/OPEN CALL resolutions; every
   visual difference not on the sanctioned list is a defect.
8. Nav-flip verification: confirm `portalNavGroups` Forms group shows one
   "Forms" entry (sidebar + CommandPalette + More sheet), confirm mobile
   bottom-bar slot 4 is Forms (`/portal/forms`) not Leaderboard, confirm
   Leaderboard is still reachable via sidebar/More sheet, confirm the 5
   admin review nav entries are unaffected.
9. Regression verification: all 5 form submissions still write to
   Firestore with the correct payload shape and pass existing route tests;
   in-portal + Postmark alerts still fire per the `formAlerts` toggle for
   all 5 forms; file uploads (Payroll's 1 slot, Leads' 3 slots) still
   upload/validate/downscale correctly; SignaturePad still submits a valid
   PNG data URL; Manager Interview role gate (including the known
   `gm_in_training` mismatch, unchanged) still behaves identically;
   admin review pages and their notification links still work.
10. Codex fixes; repeat with a FRESH reviewer until PASS (zero unsanctioned
    diffs, zero clipped numerals, zero broken entry points/regressions).
    Commit locally only. Push only on the user's explicit "deploy".

## Orchestrator rulings (BINDING — 2026-07-13, resolve all OPEN CALLs)

1. **Segmented picker placement.** The picker ships on every form field
   that is a small closed enum choice. Two-level (dependent sub-row) only
   where a REAL dependent field exists — Leads Request's category→reason is
   the flagship instance; Payroll Dispute gets the single-level picker only.
   Never fabricate a second tier.
2. **Section count flexes per form.** Keep the numbered-section visual
   pattern (kicker `01 /` headers, same type/spacing) but let each form use
   however many sections its real fields warrant. Fiber Report may be a
   single section; Leads Request may need four. Uniformity of PATTERN, not
   of count.
3. **Manager Interview hub row: HIDE for unauthorized users**, mirroring
   today's portalNavGroups role filtering. No locked-state row.
4. **Success state shows the real reference: the Firestore doc id** the API
   already returns, labelled per the mockup's ticket treatment (real id
   replaces the fake "PAY-2048"). Never invent a formatted fake number.
5. **`gm_in_training` mismatch stays untouched** (page/palette allow,
   server rejects). Do not "fix" it in passing; do not replicate the
   mismatch into the new hub gating either — the hub row visibility for
   Manager Interview follows portalNavGroups filtering as-is today.
6. **Hub route `/portal/forms` is binding** (confirmed free).

