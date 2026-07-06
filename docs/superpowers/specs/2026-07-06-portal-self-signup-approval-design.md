# Portal Self-Signup with Admin Approval — Design

Date: 2026-07-06

## Summary

Let people self-register for the portal (email + password); new accounts are **pending**
and cannot see any portal data until an admin approves them. The gate is enforced in
`firestore.rules` (server-side), not just the UI.

**Key decision (approved):** reuse the existing `status: "active"` as the "approved"
state rather than introducing a new `"approved"` literal. Existing users are all
`"active"`, so there is **no data migration and no lockout**. New self-signups get
`status: "pending"`; an admin flips them to `"active"` to approve.

## Status model (no type change)

`User.status` is already `'active' | 'inactive' | 'pending'` (`src/types/auth.ts`).
- `active` = approved, full access (all current users).
- `pending` = self-signed-up, awaiting approval (new).
- `inactive` = deactivated (existing).

## Flow

1. **Sign-up** (`/portal/signup`, new page, linked from the login screen):
   - `createUserWithEmailAndPassword(auth, email, password)` (client SDK).
   - Client writes `users/{uid}` = `{ email, status: "pending", createdAt: serverTimestamp() }`.
   - Sign the user out and show the **"Account pending approval"** screen.
2. **Login / signup gate** — `AuthContext.onAuthStateChanged` reads `users/{uid}`:
   - `status === "active"` → normal portal (unchanged behavior).
   - `status === "pending"` → sign out, set `pendingApproval`, show the pending screen.
   - `status === "inactive"` → sign out, show "account deactivated" message.
   - no doc → "profile not found" (unchanged).
3. **Approval** — an admin flips `pending → active` via the **existing** admin Users page
   (`PUT /api/portal/auth/users/{id}`, Admin SDK) or the Firebase Console. No client path
   can self-approve.

### Auth-state race (implementation note)
`createUserWithEmailAndPassword` signs the user in and fires `onAuthStateChanged` **before**
the `users/{uid}` doc write finishes. `signUp` must: create the user → `await setDoc(...)` →
`await signOut()` → set the final `{ user: null, pendingApproval: true }` state last, and the
`onAuthStateChanged` listener must **not** overwrite `pendingApproval` when it later fires with
a null user. Verify the pending screen shows reliably right after signup (tested in
verification).

## firestore.rules — the security core

Add a shared helper mirroring the existing `isManagement()`:

```
function isApproved() {
  return request.auth != null &&
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.status == 'active';
}
```

**`users/{userId}` block** — allow a user to create ONLY their own doc, ONLY pending, only
the three allowed fields; deny all other client writes (approval/profile changes go through
Admin SDK routes, which bypass rules):

```
match /users/{userId} {
  allow read: if request.auth != null && request.auth.uid == userId;   // self-read, any status (pending must read own doc)
  allow create: if request.auth != null && request.auth.uid == userId
    && request.resource.data.status == 'pending'
    && request.resource.data.keys().hasOnly(['email', 'status', 'createdAt']);
  allow update, delete: if false;                                       // no client self-approval, ever
}
```

The existing second `match /users/{userId}` (admin/ops read-all) stays. The old
`allow write: if role == 'admin'` client rule is **removed** — confirmed no client code
writes the `users/{uid}` doc (only the `chatReads` subcollection is client-written, and it
keeps its own rule).

**Approved gate on client-readable data collections** — replace `request.auth != null` with
`isApproved()` (which already includes the auth check) on the collections clients read/write
directly: `sales`, `notifications`, `training`, `userProgress`, `leaderboard`, the
`chatChannels` read + `messages`/`reactions` reads, and the `userOnboarding` /
`userChannelOnboarding` reads (kept alongside their existing own-or-management condition).
The `chatReads` subcollection read gains `isApproved()`; its write keeps its tight
own-uid + `lastReadAt`-only rule. Every server-only collection (`allow read, write: if false`)
is unchanged — the Admin SDK bypasses rules.

Net effect: a `pending` user is authenticated but `isApproved()` is false, so they can read
their own user doc (to see the pending screen) and nothing else.

## Components / files

- `firestore.rules` — helper + users rules + `isApproved()` gate (above). **Ship gate:**
  `firebase deploy --only firestore:rules` (user-approved; CLI is authed to `cworldgroup-cca68`).
- `src/contexts/AuthContext.tsx` — add `signUp(email, password)`; add `pendingApproval`
  boolean to state; refine the status branch (`pending` → `pendingApproval`, `inactive` →
  deactivated message); reset `pendingApproval` on a successful active sign-in.
- `src/app/portal/signup/page.tsx` (new) — the signup route, v3-styled to match the login page.
- `src/components/auth/SignupForm.tsx` (new) — email + password form (autocomplete
  `email` / `new-password`), inline error messages reusing the login page's error mapping;
  navy/lime tokens, `portal-*` classes; "Back to sign in" link.
- `src/components/auth/PendingApproval.tsx` (new) — the "Account pending approval" screen,
  same brand deck as the login page.
- `src/components/auth/LoginForm.tsx` — add a "Create an account" link to `/portal/signup`
  (small; the portal login area only).
- `src/app/portal/page.tsx` (renders `<LoginForm />` at line 38 when signed out) — render
  `<PendingApproval />` instead when `pendingApproval` is set.

## What NOT to touch
The public marketing site, `/apply` (`applications` collection), and the recruit /
onboarding-invite flow (`onboardingInvites`, `candidateOnboarding`, `recruiting/convert`,
`public/onboarding/[token]`). The disabled `api/portal/auth/signup/route.ts` stays disabled
(signup is client-side per the flow above).

## Testing
- Unit: a small pure `signupValidation(email, password)` helper (non-empty email, password
  length ≥ 6) with colocated Vitest tests; reuse `friendlyAuthError` for Firebase codes.
- Manual (signed-in, against deployed rules):
  1. Sign up → lands on "pending approval", is signed out, cannot reach the portal.
  2. In Firestore/admin, the new doc is `status: "pending"` with only the 3 fields.
  3. Flip to `"active"` (admin Users page) → the account can log in and use the portal.
  4. An existing `"active"` user is unaffected (sales/chat/training still work) — verifies no
     lockout.
  5. Confirm a `pending` user's client reads of `sales`/`training`/etc. are denied by rules.

## Ship gates
1. Deploy rules (`firebase deploy --only firestore:rules`) — the gate is inert until deployed,
   and existing `active` users keep working because the gate value is `active`.
2. Deploy the app (merge + push).

## Out of scope / deferred
- Email verification of the signup address, rate-limiting signups, and a dedicated admin
  "pending signups" queue (admins approve via the existing Users page, filterable by status).
- Notifying admins on new signups.
