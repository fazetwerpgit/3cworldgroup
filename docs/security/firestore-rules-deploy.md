# Deploying the tightened Firestore rules

**Jacob runs this himself.** It was deliberately not run unattended — a bad
rules push breaks the live app for everyone the instant it lands, and there is
no emulator in this repo to catch a mistake first.

## What changed

Four collections went from `isApproved()` to `read, write: if false`:
`sales`, `training`, `userProgress`, `leaderboard`. They join the fourteen
collections already locked that way.

The vulnerability this closes: `isApproved()` means *any approved rep*. A rep
could open the browser console and, using the Firebase Web SDK the app already
loads, create a sale with `totalPoints: 99999`, delete a colleague's sale, or
wipe the training library. The server-side point calculation in
`src/app/api/portal/sales/route.ts:205-211` was fully bypassable.

## Why this is safe

No client-SDK code path touches any of the four. `firebase/firestore` is
imported in exactly six files repo-wide:

```
src/lib/firebase/config.ts          (exports the db handle only)
src/contexts/AuthContext.tsx        users/{uid}
src/hooks/admin/usePendingSignupsCount.ts   users
src/hooks/chat/useChatChannels.ts   chatChannels
src/hooks/chat/useChatUnread.ts     users/{uid}/chatReads
src/hooks/chat/useMessages.ts       chatChannels/{id}/messages
```

None mentions `sales`, `training`, `userProgress`, or `leaderboard`. Confirmed
by three independent sweeps: an import grep, a write-operation-name grep
(`addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction`), and a direct
check of every one of those six files. The whole application performs exactly
three client writes, all to the caller's own document.

Every writer of these four collections is an API route using `adminDb`. The
Admin SDK bypasses rules entirely, so it is unaffected by this change.

## Before you run it

1. **Read the diff.** `git diff firestore.rules` — only the `allow` lines in
   four blocks change; everything else added is comments.
2. **Check `leaderboard` is actually empty** in Firebase Console → Firestore →
   Data. Nothing in the repo reads or writes it, so it looks dead — but if a
   one-off script or a Cloud Function outside this repo populated it, the code
   cannot show that. This is the only denial that could be wrong in a way the
   codebase cannot reveal.
3. **Know the rollback** (below) before you need it.

## Deploy

```
firebase deploy --only firestore:rules --project cworldgroup-cca68
```

Rules only — no app code, no indexes.

## Smoke test right after, signed in as a normal approved rep

- portal sales list loads
- dashboard stats populate
- training library lists resources
- marking a training item complete persists across a reload
- leaderboard standings render
- chat loads and unread badges clear

**Chat is the control.** It is genuinely client-SDK, so if chat breaks,
something went wrong outside the four blocks that changed.

## Rollback

Firebase Console → Firestore → Rules → History restores a previous ruleset in
one click, without touching the repo. **Use that first if the app is visibly
broken**, then sort out the repo afterwards. Or `git revert` the rules commit
and re-run the deploy command.

## If you want to be more conservative

The **write** denial is what closes the vulnerability and rests on positive
evidence. The **read** denial rests on a negative claim ("nothing reads it"),
which three sweeps support but which is inherently absence-of-evidence. To
split the risk, change any of the four blocks to:

```
allow read: if isApproved();
allow write: if false;
```

That keeps the entire security fix and eliminates any chance of a read path
breaking. The reason the committed version denies reads too: with reads open,
anyone holding a single approved user's token can dump the whole `sales`
collection via the client SDK, bypassing whatever scoping the API applies.

## What this does NOT fix

Locking the rules makes the **API layer the sole remaining attack surface** for
these collections. Do not read "rules locked down" as "sales are secure":

- `/api/portal/training/progress` trusts a caller-supplied `requestedBy` field
  instead of deriving identity from a verified token — a rep can still write
  someone else's progress.
- The API-layer helper `verifyCaller`
  (`src/lib/auth/requireVerifiedAdmin.ts:24-28`) only checks that a user doc
  *exists*, never that `status == 'active'`. The rules layer is stricter than
  the API layer. See the findings report.

## Automated rules tests

`firebase.json` has a Firestore emulator block (127.0.0.1:8099), and
`@firebase/rules-unit-testing` + `firebase-tools` are dev dependencies. Run:

```
JAVA_HOME=/usr/lib/jvm/java-21-openjdk npm run test:rules
```

That wraps vitest (`vitest.rules.config.ts`) in
`firebase emulators:exec --only firestore --project demo-cwg`, so it never
touches production. The emulator needs **JDK 21+**. It runs `tests/rules/`
(Chompen `config/app` gate, campaign archive, representative portal
chat/sales/onboarding rules) plus the older `src/**/*.rules.test.ts` suites,
which plain `npm test` skips because `FIRESTORE_EMULATOR_HOST` is unset.

## 2026-10-24/26 — Chompen store gate + campaign soft delete

`firestore.rules` changes (hand edits on top of the 3c-knock-logic merge; they
must be carried back into `scripts/merge-prod-rules.ts` there, or the next
regenerate drops them):

- `match /config/{docId}`: public `get` only for `docId == 'app'`; list and all
  client writes denied. `config/fiberRepMap` stays denied.
- `campaigns` update allow-list accepts `archived`, `archivedAt`, `archivedBy`,
  judged by `archiveValid()` on what the write changes:
  - not archived: the stamp may change only by archiving
    (`archived == true`, `archivedAt is number`, `archivedBy == request.auth.uid`);
  - archived (`resource.data.archived == true`): all three fields are frozen;
    editing or deleting any of them (un-archive) is denied. Other campaign
    edits still work, for any owner. Restoring is Admin SDK only.
  - `allow delete: if false` is unchanged (no hard delete).

**Deploy state (2026-10-26): production is BEHIND master.** On 2026-10-24 a
first version was deployed to cworldgroup-cca68 via the Rules API (service
account; CLI auth had expired) from a stale branch; backup of the previous
live ruleset in `.qa-backups/firestore-rules-2026-10-24/`. That version had an
un-archive hole: a client could delete `archived` (or restamp
`archivedAt`/`archivedBy`), and its whole-doc `archivedBy == uid` check blocked
other owners from editing an archived campaign. The fix is on master only;
the ruleset on master must be redeployed
(`firebase deploy --only firestore:rules` after `firebase login --reauth`)
and this note updated.
