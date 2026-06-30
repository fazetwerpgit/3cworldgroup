# P1 — Onboarding File Uploads (Firebase Storage)

**Date:** 2026-06-26
**Status:** Design — approved in brainstorm, pending spec review
**Scope:** Phase 1 of the Employee Portal Onboarding / Formstack-replacement roadmap
**Nature:** Purely additive. No existing flow changes shape except the admin review API, which gains storage-item handling additively.

---

## 1. Problem & Goal

Four onboarding items are file uploads but the app has no Firebase Storage wiring:

| Item ID | Label | `referenceKind` | Files |
| --- | --- | --- | --- |
| `w9` | W-9 | `storage` | 1 |
| `dl_photos` | Driver's License Photos (Front & Back) | `storage` | 2 (front + back) |
| `llc_sos` | LLC / Secretary of State | `storage` | 1 |
| `insurance` | Proof of Insurance | `storage` | 1 |

Today every item — including these four — is captured as a single free-text `reference` string. `referenceKind` is typed on every item in `src/types/onboarding.ts` but **nothing in any API or UI branches on it**.

**Goal:** make `referenceKind: 'storage'` items capture an actual file upload that lands in Firebase Storage, store the folder path as the item's `reference` (unchanged field), and let management review the files via short-lived signed URLs. `esign` and `vendor` items keep their current text field (those are Phases 3 and 5).

**Non-goals (this phase):** virus scanning; client-side direct-to-Storage; any change to the `esign`/`vendor` capture; any change to the `userOnboarding/{uid}_{itemId}` document shape; any change to the recruiting convert gate.

---

## 2. Locked Decisions (from brainstorm)

1. **Server-side uploads via API route.** The browser never uses the Firebase Storage SDK. Files POST to a Next.js route that writes via the Admin SDK. This is what keeps the *public* (unauthenticated) onboarding flow working and keeps `storage.rules` deny-all.
2. **`storage.rules`: deny all client access.** Every read and write goes through the server. No client rule can be misconfigured into a leak.
3. **Folder-per-item; `reference` = the folder path string.** One item can hold 1..n files. No type-model change.
4. **Public uploads are authorized by the invite token** — the same hashed-token gate the candidate already uses. No anonymous Firebase auth, no open endpoint.
5. **File limits:** type allowlist + **4 MB per file**, enforced server-side. (Deployment target is **Vercel**, whose route handlers cap request bodies at ~4.5 MB; 4 MB leaves multipart headroom.) `FileUpload` downscales canvas-decodable images client-side so phone photos fit under the cap.
6. **Signed-URL expiry for review: 15 minutes.** Minted per request on management's authenticated review call only.
7. **Virus scanning deferred** to a fast-follow (no blocker in P1).

---

## 3. Storage Path Convention

```
onboarding/
  {uid}/                       <- authenticated rep (has a Firebase account)
    dl_photos/                 <- reference = "onboarding/{uid}/dl_photos/"
      front.<ext>
      back.<ext>
    w9/file.<ext>              <- reference = "onboarding/{uid}/w9/"
    llc_sos/file.<ext>
    insurance/file.<ext>
  invite_{inviteId}/           <- public candidate (no account yet)
    dl_photos/front.<ext> ...  <- reference = "onboarding/invite_{inviteId}/dl_photos/"
```

- **`reference` always stores the folder path** (trailing slash), never an individual file path. Single-file items have exactly one `file.<ext>` inside.
- `dl_photos` uses fixed slot filenames `front` / `back`. All other storage items use `file`.
- The extension is derived from the validated MIME type (not the client-supplied filename) to avoid spoofed/path-bearing names.
- The public path keys on `invite_{inviteId}` because the candidate has no `uid` yet. The files are not moved on account creation — the stored `reference` (the `invite_{inviteId}/...` folder) remains valid and management reads it the same way. (A future migration-to-uid is explicitly out of scope; the folder path is opaque to consumers.)

---

## 4. Components & Changes

### 4.1 `storage.rules` (NEW file, repo root)

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false;   // all access via Admin SDK on the server
    }
  }
}
```

Deploy target: `firebase.json` currently has only `{ "firestore": { "rules": "firestore.rules" } }`. Add a sibling `"storage": { "rules": "storage.rules" }` entry so `firebase deploy` ships it.

### 4.2 `src/lib/firebase/admin.ts` (CHANGED — additive)

Add Storage to the already-initialized admin app (same service-account creds, no new env vars beyond the existing `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`):

- `import { getStorage, Storage } from 'firebase-admin/storage';`
- After `adminDb = getFirestore(app)`, add `adminStorage = getStorage(app)`.
- Export `adminStorage`.
- Add a helper `getOnboardingBucket()` returning `adminStorage.bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)`, throwing a clear error if the env is unset.

No change to the credential-loading logic or `isFirebaseAdminConfigured()`.

### 4.3 Shared upload helper (NEW — `src/lib/onboarding/uploads.ts`)

A single module both routes use, so validation lives in one place:

- `STORAGE_ITEM_IDS = ['w9', 'dl_photos', 'llc_sos', 'insurance']` (or derived from `ONBOARDING_ITEMS.filter(i => i.referenceKind === 'storage')`).
- `ALLOWED_TYPES`: `dl_photos` → `image/jpeg|png|heic|webp`; `w9|llc_sos|insurance` → those images **plus** `application/pdf`.
- `MAX_FILE_BYTES = 10 * 1024 * 1024`.
- `validateUpload({ itemId, slot, mime, size })` → returns `{ ok, error?, ext }`. Enforces: item is a storage item; `slot` is `front`/`back` only for `dl_photos` and required there; mime in allowlist; size ≤ cap.
- `storeFile({ bucket, folder, slot, buffer, mime })` → writes `folder + (slot ?? 'file') + '.' + ext`, sets `contentType`, returns the **folder** path.
- `extForMime(mime)` → canonical extension.

### 4.4 Upload route — authenticated rep (NEW)

`POST /api/portal/onboarding/upload` — `src/app/api/portal/onboarding/upload/route.ts`

- Auth: mirror `src/app/api/portal/onboarding/submit/route.ts` (caller identity + `resolveRoles`; a rep uploads only to their own `uid`, management may act on behalf — match submit's existing rule exactly).
- Body: `multipart/form-data` → `userId`, `itemId`, optional `slot`, `file`.
- Flow: validate → `getOnboardingBucket()` → `storeFile` into `onboarding/{userId}/{itemId}/` → `200 { path }`.
- Does **not** write Firestore. The returned path is handed back to the client, which includes it in the normal submit payload.

### 4.5 Upload route — public candidate (NEW)

`POST /api/public/onboarding/[token]/upload` — `src/app/api/public/onboarding/[token]/upload/route.ts`

- Auth: reuse `getInviteByToken` + `hashInviteToken` from the existing `[token]/route.ts`. Reject if invite missing, expired, or status ∈ `{submitted, approved, converted}` (mirror that route's guards).
- Body: `multipart/form-data` → `itemId`, optional `slot`, `file`.
- Flow: validate → `getOnboardingBucket()` → `storeFile` into `onboarding/invite_{invite.id}/{itemId}/` → `200 { path }`.
- Does **not** create the user or write Firestore. Account creation stays in the existing `POST [token]/route.ts` on final submit; the path arrives there inside `references[itemId]`.

### 4.6 Review API (CHANGED — additive)

`GET /api/portal/onboarding/review` — `src/app/api/portal/onboarding/review/route.ts`

- For each submission, look up the item and read `referenceKind`.
- **Text items (`manual`/`esign`/`vendor`)**: return `reference` exactly as today — no behavior change.
- **`storage` items**: treat `reference` as a folder prefix; `bucket.getFiles({ prefix: reference })`; for each file `getSignedUrl({ action: 'read', expires: Date.now() + 15*60*1000 })`. Add to the response: `referenceKind: 'storage'` and `files: [{ name, url, contentType }]`. Keep `reference` in the payload too (the raw path, for audit).
- Failure to sign (missing files, bucket error) degrades to `files: []` with the raw `reference` still shown — never 500s the whole queue.
- The `POST` half (approve/reject) is unchanged.

### 4.7 `FileUpload.tsx` (NEW — `src/components/onboarding/FileUpload.tsx`)

Reusable client component (shadcn/ui primitives, matches existing onboarding UI):

- Props: `{ itemId, slot?, uploadUrl, accept, maxSizeMb = 10, onUploaded(folderPath), existingPath? }`.
- Client pre-check (type + size) for instant feedback; then `POST multipart/form-data` to `uploadUrl`.
- States: `idle → selected → uploading → uploaded → error` (with replace/retry). On success calls `onUploaded(folderPath)`.
- The parent owns where the path goes; the component is flow-agnostic. `uploadUrl` is the only thing that differs between the public and portal flows.

### 4.8 Capture-UI branching (CHANGED — additive)

Both onboarding pages render a `FileUpload` instead of the text input **only** for `referenceKind === 'storage'` items; every other item is untouched.

- **Public:** `src/app/onboard/[token]/page.tsx` — `uploadUrl = /api/public/onboarding/{token}/upload`. For `dl_photos`, render two `FileUpload`s (`slot="front"`, `slot="back"`); both must report success before the item counts as complete. The collected folder path goes into the existing `references[itemId]` map. Submit route unchanged.
- **Authenticated rep:** `src/app/portal/onboarding/page.tsx` — `uploadUrl = /api/portal/onboarding/upload` with the rep's `userId`. Same `dl_photos` two-slot treatment. Submitted path flows through the existing submit route.
- **Admin review:** `src/app/portal/admin/onboarding/page.tsx` — when a submission has `referenceKind: 'storage'`, render the `files[]` as thumbnails/links (the signed URLs) instead of the text reference.

> Compatibility note: the public submit route requires every item to carry a non-empty `reference` (`missing` check) and runs `looksLikeRawSensitiveData` on sensitive items. A storage **folder path** is non-empty and not all-digits, so both checks pass unchanged — no edits to the submit route needed.

---

## 5. Data Flow (end to end)

**Public candidate, `dl_photos`:**
1. Candidate picks front image → `FileUpload` POSTs to `/api/public/onboarding/{token}/upload` with `itemId=dl_photos, slot=front`.
2. Route validates token + file, writes `onboarding/invite_{id}/dl_photos/front.jpg`, returns `{ path: "onboarding/invite_{id}/dl_photos/" }`.
3. Same for back. Client stores the folder path in `references['dl_photos']`.
4. Final submit (existing `POST [token]/route.ts`) writes that path as the `userOnboarding` / `candidateOnboarding` `reference`. No route change.
5. Management opens review queue → review API lists files under the folder, signs each (15-min), returns `files[]` → admin page shows front/back thumbnails.

**Authenticated rep:** identical, except `uploadUrl` is the portal route and the path is `onboarding/{uid}/...`.

---

## 6. Security Notes

- `storage.rules` deny-all means there is **no** client read or write path; signed URLs are the only way bytes leave the bucket, and only management's authenticated review call mints them.
- The public upload endpoint is gated by the invite token (hashed lookup, expiry + status checks) — same security model as the existing public submit.
- Extension/content-type is derived from validated MIME, never from the client filename — prevents path traversal or executable masquerading.
- Raw PII never enters Firestore: the file is the sensitive artifact, locked in Storage; the only thing persisted is the opaque folder path. `looksLikeRawSensitiveData()` stays as-is on text references.
- 4 MB cap + type allowlist bound abuse; rate limiting on the public upload route is a recommended fast-follow (note, not P1 blocker).

---

## 7. Verification

Per the roadmap's per-phase gate:

1. `npx tsc --noEmit` and `npm run build` stay green.
2. **Upload end to end:** via the public token flow, upload DL front+back + W-9; confirm files land at the expected paths and the stored `reference` is the folder path.
3. **Review:** management opens the queue; confirm signed URLs render the images/PDF and expire after 15 min.
4. **Isolation:** confirm a direct client read/write to the bucket is denied by `storage.rules` (deny-all).
5. **No-PII:** confirm Firestore `userOnboarding` holds only the folder path, never file bytes or raw numbers.
6. **Non-regression:** a non-storage item (e.g. `pay_structure`) still captures and reviews as plain text, unchanged.

---

## 8. Out of Scope (queued for later phases)

- Intake fields / IBO owner picker / full address (Phase 2).
- Adobe Sign reference surface (Phase 3).
- Formstack form rebuilds (Phase 4).
- Background-check vendor handoff (Phase 5).
- Virus scanning, rate limiting, signed-URL caching, invite→uid file migration (fast-follows).
