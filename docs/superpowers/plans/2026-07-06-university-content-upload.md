# University Content Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins upload documents and videos to the University tab (browser-direct to Firebase Storage) and let reps view/play them, organized by carrier category.

**Architecture:** Files upload from the browser via the Firebase client Storage SDK (bypassing Vercel's ~4.5 MB request cap); a Storage security rule restricts writes to admins/operations and reads to signed-in staff. Resource metadata lives in the existing `training` Firestore collection with new file fields; a new admin page manages content; the existing rep detail page renders the file.

**Tech Stack:** Next.js (App Router), TypeScript, React client components, Firebase client Storage SDK (`firebase/storage`), Firebase Admin SDK (deletes), Firestore, Vitest, Tailwind.

## Global Constraints

- Carrier categories are the five in `TRAINING_CATEGORIES` (`src/types/training.ts`): `att`, `tfiber`, `verizon_frontier`, `xfinity`, `directv`. Do not hardcode a different list.
- Storage path shape (verbatim): `training/{uploadId}/{safeFilename}` where `uploadId = crypto.randomUUID().replace(/-/g,'')`.
- Allowed upload MIME: `application/pdf`, `image/*`, `video/*`. Size cap: **1 GB** (`1024*1024*1024`). Enforced client-side AND in `storage.rules`.
- `type` is derived from MIME server-side on create: `video/*` → `video`, else → `document`. Never trust a client-supplied `type`.
- Admin content APIs are gated by `requireManagement(requestedBy)` (existing pattern; client sends `requestedBy = user.uid`). The real file-write authz is the Storage rule (token-based).
- Client bucket (`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`) == Admin SDK bucket (`getOnboardingBucket()`), so client uploads and server deletes hit the same objects.
- Test runner: `npx vitest run <file>`. Typecheck: `npx tsc --noEmit`. Build: `npm run build`.
- New commits, never amend. Brand tokens only (`#0A1F44` navy, `#8dc63f` lime, `#5a8f1f` lime-text).
- **Ship gate:** `firebase deploy --only storage` (user-approved) before uploads work in prod.

---

### Task 1: File helpers + data model

**Files:**
- Create: `src/lib/training/fileKind.ts`
- Create: `src/lib/training/fileKind.test.ts`
- Modify: `src/types/training.ts` (TrainingResource interface, ~lines 9-30)

**Interfaces:**
- Produces: `deriveResourceType(mime: string): 'video' | 'document'`; `sanitizeFileName(name: string): string`; `MAX_TRAINING_BYTES: number`; `isAllowedTrainingUpload(mime: string, size: number): { ok: true } | { ok: false; error: string }`; new optional `TrainingResource` fields `storagePath?`, `fileName?`, `mimeType?`, `fileSize?`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/training/fileKind.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveResourceType, sanitizeFileName, isAllowedTrainingUpload, MAX_TRAINING_BYTES } from './fileKind';

describe('deriveResourceType', () => {
  it('maps video/* to video', () => expect(deriveResourceType('video/mp4')).toBe('video'));
  it('maps application/pdf to document', () => expect(deriveResourceType('application/pdf')).toBe('document'));
  it('maps image/* to document', () => expect(deriveResourceType('image/png')).toBe('document'));
});

describe('sanitizeFileName', () => {
  it('replaces spaces and strips unsafe chars', () => {
    expect(sanitizeFileName('My Slide Deck (v2).pdf')).toBe('My_Slide_Deck_v2.pdf');
  });
  it('falls back to "file" when empty', () => expect(sanitizeFileName('***')).toBe('file'));
});

describe('isAllowedTrainingUpload', () => {
  it('accepts a pdf under the cap', () => expect(isAllowedTrainingUpload('application/pdf', 1000).ok).toBe(true));
  it('accepts a video under the cap', () => expect(isAllowedTrainingUpload('video/mp4', 1000).ok).toBe(true));
  it('rejects an unsupported type', () => expect(isAllowedTrainingUpload('application/zip', 1000).ok).toBe(false));
  it('rejects over the cap', () => expect(isAllowedTrainingUpload('video/mp4', MAX_TRAINING_BYTES + 1).ok).toBe(false));
  it('rejects zero bytes', () => expect(isAllowedTrainingUpload('image/png', 0).ok).toBe(false));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/training/fileKind.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement the helper**

Create `src/lib/training/fileKind.ts`:

```ts
// Pure helpers for University file uploads — shared by the client upload hook,
// the admin form, and the create API (server derives type from MIME).
export const MAX_TRAINING_BYTES = 1024 * 1024 * 1024; // 1 GB
const ALLOWED_MIME = /^(application\/pdf|image\/.*|video\/.*)$/;

export function deriveResourceType(mime: string): 'video' | 'document' {
  return mime.startsWith('video/') ? 'video' : 'document';
}

export function sanitizeFileName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9._-]/g, '');
  return cleaned || 'file';
}

export function isAllowedTrainingUpload(
  mime: string,
  size: number
): { ok: true } | { ok: false; error: string } {
  if (!ALLOWED_MIME.test(mime)) {
    return { ok: false, error: 'Unsupported file type (use PDF, image, or video)' };
  }
  if (size <= 0 || size > MAX_TRAINING_BYTES) {
    return { ok: false, error: 'File must be between 1 byte and 1 GB' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/training/fileKind.test.ts` → PASS (11 tests).

- [ ] **Step 5: Add the data-model fields**

In `src/types/training.ts`, inside `interface TrainingResource` (after `duration?: number;`) add:

```ts
  // Uploaded-file fields (University content). Absent on legacy link resources.
  storagePath?: string; // e.g. training/{uploadId}/{filename}
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/training/fileKind.ts src/lib/training/fileKind.test.ts src/types/training.ts
git commit -m "feat(training): file-kind helpers + upload data model"
```

---

### Task 2: Client Storage export + upload hook

**Files:**
- Modify: `src/lib/firebase/config.ts` (imports; init block; exports)
- Create: `src/hooks/useTrainingUpload.ts`

**Interfaces:**
- Consumes: `isAllowedTrainingUpload`, `sanitizeFileName` from `@/lib/training/fileKind`.
- Produces: `storage` export from `@/lib/firebase/config`; `useTrainingUpload()` returning `{ upload(file: File, uploadId: string): Promise<UploadedFile | null>, progress: number, uploading: boolean, error: string }` where `UploadedFile = { storagePath: string; fileName: string; mimeType: string; fileSize: number }`.

- [ ] **Step 1: Export client Storage**

In `src/lib/firebase/config.ts`:
- Add import: `import { getStorage, FirebaseStorage } from 'firebase/storage';`
- Add `let storage: FirebaseStorage | null = null;` beside the other singletons.
- Inside the `if (hasValidConfig) { ... }` block, after `db = getFirestore(app);`, add `storage = getStorage(app);`
- Add `storage` to the export list: `export { app, auth, db, storage };`

- [ ] **Step 2: Create the upload hook**

Create `src/hooks/useTrainingUpload.ts`:

```ts
'use client';

import { useCallback, useState } from 'react';
import { ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '@/lib/firebase/config';
import { isAllowedTrainingUpload, sanitizeFileName } from '@/lib/training/fileKind';

export interface UploadedFile {
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

// Uploads a training file straight to Firebase Storage with progress. The
// caller passes a unique uploadId so each resource gets its own folder.
export function useTrainingUpload() {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const upload = useCallback(
    (file: File, uploadId: string): Promise<UploadedFile | null> => {
      setError('');
      const check = isAllowedTrainingUpload(file.type, file.size);
      if (!check.ok) {
        setError(check.error);
        return Promise.resolve(null);
      }
      if (!storage) {
        setError('Storage is not configured');
        return Promise.resolve(null);
      }
      const safeName = sanitizeFileName(file.name);
      const storagePath = `training/${uploadId}/${safeName}`;
      setUploading(true);
      setProgress(0);
      return new Promise((resolve) => {
        const task = uploadBytesResumable(ref(storage!, storagePath), file, {
          contentType: file.type,
        });
        task.on(
          'state_changed',
          (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          (err) => {
            setUploading(false);
            setError(err.message || 'Upload failed');
            resolve(null);
          },
          () => {
            setUploading(false);
            setProgress(100);
            resolve({ storagePath, fileName: safeName, mimeType: file.type, fileSize: file.size });
          }
        );
      });
    },
    []
  );

  return { upload, progress, uploading, error };
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/firebase/config.ts src/hooks/useTrainingUpload.ts
git commit -m "feat(training): client storage export + resumable upload hook"
```

---

### Task 3: Storage security rules

**Files:**
- Modify: `storage.rules` (replace whole file)

**Interfaces:**
- Produces: a `training/` write path for admins/operations and read for any signed-in user; everything else stays deny-all.

- [ ] **Step 1: Replace `storage.rules`**

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // University training content: admins/operations upload, signed-in staff read.
    match /training/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role in ['admin', 'operations']
        && request.resource.size < 1024 * 1024 * 1024
        && request.resource.contentType.matches('application/pdf|image/.*|video/.*');
    }
    // Everything else (onboarding/forms) is Admin-SDK-only.
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 2: Sanity-check the rule compiles**

Run: `npx firebase deploy --only storage --dry-run 2>&1 | tail -5` (if the CLI is available/authed). Expected: compiles with no syntax error. If the CLI is not authed, skip — the deploy is a user-approved ship gate; do NOT block the task on it.

- [ ] **Step 3: Commit**

```bash
git add storage.rules
git commit -m "feat(training): storage rule for admin upload + staff read of training/"
```

Note for the controller: after merge, this rule must be deployed (`firebase deploy --only storage`) with user approval before uploads work.

---

### Task 4: Create API — file fields, server-side type, admin list-all

**Files:**
- Modify: `src/app/api/portal/training/route.ts` (POST body destructure + persist; GET add `?all` mode)

**Interfaces:**
- Consumes: `deriveResourceType` from `@/lib/training/fileKind`; `requireManagement` (already imported).
- Produces: POST persists `storagePath`, `fileName`, `mimeType`, `fileSize`, and server-derived `type`; GET supports `?all=true&requestedBy=<uid>` (management-gated) returning unpublished too.

- [ ] **Step 1: Import the helper**

At the top of `src/app/api/portal/training/route.ts`, add:

```ts
import { deriveResourceType } from '@/lib/training/fileKind';
```

- [ ] **Step 2: Add `?all` mode to GET**

In `GET`, after the `searchParams` are read, add:

```ts
    const includeAll = searchParams.get('all') === 'true';
    if (includeAll) {
      const gate = await requireManagement(searchParams.get('requestedBy'));
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: gate.status });
      }
    }
```

Then change the publish filter inside the `snapshot.forEach` — replace `if (data.isPublished) {` with:

```ts
      if (includeAll || data.isPublished) {
```

(and the closing brace stays). Keep the existing `storagePath`/file fields flowing through via the `...data` spread.

- [ ] **Step 3: Persist file fields + derive type in POST**

In `POST`, extend the body destructure to add `storagePath, fileName, mimeType, fileSize` alongside the existing fields. Then replace the `newResource` object's `type` line and add the file fields so the object reads:

```ts
    const newResource = {
      title,
      description: description || '',
      type: mimeType ? deriveResourceType(mimeType) : (type || 'document'),
      category,
      url: url || '',
      thumbnailUrl: thumbnailUrl || '',
      duration: duration || 0,
      requiredRoles: requiredRoles || [],
      isRequired: isRequired || false,
      isPublished: isPublished !== false,
      order: order || 0,
      storagePath: storagePath || '',
      fileName: fileName || '',
      mimeType: mimeType || '',
      fileSize: fileSize || 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit` → clean. Run: `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/portal/training/route.ts
git commit -m "feat(training): API persists uploaded-file fields + admin list-all"
```

---

### Task 5: Delete API — remove the stored file

**Files:**
- Modify: `src/app/api/portal/training/[id]/route.ts` (DELETE handler)

**Interfaces:**
- Consumes: `getOnboardingBucket` from `@/lib/firebase/admin`.
- Produces: deleting a resource also removes its storage objects (best-effort).

- [ ] **Step 1: Import the bucket helper**

In `src/app/api/portal/training/[id]/route.ts`, add to the imports:

```ts
import { adminDb } from '@/lib/firebase/admin';
import { getOnboardingBucket } from '@/lib/firebase/admin';
```

(Merge into the existing `@/lib/firebase/admin` import line: `import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';`)

- [ ] **Step 2: Delete storage objects after the doc**

In `DELETE`, capture the data before deleting and clean up the folder afterward. Replace the block from `const docRef = ...` through `await docRef.delete();` with:

```ts
    const docRef = adminDb.collection('training').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    const data = doc.data();
    await docRef.delete();

    // Best-effort: remove the uploaded file(s) under training/{uploadId}/.
    if (data?.storagePath) {
      try {
        const folder = String(data.storagePath).replace(/[^/]+$/, ''); // training/{uploadId}/
        await getOnboardingBucket().deleteFiles({ prefix: folder, force: true });
      } catch (err) {
        console.error('Training file cleanup failed:', err);
      }
    }
```

- [ ] **Step 3: Typecheck + build + commit**

Run: `npx tsc --noEmit` → clean. Run: `npm run build` → succeeds.

```bash
git add "src/app/api/portal/training/[id]/route.ts"
git commit -m "feat(training): delete removes the uploaded file too"
```

---

### Task 6: Admin management page + nav

**Files:**
- Create: `src/app/portal/admin/university/page.tsx`
- Modify: `src/components/portal/PortalSidebar.tsx` (`operationsItems` array, ~line 177)

**Interfaces:**
- Consumes: `useTrainingUpload`, `useAuth`, `TRAINING_CATEGORIES`, existing UI components, training APIs (`GET ?all`, `POST`, `PUT [id]`, `DELETE [id]`).

- [ ] **Step 1: Add the nav item**

In `src/components/portal/PortalSidebar.tsx`, add to the `operationsItems` array (after the `Onboarding Review` entry) a new item:

```tsx
  {
    name: 'University Content',
    href: '/portal/admin/university',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332-.477-4.5-1.253" />
      </svg>
    ),
    roles: ['admin', 'operations'],
  },
```

- [ ] **Step 2: Create the admin page**

Create `src/app/portal/admin/university/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useTrainingUpload } from '@/hooks/useTrainingUpload';
import { TRAINING_CATEGORIES, TrainingResource } from '@/types';

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  TRAINING_CATEGORIES.map((c) => [c.value, c.label])
);

function AdminUniversity() {
  const { user } = useAuth();
  const { upload, progress, uploading, error: uploadError } = useTrainingUpload();

  const [items, setItems] = useState<TrainingResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('att');
  const [description, setDescription] = useState('');
  const [required, setRequired] = useState(false);
  const [publish, setPublish] = useState(true);
  const [pending, setPending] = useState<{ storagePath: string; fileName: string; mimeType: string; fileSize: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/training?all=true&requestedBy=${user.uid}`);
      const data = await res.json();
      if (res.ok) setItems(data.resources || []);
      else setErr(data.error || 'Failed to load content');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    const uploadId = crypto.randomUUID().replace(/-/g, '');
    const result = await upload(file, uploadId);
    if (result) setPending(result);
  };

  const canSave = Boolean(title.trim() && category && pending && !uploading && !saving);

  const onSave = async () => {
    if (!user || !pending) return;
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const res = await fetch('/api/portal/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedBy: user.uid,
          title: title.trim(),
          category,
          description: description.trim(),
          isRequired: required,
          isPublished: publish,
          storagePath: pending.storagePath,
          fileName: pending.fileName,
          mimeType: pending.mimeType,
          fileSize: pending.fileSize,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setMsg('Content added.');
      setTitle(''); setDescription(''); setRequired(false); setPublish(true); setPending(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (item: TrainingResource) => {
    if (!user) return;
    await fetch(`/api/portal/training/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestedBy: user.uid, isPublished: !item.isPublished }),
    });
    await load();
  };

  const remove = async (item: TrainingResource) => {
    if (!user) return;
    if (!confirm(`Delete "${item.title}"? This also removes the uploaded file.`)) return;
    await fetch(`/api/portal/training/${item.id}?requestedBy=${user.uid}`, { method: 'DELETE' });
    await load();
  };

  const startEdit = (item: TrainingResource) => {
    setEditingId(item.id!);
    setEditTitle(item.title);
    setEditDesc(item.description || '');
  };

  const saveEdit = async (item: TrainingResource) => {
    if (!user || !editTitle.trim()) return;
    await fetch(`/api/portal/training/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestedBy: user.uid, title: editTitle.trim(), description: editDesc.trim() }),
    });
    setEditingId(null);
    await load();
  };

  const fmtSize = (b?: number) => (b ? `${(b / (1024 * 1024)).toFixed(1)} MB` : '');

  return (
    <ProtectedRoute permissions={['training:read']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1100px] space-y-5">
              <PortalPageHeader
                eyebrow="Admin"
                title="University Content"
                description="Upload documents and videos for reps, organized by carrier."
              />

              {(msg || err || uploadError) && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${err || uploadError ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300'}`}>
                  {err || uploadError || msg}
                </div>
              )}

              <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
                <CardHeader className="border-b border-slate-100 dark:border-border p-5">
                  <CardTitle className="text-[#0A1F44] dark:text-foreground">Add content</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
                  <div>
                    <Label className="mb-1">Title *</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AT&T Fiber install walkthrough" />
                  </div>
                  <div>
                    <Label className="mb-1">Carrier *</Label>
                    <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} className="w-full">
                      {TRAINING_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="mb-1">Description</Label>
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional short summary" />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="mb-1">File (PDF, image, or video)</Label>
                    <input
                      type="file"
                      accept="application/pdf,image/*,video/*"
                      onChange={onPickFile}
                      className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-[#8dc63f] file:px-4 file:py-2 file:text-[#0A1F44] hover:file:bg-[#7ab82e] dark:text-muted-foreground"
                    />
                    {uploading && (
                      <div className="mt-2">
                        <div className="h-2 w-full overflow-hidden rounded bg-slate-100 dark:bg-muted">
                          <div className="h-full bg-[#8dc63f] transition-all" style={{ width: `${progress}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">Uploading… {progress}%</p>
                      </div>
                    )}
                    {pending && !uploading && (
                      <p className="mt-2 text-sm text-[#4f7f1e] dark:text-green-300">Ready: {pending.fileName} ({fmtSize(pending.fileSize)})</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 md:col-span-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-muted-foreground">
                      <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required training
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-muted-foreground">
                      <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Publish immediately
                    </label>
                    <Button onClick={onSave} disabled={!canSave} className="ml-auto bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
                      {saving ? 'Saving…' : 'Save content'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
                <CardHeader className="border-b border-slate-100 dark:border-border p-5">
                  <CardTitle className="text-[#0A1F44] dark:text-foreground">Existing content</CardTitle>
                </CardHeader>
                <CardContent className="p-5">
                  {loading ? (
                    <p className="text-sm text-slate-500 dark:text-muted-foreground">Loading…</p>
                  ) : items.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-muted-foreground">No content yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-3">
                          {editingId === item.id ? (
                            <>
                              <div className="min-w-0 flex-1 space-y-2">
                                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title" />
                                <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description" />
                              </div>
                              <Button size="sm" onClick={() => saveEdit(item)} className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">Save</Button>
                              <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                            </>
                          ) : (
                            <>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-slate-950 dark:text-foreground">{item.title}</p>
                                <p className="text-xs text-slate-500 dark:text-muted-foreground">
                                  {CATEGORY_LABEL[item.category] || item.category} · {item.type} · {item.fileName || '—'} {item.fileSize ? `(${fmtSize(item.fileSize)})` : ''}
                                </p>
                              </div>
                              <Badge variant="outline" className={item.isPublished ? 'border-[#8dc63f]/40 text-[#3f6212] dark:text-[#d7ecc0]' : 'border-slate-300 text-slate-500'}>
                                {item.isPublished ? 'Published' : 'Draft'}
                              </Badge>
                              <Button variant="outline" size="sm" onClick={() => startEdit(item)}>Edit</Button>
                              <Button variant="outline" size="sm" onClick={() => togglePublish(item)}>
                                {item.isPublished ? 'Unpublish' : 'Publish'}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => remove(item)} className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/15">
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

export default function AdminUniversityPage() {
  return <AdminUniversity />;
}
```

- [ ] **Step 3: Typecheck + lint + build**

Run: `npx tsc --noEmit` → clean. Run: `npx eslint src/app/portal/admin/university/page.tsx src/components/portal/PortalSidebar.tsx` → clean. Run: `npm run build` → succeeds (route `/portal/admin/university` registered).

- [ ] **Step 4: Commit**

```bash
git add src/app/portal/admin/university/page.tsx src/components/portal/PortalSidebar.tsx
git commit -m "feat(training): admin University content page + nav"
```

---

### Task 7: Rep viewing — render uploaded file on the detail page

**Files:**
- Modify: `src/app/portal/training/[id]/page.tsx` (add storage URL resolution + render block)

**Interfaces:**
- Consumes: `storage` from `@/lib/firebase/config`; `getDownloadURL`, `ref` from `firebase/storage`; `currentResource.storagePath`/`type`/`mimeType`.

- [ ] **Step 1: Resolve + render the file**

In `src/app/portal/training/[id]/page.tsx`:
- Add imports: `import { ref, getDownloadURL } from 'firebase/storage';` and `import { storage } from '@/lib/firebase/config';`
- Add state + effect (after the existing hooks):

```tsx
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  useEffect(() => {
    const path = currentResource?.storagePath;
    if (!path || !storage) { setFileUrl(null); return; }
    let active = true;
    getDownloadURL(ref(storage, path))
      .then((url) => { if (active) setFileUrl(url); })
      .catch(() => { if (active) setFileUrl(null); });
    return () => { active = false; };
  }, [currentResource?.storagePath]);
```

(ensure `useState`/`useEffect` are imported — add if missing.)

- Render the player where the resource body shows. Add this block inside the main content area (after the resource title/description, before/where the "Mark complete" action is):

```tsx
              {currentResource?.storagePath && (
                <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-border bg-black">
                  {!fileUrl ? (
                    <div className="p-8 text-center text-sm text-white/70">Loading content…</div>
                  ) : currentResource.type === 'video' ? (
                    <video controls preload="metadata" src={fileUrl} className="max-h-[70vh] w-full bg-black" />
                  ) : currentResource.mimeType === 'application/pdf' ? (
                    <iframe src={fileUrl} title={currentResource.title} className="h-[75vh] w-full bg-white" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl} alt={currentResource.title} className="max-h-[75vh] w-full object-contain bg-black" />
                  )}
                </div>
              )}
              {currentResource?.storagePath && fileUrl && (
                <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-medium text-[#5a8f1f] hover:underline">
                  Open in new tab
                </a>
              )}
```

(Adapt the exact JSX placement to the file's existing layout; keep the existing header, category chip, and Mark-complete button intact.)

- [ ] **Step 2: Typecheck + lint + build + commit**

Run: `npx tsc --noEmit` → clean. Run: `npx eslint "src/app/portal/training/[id]/page.tsx"` → clean. Run: `npm run build` → succeeds.

```bash
git add "src/app/portal/training/[id]/page.tsx"
git commit -m "feat(training): reps view/play uploaded University content"
```

---

### Task 8: Full verification

- [ ] **Step 1: Test suite**

Run: `npm run test` → all pass (incl. new `fileKind` tests).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build` → both clean, `/portal/admin/university` and `/portal/training/[id]` registered.

- [ ] **Step 3: Manual smoke (requires storage rules deployed)**

Deploy the rule first: `firebase deploy --only storage` (user-approved). Then signed in as an admin:
1. `/portal/admin/university`: upload a small PDF → progress reaches 100% → Save → row appears (Published).
2. Upload a short video → appears under its carrier.
3. As a rep on `/portal/training`: the carrier pill shows the items; open the PDF (viewer) and play the video.
4. Unpublish an item → gone from the rep view. Delete → row and stored file removed.

---

## Notes / deferred
- Reordering, thumbnails, captions, `duration` auto-extraction, and `viewCount` analytics are out of scope (spec §Out of scope).
- The `storage.rules` deploy is a required ship gate; uploads are denied until it lands.
- Admin content APIs keep the existing `requireManagement(requestedBy)` gate; the Storage rule is the token-based backstop for file writes.
