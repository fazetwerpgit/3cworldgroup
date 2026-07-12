# 3C World Group Portal - Claude Max Handoff

For the next coding agent, especially Claude running a Max workflow. Read this
before touching code. This repo is in the middle of an employee-portal redesign,
not a public marketing-site redesign.

Last updated: 2026-07-11 (Spotlight Arena re-skin session)
Current checkpoint: see "Session Handoff 2026-07-11 — Leaderboard Spotlight
Arena re-skin DEPLOYED" below; the rest of this doc is standing project
background (intent, stack, design system, constraints) and still applies.

## Session Handoff 2026-07-11 — Leaderboard Spotlight Arena re-skin DEPLOYED

### Completed (this session)
- **DEPLOYED 2026-07-11**: user approved ("deploy"); master pushed through
  `7af637e`, production serving 200. Visual re-skin only — all phase-2 data
  features (movement/sparklines/streaks) untouched and working.
- **Design source of truth:** `design-mockups/leaderboard-round5/spotlight-arena.html`
  (user-approved after mockup rounds 2-5; round-5 combines round-2
  option-3-arena's masthead with round-3 arena-b-spotlight's dark theme +
  gold/silver/bronze medal podium). Reference screenshot:
  `.superpowers/sdd/shots/r5v2-spotlight-arena.png`.
- **Parity contract:** `docs/redesign/leaderboard-spotlight-arena-goal.md` —
  user mandated a 1:1 screenshot-verify loop: Codex (gpt-5.6-luna) implements,
  fresh opus reviewers diff implementation screenshots vs the reference until
  EXACT. Took 4 rounds (23 defects total) to PASS. Commits: 01c1c69 (re-skin),
  2d60fcd, 5fcbcf9, 8b4d5e3, 6613b5c (parity rounds), 7af637e (podium numeral
  top-clipping fix, `pt-[0.14em]` on the numeral div).
- **Sanctioned deviations from mockup:** portal shell around the page;
  functional period/metric controls in the top strip (restyled) instead of the
  mockup's static "JULY 2026 · LIVE / THEME".
- Verification setup that works: local dev on :3000, signed-in Playwright
  session (user logs into the automation browser window), dark mode via
  `localStorage['3c-theme']='dark'`, 8-rep display mock via page.route on
  `**/api/portal/leaderboard**` using REAL field names (salesRepName,
  totalPoints, totalSales, movement, spark, streakDays) and reusing the real
  `currentUser.salesRepId` for the You row. Chase fetches limit=100.

### Open items (carried forward)
- Bonus points still excluded from scoring pending client sign-off.
- Client still owes carrier→field mapping (sales proof).
- Light mode exists and follows the portal theme toggle; only dark was
  1:1-verified. If the client lives in light mode, run one verify round on it.

### NEXT SESSION: redesign the remaining portal pages
User's direction (2026-07-12): extend the redesign to the other portal pages.
The leaderboard's Spotlight Arena treatment is the approved visual bar.

- **Read first:** `docs/redesign/ANCHOR.md` (client decisions locked in §9,
  read every redesign session) and the Spotlight Arena section above.
- **Pages still on the old design:** Dashboard (`src/app/portal/page.tsx`),
  Team Chat, Sales, Calls Schedule, Forms, Resources, Operations, Admin —
  all under `src/app/portal/*`. Leaderboard is DONE, don't touch it.
- **Process that worked (user liked it):** mockups first as self-contained
  HTML in `design-mockups/<page>-round1/` (Codex gpt-5.6-luna builds; serve
  via `python -m http.server 8899` from design-mockups; screenshot 1440px;
  self-critique; present numbered options + double-click file paths). After
  the user picks: goal contract doc + Codex implements + 1:1 opus
  screenshot-verify loop until PASS, only then push (push = prod deploy;
  the permission classifier requires the user to say "deploy").
- **Quality bar (from memory):** recompose pages, don't restyle; the user is
  non-technical — ask only about what-users-see decisions, one at a time.
- **Verification recipe:** see "Verification setup that works" above (dev on
  :3000, user signs into the automation browser window, dark via
  localStorage 3c-theme, page.route mocks with real API field names).
- **Design language to carry over:** dark near-black + stage glow, navy
  #0A1F44 panels, green #8dc63f accents, metallic gradient display numerals,
  mono/letter-spaced kickers, hairline dividers, pill chips, lucide icons,
  no emoji. Both themes must work; portal ThemeContext drives dark class.

## Session Handoff 2026-07-11 — Leaderboard Phase 2 (rank history) DEPLOYED

### Completed (this session)
- **DEPLOYED 2026-07-11**: user approved; master pushed (81603b8..fa9943f),
  Vercel production build Ready, www.3cworldgroup.com serving it. This shipped
  leaderboard phase 1 (7ea24cd) + phase 2 + the Xfinity commit together.
- **Phase 2 delivered on master.** Commits 6a85850, 50842db,
  9aeb342, 67c712b, f275458 (+ docs 18a29e1/bdc0e75). Spec:
  `docs/superpowers/specs/2026-07-10-leaderboard-phase2-design.md`; plan:
  `docs/superpowers/plans/2026-07-10-leaderboard-phase2-history.md`; SDD audit
  trail in `.superpowers/sdd/progress.md` (untracked).
- Features: movement arrows (vs yesterday, ET day bucketing, "New" chip,
  all-dash on first day of period), 7-day rank sparklines (chase table only,
  hidden <sm), selling-day streak chips (>=2 only; weekends + today-grace never
  break). All computed on the fly from existing sales — NO new
  collections/rules/indexes/cron. Engine: `src/lib/leaderboard/history.ts`
  (pure, unit-tested) + `src/lib/leaderboard/sparkline.ts`; API enrichment is
  fail-soft in `/api/portal/leaderboard`; UI in `LeaderboardTable.tsx` +
  `Sparkline.tsx`.
- Verified: tsc, 346/346 vitest (14 new engine + 5 sparkline tests),
  production build, per-task opus reviews + final whole-branch opus review
  (READY TO MERGE), signed-in screenshots light+dark, desktop+390 (real data =
  only 3 reps, so chase/sparklines verified via a browser-level API mock of an
  8-rep board — display-only, nothing written to Firestore). 0 console errors.
  Shots in `.superpowers/sdd/shots/`.
- **CAUTION for the deploy decision**: a stray external commit `413dda2`
  ("feat(sales): add Xfinity carrier with 8 plans") landed on master mid-run
  from ANOTHER session — pushing master deploys leaderboard phase 1 + phase 2
  + that Xfinity change together. Verify the Xfinity commit is wanted before
  pushing.
- Deferred fast-follows (final-review minors, none blocking): hoist dayKey's
  Intl formatter to module level; dedupe chip styling in LeaderboardTable;
  short-circuit history for the weekly limit-1 call; bonus-points wiring still
  pending client sign-off; expandable week-by-week rows deliberately out.

## Session Handoff 2026-07-10 — Leaderboard Broadcast redesign shipped (local)

### Completed (this session)
- **Leaderboard "Broadcast" redesign implemented and verified** (commit
  `7ea24cd` on master, **LOCAL ONLY — NOT PUSHED**; pushing auto-deploys to
  production, user has not approved deploy yet). Files:
  `src/app/portal/leaderboard/page.tsx`,
  `src/components/leaderboard/LeaderboardTable.tsx`. Full spec (still
  accurate): `docs/redesign/leaderboard-2c-spec.md`. Locked pattern updated in
  `docs/redesign/ANCHOR.md` §9 ("Locked leaderboard pattern v2").
- Design chosen by the user across 3 mockup rounds (9 HTML mockups, built by
  Codex/gpt-5.6-luna, live-reviewed). Winner = "2C Broadcast": weekly
  challenge docked in the command band, podium + crown + count-up + baseline,
  "Across the board" ticker (top closer / closest race / your climb / team
  pulse), continuous chase table with gap-to-next chips + progress bars on the
  user's row and neighbors.
- Verified: tsc, eslint (touched files), production build, independent
  Claude (opus) diff review (2 defects found and fixed: skeleton geometry,
  weekly-challenge zero-sales stuck on "Loading"), signed-in screenshots
  light+dark, desktop+390px mobile (2 mobile defects found and fixed:
  duplicated challenge label, podium stacking 2-1-3 instead of 1-2-3).

### Decisions / constraints for phase 2
- **Deferred, needs rank-history storage**: rank-movement arrows, 7-day
  sparklines, streaks, expandable week-by-week rows. Phase 2 starts with a
  rank/points snapshot store (e.g. scheduled aggregation into a
  `leaderboardSnapshots` collection) — API is currently computed on the fly in
  `/api/portal/leaderboard` with no history.
- **Challenge bonus points NOT displayed** ("+15 bonus pts" from the mockup):
  not wired into scoring; showing an unpaid reward would mislead reps. Needs
  client sign-off + scoring change before display. Challenge target is
  tunable: `WEEKLY_CHALLENGE` const at top of the leaderboard page.tsx.
- Data shape available to the page: `{rank, salesRepId, salesRepName,
  totalSales, totalPoints}` per entry + server-computed `currentUser`. The
  page calls `useLeaderboard()` twice (main period + a 'week' instance for the
  challenge); both auth-gated on `user`.

### Gotchas discovered
- **Tailwind v4 scans repo .md files**: a Windows-style path with backslashes
  (`\11c6bab0...`) in a committed doc parses as a CSS escape → build fails
  with "Invalid code point". Use forward slashes in all committed docs.
- Dev server: port 3000 is often held by a stale process; `npm run dev` falls
  back to 3002. Check the dev-task output for the real port.
- QA bots (`qa-e2e-*@3cworldgroup.test`) exist but `E2E_BOT_SECRET` is not in
  `.env.local` — their passwords are unknown; resetting them requires the
  user to run `node scripts/e2e-create-test-user.mjs` themselves (permission
  classifier blocks credential actions in auto mode). This session verified
  signed-in via the user logging into the Playwright browser manually.
- The permission classifier also blocks Admin SDK custom-token minting and
  credential grepping — don't attempt; ask the user.

### Next task (user-stated): Phase 2
Rank history + the deferred features. Suggested slices: 1) snapshot storage +
API extension (needs approval per ANCHOR scope — API changes were out of
redesign scope, phase 2 is a feature, confirm with user), 2) movement arrows
from snapshot delta, 3) sparklines, 4) streaks. Also pending user decisions:
push/deploy the leaderboard commit; bonus-points wiring.

## Session Handoff 2026-07-10 — Postmark live, form-submission emails shipped

### Completed (this session)
- **Postmark approved + fully configured.** POSTMARK_SERVER_TOKEN and
  EMAIL_FROM (`alerts@3cworldgroup.com`, domain signature) are set in Vercel
  production (verified via `vercel env ls`) AND `.env.local`. A real test
  email was sent through the API and delivered — token + sender confirmed
  working. This closes the "STILL MISSING" item in the 2026-07-08 deploy
  checklist (item 3) and unblocks item 5.
- **Form-submission email alerts shipped** (commit `3a5029e` on master,
  deployed): `src/lib/forms/notifySubmission.ts` now also emails each
  admin/operations user (users/{uid}.email) via the existing
  `src/lib/email/sendEmail.ts`, using a new `formSubmissionEmail` template in
  `src/lib/email/templates.ts`. Same per-form `formAlerts/{key}` toggle gates
  bell + email together; email failures are logged, never block submission.
  Implementation by Codex, diff-reviewed; tsc + production build green.
- **Deploy note — git integration is NOW ACTIVE**: the push to master
  auto-deployed to production (deployment aliased to www.3cworldgroup.com,
  Ready). The 2026-07-09 note "no git integration, manual `vercel deploy
  --prod`" is obsolete. This deploy also shipped the 796ad2b chat-hook
  changes that were waiting for "the next deploy" (follow-up 2 below).
- ONBOARDING_FIELD_ENCRYPTION_KEY confirmed present in Vercel production —
  the only remaining pre-Formstack-cancellation item is the USER rotating the
  Formstack password.
- Gotcha: `.gitignore` has `.env*`, which excludes even `.env.example` — its
  Postmark placeholder additions exist locally but cannot be committed.

### Next section (suggested order)
1. **Final Verification E2E smoke** from the onboarding-automation plan, now
   unblocked by Postmark: signup -> pending_assignment alert -> role assign ->
   checklist email -> e-sign (SignWell test_mode) -> webhook approve ->
   activate. Emails now actually send, so verify real delivery too.
2. **Formstack cancellation**: everything technical is done; user must rotate
   the Formstack password, then cancel the subscription.
3. **Mobile chat edit/delete bug** (user-reported 2026-07-06, still queued,
   scope never investigated).
4. Small cleanup: `bug-report/route.ts` still uses its own local
   `notifyAdmins` — no email, ignores formAlerts toggles; unify onto
   `notifySubmission`.
5. Leaderboard gamification round-2 mockups (see memory
   project-leaderboard-gamification).

## Session Handoff 2026-07-08 — Onboarding Automation (branch feat/onboarding-automation)

### Completed (this session)
All 14 tasks of `docs/superpowers/plans/2026-07-08-onboarding-automation.md`, executed
via subagent-driven development (Codex implementer, Claude reviewers; audit trail in
`.superpowers/sdd/progress.md`, untracked). Branch 53ae856..ff12e59 (24 commits) is
**merge-ready** per the final whole-branch review. NOT yet merged to main.

- **Roles**: general_manager, gm_in_training, office_manager; light-vetting (no
  SSN/DL/screen items); promotion warning when a light-vetting role is assigned
  without base onboarding history.
- **Checklist**: fcra_auth e-sign item; role-filtered vetting via appliesToRoles.
- **Comms**: shared createNotification (+6 types), Postmark sendEmail (never throws)
  + all transactional templates, dispatchToUser (bell awaited, push+email allSettled).
- **Alert engine**: alertTasks collection — broadcast to management, one-tap claim
  (transaction), resolve, 24h re-nag; GET /api/portal/alerts + claim route.
- **E-sign**: EsignProvider interface (frozen contract) + SignWell impl. Doc-verified:
  webhook HMAC key is the WEBHOOK ID, not the API key (resolution chain ending in
  SIGNWELL_WEBHOOK_ID env). Auto-send envelopes on wizard submit; webhook auto-approves.
- **Activation gate** (decision 6 behavior change): convert/approve no longer set
  status active. computeReadiness + POST /api/portal/onboarding/activate; an
  activation_ready alert fires when a pending user goes all-green; manager activates.
- **Stall cron**: hourly Vercel cron (vercel.json) — 24h/72h/7d nudges, 72h manager
  alert, 7d atRisk flag, alert re-nag; per-user failure isolation with incremental
  sent-tier persistence.
- **Self-signup funnel**: signup-notify -> pending_assignment alert; admin assigns
  role via picker (status STAYS pending) -> checklist-ready email + e-sign kickoff;
  pending badge/banner count role-less signups only.
- **UI**: admin ActionQueue (claim/Activate, 30s poll) + at-risk badges on review
  rows; rep onboarding wizard redesigned as a stepper (OnboardingWizard.tsx).
- **Auth fix (final-review Critical)**: pending users WITH a fieldRole can now sign
  in (mid-onboarding); only role-less pending signups hit the awaiting-approval
  screen (`src/lib/auth/pendingApproval.ts`).

Gates at HEAD ff12e59: tsc clean, 323/323 tests, production build clean.

### Deploy checklist — status as of 2026-07-09
MERGED to master (13de182, fast-forward) and DEPLOYED to Vercel production
(CLI deploy; no git integration on the Vercel project — deploys are manual
`vercel deploy --prod`).
1. DONE — firestore rules deployed.
2. DONE — alertTasks composite index (status+createdAt) added to
   firestore.indexes.json (53acd19) and deployed; other alert queries are
   equality-only (index merging, no composite needed).
3. PARTIAL — Vercel prod env set: CRON_SECRET (generated), APP_BASE_URL
   (`https://www.3cworldgroup.com` — apex 307s to www, use www everywhere),
   ESIGN_PROVIDER=signwell, SIGNWELL_TEST_MODE=true, SIGNWELL_API_KEY,
   SIGNWELL_WEBHOOK_ID (all mirrored in .env.local). Gotcha: pipe values via
   bash `printf '%s'`, PowerShell pipes append CRLF and Vercel rejects/breaks.
   DONE 2026-07-10: POSTMARK_SERVER_TOKEN + EMAIL_FROM set (see top handoff).
4. DONE — SignWell fully live, TEMPLATE-FREE (free plan's 1-template cap
   bypassed): signwell.ts posts /v1/documents with file_base64 from
   assets/esign/*.pdf (placeholders; generator script in scripts/) and coded
   field coordinates (ece0e40, coord fix 926140b). COORDS ARE 96DPI PIXELS
   FROM TOP-LEFT (sw = pt*4/3), not PDF points — placement visually verified
   via test_mode + embedded_signing preview. Webhook registered via API
   (works on free plan), ID 9f593de0-44af-4a6e-98e4-88ce59907901. Free tier
   = 25 API docs/mo; upgrade to Business ($30/mo) past ~6 hires/mo. Real
   PDFs later: drop into assets/esign/, adjust DOCUMENTS coords. W9 exists
   as a PDF but is NOT wired as a checklist docKey (deliberate, pending ask).
5. IN PROGRESS (Jacob) — Postmark: domain verification + account approval
   submitted 2026-07-09, approval can take ~24h. When token + from-address
   arrive: set POSTMARK_SERVER_TOKEN + EMAIL_FROM (Vercel prod + .env.local),
   `vercel deploy --prod`, then run the plan's Final Verification E2E smoke
   (signup -> alert -> role assign -> e-sign -> webhook approve -> activate).
NOTE: cron is DAILY at 14:00 UTC (a5db9d6) — Vercel Hobby forbids hourly.
Tiers (24h/72h/7d) still work, nudges just land up to a day late. Restore
`0 * * * *` on Pro upgrade, or hit the endpoint hourly from an external
scheduler with the CRON_SECRET bearer. Until Postmark/SignWell vars exist,
email + e-sign fail soft (by design) — invites won't send.

### Follow-ups (non-blocking, ranked)
1. `review_needed` AlertTaskKind declared + UI-handled but never produced — wire into
   the submit path or drop it.
2. DONE 2026-07-09 (796ad2b, rules deployed): the bell was never actually blocked
   (it reads via /api/portal/notifications, which allows self at any status). Real
   fixes: notifications rule tightened to self-only read / no client writes (any
   active user could previously read/update/spoof anyone's notifications via the
   client SDK), and the permission-denied console noise for pending reps traced to
   the chat listeners (useChatChannels via MobileBottomNav, useChatUnread's
   chatReads) — both now subscribe only when status is 'active'. Hook changes need
   the next `vercel deploy --prod` (fold into the Postmark redeploy).
3. Status-free write endpoints (e.g. POST /api/portal/sales) now reachable by
   pending+role reps pre-vetting — confirm intended or add status checks.
4. Escape user-sourced strings in email HTML; bell icon fallback for new notification
   types; activation_ready staleness if an item is rejected post-alert; kickoff-guard/
   signup-notify unit tests; GET checklist early-return lacks `progress` for role-less
   users; UserForm `as FieldRole` assertion; route auth hardening (plan-noted project).

### Open decisions
- Merge strategy (merge/PR): branch ready; superpowers:finishing-a-development-branch.
- Adobe Sign: if the tier includes API access, implement adobesign.ts against the
  frozen EsignProvider interface and flip ESIGN_PROVIDER — drop-in by design.

## Session Handoff 2026-07-07

### Completed (this session)
- **IBO role with 4 levels** — plan `~/.claude/plans/so-there-are-gonna-fluffy-hanrahan.md`.
  Added `ibo_level_1..4` to the `FieldRole` union (`src/types/auth.ts`, exports
  `IBO_FIELD_ROLES`), mirroring the l1/l2 manager pattern. Each level is its own
  pay tier in `DEFAULT_COMMISSION` (placeholder $0 base + override; admin fills
  real rates on `/portal/pay-structure`). IBOs behave exactly like L1/L2
  managers: `isManagerOrAbove` (`src/lib/auth/requireManagement.ts`), verified
  field-manager gate, Managers chat channel + pinning, manager calls, recruiting
  invite/convert, manager-interview + onboarding routes, all sidebar/palette/
  dashboard manager groupings. Existing `isIBO`/`iboOwnerId`/`iboName` fields
  are business-entity linkage, INDEPENDENT of these roles (documented in
  auth.ts) — untouched, no migration.
  Gates: tsc, 272 tests, build all green. Firestore rules DEPLOYED to prod.
  Client decisions: admin assigns levels manually; IBOs inherit the current
  broad manager sales visibility (team-only scoping deliberately deferred —
  would affect L1/L2 too).

### Open items / next steps
- Run the admin chat-channel sync once after the app deploys so existing
  Managers channel `memberIds` pick up IBO users.
- Future: automated payroll — on sale submission, compute pay from the rep's
  `fieldRole` commission tier. Client doesn't have the real pay scales yet.
- Pre-existing repo-wide lint debt still fails `npm run lint` (unrelated files).

## Session Handoff 2026-07-06

Operating rules for the next session: follow **# Model Routing & Orchestration**
in `~/.claude/CLAUDE.md` — the main loop orchestrates; delegate execution
(Codex/gpt-5.5 default, sonnet/opus subagents), review diffs against specs,
never spawn Fable subagents.

### Completed (merged + pushed — verified: master == origin/master @ `776c2a1`)
- University carriers + sales proof — plan
  `docs/superpowers/plans/2026-07-06-university-carriers-and-sales-proof.md`,
  all 8 tasks done, commit `f4b76ab`.
- Portal self-signup approval flow — plan
  `docs/superpowers/plans/2026-07-06-portal-self-signup-approval.md`, all 6
  tasks done, commit `5999da2`. Firestore rules deployed to prod
  (`cworldgroup-cca68`).
- Admin approve-pending-users fix — commit `776c2a1` (Approve action +
  "Pending approval" filter in `src/components/admin/UserTable.tsx` and
  `src/app/portal/admin/users/page.tsx`). Verified end-to-end (Playwright +
  Admin SDK reads); build passed. Landed on master and pushed.

### Completed (this session)
- University content upload — ALL 8 tasks done
  (`docs/superpowers/plans/2026-07-06-university-content-upload.md`). Admin
  upload page at `/portal/admin/university`, rep viewing on
  `/portal/training/[id]`. Storage rules DEPLOYED to prod. Full gates green
  (249 tests, tsc, build) plus a live Playwright smoke test: upload → save →
  rep view → delete → storage cleanup, all verified end-to-end.
  - Bug found by the smoke test and fixed in `3cbbd02`: the training POST API
    validated `type` before deriving it from `mimeType`, rejecting every save
    from the new form.
  - Prod infra fix (user-approved): granted `roles/datastore.viewer` to the
    Storage service agent (`service-55311478672@gcp-sa-firebasestorage`), which
    cross-service `firestore.get()` in storage.rules requires — without it all
    uploads got `storage/unauthorized`. Non-interactive `firebase deploy` skips
    this grant; remember it for future cross-service rules.
  - Smoke-test helpers left in `.audit/`: `uni-smoke-role.mjs` (role toggle by
    email), `uni-smoke-storage-check.mjs` (list `training/`),
    `uni-smoke-storage-cleanup.mjs`. QA bot `qa-e2e-1` restored to
    `l1_manager` (no `role` field), bucket `training/` prefix clean.

### Queued, not started
- Mobile chat edit/delete bug (user-reported; scope not yet investigated).

### Environment notes
- Dev server may still be running on `localhost:3000` from the previous session.
- Test fixtures cleaned up (pending-verify user deleted, qa-e2e-1 restored to
  `l1_manager`). Throwaway verification scripts live in `.audit/` — reusable
  for admin-flow verification, but resolve the QA bot by **email**, not
  hardcoded UID (stale UIDs previously caused a Firestore NOT_FOUND).
- E2E test-user creation pattern: `scripts/e2e-create-test-user.mjs`.

### Suggested order
1. Finish `feat/university-content-upload` tasks 6–8 per its plan file —
   delegate implementation to Codex with self-contained specs, review diffs,
   run gates via an agent; deploy the storage rule; merge/push. (Branch exists
   locally @ `a0d66a1`, not on origin.)
2. Investigate + fix the mobile chat edit/delete bug (delegate exploration).

## Product Intent

This app is becoming an internal sales-team operating portal for 3C World Group.
The public site and apply flow remain secondary. The main product is the
authenticated employee portal under `/portal`.

The boss-provided document appears to point toward replacing scattered email and
Connecteam-style workflows with a single internal portal:

- reps can see training, scripts, links, calls, shorts, leaderboard, pay info,
  sales, and onboarding status;
- managers/admins can manage recruiting, pipeline, onboarding review, user
  accounts, settings, and email-template copy;
- onboarding should happen in the website instead of email so recruits do not
  drop off from missed messages.

Design direction is now v3: polished but operational. Avoid decorative AI-looking
sections, giant marketing cards, or single-color gradient sludge. This should
feel like a sales ops command center that reps and managers can use every day.

## Stack

- Next.js 16.1.1 App Router, Turbopack
- React 19
- TypeScript strict
- Tailwind v4
- Firebase Auth client plus Firebase Admin SDK routes
- Cloud Firestore
- shadcn-style UI primitives live under `src/components/ui`
- Brand colors:
  - navy `#0A1F44`
  - green `#8dc63f`

## Run Commands

```bash
npm install
npm run dev
npm run build
npm run lint
npx tsc --noEmit
```

Dev server has been used at:

```text
http://127.0.0.1:3000
```

Static mockups are in:

```text
design-mockups/portal-redesign-v3/index.html
```

## Current Design System Direction

Use these portal patterns unless there is a strong reason not to:

- page wrapper: `mx-auto max-w-[1500px] space-y-5`
- narrower form wrapper: `mx-auto max-w-[1100px] space-y-5`
- hero/workbench header:
  `portal-panel portal-rail rounded-lg p-5 sm:p-6`
- main heading:
  `text-2xl font-semibold tracking-tight text-slate-950`
- intro copy:
  `mt-2 max-w-2xl text-sm text-slate-600`
- cards:
  `rounded-lg border-slate-200 bg-white py-0 shadow-sm`
- card header:
  `border-b border-slate-100 p-5`
- card content:
  `p-5`
- primary green buttons:
  `bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]`

Avoid:

- duplicate portal chrome inside pages already wrapped by a portal/admin layout;
- white text on the lime green primary button in portal screens;
- `rounded-xl` for portal cards unless the base UI primitive injects it and the
  local component overrides it;
- mojibake or decorative text symbols in UI copy;
- public-site hero/marketing patterns inside the portal.

## Role Model

Roles are split between platform and field roles. Keep this invariant:

```ts
type PlatformRole = 'admin' | 'operations';
type FieldRole = 'entry_rep' | 'l1_manager' | 'l2_manager';
```

Important rules:

- Prefer `getEffectiveRole(user)` and `resolveRoles(rawRole, rawFieldRole)`.
- Do not add ad-hoc role checks in components when `ProtectedRoute`,
  `isRole(...)`, or `hasPermission(...)` already covers it.
- Platform users handle admin/ops workflows.
- Field reps and managers use rep-facing portal workflows.
- IBO is an opt-in flag, not a role.

## Major Features Now Present

Employee portal:

- dashboard
- sales list, detail, edit, and create
- approvals
- leaderboard
- pay structure
- calls schedule
- training/university module list and detail
- quick links
- shorts
- chat
- personal settings
- rep onboarding checklist

Admin/ops portal:

- recruiting
- pipeline command center
- onboarding review
- user management
- system settings
- email templates

Public/recruit flow:

- public apply page
- public onboarding token route under `/onboard/[token]`
- recruiting APIs and public application APIs

## Latest Completed Pass

The most recent pass did five things:

1. Polished admin users:
   - `src/app/portal/admin/users/page.tsx`
   - `src/app/portal/admin/users/new/page.tsx`
   - `src/app/portal/admin/users/[id]/page.tsx`
   - `src/components/admin/UserTable.tsx`
   - `src/components/admin/UserForm.tsx`

2. Polished admin settings:
   - `src/app/portal/admin/settings/page.tsx`

3. Polished email templates:
   - `src/app/portal/admin/email-templates/page.tsx`

4. Portal consistency sweep:
   - `src/app/portal/onboarding/page.tsx`
   - `src/app/portal/error.tsx`
   - `src/components/auth/LoginForm.tsx`
   - `src/components/sales/SalesTable.tsx`
   - `src/components/leaderboard/LeaderboardTable.tsx`
   - `src/components/leaderboard/RankCard.tsx`

5. Verification:
   - TypeScript passed.
   - Targeted ESLint on touched files passed.
   - Route smoke checks passed.
   - Production build passed.
   - `git diff --check` passed.

## Verification Evidence From Current Checkpoint

Passed:

```bash
npx tsc --noEmit
npx eslint src/app/portal/admin/users/page.tsx src/app/portal/admin/users/new/page.tsx 'src/app/portal/admin/users/[id]/page.tsx' src/components/admin/UserTable.tsx src/components/admin/UserForm.tsx src/app/portal/admin/settings/page.tsx src/app/portal/admin/email-templates/page.tsx src/app/portal/onboarding/page.tsx src/app/portal/error.tsx src/components/sales/SalesTable.tsx src/components/leaderboard/RankCard.tsx src/components/leaderboard/LeaderboardTable.tsx src/components/auth/LoginForm.tsx
npm run build
git diff --check
```

Route smoke checks returned `200`:

```text
/portal/admin/users
/portal/admin/users/new
/portal/admin/users/sample
/portal/admin/settings
/portal/admin/email-templates
/portal/onboarding
```

Full `npm run lint` is not green yet. Current failures are pre-existing or
outside the polished portal slice:

- public marketing page `react/no-unescaped-entities` issues;
- a few API `prefer-const` issues;
- `src/contexts/AuthContext.tsx` React hook lint around synchronous setState in
  an effect.

Do not claim full lint is clean until those are fixed.

## Known Local State Notes

The working tree has a lot of portal redesign work compared with the previous
commits. Some directories are new:

- `design-mockups/`
- `src/components/ui/`
- `src/app/portal/chat/`
- `src/app/api/portal/chat/`
- `src/app/portal/admin/recruiting/`
- `src/app/api/portal/recruiting/`
- `src/app/api/public/`
- `src/app/onboard/`
- `src/lib/recruiting/`
- `src/types/chat.ts`
- `src/types/recruiting.ts`
- `components.json`

These are intentional for this checkpoint. Do not delete them as "untracked
noise" without checking the feature first.

## Claude Max Workflow Recommendation

Use Claude for focused design/code review loops, not broad rewrites.

Suggested sequence:

1. Start dev server and inspect the portal pages live.
2. Compare live portal screens against `design-mockups/portal-redesign-v3`.
3. Run a visual QA pass on mobile and desktop widths.
4. Fix only visible inconsistencies or bugs.
5. Run targeted ESLint on changed files, then `npx tsc --noEmit`, then
   `npm run build`.
6. Only after the portal is stable, clean the unrelated global lint debt.

Prompt Claude with explicit constraints:

```text
You are working on the employee portal only. Do not redesign the public marketing
site. Preserve current data behavior. Use the existing v3 portal visual system:
portal-panel, portal-rail, rounded-lg cards, navy text, lime primary buttons with
navy text. Do not introduce new routes unless required. Do not remove role gates.
Run targeted lint, TypeScript, route smoke, and build before final.
```

## Next Good Tasks

If the boss wants more polish:

- run browser visual QA on each portal page at desktop and mobile;
- tighten public apply to match the recruiting/onboarding flow;
- add actual onboarding document requirements when leadership provides them;
- clean global lint debt;
- review Firebase route authorization server-side before production launch;
- add a small QA checklist page or doc for managers testing recruiting and
  onboarding.

## Hard Constraints To Preserve

- The app should not store raw SSNs, card numbers, or bank-account numbers.
  Store status/reference/vendor token only.
- The admin email-templates page is copy-paste only, but the app DOES send
  transactional email via Postmark (`src/lib/email/sendEmail.ts`) as of
  2026-07-10 — onboarding comms, alert broadcasts, form-submission alerts.
- Google Meet links only for calls; no in-app video hosting.
- Pipeline stage is derived from user/onboarding/channel/sales state, not a
  manually stored stage.
- Do not link to `/portal/login`; `/portal` is the login entry.
