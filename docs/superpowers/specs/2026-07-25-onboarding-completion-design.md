# Onboarding completion: access lock, universal checklist, signature integrity

Date: 2026-07-25. Approved by client (plain-language walkthrough, four decisions
recorded below).

**DO NOT DEPLOY.** Local commits only. No `git push` — a push triggers a Vercel
production deploy. No `firebase deploy`. The Firestore rules change in this spec
is written and committed but NOT deployed; deploying it is the client's call at a
later date. Any agent implementing from this spec that finds itself about to run
`git push`, `vercel`, or `firebase deploy` has misread its instructions.

## Why this exists

The onboarding pipeline is largely built and works: invite → hashed single-use
token (14-day) → checklist → uploads → single submit → auth user created with
rollback → e-sign auto-send → per-item admin review → automatic activation →
stall-nudge cron. Three things are wrong with it, and one premise the client
held turned out not to be true.

1. Nothing confines a rep who has not finished onboarding. They sign in and get
   nearly the whole portal.
2. Seven of the eight roles the recruiting invite form offers strand the
   candidate permanently.
3. A failed e-signature send degrades silently into a free-text box the
   candidate can type anything into.

## Relationship to the 2026-07-09 spec

`docs/superpowers/specs/2026-07-09-entry-level-rep-onboarding-gate-design.md`
established `entry_level_rep` as the *only* onboarding role, and made assigning
any other role to a pending user activate that account immediately. Both were
deliberate, client-approved decisions.

**This spec supersedes both.** The client was shown the conflict explicitly and
chose the new behaviour on 2026-07-25. That earlier spec is not deleted; it
remains the record of what was true between 2026-07-09 and now.

Two things from it survive unchanged:

- The **Accept** button on the users page (confirm-dialog bypass of remaining
  onboarding) is KEPT. An explicit, guarded, human-decided override is a
  different thing from the silent accidental bypasses this spec closes.
- `entry_level_rep` still graduates to `entry_rep` on completion.

What that spec never covered — and the source of the worst bug here — is the
**recruiting invite path**. Its rules governed `PUT /api/portal/auth/users/[id]`
only. Nobody ever decided what an invited L1 manager should do, so nothing does.

## Client decisions (2026-07-25)

1. **Access model:** onboarding plus a small welcome set. Not a hard lock, not
   the status quo.
2. **Who onboards:** everyone invited — rep, manager, or IBO — on the same
   checklist, activating into whichever role they were invited as.
3. **E-sign failure:** hold the item, retry automatically, alert ops.
4. **Welcome set contents:** Team Chat, University + Resources, Calls Schedule.
   Explicitly NOT Dashboard or Leaderboard.

---

## Section 1 — The access lock

### 1.1 One source of truth

New file: `src/lib/auth/onboardingAccess.ts`. It is the only place in the
codebase that may state what an unfinished hire can reach.

It exports:

- `ONBOARDING_ALLOWED_PAGES: readonly string[]` — portal path prefixes.
- `ONBOARDING_ALLOWED_APIS: readonly string[]` — API path prefixes.
- `isOnboardingAllowedPage(pathname: string): boolean`
- `isOnboardingAllowedApi(pathname: string): boolean`
- `isOnboardingUser(user: { status?: string; fieldRole?: FieldRole }): boolean`
  — true when `status === 'pending'` AND `roleRequiresOnboarding(fieldRole)`.
  This is the same test the API layer uses, so client and server cannot
  disagree about who counts as "still onboarding."

Matching is prefix-based on path segments (`/portal/training` matches
`/portal/training/abc` but must NOT match `/portal/trainingfoo`). Implement with
a segment-aware helper, not bare `startsWith`.

**Allowed pages:**

```
/portal/onboarding
/portal/chat
/portal/training
/portal/resources
/portal/calls
/portal/settings
```

**Allowed APIs:**

```
/api/portal/onboarding      (all methods, all sub-paths)
/api/portal/training        (incl. /[id] and /progress)
/api/portal/commission      (the pay lane on /portal/resources)
/api/portal/calls
/api/portal/notifications   (the bell is in the header on every page)
/api/portal/profile
/api/portal/presence
/api/portal/push/register
/api/portal/chat/channels
/api/portal/chat/channels/[channelId]/media
/api/portal/chat/channels/[channelId]/members
/api/portal/chat/gifs
/api/portal/chat/media
/api/portal/chat/messages
/api/portal/chat/messages/pin
/api/portal/chat/reactions
```

Three chat routes are deliberately NOT on the list — `channels/manage`,
`channels/sync`, and `channels/[channelId]/members/manage` are channel
administration and keep their own management gates.

The allowlist is path-based, not method-based: being listed relaxes only the
`pending` status check. It grants no permission a rep does not already hold, so
an admin-only method on a listed path (e.g. `PUT /api/portal/commission`) stays
closed to a hire through its existing role check.

**Explicitly NOT allowed** (these currently pass `allowOnboarding: true` and
must stop): `/api/portal/leaderboard`, `/api/portal/sales`,
`/api/portal/sales/stats`.

The full current set of files passing `allowOnboarding` is, for reference:
`calls`, `commission`, `leaderboard`, `notifications`, `onboarding`,
`onboarding/submit`, `onboarding/upload`, `presence`, `profile`,
`push/register`, `sales`, `sales/stats`, `training/[id]`, `training/progress`,
`training`.

### 1.2 The three consumers

**Guard.** A client component — `src/components/portal/OnboardingGate.tsx` —
mounted inside `AuthProvider` in `src/app/portal/layout.tsx`, wrapping
`children`. `layout.tsx` is currently a server component and must stay one; the
gate carries its own `'use client'`.

Behaviour: read the user from `useAuth()`. While `loading`, render children
unchanged (no flash, no premature redirect). When `isOnboardingUser(user)` and
`!isOnboardingAllowedPage(pathname)`, `router.replace('/portal/onboarding')`
and render nothing for that frame. Everyone else is untouched — an active rep,
an admin, and a signed-out visitor must all see exactly today's behaviour.

**Navigation.** `PortalSidebar.tsx`, `MobileBottomNav.tsx` and
`CommandPalette.tsx` filter their item lists through
`isOnboardingAllowedPage` when `isOnboardingUser(user)`. A hire sees five real
destinations, not a menu of doors that bounce them back. `CommandPalette.tsx:87`
already gates "My Onboarding" on `roles: ['entry_level_rep']` — widen that to
every onboarding role.

Landing: a pending hire signing in arrives at `/portal/onboarding`, not
`/portal/dashboard`.

**API helper.** `src/lib/auth/requireVerifiedAdmin.ts` — the per-route
`allowOnboarding` boolean is replaced by a lookup against
`ONBOARDING_ALLOWED_APIS` keyed on `request.nextUrl.pathname`. The
`allowOnboarding` option is removed from the helper signature and from all 15
call sites. `checkStatus()`'s existing semantics are otherwise unchanged: it
still admits `pending` only when a field role is present, and never admits
`inactive` or a pending self-signup with no field role.

Keep `requireVerifiedManagement` in `notifications/route.ts` (~line 126)
untouched — it is a deliberate management-only branch inside an otherwise
rep-facing route.

### 1.3 Firestore rules

`firestore.rules` currently gates chat on `isApproved()`, which requires
`status == 'active'`. Add a companion:

```
function isOnboardingMember() {
  return request.auth != null &&
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.status == 'pending' &&
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.fieldRole != null;
}
```

Chat read/write conditions become `isApproved() || isOnboardingMember()`. Every
other use of `isApproved()` stays exactly as it is — in particular
`userProgress`, `sales` and `leaderboard` must not gain this.

This closes to unapproved self-signups (no field role) and to deactivated
accounts (`status == 'inactive'`), which is the distinction that matters.

**Written and committed, not deployed.**

### 1.4 The test that keeps this from rotting

A unit test asserting that the page list and the API list agree: for every
allowed page, the API routes that page depends on are allowed; and no API is
allowed whose only consumer is a blocked page. Maintain the page→API dependency
map inside the test file itself so the assertion is readable and reviewable.

This is the load-bearing test. Without it the two lists drift and the lock
silently develops holes — the exact failure mode the 2026-07-25 security work
existed to fix.

---

## Section 2 — Everyone onboards

### 2.1 The one-function fix

`src/types/auth.ts:159` — `roleRequiresOnboarding(fieldRole?: FieldRole)`
currently returns `fieldRole === 'entry_level_rep'`. It becomes: true for any
field role that can be invited, i.e. membership in the eight-role set already
declared as `ROLE_OPTIONS` in `src/app/portal/admin/recruiting/page.tsx`:

```
entry_level_rep, entry_rep, l1_manager, l2_manager,
ibo_level_1, ibo_level_2, ibo_level_3, ibo_level_4
```

Move that list out of the page component into `src/types/auth.ts` as an
exported `INVITABLE_FIELD_ROLES`, and have both the recruiting page and
`roleRequiresOnboarding` read it. `general_manager`, `gm_in_training` and
`office_manager` are not invite targets and do not require onboarding.

`BASE_VETTING_ROLES` in `src/types/onboarding.ts` already contains all eight, so
`getOnboardingItemsForUser` produces the correct packet for every role the
moment the early return stops firing. **No change to `ONBOARDING_ITEMS` is
needed** — four items apply to all roles, three to all vetting roles, three are
IBO-only.

Five systems come alive from this single change, all through existing tested
code paths: checklist generation, the stall/nudge cron
(`src/lib/onboarding/stallDetection.ts:50`), activation readiness, automatic
activation, and the manual Activate endpoint.

### 2.2 Graduation

`src/lib/onboarding/activation.ts` and
`src/app/api/portal/onboarding/activate/route.ts:53-55` both hardcode
`fieldRole: 'entry_rep'` on activation. Replace with a single exported helper —
`graduatedFieldRole(fieldRole: FieldRole): FieldRole` — returning `entry_rep`
for `entry_level_rep` and the input role unchanged for everything else. Both
call sites use it. An invited L1 manager finishes their packet and activates as
an L1 manager.

### 2.3 The second door

`src/app/api/portal/auth/users/[id]/route.ts:198-205` computes
`shouldActivateImmediately`, which activates a pending user the moment an admin
assigns them a field role that doesn't require onboarding. With 2.1 in place
that condition is false for all eight invitable roles, so the behaviour changes
on its own — but the dead branch must be removed rather than left to look
meaningful, along with any now-unreachable "your account is active" dispatch on
that path.

Assigning a field role to a pending self-signup now enrols them in onboarding:
kick off the checklist and auto-send e-sign documents, same as the invite path.
Concretely, `shouldKickoffChecklist` (same file, line 197, consumed at line 272)
currently fires only when the assigned role is `entry_level_rep`; widen it to any
role for which `roleRequiresOnboarding` is true.

**The Accept button stays.** `src/components/admin/UserTable.tsx` and
`src/app/portal/admin/users/page.tsx:338` — unchanged behaviour, unchanged
confirm dialog. Update its dialog copy so it names what is being skipped now
that every invited role has a real packet.

### 2.4 Recruiting page

`src/app/portal/admin/recruiting/page.tsx` — the "Activate" control is
cosmetic; wire it to `POST /api/portal/onboarding/activate`. That endpoint
already returns 409 with a `missing` array when the rep is not ready; surface
those item labels in the UI rather than a generic failure.

---

## Section 3 — Signature integrity

### 3.1 What is wrong

`src/lib/esign/autoSend.ts` sends four documents (`fcra_auth`, `contract`,
`direct_deposit`, `pay_structure`). Three defects compound:

- A per-item `createEnvelope` failure is caught and only `console.error`'d. The
  item stays `not_started`, and the checklist UI falls back to the generic
  free-text reference input — the candidate can type anything and it counts.
- `getEsignProvider()` is called *outside* the per-item try/catch, so a bad
  `ESIGN_PROVIDER` value throws before the loop and **all four** fail at once.
- Both call sites use `void sendPendingEsignDocs(...).catch(console.error)` —
  fire-and-forget. Nothing downstream ever learns it failed.

### 3.2 Record the failure

On a caught `createEnvelope` error, merge onto `userOnboarding/{userId}_{itemId}`:

```
esignDispatch: {
  state: 'failed',
  attempts: <n+1>,
  lastError: <message, truncated>,
  lastAttemptAt: <Date>,
}
```

Move `getEsignProvider()` inside the error handling so a provider-level throw
marks every applicable e-sign item failed rather than dying before the loop.

### 3.3 Lock the item

The rep-facing checklist renders an item with `esignDispatch.state === 'failed'`
as a locked card reading *"Preparing your document — check back shortly."* No
text input, no submit affordance. Items in the normal sent state keep the
existing `ESIGN_HELPER_TEXT`.

### 3.4 Retry, then escalate

- **On checklist load:** `GET /api/portal/onboarding` triggers a retry for
  failed items, throttled by `lastAttemptAt` (no retry within 5 minutes). Keep
  it non-blocking — the checklist response must not wait on the provider.
- **Backstop:** the existing daily onboarding cron retries failed items.
- **Escalate:** at `attempts >= 3`, raise an alert task through the existing
  `src/lib/alerts/alertTasks.ts` machinery so it lands in the ops Action Queue
  alongside stalled candidates. One task per user, not per item; resolve it when
  the envelope succeeds.

### 3.5 Refuse it server-side

`POST /api/portal/onboarding/submit` rejects any client-supplied reference for
an item whose `referenceKind === 'esign'` (use the existing `isEsignItem` from
`src/lib/onboarding/esign.ts`), returning 400. Those items are completed only by
the provider webhook.

This is the hard guarantee. Even if the UI regresses, a contract cannot be
marked signed by typing into a box.

---

## Section 4 — Leftovers

- **Dead metadata.** `signatureProvider: 'adobe_sign'` on `contract`,
  `direct_deposit` and `pay_structure` in `src/types/onboarding.ts` has zero
  consumers anywhere in the codebase and contradicts the only implemented
  provider. Remove the three values. Keep the optional field on the type and
  keep the `adobe_sign` branch in `src/lib/esign/provider.ts:32-35` — that is
  where a real Adobe integration plugs in if the client obtains API access.
- **Test-mode guard.** `src/lib/esign/signwell.ts:127` passes
  `test_mode: process.env.SIGNWELL_TEST_MODE === 'true'` with no environment
  check. Documents signed in test mode are not binding. Throw at envelope
  creation when test mode is requested and `VERCEL_ENV === 'production'` (or
  `NODE_ENV === 'production'` outside Vercel), with a message naming the
  variable.
- **Upload gate ordering.** `src/app/api/portal/onboarding/upload/route.ts`
  parses the multipart body before its auth gate, because the target userId
  lives in the form data. Take the identity from the verified token and gate
  first; this is a free DoS amplifier for an unauthenticated caller today.
  (Carried over from the 2026-07-25 security work as a deliberately deferred
  item.)

---

## Testing

Unit (vitest):

- **Page/API agreement** (Section 1.4) — the load-bearing one.
- `isOnboardingUser`: pending+field role true; pending without field role false;
  active false; inactive false.
- Prefix matching: `/portal/training/abc` allowed, `/portal/trainingfoo` not.
- `roleRequiresOnboarding` across all eight invitable roles plus the three
  non-invitable ones.
- `getOnboardingItemsForUser` for each of the eight roles, IBO and non-IBO —
  assert the IBO-only trio appears only when `isIBO`.
- `graduatedFieldRole` for all eight roles.
- `autoSend`: envelope failure writes `esignDispatch`; provider-level throw
  marks all applicable items; retry throttle respects `lastAttemptAt`; the
  alert task fires at three attempts and not before.
- `submit`: a typed reference for an e-sign item is rejected 400.
- Test-mode guard throws in production, passes otherwise.
- Existing `activation.test.ts` and `stallDetection.test.ts` updated — several
  assertions there encode the old single-role rule and will fail correctly.

Gates: `npx tsc --noEmit`, `npm test`, `npm run build`, and eslint clean on
changed files (the repo has 26 pre-existing errors in marketing pages and two
chat hooks — do not attempt to fix those, and do not report the repo as clean).

Manual verification is limited and must be reported honestly:

- No SignWell API key is available in this environment. The signature path is
  unit-tested only; "a real envelope arrives in an inbox" is UNVERIFIED and must
  be stated as such.
- Firestore rules are not deployed, so chat access for a pending hire cannot be
  confirmed against production.
- Browser checks run against the local dev server only.

## Out of scope

- No Firestore data migration. Users already `pending` under the old rules keep
  their current role and status; they gain a checklist the next time their
  record is read, which is the intended outcome.
- No per-role checklist variation. The client chose one packet for everyone;
  `appliesToRoles` and `iboOnly` remain in the item table and can express that
  later without a redesign.
- No change to the invite token, upload, storage-verification or webhook
  mechanics beyond what Section 3 and Section 4 name.
- No Adobe Sign implementation.
- Nothing deployed.
