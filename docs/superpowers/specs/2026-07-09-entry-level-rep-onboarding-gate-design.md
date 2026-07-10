# Entry Level Rep role + onboarding gate + accept bypass

Date: 2026-07-09. Approved by client (plain-language walkthrough).

## Business rules

1. New field role `entry_level_rep` ("Entry Level Rep") sits BELOW `entry_rep`
   ("Account Executive"). It is the only role that goes through the onboarding
   checklist. Existing users and the existing `entry_rep` role are NOT touched
   or migrated.
2. Assigning any role other than `entry_level_rep` (any other field role OR a
   platform role) to a `pending` user activates the account immediately: no
   checklist kickoff, no e-sign auto-send, no onboarding emails. The user gets
   a simple "your account is active" in-portal notification.
3. When the LAST applicable onboarding item of an `entry_level_rep` is
   approved (admin review or e-sign webhook), the user is automatically
   promoted to `entry_rep` (Account Executive) and their status is set to
   `active` — replacing today's "ready to activate" admin alert + manual
   one-click activate for this case.
4. Users page gets an **Accept** button for `pending` users WITH a fieldRole
   (today those show no action): it bypasses the rest of onboarding — if their
   role is `entry_level_rep` they are promoted to `entry_rep`, otherwise they
   keep their role — and sets status `active`. Confirm dialog before doing it.
   The existing green Approve button for role-less pending users is unchanged
   (but its role dropdown now includes Entry Level Rep and defaults to it).
5. The "promotion warning" (light-vetting role assigned without base
   onboarding) is obsolete under these rules: remove it (helper, tests, API
   response field, and the sessionStorage banner wiring on the users page).
6. Bug fix: `/portal/admin/users/[id]` (edit user page) has light-only
   backgrounds — add proper dark-mode classes consistent with
   `/portal/admin/users` (users list page).

## Touchpoints (verified against current code)

- `src/types/auth.ts` — add `entry_level_rep` to `FieldRole`, `FieldRoles`,
  `RolePermissions` (same perms as `entry_rep`), `RoleDisplayNames`
  ("Entry Level Rep"). Add `roleRequiresOnboarding(fieldRole?)` helper
  (true only for `entry_level_rep`). Do NOT add it to
  `MANAGEMENT_FIELD_ROLES`, `IBO_FIELD_ROLES`, or `LIGHT_VETTING_ROLES`.
- `src/types/onboarding.ts` — `getOnboardingItemsForUser` returns `[]` when
  `!roleRequiresOnboarding(fieldRole)`. Add `entry_level_rep` to
  `BASE_VETTING_ROLES` so the full (heavy-vetting) checklist applies to it.
  Any exhaustive `Record<FieldRole, ...>` maps repo-wide must gain the new
  key (TypeScript will surface them — fix all).
- `src/app/api/portal/auth/users/[id]/route.ts` (PUT) —
  - `shouldKickoffChecklist` = assigning `entry_level_rep` when the existing
    fieldRole isn't already `entry_level_rep`.
  - Instant activation: when the request assigns a role/fieldRole that does
    NOT require onboarding, the doc's current status is `pending`, and the
    request does not explicitly set `status`, write `status: 'active'`,
    resolve `pending_assignment` alert tasks, and `dispatchToUser` a simple
    system notification ("Your account is active"). Do not send checklist
    email or e-sign docs in this path.
  - Remove the `promotionWarning` computation and response field.
- `src/lib/onboarding/activation.ts` — replace/extend
  `maybeFlagActivationReady` with auto-activation: only for users whose
  fieldRole requires onboarding; when all items approved → transaction-ish
  update: `fieldRole: 'entry_rep'`, `status: 'active'`, notify the user
  ("Onboarding complete — you're now an Account Executive"), resolve their
  onboarding-related alert tasks. Callers: e-sign webhook
  (`src/app/api/webhooks/esign/route.ts`), onboarding review route,
  recruiting convert route — keep call sites, new behavior inside.
  `getActivationReadiness` should return not-ready (or be short-circuited by
  callers) for roles that don't require onboarding so no stray "ready to
  activate" alerts fire (`src/lib/onboarding/stallDetection.ts` also calls it —
  make stall detection skip non-onboarding roles).
- `src/app/api/portal/onboarding/activate/route.ts` (manual activate) — when
  activating an `entry_level_rep`, also promote to `entry_rep`.
- `src/lib/onboarding/promotionCheck.ts` + its test — delete; remove usage in
  the PUT route and the `adminUserPromotionWarning` sessionStorage
  read/write in `src/app/portal/admin/users/page.tsx` and wherever it is set
  (grep `adminUserPromotionWarning`).
- `src/components/admin/UserTable.tsx` — add `roleLabels` entry for the new
  role; add Accept button: shown when `user.status === 'pending' &&
  user.fieldRole` and an `onAccept` prop is provided.
- `src/app/portal/admin/users/page.tsx` — wire `onAccept` with a confirm
  modal (mirror the existing approve/delete modal pattern): body text
  explains it skips remaining onboarding and activates now (mention the
  Account Executive promotion when the target is an Entry Level Rep). On
  confirm: PUT to `/api/portal/auth/users/[id]` with `status: 'active'` and,
  if target fieldRole is `entry_level_rep`, `fieldRole: 'entry_rep'`.
  Approve modal's role dropdown default becomes `entry_level_rep`.
- Funnel entry points that mean "new rep entering onboarding" must now use
  `entry_level_rep` (grep `'entry_rep'` literals and judge each):
  known: approve-modal default on the users page; recruiting convert route
  (`src/app/api/portal/recruiting/convert/route.ts`) and any
  `intendedFieldRole` defaults in the recruiting/public-onboarding flow.
  Role dropdowns elsewhere (edit user page) just gain the new option via
  `FieldRoles`.
- Dark mode fix on `src/app/portal/admin/users/[id]/page.tsx` (or wherever
  that route's UI lives): audit for `bg-white` / light-only cards and add
  `dark:` variants matching the users list page idiom
  (`dark:bg-card`, `dark:text-foreground`, `dark:border-border`, etc.).

## Tests / gates

- Update/extend unit tests: `activation.test.ts` (auto-promote+activate path,
  non-onboarding role short-circuit), `stallDetection.test.ts`,
  `pendingApproval.test.ts` (unchanged semantics), remove
  `promotionCheck.test.ts`. Add a test for `roleRequiresOnboarding` and for
  `getOnboardingItemsForUser` returning `[]` for non-onboarding roles.
- Gates: `npx tsc --noEmit`, `npm test` (vitest), `npm run build`.
- Manual verification: Playwright screenshots of Users page (Approve +
  Accept buttons, light/dark) and the edit user page in dark mode.

## Out of scope

- No Firestore data migration. Existing `entry_rep` users keep role/title.
- firestore.rules unchanged (signup shape unchanged).
