# Onboarding File Uploads (Firebase Storage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `referenceKind: 'storage'` onboarding items (W-9, DL photos, LLC/SOS, insurance) capture real file uploads to Firebase Storage via server-side API routes, storing only the folder path as the item reference, with a 15-minute signed-URL review surface for management.

**Architecture:** Browser POSTs files (multipart) to Next.js API routes that write via the Firebase Admin SDK; `storage.rules` denies all client access. One file per item lives under `onboarding/{uid|invite_{inviteId}}/{itemId}/`, and the item's existing `reference` string stores the **folder path**. Management review lists files under the prefix and mints short-lived signed URLs. Purely additive — existing onboarding flows are untouched except the review API, which gains storage handling additively.

**Tech Stack:** Next.js 16.1.1 (App Router), React 19.2.3, TypeScript 5 (strict), firebase-admin 13.6.0 (`firebase-admin/storage`), Tailwind v4 + shadcn/ui, Vitest (new — pure-helper unit tests only).

## Global Constraints

- **Additive only:** no change to the `userOnboarding/{userId}_{itemId}` document shape, the public submit route, the portal submit route, or the recruiting convert gate. The review API changes additively (storage items gain `files[]`; text items unchanged).
- **Server-side uploads only.** The browser never imports `firebase/storage`. All Storage reads/writes go through the Admin SDK.
- **`storage.rules` = deny-all** (`allow read, write: if false`).
- **`reference` always stores the folder path** (trailing slash), never an individual file path.
- **File limits:** max **4 MB per file** (Vercel route handlers cap request bodies at ~4.5 MB; 4 MB leaves multipart headroom); type allowlist enforced server-side. `dl_photos` → `image/jpeg|png|heic|heif|webp`; `w9|llc_sos|insurance` → those images plus `application/pdf`.
- **Deployment target: Vercel.** Because of the body-size cap, `FileUpload` downscales canvas-decodable images (jpeg/png/webp) client-side before upload so phone photos fit under 4 MB. PDFs and non-decodable images that exceed 4 MB are rejected client-side with a clear message.
- **Extension derived from validated MIME**, never from the client filename.
- **Signed-URL expiry: 15 minutes** (`15 * 60 * 1000` ms), minted only on management's authenticated review call. Signing requires the service account's `private_key` (present in the current `cert(serviceAccount)` setup); if credentials ever switch to ADC/workload-identity without a key, signing needs the `iam.serviceAccounts.signBlob` permission.
- **Storage item IDs:** `w9`, `dl_photos`, `llc_sos`, `insurance`. `dl_photos` is the only multi-file item (`slot` = `front` | `back`, filenames `front.<ext>` / `back.<ext>`); all others use `file.<ext>`.
- **Bucket env:** `process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`.
- **Auth gates (reuse existing helpers, do not reinvent):** portal upload → `requireSelfOrManagement(callerId, userId)`; public upload → `getInviteByToken` + token guards (expired / status in {submitted, approved, converted}).
- **Validation per task:** `npx tsc --noEmit` and `npm run build` must stay green. Add `npm test` (vitest) for the helper task.

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `storage.rules` (NEW) | Deny-all Storage security rules | 1 |
| `firebase.json` (MODIFY) | Register the storage rules target | 1 |
| `src/lib/firebase/admin.ts` (MODIFY) | Export `adminStorage` + `getOnboardingBucket()` | 2 |
| `src/lib/onboarding/uploads.ts` (NEW) | Pure upload validation + path/file helpers | 3 |
| `src/lib/onboarding/uploads.test.ts` (NEW) | Vitest unit tests for the helper | 3 |
| `vitest.config.ts` (NEW) + `package.json` (MODIFY) | Test runner + `test` script | 3 |
| `src/app/api/portal/onboarding/upload/route.ts` (NEW) | Authenticated rep upload endpoint | 4 |
| `src/app/api/public/onboarding/[token]/upload/route.ts` (NEW) | Token-gated public candidate upload endpoint | 5 |
| `src/app/api/portal/onboarding/review/route.ts` (MODIFY) | Signed-URL `files[]` for storage items | 6 |
| `src/components/onboarding/FileUpload.tsx` (NEW) | Reusable upload control | 7 |
| `src/app/onboard/[token]/page.tsx` (MODIFY) | Render uploader for storage items (public) | 8 |
| `src/app/portal/onboarding/page.tsx` (MODIFY) | Render uploader for storage items (rep) | 9 |
| `src/app/portal/admin/onboarding/page.tsx` (MODIFY) | Render signed-URL thumbnails/links | 10 |

---

## Task 1: Storage rules (deny-all) + deploy target

**Files:**
- Create: `storage.rules`
- Modify: `firebase.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a `storage` deploy target so `firebase deploy` ships the rules. No code imports this.

- [ ] **Step 1: Create `storage.rules`**

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      // All onboarding file access goes through the Firebase Admin SDK on the
      // server. No client read or write path exists; signed URLs (minted
      // server-side on management review) are the only way bytes leave the bucket.
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 2: Register the rules in `firebase.json`**

Replace the file contents with:

```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "storage": {
    "rules": "storage.rules"
  }
}
```

- [ ] **Step 3: Verify build is unaffected**

Run: `npm run build`
Expected: build succeeds (rules files are not compiled, but confirm nothing broke).

- [ ] **Step 4: Commit**

```bash
git add storage.rules firebase.json
git commit -m "feat: add deny-all Firebase Storage rules and deploy target"
```

---

## Task 2: Admin SDK Storage access

**Files:**
- Modify: `src/lib/firebase/admin.ts`

**Interfaces:**
- Consumes: the already-initialized admin `app` and existing `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` env.
- Produces:
  - `adminStorage: Storage | null` (exported)
  - `getOnboardingBucket(): Bucket` — returns the configured bucket; throws `Error('Storage bucket is not configured')` if env or storage is unavailable. (`Bucket` type from `@google-cloud/storage`, re-exported transitively via firebase-admin.)

- [ ] **Step 1: Add the storage import**

At the top of `src/lib/firebase/admin.ts`, alongside the existing imports:

```typescript
import { getStorage, Storage } from 'firebase-admin/storage';
```

- [ ] **Step 2: Add the module-level binding**

Next to `let adminDb: Firestore | null = null;` add:

```typescript
let adminStorage: Storage | null = null;
```

- [ ] **Step 3: Initialize storage inside the existing try block**

In the `if (serviceAccount)` block, immediately after `adminDb = getFirestore(app);`:

```typescript
    adminStorage = getStorage(app);
```

- [ ] **Step 4: Export and add the bucket helper**

Change the export line to include `adminStorage`:

```typescript
export { app, adminAuth, adminDb, adminStorage, initError };
```

Then append the helper at the end of the file:

```typescript
// Returns the configured onboarding Storage bucket. Throws if Storage or the
// bucket env is unavailable, so callers fail loudly instead of writing nowhere.
export function getOnboardingBucket() {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!adminStorage || !bucketName) {
    throw new Error('Storage bucket is not configured');
  }
  return adminStorage.bucket(bucketName);
}
```

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/firebase/admin.ts
git commit -m "feat: expose Firebase Admin Storage bucket accessor"
```

---

## Task 3: Pure upload helper + Vitest

**Files:**
- Create: `src/lib/onboarding/uploads.ts`
- Create: `src/lib/onboarding/uploads.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ONBOARDING_ITEMS` from `@/types`.
- Produces (relied on by Tasks 4 and 5):
  - `STORAGE_ITEM_IDS: string[]`
  - `isStorageItem(itemId: string): boolean`
  - `extForMime(mime: string): string | null`
  - `validateUpload(input: { itemId: string; slot?: string | null; mime: string; size: number }): { ok: true; ext: string; fileBase: string } | { ok: false; error: string }`
  - `buildFolderPath(scope: { kind: 'user'; userId: string } | { kind: 'invite'; inviteId: string }, itemId: string): string`
  - `IMAGE_TYPES: string[]`, `DOC_TYPES: string[]` (client-side allowlists reused by `FileUpload` in Tasks 8/9)

- [ ] **Step 1: Add Vitest dev dependency and script**

Run:

```bash
npm install --save-dev vitest
```

Then add to `package.json` `scripts`:

```json
    "test": "vitest run"
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/onboarding/uploads.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  STORAGE_ITEM_IDS,
  isStorageItem,
  extForMime,
  validateUpload,
  buildFolderPath,
} from './uploads';

describe('storage item identification', () => {
  it('lists the four storage items', () => {
    expect(new Set(STORAGE_ITEM_IDS)).toEqual(
      new Set(['w9', 'dl_photos', 'llc_sos', 'insurance'])
    );
  });

  it('recognizes storage vs non-storage items', () => {
    expect(isStorageItem('w9')).toBe(true);
    expect(isStorageItem('background_check')).toBe(false);
    expect(isStorageItem('contract')).toBe(false);
  });
});

describe('extForMime', () => {
  it('maps known mimes to extensions', () => {
    expect(extForMime('image/jpeg')).toBe('jpg');
    expect(extForMime('image/png')).toBe('png');
    expect(extForMime('image/webp')).toBe('webp');
    expect(extForMime('image/heic')).toBe('heic');
    expect(extForMime('image/heif')).toBe('heic');
    expect(extForMime('application/pdf')).toBe('pdf');
  });

  it('returns null for unknown mimes', () => {
    expect(extForMime('application/zip')).toBeNull();
    expect(extForMime('text/html')).toBeNull();
  });
});

describe('validateUpload', () => {
  it('accepts a valid DL front image', () => {
    const r = validateUpload({ itemId: 'dl_photos', slot: 'front', mime: 'image/jpeg', size: 1_000_000 });
    expect(r).toEqual({ ok: true, ext: 'jpg', fileBase: 'front' });
  });

  it('accepts a W-9 PDF with the default file base', () => {
    const r = validateUpload({ itemId: 'w9', mime: 'application/pdf', size: 500_000 });
    expect(r).toEqual({ ok: true, ext: 'pdf', fileBase: 'file' });
  });

  it('rejects a non-storage item', () => {
    const r = validateUpload({ itemId: 'contract', mime: 'application/pdf', size: 10 });
    expect(r.ok).toBe(false);
  });

  it('rejects a PDF for dl_photos (images only)', () => {
    const r = validateUpload({ itemId: 'dl_photos', slot: 'front', mime: 'application/pdf', size: 10 });
    expect(r.ok).toBe(false);
  });

  it('requires a valid slot for dl_photos', () => {
    expect(validateUpload({ itemId: 'dl_photos', mime: 'image/png', size: 10 }).ok).toBe(false);
    expect(validateUpload({ itemId: 'dl_photos', slot: 'side', mime: 'image/png', size: 10 }).ok).toBe(false);
  });

  it('rejects a slot on a single-file item', () => {
    const r = validateUpload({ itemId: 'w9', slot: 'front', mime: 'application/pdf', size: 10 });
    expect(r.ok).toBe(false);
  });

  it('rejects files over 4 MB', () => {
    const r = validateUpload({ itemId: 'w9', mime: 'application/pdf', size: 4 * 1024 * 1024 + 1 });
    expect(r.ok).toBe(false);
  });

  it('rejects an unknown mime', () => {
    const r = validateUpload({ itemId: 'insurance', mime: 'application/zip', size: 10 });
    expect(r.ok).toBe(false);
  });
});

describe('buildFolderPath', () => {
  it('builds a user-scoped folder', () => {
    expect(buildFolderPath({ kind: 'user', userId: 'abc' }, 'dl_photos')).toBe(
      'onboarding/abc/dl_photos/'
    );
  });

  it('builds an invite-scoped folder', () => {
    expect(buildFolderPath({ kind: 'invite', inviteId: 'inv1' }, 'w9')).toBe(
      'onboarding/invite_inv1/w9/'
    );
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./uploads` (module not yet created).

- [ ] **Step 5: Implement `src/lib/onboarding/uploads.ts`**

```typescript
import { ONBOARDING_ITEMS } from '@/types';

// Items whose reference is a Firebase Storage folder path.
export const STORAGE_ITEM_IDS: string[] = ONBOARDING_ITEMS.filter(
  (i) => i.referenceKind === 'storage'
).map((i) => i.id);

const IMAGE_MIMES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
};
const PDF_MIME: Record<string, string> = { 'application/pdf': 'pdf' };

// Per-item allowlist. dl_photos is images only; the document items also allow PDF.
const ALLOWED_BY_ITEM: Record<string, Record<string, string>> = {
  dl_photos: { ...IMAGE_MIMES },
  w9: { ...IMAGE_MIMES, ...PDF_MIME },
  llc_sos: { ...IMAGE_MIMES, ...PDF_MIME },
  insurance: { ...IMAGE_MIMES, ...PDF_MIME },
};

// 4 MB: Vercel route handlers cap request bodies at ~4.5 MB; this leaves
// headroom for multipart framing. FileUpload downscales images client-side so
// phone photos fit under this ceiling.
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

// Client-side allowlists (mirror ALLOWED_BY_ITEM) shared with FileUpload.
export const IMAGE_TYPES = Object.keys(IMAGE_MIMES);
export const DOC_TYPES = [...IMAGE_TYPES, 'application/pdf'];

export function isStorageItem(itemId: string): boolean {
  return STORAGE_ITEM_IDS.includes(itemId);
}

export function extForMime(mime: string): string | null {
  return IMAGE_MIMES[mime] ?? PDF_MIME[mime] ?? null;
}

export type ValidateResult =
  | { ok: true; ext: string; fileBase: string }
  | { ok: false; error: string };

// Validates an upload request. dl_photos requires slot 'front'|'back' (and uses
// it as the filename base); every other storage item forbids slot and uses
// 'file'. Extension comes from the validated MIME, never the client filename.
export function validateUpload(input: {
  itemId: string;
  slot?: string | null;
  mime: string;
  size: number;
}): ValidateResult {
  const { itemId, slot, mime, size } = input;

  const allowed = ALLOWED_BY_ITEM[itemId];
  if (!allowed) {
    return { ok: false, error: 'This item does not accept file uploads' };
  }

  let fileBase: string;
  if (itemId === 'dl_photos') {
    if (slot !== 'front' && slot !== 'back') {
      return { ok: false, error: 'Driver\'s license uploads require a front or back slot' };
    }
    fileBase = slot;
  } else {
    if (slot) {
      return { ok: false, error: 'This item does not use upload slots' };
    }
    fileBase = 'file';
  }

  const ext = allowed[mime];
  if (!ext) {
    return { ok: false, error: 'Unsupported file type' };
  }

  if (size <= 0 || size > MAX_FILE_BYTES) {
    return { ok: false, error: 'File must be between 1 byte and 4 MB' };
  }

  return { ok: true, ext, fileBase };
}

export type UploadScope =
  | { kind: 'user'; userId: string }
  | { kind: 'invite'; inviteId: string };

// Returns the folder path (with trailing slash) stored as the item reference.
export function buildFolderPath(scope: UploadScope, itemId: string): string {
  const base =
    scope.kind === 'user'
      ? `onboarding/${scope.userId}`
      : `onboarding/invite_${scope.inviteId}`;
  return `${base}/${itemId}/`;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all assertions green.

- [ ] **Step 7: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/onboarding/uploads.ts src/lib/onboarding/uploads.test.ts vitest.config.ts package.json package-lock.json
git commit -m "feat: add onboarding upload validation helper with vitest tests"
```

---

## Task 4: Authenticated rep upload route

**Files:**
- Create: `src/app/api/portal/onboarding/upload/route.ts`

**Interfaces:**
- Consumes: `getOnboardingBucket` (Task 2); `validateUpload`, `buildFolderPath` (Task 3); `requireSelfOrManagement` from `@/lib/auth/requireManagement`.
- Produces: `POST` endpoint returning `{ path: string }` (the folder path). Used by `FileUpload` (Task 7) wired in Task 9.

- [ ] **Step 1: Implement the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getOnboardingBucket } from '@/lib/firebase/admin';
import { requireSelfOrManagement } from '@/lib/auth/requireManagement';
import { validateUpload, buildFolderPath } from '@/lib/onboarding/uploads';

// POST /api/portal/onboarding/upload - Authenticated rep (or management acting
// on their behalf) uploads a file for a storage-kind onboarding item. Writes
// via the Admin SDK and returns the folder path to store as the item reference.
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const requestedBy = String(form.get('requestedBy') ?? '');
    const userId = String(form.get('userId') ?? '');
    const itemId = String(form.get('itemId') ?? '');
    const slot = form.get('slot') ? String(form.get('slot')) : null;
    const file = form.get('file');

    if (!userId || !itemId || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, itemId, file' },
        { status: 400 }
      );
    }

    const gate = await requireSelfOrManagement(requestedBy, userId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const check = validateUpload({ itemId, slot, mime: file.type, size: file.size });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const folder = buildFolderPath({ kind: 'user', userId }, itemId);
    const objectPath = `${folder}${check.fileBase}.${check.ext}`;

    const bucket = getOnboardingBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    await bucket.file(objectPath).save(buffer, {
      contentType: file.type,
      resumable: false,
    });

    return NextResponse.json({ path: folder });
  } catch (error) {
    console.error('Error uploading onboarding file:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds; the new route appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/portal/onboarding/upload/route.ts
git commit -m "feat: add authenticated rep onboarding upload route"
```

---

## Task 5: Public candidate upload route (token-gated)

**Files:**
- Create: `src/app/api/public/onboarding/[token]/upload/route.ts`

**Interfaces:**
- Consumes: `getOnboardingBucket` (Task 2); `validateUpload`, `buildFolderPath` (Task 3); `hashInviteToken` from `@/lib/recruiting/tokens`; `adminDb` from `@/lib/firebase/admin`.
- Produces: `POST` endpoint returning `{ path: string }`. Used by `FileUpload` (Task 7) wired in Task 8.

- [ ] **Step 1: Implement the route**

Mirror the invite-lookup + guards used in `src/app/api/public/onboarding/[token]/route.ts` (kept self-contained here so the file is independently readable):

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { hashInviteToken } from '@/lib/recruiting/tokens';
import { validateUpload, buildFolderPath } from '@/lib/onboarding/uploads';

const LOCKED_STATUSES = ['submitted', 'approved', 'converted'];

async function getInviteByToken(token: string) {
  if (!adminDb) return null;
  const tokenHash = hashInviteToken(token);
  const snapshot = await adminDb
    .collection('onboardingInvites')
    .where('tokenHash', '==', tokenHash)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, data: doc.data() };
}

function isExpired(expiresAt: FirebaseFirestore.Timestamp | undefined) {
  return !!expiresAt?.toDate && expiresAt.toDate().getTime() < Date.now();
}

// POST /api/public/onboarding/[token]/upload - A candidate holding a valid
// invite token uploads a file for a storage-kind item before account creation.
// Files land under onboarding/invite_{inviteId}/{itemId}/. No Firestore/user
// writes happen here; the returned path is submitted later via [token] POST.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { token } = await params;
    const invite = await getInviteByToken(token);
    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }
    if (isExpired(invite.data.expiresAt) || invite.data.status === 'expired') {
      return NextResponse.json({ error: 'This onboarding link has expired' }, { status: 410 });
    }
    if (LOCKED_STATUSES.includes(invite.data.status)) {
      return NextResponse.json(
        { error: 'This onboarding packet was already submitted' },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const itemId = String(form.get('itemId') ?? '');
    const slot = form.get('slot') ? String(form.get('slot')) : null;
    const file = form.get('file');

    if (!itemId || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing required fields: itemId, file' },
        { status: 400 }
      );
    }

    const check = validateUpload({ itemId, slot, mime: file.type, size: file.size });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const folder = buildFolderPath({ kind: 'invite', inviteId: invite.id }, itemId);
    const objectPath = `${folder}${check.fileBase}.${check.ext}`;

    const bucket = getOnboardingBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    await bucket.file(objectPath).save(buffer, {
      contentType: file.type,
      resumable: false,
    });

    return NextResponse.json({ path: folder });
  } catch (error) {
    console.error('Error uploading public onboarding file:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds; the new route appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/public/onboarding/[token]/upload/route.ts"
git commit -m "feat: add token-gated public onboarding upload route"
```

---

## Task 6: Review API — signed URLs for storage items

**Files:**
- Modify: `src/app/api/portal/onboarding/review/route.ts`

**Interfaces:**
- Consumes: `getOnboardingBucket` (Task 2); `isStorageItem` (Task 3); existing `ONBOARDING_ITEMS`.
- Produces: each storage submission gains `referenceKind: 'storage'` and `files: { name: string; url: string; contentType: string }[]`. Text submissions unchanged. Consumed by the admin page (Task 10).

- [ ] **Step 1: Add imports**

In `src/app/api/portal/onboarding/review/route.ts`, extend the imports:

```typescript
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { ONBOARDING_ITEMS } from '@/types';
import { isStorageItem } from '@/lib/onboarding/uploads';
```

- [ ] **Step 2: Add a signed-files helper above `GET`**

```typescript
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

// For a storage-item reference (a folder path), list its files and mint a
// 15-minute signed read URL for each. Degrades to [] on any error so one bad
// reference never 500s the whole review queue.
async function signFolderFiles(
  reference: string | null
): Promise<{ name: string; url: string; contentType: string }[]> {
  if (!reference) return [];
  try {
    const bucket = getOnboardingBucket();
    // Always list within the exact folder. A trailing slash prevents a legacy
    // reference like ".../dl_photos" from over-matching ".../dl_photos_x/...".
    const prefix = reference.endsWith('/') ? reference : `${reference}/`;
    const [files] = await bucket.getFiles({ prefix });
    const expires = Date.now() + SIGNED_URL_TTL_MS;
    return Promise.all(
      files.map(async (f) => {
        const [url] = await f.getSignedUrl({ action: 'read', expires });
        return {
          name: f.name.split('/').pop() ?? f.name,
          url,
          contentType: String(f.metadata.contentType ?? ''),
        };
      })
    );
  } catch (error) {
    console.error('Failed to sign storage files for review:', error);
    return [];
  }
}
```

- [ ] **Step 3: Build submissions with storage handling**

Replace the existing `const submissions = snapshot.docs.map(...)` block with an async build that signs storage items. The mapping currently produces the plain object; wrap it so storage items get `files`:

```typescript
    const submissions = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();
        const item = ONBOARDING_ITEMS.find((i) => i.id === data.itemId);
        const user = userMap.get(data.userId);
        const storage = isStorageItem(data.itemId);
        return {
          id: doc.id,
          userId: data.userId,
          itemId: data.itemId,
          itemLabel: item?.label ?? data.itemId,
          category: item?.category ?? 'paperwork',
          sensitive: item?.sensitive ?? false,
          referenceKind: item?.referenceKind ?? 'manual',
          reference: data.reference ?? null,
          files: storage ? await signFolderFiles(data.reference ?? null) : [],
          userName: user?.displayName ?? user?.email ?? data.userId,
          userEmail: user?.email ?? '',
          submittedAt: data.submittedAt?.toDate() ?? null,
        };
      })
    );

    submissions.sort((a, b) => {
      const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return ta - tb; // oldest first - FIFO review queue
    });
```

> Note: the original chained `.map().sort()`. Because mapping is now async (`Promise.all`), sort moves to a separate statement on the resolved array, as shown.

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/portal/onboarding/review/route.ts
git commit -m "feat: return signed URLs for storage onboarding items in review queue"
```

---

## Task 7: `FileUpload` component

**Files:**
- Create: `src/components/onboarding/FileUpload.tsx`

**Interfaces:**
- Consumes: shadcn `Button` (`@/components/ui/button`); lucide icons.
- Produces: default-exported `FileUpload` with props:
  ```typescript
  interface FileUploadProps {
    itemId: string;
    slot?: 'front' | 'back';
    uploadUrl: string;
    accept: string;                       // input accept attr, e.g. "image/*" or "image/*,application/pdf"
    allowedTypes: string[];               // exact MIME allowlist for client pre-check
    maxSizeMb?: number;                   // default 4
    extraFields?: Record<string, string>; // appended to the multipart body (e.g. userId, requestedBy)
    label?: string;
    existingPath?: string;                // pre-populate as already-uploaded (replace UX)
    onUploaded: (folderPath: string) => void;
  }
  ```
  Consumed by Tasks 8 and 9.

- [ ] **Step 1: Implement the component**

```tsx
'use client';

import { useRef, useState } from 'react';
import { Loader2, UploadCloud, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FileUploadProps {
  itemId: string;
  slot?: 'front' | 'back';
  uploadUrl: string;
  accept: string;
  allowedTypes: string[];
  maxSizeMb?: number;
  extraFields?: Record<string, string>;
  label?: string;
  existingPath?: string;
  onUploaded: (folderPath: string) => void;
}

type UploadState = 'idle' | 'uploading' | 'uploaded' | 'error';

// MIME types we can safely re-encode on a canvas to shrink large phone photos.
const DOWNSCALABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Downscale a large image client-side so it fits under the body-size cap.
// Returns the original file when it already fits or cannot be decoded.
async function maybeDownscale(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes || !DOWNSCALABLE.has(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 2000;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export default function FileUpload({
  itemId,
  slot,
  uploadUrl,
  accept,
  allowedTypes,
  maxSizeMb = 4,
  extraFields = {},
  label,
  existingPath,
  onUploaded,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>(existingPath ? 'uploaded' : 'idle');
  const [fileName, setFileName] = useState(existingPath ? 'Uploaded' : '');
  const [error, setError] = useState('');

  const handleFile = async (selected: File) => {
    setError('');

    // Client-side type pre-check (mirrors the server allowlist) for instant feedback.
    if (!allowedTypes.includes(selected.type)) {
      setState('error');
      setError('Unsupported file type');
      return;
    }

    const maxBytes = maxSizeMb * 1024 * 1024;
    const file = await maybeDownscale(selected, maxBytes);
    if (file.size > maxBytes) {
      setState('error');
      setError(`File must be ${maxSizeMb} MB or smaller`);
      return;
    }

    setState('uploading');
    setFileName(file.name);

    try {
      const body = new FormData();
      body.set('itemId', itemId);
      if (slot) body.set('slot', slot);
      for (const [k, v] of Object.entries(extraFields)) body.set(k, v);
      body.set('file', file);

      const response = await fetch(uploadUrl, { method: 'POST', body });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Upload failed');

      setState('uploaded');
      onUploaded(json.path as string);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      {label && <p className="mb-2 text-xs font-medium text-slate-600">{label}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={state === 'uploading'}
        >
          {state === 'uploading' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UploadCloud className="size-4" />
          )}
          {state === 'uploaded' ? 'Replace file' : 'Choose file'}
        </Button>
        {state === 'uploaded' && (
          <span className="flex items-center gap-1 text-sm text-[#4f7f1e]">
            <CheckCircle2 className="size-4" />
            {fileName || 'Uploaded'}
          </span>
        )}
        {state === 'error' && (
          <span className="flex items-center gap-1 text-sm text-red-600">
            <AlertTriangle className="size-4" />
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
```

> The shared client allowlists (passed as `allowedTypes`) are: images `['image/jpeg','image/png','image/webp','image/heic','image/heif']`; documents add `'application/pdf'`. Tasks 8 and 9 import these from a small exported constant in `src/lib/onboarding/uploads.ts` to avoid duplication — add `export const IMAGE_TYPES = [...]` and `export const DOC_TYPES = [...IMAGE_TYPES, 'application/pdf']` to Task 3's helper.

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/FileUpload.tsx
git commit -m "feat: add reusable onboarding FileUpload component"
```

---

## Task 8: Wire uploads into the public onboarding page

**Files:**
- Modify: `src/app/onboard/[token]/page.tsx`

**Interfaces:**
- Consumes: `FileUpload` (Task 7); public upload route (Task 5); `isStorageItem` (Task 3).
- Produces: storage items captured via uploaders; `references[itemId]` holds the folder path. The existing submit POST is unchanged.

- [ ] **Step 1: Add imports**

```typescript
import FileUpload from '@/components/onboarding/FileUpload';
import { isStorageItem, IMAGE_TYPES, DOC_TYPES } from '@/lib/onboarding/uploads';
```

- [ ] **Step 2: Add per-slot DL tracking state**

`dl_photos` requires BOTH front and back before it counts complete (spec §4.8). Add a state map for the two slots, just after the existing `const [references, setReferences] = useState...`:

```typescript
  // Track which dl_photos slots have uploaded; the item is complete only when
  // both are present. Both slots write the same folder path, so we set the
  // dl_photos reference only once both slots have reported success.
  const [dlSlots, setDlSlots] = useState<{ front: string; back: string }>({
    front: '',
    back: '',
  });

  const markDlSlot = (slot: 'front' | 'back', folderPath: string) => {
    setDlSlots((prev) => {
      const next = { ...prev, [slot]: folderPath };
      // Reference is the shared folder path once both slots are present; empty
      // (incomplete) otherwise, so the completion + submit checks stay accurate.
      updateReference('dl_photos', next.front && next.back ? folderPath : '');
      return next;
    });
  };
```

- [ ] **Step 3: Branch the item rendering on storage kind**

Inside the `data?.items.map((item, index) => ( ... ))` block, replace the single `<Textarea ... />` with this conditional. Keep the textarea for non-storage items; render uploader(s) for storage items:

```tsx
                  {isStorageItem(item.id) ? (
                    item.id === 'dl_photos' ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <FileUpload
                          itemId="dl_photos"
                          slot="front"
                          label="Front of license"
                          accept="image/*"
                          allowedTypes={IMAGE_TYPES}
                          uploadUrl={`/api/public/onboarding/${token}/upload`}
                          onUploaded={(path) => markDlSlot('front', path)}
                        />
                        <FileUpload
                          itemId="dl_photos"
                          slot="back"
                          label="Back of license"
                          accept="image/*"
                          allowedTypes={IMAGE_TYPES}
                          uploadUrl={`/api/public/onboarding/${token}/upload`}
                          onUploaded={(path) => markDlSlot('back', path)}
                        />
                      </div>
                    ) : (
                      <FileUpload
                        itemId={item.id}
                        accept="image/*,application/pdf"
                        allowedTypes={DOC_TYPES}
                        uploadUrl={`/api/public/onboarding/${token}/upload`}
                        onUploaded={(path) => updateReference(item.id, path)}
                      />
                    )
                  ) : (
                    <Textarea
                      value={references[item.id] || ''}
                      onChange={(event) => updateReference(item.id, event.target.value)}
                      placeholder={
                        item.sensitive
                          ? 'Example: Vendor confirmation, uploaded file reference, or manager note'
                          : 'Example: Completed, acknowledged, or upload/reference note'
                      }
                      required
                    />
                  )}
```

> Note: `dl_photos` is marked complete only when both slots succeed (`markDlSlot` clears the reference until `front && back`). The existing `references['dl_photos']?.trim()` completion + the submit route's `missing` check then both pass only with both files present — satisfying spec §4.8 with no submit-route change.

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add "src/app/onboard/[token]/page.tsx"
git commit -m "feat: capture storage onboarding items via file upload on public flow"
```

---

## Task 9: Wire uploads into the rep onboarding page

**Files:**
- Modify: `src/app/portal/onboarding/page.tsx`

**Interfaces:**
- Consumes: `FileUpload` (Task 7); portal upload route (Task 4); `isStorageItem`, `IMAGE_TYPES`, `DOC_TYPES` (Task 3); the page's existing `useAuth()` user (for `userId`/`requestedBy`).
- Produces: storage items captured via uploaders in the authenticated submit Dialog; the resolved folder path flows into the existing `reference` state that `handleSubmit` POSTs.

**Context (verified against the current file):** the active item in the submit Dialog is `submitModal` (`ChecklistItem | null`), not `item`. The reference is held in `const [reference, setReference] = useState('')` and sent by `handleSubmit` as `reference`. The `Input` at lines 294-299 is what we branch. The auth user is `const { user } = useAuth()`.

- [ ] **Step 1: Add imports**

Add to the import block:

```typescript
import FileUpload from '@/components/onboarding/FileUpload';
import { isStorageItem, IMAGE_TYPES, DOC_TYPES } from '@/lib/onboarding/uploads';
```

- [ ] **Step 2: Add per-slot DL tracking state**

Just after `const [reference, setReference] = useState('');` add:

```typescript
  // dl_photos requires both slots before the reference (shared folder path) is set.
  const [dlSlots, setDlSlots] = useState<{ front: string; back: string }>({
    front: '',
    back: '',
  });

  const markDlSlot = (slot: 'front' | 'back', folderPath: string) => {
    setDlSlots((prev) => {
      const next = { ...prev, [slot]: folderPath };
      setReference(next.front && next.back ? folderPath : '');
      return next;
    });
  };
```

Also reset the slots when the Dialog closes — in BOTH `onOpenChange` (line 277) and the Cancel button (line 303) handlers, add `setDlSlots({ front: '', back: '' });` next to the existing `setReference('')`.

- [ ] **Step 3: Branch the Dialog input on storage kind**

Replace the `Input` block (current lines 294-299):

```tsx
            <Input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Reference or note (optional)"
              maxLength={500}
            />
```

with this conditional (`user` is guaranteed inside the Dialog because the page is under `ProtectedRoute`; guard with `user?.uid` to satisfy the type checker):

```tsx
            {submitModal && isStorageItem(submitModal.id) ? (
              submitModal.id === 'dl_photos' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <FileUpload
                    itemId="dl_photos"
                    slot="front"
                    label="Front of license"
                    accept="image/*"
                    allowedTypes={IMAGE_TYPES}
                    uploadUrl="/api/portal/onboarding/upload"
                    extraFields={{ userId: user?.uid ?? '', requestedBy: user?.uid ?? '' }}
                    onUploaded={(path) => markDlSlot('front', path)}
                  />
                  <FileUpload
                    itemId="dl_photos"
                    slot="back"
                    label="Back of license"
                    accept="image/*"
                    allowedTypes={IMAGE_TYPES}
                    uploadUrl="/api/portal/onboarding/upload"
                    extraFields={{ userId: user?.uid ?? '', requestedBy: user?.uid ?? '' }}
                    onUploaded={(path) => markDlSlot('back', path)}
                  />
                </div>
              ) : (
                <FileUpload
                  itemId={submitModal.id}
                  accept="image/*,application/pdf"
                  allowedTypes={DOC_TYPES}
                  uploadUrl="/api/portal/onboarding/upload"
                  extraFields={{ userId: user?.uid ?? '', requestedBy: user?.uid ?? '' }}
                  onUploaded={(path) => setReference(path)}
                />
              )
            ) : (
              <Input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Reference or note (optional)"
                maxLength={500}
              />
            )}
```

> The submit button is unchanged: `handleSubmit` already sends `reference`. For storage items it now carries the folder path (set only when complete — both DL slots, or the single file). For `dl_photos`, the submit button can additionally be disabled until `reference` is non-empty if desired, but the existing flow already rejects an empty sensitive reference server-side, so no submit-route change is required.

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/portal/onboarding/page.tsx
git commit -m "feat: capture storage onboarding items via file upload on rep portal"
```

---

## Task 10: Admin review — render signed-URL thumbnails/links

**Files:**
- Modify: `src/app/portal/admin/onboarding/page.tsx`

**Interfaces:**
- Consumes: review API `files[]` + `referenceKind` (Task 6).
- Produces: storage submissions show file previews/links; text submissions show the reference exactly as today.

- [ ] **Step 1: Extend the `Submission` interface**

```typescript
interface Submission {
  id: string;
  userId: string;
  itemId: string;
  itemLabel: string;
  category: OnboardingCategory;
  sensitive: boolean;
  referenceKind: 'vendor' | 'storage' | 'esign' | 'manual';
  reference: string | null;
  files: { name: string; url: string; contentType: string }[];
  userName: string;
  userEmail: string;
  submittedAt: string | null;
}
```

- [ ] **Step 2: Render files for storage items**

Replace the existing reference block:

```tsx
                      {submission.reference && (
                        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                          <span className="font-medium text-slate-950">Reference:</span>{' '}
                          {submission.reference}
                        </div>
                      )}
```

with a branch on `referenceKind`:

```tsx
                      {submission.referenceKind === 'storage' ? (
                        submission.files.length > 0 ? (
                          <div className="mt-4 flex flex-wrap gap-3">
                            {submission.files.map((file) => (
                              <a
                                key={file.name}
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                {file.contentType.startsWith('image/') ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={file.url}
                                    alt={file.name}
                                    className="h-24 w-36 rounded-md border border-slate-200 object-cover"
                                  />
                                ) : (
                                  <span className="flex h-24 w-36 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                                    {file.name}
                                  </span>
                                )}
                              </a>
                            ))}
                            <p className="w-full text-xs text-slate-400">Links expire in 15 minutes.</p>
                          </div>
                        ) : (
                          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                            No files found at {submission.reference ?? 'this reference'}.
                          </div>
                        )
                      ) : (
                        submission.reference && (
                          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                            <span className="font-medium text-slate-950">Reference:</span>{' '}
                            {submission.reference}
                          </div>
                        )
                      )}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/portal/admin/onboarding/page.tsx
git commit -m "feat: render signed-URL file previews in onboarding review"
```

---

## Final Verification (per spec §7)

- [ ] `npx tsc --noEmit` and `npm run build` green; `npm test` green.
- [ ] Upload DL front+back + W-9 via the public token flow; confirm files at `onboarding/invite_{inviteId}/dl_photos/{front,back}.<ext>` and `.../w9/file.<ext>`, and that the stored `reference` is the folder path.
- [ ] Management review renders images/PDF via signed URLs; confirm a URL 403s after 15 minutes.
- [ ] Confirm a direct client read/write to the bucket is denied (deny-all `storage.rules`).
- [ ] Confirm Firestore `userOnboarding` holds only the folder path — no bytes, no raw numbers.
- [ ] Non-regression: a non-storage item (e.g. `pay_structure`) still captures + reviews as plain text.

## Deferred (not in this plan — fast-follows)

Virus scanning; rate limiting on the public upload route; signed-URL caching; invite→uid file migration; raising the 4 MB cap if/when the host allows larger bodies.
