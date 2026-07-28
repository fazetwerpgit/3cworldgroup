# Task 9 report — onboarding completion

## Per-step summary

1. Verified `grep -rn "signatureProvider" src/` before editing. Removed the
   three dead `signatureProvider: 'adobe_sign'` item values while retaining the
   optional type field and the unimplemented Adobe provider branch.
2. Added the SignWell production guard. `SIGNWELL_TEST_MODE=true` now throws
   with a `SIGNWELL_TEST_MODE` message in Vercel production or non-Vercel
   production; development and absent/false production settings continue.
3. Moved verified authentication before `request.formData()`. The upload
   folder now uses the verified token UID and ignores any body `userId`. Added
   tests for gate-before-parse and UID substitution. The existing portal
   `FileUpload` caller continues passing auth through `getHeaders`.
4. Replaced the invite route's all-field-role validation with
   `INVITABLE_FIELD_ROLES`; added a direct-POST rejection test for
   `general_manager`.
5. Added positive checklist-count tests for L1 Manager and IBO Level 1 with
   both IBO flag values, plus the `BASE_VETTING_ROLES` /
   `INVITABLE_FIELD_ROLES` set-lockstep invariant.
6. Exported and reused `isEligibleChatMember` in the member roster and admin
   addable picker. Active users and pending onboarding hires are eligible;
   pending self-signups and inactive users are not. Added the required roster
   test.
7. Added the optional prefetched-user parameter to
   `getMemberIdsForAudience`, fetched active/pending cohorts once in
   `syncChatChannels`, and reused the in-memory cohort for every channel.
   Added a two-channel query-count test.
8. Updated the extra-member comment to describe eligible users and removed the
   abandoned `Array.isArray(value)` branch from the test `where()` double.
9. Replaced the hardcoded activation title inside `maybeFlagActivationReady`
   with the graduated role display name and dynamic article. Left
   `activateUser`'s role-neutral title untouched. Added the L1 Manager title
   test.
10. Replaced the admin Accept button's hand-copied entry-rep conditional with
    `graduatedFieldRole`.
11. Completed all gates below.
12. Commit is made locally after this report is staged, using the exact
    requested commit message. No push or Firebase command was run.

## Files touched

- `.superpowers/sdd/task-9-report.md`
- `src/types/onboarding.ts`
- `src/types/onboarding.test.ts`
- `src/lib/esign/signwell.ts`
- `src/lib/esign/signwell.test.ts`
- `src/app/api/portal/onboarding/upload/route.ts`
- `src/app/api/portal/onboarding/upload/route.test.ts`
- `src/app/api/portal/recruiting/invites/route.ts`
- `src/app/api/portal/recruiting/invites/route.test.ts`
- `src/lib/chat/channels.ts`
- `src/lib/chat/channels.test.ts`
- `src/app/api/portal/chat/channels/[channelId]/members/route.ts`
- `src/app/api/portal/chat/channels/[channelId]/members/route.test.ts`
- `src/lib/onboarding/activation.ts`
- `src/lib/onboarding/activation.test.ts`
- `src/app/portal/admin/users/page.tsx`

The repository's pre-existing untracked PNGs and mockup directory were not
staged.

## Bite-proof record

Every new test was run against a deliberate temporary fault, failed for the
expected reason, and was then reverted and rerun green.

- SignWell production rejection: changed the production guard to `false`;
  `throws when test mode is requested in production` failed because the call
  resolved instead of rejecting.
- SignWell development pass: changed the guard to `if (testMode)`;
  `passes in development when test mode is requested` failed because it
  rejected with `SIGNWELL_TEST_MODE`.
- SignWell absent/false production pass: forced `testMode = true`;
  both parameterized cases of `passes in production when SIGNWELL_TEST_MODE is`
  failed with `SIGNWELL_TEST_MODE`.
- Upload gate ordering: inserted a `request.formData()` call before the gate;
  `rejects before reading the multipart body when verification fails` failed
  because `formData` was called once.
- Upload identity: replaced `gate.uid` with `'attacker'`;
  `uses the verified UID for the folder instead of the body userId` failed
  because the folder path used `attacker`.
- Invite role gate: disabled the invalid-role condition;
  `rejects a direct invite POST for a non-invitable field role` failed with
  status 500 instead of the expected 400 after reaching requester lookup.
- Checklist positives: made `getOnboardingItemsForUser` return `[]`; all
  three cases of `returns the expected packet for %s (isIBO=%s)` failed with
  lengths 0 instead of 8/11/8.
- Checklist set invariant: added `general_manager` to
  `BASE_VETTING_ROLES`; `keeps the base-vetting and invitable role sets in
  lockstep` failed with 9 roles versus 8.
- Chat roster eligibility: removed the pending-hire predicate;
  `includes a pending hire in the roster but excludes self-signups and inactive
  users` returned an empty list instead of the pending hire.
- Chat sync hoisting: removed the prefetched-users argument inside the channel
  loop; `fetches active and pending cohorts once for all channels` observed six
  status queries instead of two.
- Activation title: restored the Account Executive hardcode;
  `names an invited l1 manager in the activation notification` received the
  Account Executive title instead of L1 Manager.

All temporary faults were reverted before the final gates. Test doubles added
for this task key lookups and filters on their supplied arguments.

## Gate outputs

- `npx tsc --noEmit`: passed, no output/errors.
- `npm test`: passed — 67 test files, 548 tests.
- `npm run build`: passed — Next.js production build compiled, type-checked,
  generated 114 static pages, and finalized successfully.
- `git diff --check`: passed.
- `npx eslint` on the union of `git diff --name-only e1b2173..HEAD` and the
  current Task 9 files, restricted to `.ts`/`.tsx`: exit 0, 0 errors. It
  reported three pre-existing warnings in
  `src/app/api/portal/training/[id]/route.ts` (unused destructured fields); no
  Task 9 lint errors were reported.

Lint scope:

```text
src/app/api/portal/auth/users/[id]/route.test.ts
src/app/api/portal/auth/users/[id]/route.ts
src/app/api/portal/calls/route.ts
src/app/api/portal/chat/channels/[channelId]/members/route.test.ts
src/app/api/portal/chat/channels/[channelId]/members/route.ts
src/app/api/portal/commission/route.ts
src/app/api/portal/leaderboard/route.ts
src/app/api/portal/notifications/route.ts
src/app/api/portal/onboarding/activate/route.test.ts
src/app/api/portal/onboarding/activate/route.ts
src/app/api/portal/onboarding/review/route.test.ts
src/app/api/portal/onboarding/review/route.ts
src/app/api/portal/onboarding/route.ts
src/app/api/portal/onboarding/submit/route.test.ts
src/app/api/portal/onboarding/submit/route.ts
src/app/api/portal/onboarding/upload/route.test.ts
src/app/api/portal/onboarding/upload/route.ts
src/app/api/portal/presence/route.ts
src/app/api/portal/profile/route.ts
src/app/api/portal/push/register/route.ts
src/app/api/portal/recruiting/convert/route.test.ts
src/app/api/portal/recruiting/convert/route.ts
src/app/api/portal/recruiting/invites/route.test.ts
src/app/api/portal/recruiting/invites/route.ts
src/app/api/portal/sales/route.ts
src/app/api/portal/sales/stats/route.ts
src/app/api/portal/training/[id]/route.ts
src/app/api/portal/training/progress/route.ts
src/app/api/portal/training/route.ts
src/app/api/public/onboarding/[token]/route.test.ts
src/app/api/public/onboarding/[token]/route.ts
src/app/api/webhooks/esign/route.test.ts
src/app/api/webhooks/esign/route.ts
src/app/onboard/[token]/page.tsx
src/app/portal/admin/onboarding/page.tsx
src/app/portal/admin/recruiting/page.tsx
src/app/portal/admin/users/page.tsx
src/app/portal/chat/page.tsx
src/app/portal/layout.tsx
src/app/portal/onboarding/page.tsx
src/components/onboarding/MemberLineOnboardingBoard.tsx
src/components/onboarding/OnboardingWizard.tsx
src/components/portal/CommandPalette.tsx
src/components/portal/MobileBottomNav.tsx
src/components/portal/OnboardingGate.test.tsx
src/components/portal/OnboardingGate.tsx
src/components/portal/PortalChrome.test.tsx
src/components/portal/PortalHeader.tsx
src/components/portal/PortalSidebar.tsx
src/components/portal/QuickActions.tsx
src/lib/auth/onboardingAccess.test.ts
src/lib/auth/onboardingAccess.ts
src/lib/auth/requireVerifiedAdmin.test.ts
src/lib/auth/requireVerifiedAdmin.ts
src/lib/chat/access.test.ts
src/lib/chat/access.ts
src/lib/chat/channels.test.ts
src/lib/chat/channels.ts
src/lib/esign/autoSend.test.ts
src/lib/esign/autoSend.ts
src/lib/esign/signwell.test.ts
src/lib/esign/signwell.ts
src/lib/onboarding/activation.test.ts
src/lib/onboarding/activation.ts
src/lib/onboarding/esign.ts
src/lib/onboarding/stallDetection.test.ts
src/types/alerts.ts
src/types/auth.test.ts
src/types/auth.ts
src/types/onboarding.test.ts
src/types/onboarding.ts
```

## Deviations and unverifiable items

- The upload route now uses `requireVerifiedUser`, so the verified caller UID
  is the only identity/target. A body `userId` remains accepted by the client
  form for compatibility but is ignored by the server. This follows the brief's
  explicit instruction not to trust body identity.
- Eslint emitted three warnings in a prior-task training route; they are not
  Task 9 changes and were not modified under the no-out-of-scope-change rule.
- Per the brief, no SignWell API key was available, so a real envelope arriving
  in an inbox is unverified. Firestore rules were not deployed, so production
  pending-hire chat access is unverified. No pending-hire browser account was
  available; redirect behavior remains unit-test covered. No browser/dev-server
  check was run.
