# Morning verification checklist — 2026-07-25 security branch

Branch `security/close-open-routes`. Nothing pushed, nothing deployed.

**No authenticated request was made against any of these routes overnight.**
Agents had no login, and were explicitly refused permission to create a
disposable admin account or sign in as a real employee against the live
Firebase project. So every item below is NOT VERIFIED — not "probably fine".

What WAS verified without credentials: typecheck, **425 tests**, eslint clean on
all 56 changed files, all 11 touched pages compile and render with a clean
console, and every gated method+path combo returns 401 rather than 404 —
confirming no URL was malformed while stripping identity query params.

The route table was then enumerated rather than trusted to a hand-written list:
**109 route+method pairs across 69 files, 0 ungated.** All 40 GETs probed with
no credentials, zero 200s. The 69 mutating pairs were **never probed** — doing so
means sending a body to a production-backed server — so they are source-read
only: unconfirmed, not cleared.

Several failures below are SILENT — no error banner, just wrong or missing
data. They are marked. Read those before you start.

**The highest-value account to test is a `pending`, mid-onboarding rep.** Every
regression this branch introduced landed on that state, and both were silent. Two
of them were found only by the adversarial review, after the implementation work
reported itself finished.

**Known-good baseline:** a hard-refresh 401 on the leaderboard, or silently empty
dropdowns on a form, are **pre-existing on master** — not from this branch. See
finding #8 in `2026-07-25-findings.md` before blaming the security work.

## MORNING CHECKLIST — every flow that is NOT VERIFIED

Nothing below has been exercised. Open devtools console before starting; a **console 401 or 403 on an
`/api/portal/` request is a FAIL** on every item, in addition to the specific symptom named.

### A. As a PENDING rep — `status: 'pending'` WITH a field role

**This is the highest-risk group and none of it has ever been run.** This is an invited/hired rep who has
not finished onboarding. It is what the `allowOnboarding` opt-in (commit `3af6163`) exists to restore. If
the opt-in reasoning is wrong, every page here locks out every new hire.

To get this account state: an invited rep is `pending` with a field role from account creation until their
last onboarding item is approved. Do not use an unapproved self-signup — those have **no** field role and
are *supposed* to be rejected.

| # | URL | click path | PASS | FAIL |
|---|---|---|---|---|
| A1 | `/portal/onboarding` | load the page | checklist renders with the rep's items and progress | empty checklist, skeleton that never resolves, or an error banner "Failed to load checklist" |
| A2 | `/portal/onboarding` | on the DL item, upload **front**, then **back** | both tiles show the uploaded state; the submit button enables only after *both* | one or both uploads fail with "Upload failed"; page otherwise looks fine — this is the `getHeaders` prop path, it fails in isolation |
| A3 | `/portal/onboarding` | fill a reference, click **Submit for review** | item flips to "submitted and waiting for manager review" | error banner "Failed to submit" |
| A4 | `/portal/calls` | load | the call schedule renders; manager-only calls are **hidden** | empty schedule or "Failed to load call schedule". If manager-only calls are *visible* to an entry-level rep, that is a separate and worse failure — report it |
| A5 | `/portal/settings` | change the display name, save | saves; the new name shows in the header after `refreshUser()` | "Failed to update profile" |
| A6 | `/portal/resources` | load, find the pay lane | the rep's own commission tier displays | empty pay lane or an error; a 403 here means the `allowOnboarding` call on `commission` GET was wrong |
| A7 | `/portal/dashboard` | load | stats tiles populate with the rep's own numbers | tiles stuck at zero or blank |

### B. As a REP (active, ordinary field role)

| # | URL | click path | PASS | FAIL |
|---|---|---|---|---|
| B1 | `/portal/dashboard` | load | stats tiles show **the rep's own** numbers | blank/zero tiles |
| B2 | `/portal/sales` | load the ledger | the rep's own sales list | empty ledger or error |
| B3 | `/portal/sales` | open one sale | detail view populates | "Failed to fetch sale" |
| B4 | `/portal/sales` | edit a sale, save | saves and persists on reload | "Failed to update sale" |
| B5 | any page | open the notification bell | badge count and list render | badge stuck at 0 with notifications that exist, or empty panel |
| B6 | bell panel | click one notification to mark read | it greys out; count decrements | count does not move |
| B7 | bell panel | **Mark all read** | all clear; count goes to 0 | nothing happens — most fragile of the four, its server-side `requestedBy ?? userId` fallback was deleted, so a missing `userId` now 400s instead of silently working |
| B8 | bell panel | **Clear all** | list empties | list unchanged |
| B9 | `/portal/training` | mark a resource complete | progress bar advances; **reload** and it is still complete | progress resets on reload — the POST 401'd and only local state moved |

### C. As ADMIN or OPERATIONS

| # | URL | click path | PASS | FAIL |
|---|---|---|---|---|
| C1 | `/portal/admin` | load the ops home | the **onboarding review** queue card shows a count | the card shows its error state — this is the `admin/page.tsx:96` one-word fix, and the error is silent-ish, just a card that looks broken |
| C2 | `/portal/admin` | same page | pipeline + recruiting queue cards show counts | error state |
| C3 | `/portal/admin/onboarding` | load | review queue lists submitted items with signed file links | empty queue or "Failed to load review queue" |
| C4 | `/portal/admin/onboarding` | **approve** one item | row disappears from the queue | "Failed to review submission" |
| C5 | `/portal/admin/onboarding` | **reject** one item with a reason | row disappears | as above |
| C6 | → then sign in as **that rep** | open `/portal/onboarding`, look at the rejected item | it reads "Returned by *&lt;the real reviewer's name&gt;*" | blank name, or someone else's name. This is the `reviewerName` removal end to end — the stamp now comes from the token |
| C7 | `/portal/admin/onboarding` | in the Action Queue, **claim** a task | task shows **your** name as claimer | claim fails, or it shows a blank/wrong claimer |
| C8 | `/portal/admin/onboarding` | Action Queue → **activate** a rep whose onboarding is complete | rep activates | "Failed to activate rep". A 409 "Cannot activate yet, missing: …" is a **PASS** — that is the real not-ready branch, not an auth failure |
| C9 | `/portal/admin/users` | load | full user list renders | empty table or "Failed to fetch users" |
| C10 | `/portal/admin/users` | toggle a user's status active↔inactive | status flips and persists | "Failed to update user" |
| C11 | `/portal/admin/users` | **approve** a pending signup (assign a field role) | user moves to active | "Failed to approve user" |
| C12 | `/portal/admin/users` | **accept** a pending user | status goes active | "Failed to accept user" |
| C13 | `/portal/admin/users` | try to **delete your own account** | **blocked** | if it succeeds, that is a serious regression — this guard was previously bypassable (the caller chose both sides of the comparison) and is supposed to be real now |
| C14 | `/portal/admin/users/<id>` | open a user's detail page | their details load | "Failed to fetch user" |
| C15 | same page | the **manager picker** dropdown | populates with manager-eligible names | empty dropdown — a separate `GET /auth/users` call that fails silently by design ("fail-soft: picker just shows no results"), so it will NOT show an error banner. Check it explicitly |
| C16 | same page | edit a field, save | saves and persists | "Failed to update user" |
| C17 | `/portal/admin/users` → new user | create a user, incl. assigning a manager | account is created with the manager set | "Failed to create user"; or created but `managerId` empty — that would mean the kept target param was dropped |
| C18 | `/portal/admin/university` | load | list includes **unpublished** items | only published items appear, or "Failed to load content". Unpublished-missing is the tell that the `all=true` gated path 401'd |
| C19 | `/portal/admin/university` | add content (upload + save) | appears in the list | "Failed to save" |
| C20 | `/portal/admin/university` | toggle publish on an item | badge flips and persists on reload | reverts on reload |
| C21 | `/portal/admin/university` | rename an item | persists on reload | reverts |
| C22 | `/portal/admin/university` | delete an item | disappears and stays gone | reappears on reload |
| C23 | `/portal/dashboard` | load as a `sales:approve` holder | tiles show **org-wide** numbers, not just your own | if you see only your own numbers, the `salesRepId` conditional broke — note this fails *silently*, no error, just wrong numbers |
| C24 | `/portal/sales` | **approve** a sale | status flips to approved | "Failed to process sale" |
| C25 | `/portal/sales` | open that sale's detail | approver line reads **your** name | blank or another user's name — the `approverId`/`approverName` removal; the route now stamps from the token |
| C26 | `/portal/sales` | **reject** a sale with a reason | status flips to rejected | "Failed to process sale" |
| C27 | `/portal/calls` | add a call, then delete it | both succeed | error banner |
| C28 | `/portal/resources` | load as admin | **all** commission tiers show; a PUT saves | only one tier, or the save fails |

### D. Decommission / reinstate — needs a throwaway account, Jacob's call

**NOT VERIFIED and inherently un-verifiable without a disposable real account.** Flagging rather than
doing it, for the same reason as everything else above: it needs a real rep account in production, and
creating one is Jacob's decision to make with an account he controls, not ours.

The reinstate half is the dangerous one — it fails **destructively**. If `disabled: false` were ever
dropped from the reinstate path, a reinstated rep would show `status: 'active'` in Firestore while their
Firebase Auth account stays disabled: correct status, still cannot log in, and very hard to diagnose.

| # | step | PASS | FAIL |
|---|---|---|---|
| D1 | `/portal/admin/pipeline` → decommission a throwaway rep | audit record written, rep marked inactive | error banner |
| D2 | sign in as that rep | **cannot** sign in | if they can still sign in, `revokeRefreshTokens`/`disabled:true` did not take |
| D3 | `/portal/admin/pipeline` → reinstate them | rep returns to active | error banner |
| D4 | sign in as that rep again | **can** sign in | signs in fails while the portal shows them active — this is the destructive failure described above |
| D5 | repeat D1–D4 via `/portal/admin/users` status toggle instead | same results | the two deactivation paths disagree |

### Watch for on every item

**A spurious 401 on hard refresh.** All 15 new token reads go through `getIdToken()` (which awaits
`onAuthStateChanged`) rather than `auth.currentUser`, specifically to avoid the first-load race. That
choice is untested in a real browser. If a page works on soft navigation but 401s on F5, this is the cause.

### Not mine, but in this checklist

A4–A6, C2, C27, C28 and all of D cover routes migrated by other agents (impl-routes' batch and
`pipeline/decommission`). Included because the lead asked for them and because they share the same
untested failure mode. My own changes are A1–A3, A7, B1–B9, C1, C3–C26.

---

