# Member "The Line" — Visual Parity Goal Contract (DRAFT)

User picked the mockup `option-3-the-line-member.html` for the Member pages
(Settings, Onboarding, Signup). Same contract style as
`forms-the-line-goal.md` / `resources-the-line-goal.md` /
`calls-the-line-goal.md` / `chat-the-line-goal.md` /
`shell-the-rail-goal.md`: implementation is verified 1:1 against the mockup
by independent reviewers until EXACT — not close enough.

This round touches three genuinely different pages sharing one mockup file:
a personal Settings page (authenticated, inside the real portal shell), an
Onboarding page (authenticated, inside the real portal shell, gated to
`entry_level_rep` only) whose mockup layout is structurally different from
today's one-item-at-a-time wizard, and a public Signup page (unauthenticated,
`AuthShell`-based, shared with the out-of-scope Login and PendingApproval
screens). No new routes, no nav-group changes — none of these three pages
currently sit in `portalNavGroups` in a way this round needs to touch.

## Source of truth

- Mockup: `design-mockups/member-round1/option-3-the-line-member.html` (one
  file, three views — Settings / Onboarding / Signup — switched by a
  mockup-only prototype pill; see Sanctioned deviations).
- The mockup wins on any visual ambiguity not resolved by the sanctioned
  deviations below.
- Extraction reference (factual detail on both the mockup and the current
  implementation): Codex read-only audit, summarized into Part A/B below.
  Full log:
  `codex-member-extract.log` (session scratchpad).

## Pill nav — DECIDED, does not ship

Extraction confirms explicitly: "The fixed pill nav is prototype-only
chrome. It does not map to `/portal/settings`, `/portal/onboarding`, or
`/portal/signup` automatically" (hazard B-5). Matches campaign precedent
(Forms' `Forms home`/`Form fill` pill, Resources' hub/University pill —
neither shipped). The three views are genuinely three separate real routes
today and stay that way. No floating dev-toggle control ships anywhere.
Not an open call.

## Composition — Settings view

Mockup masthead (brand square + `signal active / 2026` + ticker) is
prototype chrome standing in for the real shell — **none of it ships**. The
page renders inside the real `PortalHeader`/`PortalSidebar`;
implementation starts at the masthead (`Set the signal. / Stay on the
line.`).

1. **Masthead**: kicker `member broadcast / settings`, two-line headline,
   intro sentence, `Report a bug` button (scrolls to the bug panel, same
   behavior as today's `#report-bug` hash), chip `<initials> / <role
   label> / <status>` (real signed-in user, not `MC / Field Rep / active`),
   top-aligned metallic hero numeral (real panel count — see Real data
   mapping) with ARIA label `<N> settings groups`.
2. **Desktop two-column arena** (`1.32fr .68fr`, 18px gap):
   - Left stack: Member identity panel → Bug report panel.
   - Right stack: Change password panel → App + appearance panel →
     Sensitive-data boundary panel.
3. **Member identity panel** (`01 / who you are`): two-column profile grid
   (address spans full width) — editable `Display name` / `Phone`;
   read-only/locked `Email` / `Role` / `Status` / `Hire date` / `Address`
   (13px lock glyph on each locked field); 4-column stats row (2-column
   mobile) — `Member since` / `Territory` / `Employee ID (last 6)` /
   `Active yes/no`; action `Save member lines`.
4. **Bug report panel** (`02 / call the desk`): segmented `Area` picker
   (`Forms`/`Sales`/`Onboarding`/`Chat`/`Leaderboard`/`Other`), required
   `Short summary`, optional `Details`, action `Send report`.
5. **Change password panel** (`03 / security channel`): collapsed behind a
   `Change password` toggle; fields `Current password` / `New password` /
   `Confirm password`; action `Update password`.
6. **App + appearance panel** (`04 / device channel`): install status row
   (`Install the member app` / `One device, quick access.` / Installed↔Install
   app toggle), push-notifications row (`Push notifications` /
   `Mentions, DMs, activity.` / toggle), appearance segmented control
   (`Auto`/`Light`/`Dark` + conditional Auto-only note).
7. **Sensitive-data boundary panel** (`05 / hard boundary`): static warning
   copy, no fields — `Never broadcast raw sensitive data.` / `No raw SSN,
   card numbers, or bank-account numbers in member settings.`

## Composition — Onboarding view

Same masthead-does-not-ship rule. Page renders inside the real portal
shell; implementation starts at the masthead (`Five lines open. / Three are
clear.` — see Real data mapping for how this templated headline generalizes).

1. **Masthead**: kicker `onboarding broadcast / live board`, two-line
   headline, intro sentence, two chips (`<N> approved / <M> total`,
   `<N> review / <N> attention / <N> to do`), top-aligned metallic hero
   numeral (real incomplete-item count) with ARIA label `<N> items left`.
2. **Board panel** (`01 / the board`): heading `<real name> / onboarding`,
   meta `<N> approved`, **one** progress bar (7px, lime gradient, real
   fraction) with text `<N> of <M> approved / one progress readout`, then
   the **full vertical item board** — every applicable checklist item as a
   row (not one-active-item-at-a-time — see **OPEN CALL 1**), each row:
   status pill (`Done`/`In review`/`Needs attention`/`To do`, real status
   color treatment per Status treatments below), item title, one-line real
   description, a next-action control appropriate to that item's real type
   (view / check-email / resubmit-with-reason / upload / open-link), plus
   for `Needs attention` a real rejection reason and for upload items real
   drop-zone(s) (front/back slots for the DL item).
3. **Action-type panel** (`02 / action type`): static explainer —
   `UPLOAD` note (`PNG / JPG / PDF · 4 MB max. License has front + back
   slots.` — real limits, matches today's server validation) and `E-SIGN`
   note (`Check your email for the signing link — this completes
   automatically after you sign.` — real copy already in production, see
   Real data mapping).
4. **Sensitive-items panel** (`03 / sensitive items`): static warning copy,
   no fields.

Status treatments (exact, carry over): Done = lime; In review = gold;
Needs attention = red text + red left rail + dark red-tinted row; To do =
muted blue-gray. Mobile: rows become two columns, next action moves below
item text, rejection reason spans full width.

## Composition — Signup view

The signup canvas is a split brand/form composition and does **not**
contain the authenticated portal header/sidebar (matches today's
`AuthShell` framing — this is the one view where the mockup's standalone
canvas is closer to reality than Settings/Onboarding's dark-canvas
placeholder chrome).

1. **Masthead**: kicker `signup broadcast / first signal`, two-line
   headline `Join the line. / Find your lane.`, intro sentence, metallic
   numeral `3` with ARIA label `3 signup steps` (static structural fact —
   see Real data mapping).
2. **Form card** (`01 / your signal`): heading `Create a member account`,
   intro sentence, fields `Full name`* / `Email`* / `Password`* /
   `Confirm password`* (new field — see **OPEN CALL 2**), password
   Show/Hide toggle (already real, preserve), live strength bar (new,
   client-side only — see **OPEN CALL 2**), action `Request access`,
   three-step strip (`1 Verify your email` / `2 Manager approves your
   account` / `3 You get your role and start onboarding` — static tone
   copy describing the real flow), links `Sign in` / `Back to main site`.
3. **Pending state**: mockup's inline demo panel + `Show demo pending
   state` toggle do **not** ship — real post-submit behavior is the
   existing `PendingApproval` component after redirect to `/portal` (see
   Sanctioned deviations) restyled to match this panel's visuals.
4. **Brand card** (`02 / the member signal`): heading `Make the next move
   visible.` (`visible.` lime italic), subtext, footer (`verify / approve
   / begin`, `live / 3C` — with the real logo per campaign rule, not the
   placeholder `3C` square). At mobile width the form card renders first,
   brand card second.

## Desktop / mobile reflow (exact mockup breakpoints)

Breakpoints are **760px and 460px** (different from Forms'/Resources'
800px — use the mockup's own values, verified in the source).

### `max-width: 760px`
Live-text (`signal active / 2026`) hides; fixed pill nav (not shipped)
would reposition to `top:62px;right:9px` — not applicable since it doesn't
ship, but the same header-brand clearance constraint applies to any other
fixed-position chrome introduced this round (there should be none per
Sanctioned deviations); masthead numeral column narrows to 80px content
gap 10px; numeral shrinks to 95px; onboarding rows become two columns
(next action moves below item text, rejection reason spans full width).

### `max-width: 460px`
Numeral padding-right/margin-right reset to zero (same anti-clip pattern as
Forms/Resources); main padding tightens (`132px 16px 55px`); signup form
card renders before brand card.

No horizontal scroll anywhere at any width (campaign rule).

## Design tokens (exact, from mockup)

```css
--stage: #03070f;   /* darker than Forms/Resources' #030916 — Member uses its own stage tone, carry over exactly */
--panel: #08101d;   /* / #0d1724 secondary panel tone */
--line:  #26364a;   /* hairline border, NOT the rgba(231,237,244,.15) token Forms/Resources use */
--lime:  #a3e635;
--white: #f4f7f4;
--muted: #8d9baa;
--silver:#d2dcda;
--red:   #fb7185;
--gold:  #fbbf24;
```

**Fonts differ from the rest of the campaign** — this mockup does NOT use
the system-font-stack + `ui-monospace` pairing Forms/Resources/Calls/Chat
use. It specifies:
- Body: `"Trebuchet MS", Arial, sans-serif`
- Editorial headings (H1s, headline pairs): `Georgia, "Times New Roman",
  serif`
- Labels/chrome/kickers/meta/numerals: `"Courier New", monospace`

This is a deliberate per-page voice difference in the mockup (editorial
serif headline vs the rest of the campaign's grotesk display type) — ship
it as spec'd, do not silently normalize to the other pages' font stack.
Confirm this reads intentional, not a mockup inconsistency, before
implementing — flagged for orchestrator awareness, not gated on it (the
mockup is unambiguous and internally consistent across all three views).

Hero numeral: `clamp(115px,16vw,218px)` (resolves to 218px at 1440 —
notably larger than Forms' 120px cap and Resources' 120px cap), Trebuchet,
weight 700, line-height `.78`, letter-spacing `-.12em`. Below 760px: 95px.
H1: `clamp(36px,10.5vw,54px)`, Georgia, weight 700, line-height `.96`,
tracking `-.055em` — **this one has an explicit weight in the mockup**,
unlike most other campaign pages' headings; still verify computed weight
in-browser (Hard Rule 2 still applies defensively). Kicker/eyebrow/labels:
10px mono, weight 700, uppercase, lime, tracking `.16em`. New
member-specific rules should be namespaced `member-line-*` in
`globals.css` alongside existing `.portal-*` conventions.

## Numeral clipping fix (carry over exactly)

Same paint-area fix as every other page this campaign: `padding: .25em
.13em 0 0` + `margin: -.25em -.13em 0 0` via the shared
`.portal-metallic-num` class already in `globals.css`. Single-strategy
situation (not two, like Calls) — use `.portal-metallic-num` for all three
hero numerals (Settings, Onboarding, Signup), verify empirically at 1440
and 390. At ≤460px the mockup drops right padding/margin to zero — replay
exactly. Grid `align-items:start` top-aligns the numeral with the headline
— preserve.

## Real data mapping (what each mockup number/string becomes)

- **Settings hero numeral / "N settings groups"**: static **5** — a
  structural fact (there are 5 real panels: identity, bug report,
  password, app+appearance, sensitive boundary), same reasoning
  Resources used for its static "1" pay-structure lane count — no live
  data source needed, but must reflect the actual panel count if that
  count ever changes.
- **Settings identity chip** (`MC / Field Rep / active`): real signed-in
  user's initials, `getEffectiveRole()`/`RoleDisplayNames` role label, and
  real `status` — never the mockup's static Marcus Chen values.
- **Settings identity panel fields**: real `AuthContext`/`users/{uid}`
  data — `displayName`, `phone` (editable, saved via `PUT
  /api/portal/profile`), `email`, role label, `status`, `hireDate`,
  `address`/`city`/`state`/`zip` (read-only) — never the mockup's demo
  values (`482731`, `Chicago North`, the example phone number — hazard
  B-7).
- **Settings stats row**: `Member since` = real `createdAt` (not
  `hireDate` — preserve today's exact distinction, hazard B-7/B-8);
  `Territory` = real `territoryId`; `Employee ID` = last 6 chars of the
  Firebase `uid`, uppercase (there is no separate `employeeId` field —
  preserve exactly, do not invent one); `Active yes/no` = derived from
  `status === 'active'`.
- **Settings bug-area picker**: same real `area` enum values the current
  native `<select>` already submits (`Forms`/`Sales`/`Onboarding`/
  `Chat`/`Leaderboard`/`Other`) — restyled into the mockup's segmented
  control, not a new value set.
- **Onboarding headline / chips / numeral**: `Five lines open. / Three are
  clear.` is a **templated pattern**, not literal copy — real headline
  derives from real `progress.total`/`progress.approved` (e.g. "`<M-N>`
  lines open." / "`<N>` are clear." using real remaining/approved counts),
  matching the mockup's own voice. Chips become real `<N> approved / <M>
  total` and real `<review-count> review / <attention-count> attention /
  <todo-count> to do` tallies from the real per-item statuses. Hero
  numeral = real count of non-approved items, ARIA label `<N> items left`
  — never the mockup's static 5-of-8.
- **Onboarding item board**: real, role- and IBO-filtered checklist from
  `getOnboardingItemsForUser()` — 8 base items for a standard
  `entry_level_rep`, up to 11 for an IBO `entry_level_rep` (`llc_sos`,
  `insurance`, `chargeback_card` added) — never hardcode 8 rows (hazard
  B-14). Row status pill/color = real `not_started`/`submitted`/
  `approved`/`rejected` mapped to `To do`/`In review`/`Done`/`Needs
  attention` exactly as today.
- **Onboarding "Onboarding Submission" row**: current real behavior is a
  manual/optional reference field, NOT a file upload (hazard B-18) — ship
  the row's next-action control to match that real behavior (a
  mark-ready/reference action), not the mockup's literal drop-zone widget.
  Do not add real upload capability to this item — that would be a data/
  API contract change, out of scope per ANCHOR.md §5.
- **Onboarding e-sign rows** (`fcra_auth`, `contract`, `direct_deposit`,
  `pay_structure`/Compensation): real behavior is automated envelope
  send + email notification, not a clickable in-app "Open link" that does
  anything (hazard B-16) — ship the mockup's `Check email` next-action
  copy/button styled per the mockup, wired to real behavior (e.g.
  re-triggering the email helper text or a mailto/no-op affordance,
  never a fake functional link) — the existing helper copy `We've emailed
  you this document for e-signature. Check your inbox — it completes here
  automatically once signed.` ships verbatim, restyled.
- **Onboarding upload rows** (`w9`, `dl_photos`): real `FileUpload`
  component behavior (MIME validation, 4MB limit, downscale, DL front/back
  slots) restyled into the mockup's drop-zone visual — never the mockup's
  no-op demo drop zone.
- **Signup hero numeral "3 signup steps"**: static **3** — a structural
  fact describing the real 3-step process (verify → manager approves →
  role assigned + onboarding starts), same reasoning as Settings' static
  5 — no live data source needed.
- **Signup three-step strip copy**: ships as real tone copy describing the
  actual flow (verification email → admin/manager approval →
  `entry_level_rep` assignment triggers onboarding) — not measured data.
- **Signup pending state**: real destination after submit is a redirect to
  `/portal` where the real `PendingApproval` component renders — not the
  mockup's inline demo banner + toggle (see Sanctioned deviations).

## Sanctioned deviations (structural / cross-cutting)

- **Mockup masthead/ticker/pill-nav does not ship** on Settings or
  Onboarding. Real `PortalHeader`/`PortalSidebar` render instead.
- **Signup's split brand/form canvas is the real framing** (it already
  matches `AuthShell`'s composition) — but the mockup's own header/ticker
  chrome still does not ship; the page starts at the form/brand cards.
- **Signup restyle is scoped, not global `AuthShell`.** `AuthShell` is
  shared by `SignupForm`, `LoginForm`, and `PendingApproval` (hazard
  B-25). Login is explicitly out of scope this round and the mockup
  specs no login view. Restyle at the `SignupForm` callsite / a
  signup-specific wrapper only. If any `AuthShell`-level change is
  genuinely unavoidable (e.g. a shared background token), it must be
  called out as an explicit additional sanctioned deviation with a
  blast-radius note (which other screens it visually affects) before
  Codex implements it — do not silently restyle the shared shell.
- **Onboarding structural layout changes from one-item wizard to full
  board** — see **OPEN CALL 1**, this is the round's single biggest
  structural decision and gates the file-scope hard rule below.
- **Duplicate progress treatment is deduped.** Today's page shows both a
  `PortalPageHeader` stats block and a wizard sidebar progress card
  (hazard: extraction calls this out explicitly). The mockup shows one
  progress bar. Ship one real progress readout, not two, regardless of
  OPEN CALL 1's resolution.
- **E-sign rows never become fake-actionable.** The mockup's visual
  affordance (a clickable-looking next-action button) ships, but its
  real behavior stays "check your email" — no client-side bypass of the
  SignWell envelope flow (hazard B-16).
- **Onboarding Submission stays a manual reference action**, not a real
  upload — see Real data mapping.
- **Real submission/data flow preserved exactly**: `PUT
  /api/portal/profile`, Firebase `reauthenticateWithCredential()` +
  `updatePassword()` password flow, `sendPasswordResetEmail()`, install/
  push capability states (`beforeinstallprompt`/FCM/iOS manual
  instructions), `POST /api/portal/forms/bug-report`, `GET
  /api/portal/onboarding`, `POST /api/portal/onboarding/upload`, `POST
  /api/portal/onboarding/submit`, e-sign autoSend + webhook, Firebase
  Auth signup (`AuthContext.signUp()`), `signup-notify` — restyled into
  the mockup's visuals, not replaced with new client architecture.
- **Loading/error/empty/rejected states preserved, restyled.**
  `ProtectedRoute` loading, onboarding skeleton/error/empty/rejected
  states, upload errors, settings save errors, password errors, signup
  Firebase errors, `PendingApproval`, deactivated-account handling — the
  mockup shows none of these (all-happy-path demo), they must be added
  into the new visual frame, not dropped (hazard B-26).
- **Theme behavior unchanged.** `localStorage['3c-theme']`, `system`/
  `light`/`dark` internal values displayed as Auto/Light/Dark, device
  preference tracking, portal-scoped removal on exit — a dark-only
  mockup implementation must not remove Light/System (hazard B-11).
- **Install/push are not simple demo toggles.** Real capability/
  permission/loading/failure/FCM/iOS states preserved; push card stays
  hidden entirely when unsupported/unconfigured (hazard B-12).
- **Real logo everywhere the mockup shows its placeholder `3C` square**
  (campaign rule) — `public/logo.png`, already used by `PortalHeader` and
  `AuthShell`.
- **Role gating unchanged.** `roleRequiresOnboarding()` stays true ONLY
  for `entry_level_rep`; `entry_rep` stays not-gated; existing `entry_rep`
  users are not migrated (hazard B-20). Admin Users page `Accept` bypass
  behavior (skips remaining onboarding, activates immediately, promotes
  accepted `entry_level_rep` → `entry_rep`) is untouched (hazard B-21).
  `/portal/onboarding` keeps `ProtectedRoute roles={Object.values
  (FieldRoles)}`; non-gated roles keep receiving an empty checklist, not
  an error.
- **Google SSO stays LoginForm-only.** Do not add or remove it while
  restyling `SignupForm` (hazard B-24).
- **`/api/portal/auth/signup/route.ts` stays disabled (403).** Real
  signup path stays client-side Firebase Auth via `AuthContext.signUp()`
  — do not route through it or "fix" it as part of this reskin.
- Light theme must keep working via the portal `ThemeContext` (dark is
  the 1:1-verified target per campaign rule; light needs to be coherent,
  not verified 1:1).
- lucide-react icons replace the mockup's inline SVGs (same glyph
  intent), including the 13px lock glyph on locked Settings fields.
- Animations/transitions skipped under `prefers-reduced-motion` (respect
  the exemption pattern in `globals.css` `@layer base` — see
  `project-reduced-motion-gotcha` memory).
- No Firestore/data-shape changes, no new collections, no new API routes,
  no change to `roleRequiresOnboarding()` or any other role predicate
  (ANCHOR.md §5 explicitly forbids role-logic changes) — this is a visual
  reskin (+ the one sanctioned structural layout change under OPEN CALL
  1), not a backend change.

## Nav / entry points (no changes required this round)

- **Settings**: reached via `PortalHeader` user menu (`/portal/settings`,
  `/portal/settings#report-bug`) and `CommandPalette`'s "Report a bug"
  action. Personal Settings is not a sidebar item today and stays that
  way — no nav-group edits this round (unlike Forms/Resources, which
  both required `portalNavGroups` collapses).
- **Onboarding**: reached via `CommandPalette`/`PortalSidebar` "My
  Onboarding" (role-gated to `entry_level_rep`, unchanged) and
  dashboard's conditional "Continue onboarding" card. No change required.
- **Signup**: reached via `LoginForm`'s "Create one" link only. No other
  in-app entry point exists or is added.
- **Do not touch** `CommandPalette.tsx`, `PortalSidebar.tsx`, or the
  dashboard's onboarding-card logic as part of this slice — none of them
  need a change and touching them would be scope creep.

## OPEN CALL 1 — Onboarding: full board (mockup) vs one-item wizard (today)

The mockup shows the entire 8(–11)-item checklist as one vertical list with
a per-row next action (extraction B-15: "This is a major structural
redesign hazard"). Today's `OnboardingWizard` shows one active item at a
time in a 300px left rail + detail card (desktop) or a horizontally
scrolling step list (mobile), auto-selecting the first non-approved item
and showing "Step X of Y". Options:

- **(a)** Replace the wizard interaction model with the mockup's full
  board — every item always visible as a row, next action per row, one
  progress bar. This matches the mockup exactly and is a legitimate IA
  simplification (ANCHOR.md §5 permits "cross-cutting states" and
  consolidation changes that don't alter routes/data). Requires a real
  rewrite of `OnboardingWizard.tsx` (or a new sibling component) — the
  step-rail/one-active-item pattern goes away entirely.
- **(b)** Keep the wizard's one-item-at-a-time interaction model, and
  restyle its existing rail/detail-card visuals toward the mockup's token
  system (colors, fonts, numerals) without adopting the full-board layout
  — smaller diff, but ships something visually distinct from the approved
  mockup on the page's primary interaction pattern, which breaks the
  "verified 1:1" bar this campaign holds every other page to.
- **(c)** Hybrid — full board is the primary/default view (mockup-exact),
  but clicking a row's next action still opens the item in a focused
  panel/modal for entering data (upload, resubmit reason, etc.) rather
  than inline in the row — closest analog to how Onboarding Submission's
  Needs-attention reason + drop zone would otherwise need to render
  inline at every screen width.

Recommendation: **(c)** — matches the mockup's primary visual (full board,
one progress bar, per-row status/next-action) which is what "verified 1:1"
actually measures, while keeping upload/resubmit interactions in a focused
surface rather than cramming file drop-zones and rejection-reason text
into every row at 390px width (the mockup's own row anatomy at mobile
already moves the next-action below the item text, suggesting the row
itself isn't meant to hold a full upload UI at small widths). Needs
orchestrator sign-off — this is the round's largest structural decision,
determines the fate of `OnboardingWizard.tsx`, and directly sets the
file-scope hard rule below.

## OPEN CALL 2 — Signup: add confirm-password + strength meter

Today's `SignupForm` has no confirm-password field and no live strength
meter (hazard B-22); `signupValidation.ts` only checks a 6-char minimum.
The mockup adds both. Per the task brief: never invent backend validation;
client-side-only affordances are fine, or drop them. Options:

- **(a)** Add both fields as pure client-side affordances — confirm-password
  does an equality check before calling `AuthContext.signUp()` (same
  pattern the Settings password panel already uses for its own confirm
  field), and the strength bar is a client-computed cosmetic indicator
  (length/symbol/number heuristics, mockup's exact three-tier copy) with
  no new server call and no change to the real 6-char minimum enforced by
  Firebase Auth today.
- **(b)** Drop both — ship the mockup's visual shell (password field +
  Show/Hide) without the confirm field or strength bar, matching today's
  real field set exactly, on the theory that adding a new required field
  to a public signup form is a product decision, not a visual one.

Recommendation: **(a)** — both additions are entirely client-side (no API
change, no loosening or tightening of the real password rule), the
equality-check pattern already exists elsewhere in this exact codebase
(Settings' password panel), and dropping fields the approved mockup shows
prominently would fail the "verified 1:1" bar for no real cost. Needs
orchestrator sign-off since it does add one new required form field to a
public-facing flow.

## HARD RULES (campaign-wide, binding)

1. **Big numerals never clipped.** All three hero numerals (Settings,
   Onboarding, Signup) use the shared `.portal-metallic-num` class. Verify
   at 1440 AND 390, no glyph chopped on any edge.
2. **Tailwind preflight resets h1–h6 to font-weight 400.** Every display
   heading — Settings/Onboarding/Signup H1 pairs, panel `h2`s, form-card
   `h2` — MUST declare `font-weight` explicitly (even the Settings/
   Onboarding H1, which the mockup itself gives an explicit weight —
   verify computed weight in-browser anyway, don't assume the source CSS
   survives the port unchanged).
3. **Counts render as plain numbers.** Hero numerals, chip counts, board
   progress fractions — no leading zeros, computed from real data per
   "Real data mapping" above, never the mockup's static figures (5-of-8,
   3-approved, etc.).
4. **Big metallic hero numerals are top-aligned with the headline** on all
   three views — verify visually.
5. **Dark theme via `localStorage['3c-theme']`** is the 1:1-verified
   target; light mode must stay coherent and working (this page keeps
   Auto/Light/Dark, unlike a pure dark-only mockup — hazard B-11).
6. **Reduced-motion**: any reveal/hover/focus transition must use the
   campaign's exemption pattern in `globals.css` `@layer base` (see
   `project-reduced-motion-gotcha` memory).
7. **File scope.** Exact list depends on OPEN CALL 1's resolution; the
   orchestrator ruling on it determines the final list. Provisionally,
   assuming OPEN CALL 1→(c) and OPEN CALL 2→(a):
   - `src/app/portal/settings/page.tsx`
   - `src/app/portal/onboarding/page.tsx`
   - `src/app/portal/signup/page.tsx`
   - `src/components/portal/ReportBugCard.tsx`, `ThemeToggleCard.tsx`,
     `InstallAppCard.tsx`, `PushNotificationsCard.tsx` — restyled at
     callsite only, reuse their existing data/behavior logic as-is.
   - `src/components/onboarding/OnboardingWizard.tsx` (or a new sibling
     component under `src/components/onboarding/**` if the full-board
     layout is built as a fresh component rather than a rewrite) — reuse
     `FileUpload.tsx` as-is, do not fork it.
   - `src/components/auth/SignupForm.tsx` — plus a signup-specific
     wrapper/variant if `AuthShell` itself needs any scoped adjustment
     (see Sanctioned deviations blast-radius note); do not edit
     `AuthShell.tsx`, `LoginForm.tsx`, or `PendingApproval.tsx` directly
     unless a sanctioned deviation explicitly requires it and the
     blast-radius is documented first.
   - `src/lib/auth/signupValidation.ts` — ONLY to add the client-side
     confirm-password equality check and strength heuristic if OPEN CALL
     2 resolves to (a); no change to the real minimum-length rule.
   - `member-line-*` styles added to `globals.css` (namespaced, alongside
     existing `.portal-*` conventions).
   - **Zero edits outside this list.** No edits to
     `src/app/api/portal/profile/**`, `src/app/api/portal/onboarding/**`,
     `src/app/api/portal/forms/bug-report/**`, `src/app/api/portal/auth/**`,
     `src/app/api/portal/push/**`, `src/contexts/AuthContext.tsx`,
     `src/contexts/ThemeContext.tsx`, `src/types/auth.ts`,
     `src/lib/onboarding/uploads.ts`, `src/lib/onboarding/esign.ts`,
     `src/lib/onboarding/activation.ts`, `src/lib/esign/autoSend.ts`,
     `src/app/api/webhooks/esign/route.ts`,
     `src/app/portal/admin/users/**`, `src/app/portal/admin/settings/**`
     (a different page — do not confuse with personal settings), or any
     shared primitive (`PortalHeader.tsx`, `PortalSidebar.tsx`,
     `PortalPageHeader.tsx`, `ProtectedRoute.tsx`, `Card`/`CardContent`,
     `Alert`/`AlertDescription`, `Button`, `Input`, `Progress`,
     `Skeleton`) unless a sanctioned deviation above explicitly requires
     it. Shared primitives get restyled at the callsite only.
8. **Leaderboard is deployed — never touch it.** No edits to
   `src/components/leaderboard/**` or `/portal/leaderboard`.
9. **`entry_level_rep`-only onboarding gate is immutable.**
   `roleRequiresOnboarding()`, `getOnboardingItemsForUser()`'s role/IBO
   filtering, and `ProtectedRoute roles={Object.values(FieldRoles)}` on
   `/portal/onboarding` must not change. Existing `entry_rep` users are
   never migrated or newly gated. Admin `Accept` bypass behavior is
   untouched.

## Preserved behaviors (from extraction Part B — must keep working)

- `PUT /api/portal/profile` accepting `{ userId, displayName, phone }`,
  updating `users/{userId}` and `updatedAt`, followed by `refreshUser()` —
  unchanged, including its existing lack of a verified-user gate (hazard
  B-9 — flagged for separate security review, NOT fixed as part of this
  visual reskin).
- Firebase Auth password change (`reauthenticateWithCredential()` +
  `updatePassword()`, 6-char minimum, client-side confirm check) and the
  separate `sendPasswordResetEmail()` action.
- Theme wiring: `localStorage['3c-theme']`, `system`/`light`/`dark`
  internal values, `prefers-color-scheme` following for Auto, dark class
  mirrored onto portal wrapper + `document.body`, portal-scoped removal on
  exit.
- Install/push: `beforeinstallprompt`/`appinstalled`/standalone detection/
  iOS manual instructions; FCM registration via `/api/portal/push/register`;
  push card hidden entirely when unsupported/unconfigured.
- Bug report: `POST /api/portal/forms/bug-report` requiring
  `requireVerifiedUser`, writing to `bugReports` with the real field set
  (`area`, `summary`, `details`, `pageUrl`, `repUid`, `repName`,
  `repEmail`, `status:'new'`, timestamps), admin notification to
  `/portal/admin/bug-reports`.
- Onboarding data flow: `GET /api/portal/onboarding?userId=...`, real
  `userOnboarding/{uid}_{itemId}` progress fields, real per-item type
  (upload/e-sign/vendor-reference/manual), `POST
  /api/portal/onboarding/upload` (4MB limit, MIME validation, downscale,
  DL front/back slots, ownership checks), `POST
  /api/portal/onboarding/submit`, `looksLikeRawSensitiveData()` server
  guard.
- E-sign: SignWell-backed `autoSend.ts`, webhook auto-approval
  (`status:'approved'`, `reviewerName:'E-sign (auto)'`), notification
  linking to `/portal/onboarding`.
- Signup: `AuthContext.signUp()`'s exact sequence (create Firebase Auth
  account → update Auth display name → write `users/{uid}` with
  `status:'pending'` → fire `signup-notify` → send verification email
  redirecting to `/portal` → sign out → set `pendingApproval:true`),
  `signup-notify`'s `alertTasks` record, Firestore rules gating most
  portal collections on `status:'active'`, Google SSO staying LoginForm-
  only, `/api/portal/auth/signup/route.ts` staying disabled.
- Existing test/route expectations for profile update, bug report
  submission, onboarding upload/submit validation, and signup flow keep
  passing unmodified.

## Verify loop (mandatory)

1. Codex implements. Gates: `npx tsc --noEmit`, targeted eslint (files
   changed in this slice only), `npm run build`, `git diff --check`.
2. Signed-in Playwright session on `:3000` for Settings/Onboarding, dark
   mode (`localStorage['3c-theme']='dark'`); unauthenticated session for
   Signup. Before judging any screenshot, spot-check one changed element's
   computed style against the source (stale-dev-server guard — see
   `project-stale-dev-server-css` memory): if computed styles don't match
   source, kill the node child on `:3000`, delete `.next`, cold-start, and
   re-screenshot.
3. Screenshot the implementation at 1440px AND 390px covering: Settings
   (both column stacks, locked vs editable fields, collapsed AND expanded
   password panel, appearance Auto-note visible), Onboarding (full board
   with at least one row in each of the 4 status states if real test data
   allows, or documented if the signed-in test account can't produce all
   4 — Needs-attention reason + upload slots expanded), and Signup (form
   card + brand card at both widths, Show/Hide toggled, strength bar in a
   non-empty state if OPEN CALL 2→(a)).
4. Numeral integrity: confirm no glyph chopped on any edge for all three
   hero numerals, at both 1440 and 390 (Hard Rule 1) — explicit check
   every round.
5. Computed font-weight check on every display heading, including the
   Settings/Onboarding H1 pair even though the mockup gives it an explicit
   weight (Hard Rule 2) — explicit check every round.
6. `scrollWidth` check at 375px confirming no horizontal scroll (campaign
   rule) — explicit check every round.
7. Fresh Opus reviewer diffs every screenshot against
   `design-mockups/member-round1/option-3-the-line-member.html` (rendered)
   and this contract's sanctioned-deviations/OPEN CALL resolutions; every
   visual difference not on the sanctioned list is a defect.
8. Behavior verification: confirm the real onboarding gate
   (`entry_level_rep`-only) still works; confirm the Admin `Accept` bypass
   still works exactly as today; confirm e-sign rows show real
   check-email copy, not a fake functional link; confirm Onboarding
   Submission stays a manual-reference action, not a fake upload; confirm
   signup still creates a real pending Firebase Auth account and sends a
   real verification email; confirm login/`PendingApproval` are visually
   unaffected (AuthShell blast-radius check).
9. Regression verification: profile PUT still writes correct fields;
   password change/reset still work; theme toggle still persists and
   still offers Light/Auto/Dark; install/push cards still reflect real
   browser capability states; bug report still writes to `bugReports` and
   notifies admins; onboarding upload/submit still validate and persist
   correctly; e-sign webhook auto-approval still fires; signup still
   blocks on Firebase's real validation and still routes to
   `PendingApproval`.
10. Codex fixes; repeat with a FRESH reviewer until PASS (zero
    unsanctioned diffs, zero clipped numerals, zero broken entry points/
    regressions). Commit locally only. Push only on the user's explicit
    "deploy".

## Orchestrator rulings (BINDING — 2026-07-13, resolve all OPEN CALLs)

1. **Onboarding layout → hybrid.** The mockup's always-visible full
   checklist board ships as the primary/default view (1:1 visual
   fidelity). Row next-actions that require real data entry (uploads,
   rejection reasons, anything the wizard collected) open a focused
   panel/sheet from the row rather than rendering inline forms on the
   board. ZERO changes to completion predicates, write paths, gating
   (entry_level_rep only, Accept bypass), or step data — presentation
   only. If any wizard step's data collection cannot map cleanly to a
   panel, keep that one step's existing flow behind the row action and
   note it for review rather than redesigning the data flow.
2. **Signup confirm-password + strength meter → ship both, client-side
   only.** Confirm field is a pure equality check (mirroring Settings'
   password panel pattern); strength meter is cosmetic and
   client-computed. No API/auth changes; Firebase's real 6-char minimum
   remains the enforced rule and the copy must not promise stricter
   server rules than exist.
3. **Font stack note → keep the mockup's own stack** (it is the approved
   design and internally consistent). The existing campaign rule still
   applies on top: if any BIG metallic numeral renders with old-style
   (non-lining) figures at implementation time, swap that numeral's face
   per the established Cambria/upright fix and screenshot-verify.

