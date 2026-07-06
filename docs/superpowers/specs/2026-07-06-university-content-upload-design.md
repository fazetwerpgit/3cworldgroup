# University Content Upload (Admin) — Design

Date: 2026-07-06

## Summary

Give admins a screen to add training content (documents **and** videos) to the
University tab by uploading files, and let reps open/play that content. Files upload
**straight from the browser to Firebase Storage** (bypassing Vercel's ~4.5 MB request
limit) using the Firebase client Storage SDK; a Storage security rule restricts writes
to admins and reads to signed-in staff. Content is organized under the existing five
carrier categories (AT&T, T-Fiber, Verizon/Frontier, Xfinity, DirecTV).

Backend for training resources already exists (`training` Firestore collection;
`GET/POST /api/portal/training`, `GET/PUT/DELETE /api/portal/training/[id]`), but there
is **no UI** to create/manage content and no file-upload path — this design adds both.

## Why browser-direct upload

Vercel serverless functions cap request bodies at ~4.5 MB, so routing video files
through an API route (the pattern used by the rep forms) is not viable. The Firebase
client Storage SDK uploads directly to the storage bucket over Firebase's own
endpoints (no manual bucket CORS setup needed, unlike raw signed-URL PUTs) with
resumable uploads + progress events. Authorization is enforced by Storage security
rules evaluated against the caller's real auth token.

## Data model

Extend `TrainingResource` (`src/types/training.ts`) with optional file fields:

```ts
storagePath?: string;   // Firebase Storage object path, e.g. training/{uploadId}/{filename}
fileName?: string;      // original filename, for display + download name
mimeType?: string;      // e.g. application/pdf, video/mp4
fileSize?: number;      // bytes, for display
```

`type` (`video` | `document`) is derived from the file's MIME on create: `video/*` →
`video`, `application/pdf` + `image/*` → `document`. Existing `url` field stays for the
legacy link case (unused by this feature). No migration needed — existing rows lack the
new optional fields and continue to work.

## Storage & security

### Client SDK
`src/lib/firebase/config.ts`: add `getStorage` and export `storage` (guarded by the same
`hasValidConfig` check as `auth`/`db`). The client bucket is the config's
`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` — the project default bucket, the same one the
Admin SDK's `getOnboardingBucket()` targets (must be verified during implementation so
server-side deletes hit the same objects the client wrote).

### Rules (`storage.rules`)
Replace the blanket deny with a `training/` carve-out, keeping deny-all for every other
path (onboarding/forms still go through the Admin SDK only):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /training/{allPaths=**} {
      // Any signed-in staff may read training content.
      allow read: if request.auth != null;
      // Only admins/operations may upload; cap size and allowed types.
      allow write: if request.auth != null
        && firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role in ['admin', 'operations']
        && request.resource.size < 1024 * 1024 * 1024            // 1 GB cap
        && request.resource.contentType.matches('application/pdf|image/.*|video/.*');
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

**Deploy step (requires user approval):** `firebase deploy --only storage` — the rule is
inert until deployed; document this as a ship gate, like prior Firestore-rules deploys.

## Upload flow (admin, client-side)

1. Admin picks a file in the "Add content" form.
2. Client generates `uploadId = crypto.randomUUID().replace(/-/g,'')` and starts
   `uploadBytesResumable(ref(storage, 'training/{uploadId}/{safeName}'), file)`, showing a
   percentage progress bar (`snapshot.bytesTransferred / totalBytes`). Client-side
   pre-checks mirror the rule: allowed MIME + size < 1 GB, with a clear error otherwise.
3. On completion the client holds `storagePath = training/{uploadId}/{safeName}`.
4. Admin fills Title / Carrier / (optional) Description / Required toggle, clicks **Save**.
5. `POST /api/portal/training` creates the doc with `storagePath`, derived `type`,
   `fileName`, `mimeType`, `fileSize`, `category`, `title`, `description`, `isRequired`,
   and `isPublished` (from a publish toggle; default true).

Upload-before-create means a failed upload leaves no doc (only a possibly-orphaned
storage object, acceptable). `safeName` = the filename sanitized to
`[A-Za-z0-9._-]`, spaces → `_`.

## Admin UI — `/portal/admin/university`

New management page (admin/operations only; matches existing admin pages' shell +
`requireManagement` guard on its APIs), linked in the admin sidebar section of
`PortalSidebar.tsx`.

- **Add content** panel: Title, Carrier `<select>` (the 5 `TRAINING_CATEGORIES`),
  Description (optional), `Required training` toggle, `Publish immediately` toggle
  (default on), and the file uploader with progress. Save is disabled until a file has
  finished uploading and Title + Carrier are set.
- **Existing content** list, grouped by carrier: each row shows title, type icon,
  published/draft badge, file name/size, and actions **Publish/Unpublish**, **Edit**
  (title/description/category/required), **Delete**. Draft rows are hidden from reps.

## API changes

- `GET /api/portal/training` — add an admin-only `?all=true&requestedBy=<uid>` mode that,
  when gated by `requireManagement`, returns **all** resources incl. unpublished (the
  admin list needs drafts). Without `all`, behavior is unchanged (published only).
- `POST /api/portal/training` — accept and persist `storagePath`, `fileName`, `mimeType`,
  `fileSize`; derive/persist `type` from `mimeType` server-side (never trust a client
  `type` that disagrees with the MIME). Keep the existing `requireManagement` gate.
- `DELETE /api/portal/training/[id]` — after deleting the doc, also delete the storage
  objects under the resource's `storagePath` prefix via the Admin SDK
  (`bucket.deleteFiles({ prefix: 'training/{uploadId}/' })`). Best-effort: log and still
  return success if the object is already gone.
- `PUT /api/portal/training/[id]` — unchanged mechanism; used for Edit + publish toggle.

## Rep viewing

`ResourceCard` already links to `/portal/training/[id]`. On that detail page, when the
resource has a `storagePath`, resolve a URL with the client SDK
(`getDownloadURL(ref(storage, storagePath))`) and render:
- `type === 'video'` → `<video controls preload="metadata" src={url}>` sized responsively.
- `type === 'document'` + PDF → embed in an `<iframe>`/object with a "Open in new tab"
  fallback; images → `<img>`.
`viewCount` increment is out of scope (leave as-is).

## Testing

- Unit: MIME→type derivation helper (`video/mp4`→video, `application/pdf`→document,
  `image/png`→document) with a colocated Vitest test; filename sanitizer.
- Unit: `?all` gate — published-only vs all logic (pure filter function extracted).
- Manual (signed-in): admin uploads a small PDF and a short video → both appear under the
  right carrier; rep opens the PDF (viewer) and plays the video; unpublished item hidden
  from reps; delete removes the row and the stored file.

## Deployment / ship gates

1. `firebase deploy --only storage` (user-approved) — without it, client uploads are
   denied by the still-live deny-all rule.
2. Verify `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` == the Admin SDK bucket so deletes match.

## Out of scope / deferred

- Reordering (`order`) UI — new items default to `order: 0`; drag-reorder is a later add.
- Thumbnails, video transcoding/streaming (HLS), captions, and `duration` auto-extraction.
- Per-role visibility beyond the existing `requiredRoles` (kept empty = all roles).
- `viewCount` analytics.
