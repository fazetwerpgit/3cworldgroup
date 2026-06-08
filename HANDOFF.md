# 3C World Group Portal - Claude Max Handoff

For the next coding agent, especially Claude running a Max workflow. Read this
before touching code. This repo is in the middle of an employee-portal redesign,
not a public marketing-site redesign.

Last updated: 2026-06-08
Branch: `master`
Current checkpoint: portal UX redesign and admin polish pass

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
