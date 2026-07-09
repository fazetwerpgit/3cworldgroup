# 3C World Group Portal - Claude Max Handoff

For the next coding agent, especially Claude running a Max workflow. Read this
before touching code. This repo is in the middle of an employee-portal redesign,
not a public marketing-site redesign.

Last updated: 2026-07-08
Current checkpoint: see "Session Handoff 2026-07-08" below; the rest of this doc
is standing project background (intent, stack, design system, constraints) and
still applies.

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
   ESIGN_PROVIDER=signwell, SIGNWELL_TEST_MODE=true. Gotcha: pipe values via
   bash `printf '%s'`, PowerShell pipes append CRLF and Vercel rejects/breaks.
   STILL MISSING: SIGNWELL_API_KEY, SIGNWELL_WEBHOOK_ID, SIGNWELL_TEMPLATE_*
   (4), POSTMARK_SERVER_TOKEN, EMAIL_FROM — blocked on Jacob's accounts.
4. TODO (Jacob) — SignWell: 4 templates (single `signer` placeholder each);
   register webhook `https://www.3cworldgroup.com/api/webhooks/esign`;
   webhook ID -> SIGNWELL_WEBHOOK_ID (note: `_FCRA`, not `_FCRA_AUTH`).
5. TODO (Jacob) — Postmark server + verified sender. Then redeploy and run
   the plan's Final Verification E2E smoke.
NOTE: cron is DAILY at 14:00 UTC (a5db9d6) — Vercel Hobby forbids hourly.
Tiers (24h/72h/7d) still work, nudges just land up to a day late. Restore
`0 * * * *` on Pro upgrade, or hit the endpoint hourly from an external
scheduler with the CRON_SECRET bearer. Until Postmark/SignWell vars exist,
email + e-sign fail soft (by design) — invites won't send.

### Follow-ups (non-blocking, ranked)
1. `review_needed` AlertTaskKind declared + UI-handled but never produced — wire into
   the submit path or drop it.
2. Notifications firestore rule requires status active — pending reps get email/push
   but an empty bell (and console permission-denied noise). Consider self-only reads.
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
- Email templates are copy-paste only. The app does not send email.
- Google Meet links only for calls; no in-app video hosting.
- Pipeline stage is derived from user/onboarding/channel/sales state, not a
  manually stored stage.
- Do not link to `/portal/login`; `/portal` is the login entry.
