# P1 Storage Uploads — Provision → Verify → Merge Runbook

**Status:** P1 code complete + reviewed on branch `docs/p1-storage-uploads-spec`. One operational prerequisite remains before the feature can run or be merged with confidence: **Firebase Storage is not yet provisioned** for project `cworldgroup-cca68`.

This was caught by live verification, not tests — the configured bucket `cworldgroup-cca68.firebasestorage.app` returns *"bucket does not exist"*. The env value is in the correct modern format; Storage simply has not been enabled in the Firebase console yet. Buckets on the `.firebasestorage.app` domain can only be created by Firebase's own Storage onboarding (not `gcloud`/`firebase` CLI), so this step must be done from the console.

---

## Step 1 — Enable Firebase Storage (you, ~2 min, from a computer)

1. Firebase Console → project **`cworldgroup-cca68`** → **Build → Storage → Get started**.
2. Choose a storage location. **`nam5` (US multi-region)** is the safe default for a US field-sales org. **This choice is permanent** — it cannot be changed after the bucket is created.
3. Accept the default rules prompt (we overwrite them in Step 2 anyway). This creates the `cworldgroup-cca68.firebasestorage.app` bucket the app already points at.

## Step 2 — Deploy the deny-all Storage rules

From the repo root (the `firebase` CLI isn't installed globally; `npx` fetches it):

```
npx -y firebase-tools deploy --only storage
```

This ships `storage.rules` (deny-all client access — every read/write goes through the Admin SDK, exactly as designed). `firebase.json` already registers the `storage` target.

## Step 3 — Verify the full path (Claude can run this once Storage exists)

```
node scripts/verify-storage.mjs
```

Non-destructive: it writes one file to a throwaway `onboarding/_verify_<ts>/` prefix, lists it, mints a 15-minute signed URL, fetches it over HTTP, then deletes the test prefix. It creates **no** Auth users and writes **no** Firestore. Expected output ends with `VERIFY_PASS`.

## Step 4 — Merge

Once `VERIFY_PASS` is confirmed, merge `docs/p1-storage-uploads-spec` into `master` (Claude can run `finishing-a-development-branch`).

---

## One decision flagged for you at merge time

The final whole-branch review found a real **IDOR/scope-integrity gap** and it was fixed in commit `8730f26` (`security: validate storage references on submit + fix DL slot/upload UX`). That fix touches the two submit routes, which the original spec had noted as "unchanged." This is a **deliberate, documented deviation** to close a confirmed security finding — the change is additive (only storage-kind items are affected; text items are untouched). Confirm you're happy with it when you review.

## Deferred fast-follows (non-blocking, recorded in `.superpowers/sdd/progress.md`)

- MIME is client-supplied (no magic-byte sniff) — spec explicitly defers virus scanning; management review is the backstop.
- `existingPath` prop on `FileUpload` is unused by callers (resubmit shows "Choose file" rather than pre-filled).
- A few literals (max size MB, downscale dim, JPEG quality, 15-min TTL UI copy) aren't shared with their server-side constants.
- Rate limiting on the public upload route.
