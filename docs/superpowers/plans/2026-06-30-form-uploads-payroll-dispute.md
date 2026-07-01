# Generic Form Uploads + Payroll Dispute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic (non-onboarding) form-attachment upload system and prove it on the Payroll Dispute form — a logged-in user submits contractor + order details plus a screenshot, management reviews in a list and views the attachment via a signed URL.

**Architecture:** A generic upload validator + upload route (verified token, `form-attachments/{uid}/{formType}/` folder) + a management-only attachment-view route (signed URL). The Payroll Dispute form reuses the rep-forms foundation (`submitFormRecord`, `reviewQuery`, `markHandled`, verified-auth helpers, `ReviewList`) and the existing `FileUpload` component. The only genuinely new code is the generic upload + attachment-view routes; everything else is proven reuse.

**Tech Stack:** Next.js 16.1.1 (App Router), TypeScript 5 (strict), firebase-admin 13.6.0, Tailwind + shadcn/ui, Vitest.

## Global Constraints

- **Verified-token auth on EVERY route** (no trust-the-UID): upload + submit use `requireVerifiedUser(request)`; review GET/POST + attachment-view use `requireVerifiedManagement(request)` (from `@/lib/auth/requireVerifiedAdmin`). Client sends `Authorization: Bearer <getIdToken()>`.
- **Upload writes only under the verified caller's folder:** `form-attachments/{verifiedUid}/{formType}/file.<ext>`. `formType` constrained to an allowlist.
- **Submit scopes the screenshot path** to `buildFormAttachmentFolder(verifiedUid, 'payroll-dispute')` — reject a path that isn't the caller's own folder.
- **File validation:** allowlist `image/jpeg|png|webp|heic|heif` + `application/pdf`; max 4 MB; extension from validated MIME, never the client filename.
- **Server-only-write collection** `payrollDisputes` (`allow read, write: if false`).
- **Required fields rejected server-side** if blank; `campaign` validated against `PAYROLL_CAMPAIGNS`.
- **Campaign list exact:** `['T-Fiber','Frontier','AT&T','Verizon','Brightspeed','Centurylink/Quantum','Ripple']`.
- **Attachment view is management-only**, returns a 15-min signed URL, never a raw path.
- **Validation per task:** `npx tsc --noEmit` + `npm run build` green; `npm test` for helper tasks. Stage only each task's files.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/lib/forms/formUploads.ts` (NEW) + test | generic upload validation + folder builder | 1 |
| `src/lib/forms/formOptions.ts` (MODIFY) + test | add PAYROLL_CAMPAIGNS | 1 |
| `src/components/onboarding/FileUpload.tsx` (MODIFY) | add optional `getHeaders` async-header seam | 1b |
| `src/app/api/portal/forms/upload/route.ts` (NEW) | generic verified upload route (header auth) | 2 |
| `src/app/api/portal/forms/attachment/route.ts` (NEW) | management signed-URL view | 2 |
| `firestore.rules` (MODIFY) | deny-all payrollDisputes | 3 |
| `src/app/api/portal/forms/payroll-dispute/route.ts` (NEW) | submit API | 4 |
| `src/app/api/portal/forms/payroll-dispute/review/route.ts` (NEW) | review API | 4 |
| `src/app/portal/payroll-dispute/page.tsx` (NEW) | rep submit page + upload | 5 |
| `src/app/portal/admin/payroll-disputes/page.tsx` (NEW) | review page + view screenshot | 5 |
| `src/components/portal/PortalSidebar.tsx` (MODIFY) | nav links | 6 |

> **Auth decision (from plan review):** `FileUpload` cannot currently send an `Authorization` header (its fetch is `fetch(uploadUrl, { method:'POST', body })` with no header support). Rather than smuggle the ID token through a multipart field, Task 1b adds a clean `getHeaders?` async seam so the upload can send `Authorization: Bearer <idToken>` like every other verified route. The generic upload route uses `requireVerifiedUser(request)` (header auth) — NOT the legacy onboarding-upload `requestedBy`/`userId` field pattern.

---

## Task 1: Generic upload validator + campaign options

**Files:**
- Create: `src/lib/forms/formUploads.ts`, `src/lib/forms/formUploads.test.ts`
- Modify: `src/lib/forms/formOptions.ts`, `src/lib/forms/formOptions.test.ts`

**Interfaces:**
- Produces:
  - `FORM_ATTACHMENT_TYPES: string[]`, `MAX_FORM_FILE_BYTES: number`
  - `validateFormUpload(input: { mime: string; size: number }): { ok: true; ext: string } | { ok: false; error: string }`
  - `buildFormAttachmentFolder(uid: string, formType: string): string`
  - `PAYROLL_CAMPAIGNS: string[]` (from formOptions)

- [ ] **Step 1: Write the failing tests**

`src/lib/forms/formUploads.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateFormUpload, buildFormAttachmentFolder, MAX_FORM_FILE_BYTES } from './formUploads';

describe('validateFormUpload', () => {
  it('accepts an image and returns ext', () => {
    expect(validateFormUpload({ mime: 'image/jpeg', size: 1000 })).toEqual({ ok: true, ext: 'jpg' });
  });
  it('accepts a pdf', () => {
    expect(validateFormUpload({ mime: 'application/pdf', size: 1000 })).toEqual({ ok: true, ext: 'pdf' });
  });
  it('rejects an unsupported type', () => {
    expect(validateFormUpload({ mime: 'application/zip', size: 1000 }).ok).toBe(false);
  });
  it('rejects an oversize file', () => {
    expect(validateFormUpload({ mime: 'image/png', size: MAX_FORM_FILE_BYTES + 1 }).ok).toBe(false);
  });
  it('rejects a zero-byte file', () => {
    expect(validateFormUpload({ mime: 'image/png', size: 0 }).ok).toBe(false);
  });
});

describe('buildFormAttachmentFolder', () => {
  it('builds a per-user form folder', () => {
    expect(buildFormAttachmentFolder('abc', 'payroll-dispute')).toBe('form-attachments/abc/payroll-dispute/');
  });
});
```

Add to `src/lib/forms/formOptions.test.ts` (append inside the existing `describe('form options', ...)` or a new describe):

```typescript
import { PAYROLL_CAMPAIGNS } from './formOptions';
// ...
it('has the exact Payroll campaigns', () => {
  expect(PAYROLL_CAMPAIGNS).toEqual(['T-Fiber', 'Frontier', 'AT&T', 'Verizon', 'Brightspeed', 'Centurylink/Quantum', 'Ripple']);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/forms/formUploads.test.ts src/lib/forms/formOptions.test.ts`
Expected: FAIL — `./formUploads` missing + `PAYROLL_CAMPAIGNS` undefined.

- [ ] **Step 3: Implement `formUploads.ts`**

```typescript
// Generic form-attachment upload validation (NOT onboarding-coupled). Files for
// rep forms (e.g. Payroll Dispute screenshot) go to form-attachments/{uid}/{formType}/.
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'application/pdf': 'pdf',
};

export const FORM_ATTACHMENT_TYPES: string[] = Object.keys(EXT_BY_MIME);
export const MAX_FORM_FILE_BYTES = 4 * 1024 * 1024;

export function validateFormUpload(input: {
  mime: string;
  size: number;
}): { ok: true; ext: string } | { ok: false; error: string } {
  const ext = EXT_BY_MIME[input.mime];
  if (!ext) return { ok: false, error: 'Unsupported file type' };
  if (input.size <= 0 || input.size > MAX_FORM_FILE_BYTES) {
    return { ok: false, error: 'File must be between 1 byte and 4 MB' };
  }
  return { ok: true, ext };
}

export function buildFormAttachmentFolder(uid: string, formType: string): string {
  return `form-attachments/${uid}/${formType}/`;
}
```

- [ ] **Step 4: Add `PAYROLL_CAMPAIGNS` to `formOptions.ts`**

Append:

```typescript
export const PAYROLL_CAMPAIGNS: string[] = [
  'T-Fiber',
  'Frontier',
  'AT&T',
  'Verizon',
  'Brightspeed',
  'Centurylink/Quantum',
  'Ripple',
];
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/lib/forms/formUploads.test.ts src/lib/forms/formOptions.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify typecheck + commit**

Run: `npx tsc --noEmit` (no errors), then:

```bash
git add src/lib/forms/formUploads.ts src/lib/forms/formUploads.test.ts src/lib/forms/formOptions.ts src/lib/forms/formOptions.test.ts
git commit -m "feat: add generic form-upload validator + payroll campaign options"
```

---

## Task 1b: Add an async header seam to FileUpload

**Files:**
- Modify: `src/components/onboarding/FileUpload.tsx`

**Interfaces:**
- Produces: `FileUpload` gains an optional prop `getHeaders?: () => Promise<HeadersInit>`. When provided, the component resolves it and merges the result into its upload `fetch` headers. Backward-compatible (existing callers omit it). Used by Task 5.

- [ ] **Step 1: Add the prop**

In `src/components/onboarding/FileUpload.tsx`, add to `interface FileUploadProps` (after `extraFields?`):

```typescript
  getHeaders?: () => Promise<HeadersInit>;
```

And add `getHeaders` to the destructured props in the component signature (alongside `extraFields = {}`):

```typescript
  getHeaders,
```

- [ ] **Step 2: Use it in the upload fetch**

Replace the existing fetch block (currently `const response = await fetch(uploadUrl, { method: 'POST', body });`) with:

```typescript
      const headers = getHeaders ? await getHeaders() : undefined;
      const response = await fetch(uploadUrl, { method: 'POST', headers, body });
```

(Do NOT set a `Content-Type` header — the browser sets the multipart boundary automatically when `body` is FormData. `getHeaders` only adds things like `Authorization`.)

- [ ] **Step 3: Verify typecheck (existing callers still compile)**

Run: `npx tsc --noEmit`
Expected: no errors (all existing FileUpload usages omit `getHeaders`).

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/FileUpload.tsx
git commit -m "feat: add optional async getHeaders seam to FileUpload"
```

---

## Task 2: Generic upload + attachment-view routes

**Files:**
- Create: `src/app/api/portal/forms/upload/route.ts`, `src/app/api/portal/forms/attachment/route.ts`

**Interfaces:**
- Consumes: `validateFormUpload`, `buildFormAttachmentFolder` (Task 1); `requireVerifiedUser`, `requireVerifiedManagement` (`@/lib/auth/requireVerifiedAdmin`); `getOnboardingBucket` (`@/lib/firebase/admin`).
- Produces: `POST /api/portal/forms/upload` → `{ path }`; `GET /api/portal/forms/attachment?path=` → `{ url }`.

- [ ] **Step 1: Upload route `forms/upload/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getOnboardingBucket } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { validateFormUpload, buildFormAttachmentFolder } from '@/lib/forms/formUploads';

// Allowlisted form types that may receive attachments.
const ALLOWED_FORM_TYPES = ['payroll-dispute'];

// POST /api/portal/forms/upload - verified user uploads a form attachment.
// Writes ONLY under the verified caller's own folder. Returns the folder path.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const form = await request.formData();
    const formType = String(form.get('formType') ?? '');
    const file = form.get('file');

    if (!ALLOWED_FORM_TYPES.includes(formType) || !(file instanceof File)) {
      return NextResponse.json({ error: 'Missing or invalid formType/file' }, { status: 400 });
    }

    const check = validateFormUpload({ mime: file.type, size: file.size });
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const folder = buildFormAttachmentFolder(gate.uid, formType);
    const objectPath = `${folder}file.${check.ext}`;

    const bucket = getOnboardingBucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    await bucket.file(objectPath).save(buffer, { contentType: file.type, resumable: false });

    return NextResponse.json({ path: folder });
  } catch (error) {
    console.error('Error uploading form attachment:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Attachment-view route `forms/attachment/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getOnboardingBucket } from '@/lib/firebase/admin';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

// GET /api/portal/forms/attachment?path=form-attachments/... - management only.
// Mints a 15-min signed URL for the first file under the folder. Never exposes
// the raw path back as a usable storage URL.
export async function GET(request: NextRequest) {
  try {
    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const path = request.nextUrl.searchParams.get('path') ?? '';
    if (!path.startsWith('form-attachments/')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const bucket = getOnboardingBucket();
    const prefix = path.endsWith('/') ? path : `${path}/`;
    const [files] = await bucket.getFiles({ prefix });
    if (files.length === 0) return NextResponse.json({ url: null });

    const [url] = await files[0].getSignedUrl({
      action: 'read',
      expires: Date.now() + SIGNED_URL_TTL_MS,
    });
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Error signing form attachment:', error);
    return NextResponse.json({ error: 'Failed to load attachment' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit` (no errors); `npm run build` (succeeds; both routes listed).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/portal/forms/upload/route.ts src/app/api/portal/forms/attachment/route.ts
git commit -m "feat: add generic verified form-upload + management attachment-view routes"
```

---

## Task 3: Firestore rules for payrollDisputes

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add the rule**

In `firestore.rules`, after the `expediteOrders` match block, add:

```
    match /payrollDisputes/{id} {
      allow read, write: if false;
    }
```

- [ ] **Step 2: Verify build + commit**

Run: `npm run build` (succeeds). Then:

```bash
git add firestore.rules
git commit -m "feat: deny-all firestore rules for payrollDisputes"
```

> Controller note: deploy rules after merge — `npx -y firebase-tools deploy --only firestore:rules --project cworldgroup-cca68`.

---

## Task 4: Payroll Dispute submit + review APIs

**Files:**
- Create: `src/app/api/portal/forms/payroll-dispute/route.ts`, `src/app/api/portal/forms/payroll-dispute/review/route.ts`

**Interfaces:**
- Consumes: `requireVerifiedUser` (`@/lib/auth/requireVerifiedAdmin`); `submitFormRecord` (`@/lib/forms/submitForm`); `reviewQuery`, `markHandled` (`@/lib/forms/reviewQuery`); `PAYROLL_CAMPAIGNS`, `isValidOption` (`@/lib/forms/formOptions`); `buildFormAttachmentFolder` (`@/lib/forms/formUploads`).

> Note `submitFormRecord` signature (from the rep-forms foundation): `submitFormRecord(collection: string, rep: { uid: string; name: string; email: string }, fields: Record<string, unknown>): Promise<{ id: string }>`.

- [ ] **Step 1: Submit route `payroll-dispute/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { PAYROLL_CAMPAIGNS, isValidOption } from '@/lib/forms/formOptions';
import { buildFormAttachmentFolder } from '@/lib/forms/formUploads';

function s(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// POST /api/portal/forms/payroll-dispute - verified user submits a payroll dispute.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = await request.json();
    const contractorName = s(body.contractorName, 180);
    const contractorEmail = s(body.contractorEmail, 180);
    const campaign = s(body.campaign, 40);
    const typeOfOrder = s(body.typeOfOrder, 120);
    const dateOfInstall = s(body.dateOfInstall, 40);

    if (!contractorName || !contractorEmail || !typeOfOrder || !dateOfInstall) {
      return NextResponse.json({ error: 'Please complete all required fields' }, { status: 400 });
    }
    if (!isValidOption(PAYROLL_CAMPAIGNS, campaign)) {
      return NextResponse.json({ error: 'Select a valid campaign' }, { status: 400 });
    }

    // The screenshot path, if present, must be THIS caller's own folder.
    const screenshot = s(body.orderScreenshotPath, 300);
    const expected = buildFormAttachmentFolder(gate.uid, 'payroll-dispute');
    const orderScreenshotPath = screenshot === expected ? screenshot : '';

    const { id } = await submitFormRecord(
      'payrollDisputes',
      { uid: gate.uid, name: gate.name, email: gate.email },
      { contractorName, contractorEmail, campaign, typeOfOrder, dateOfInstall, orderScreenshotPath }
    );
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error submitting payroll dispute:', error);
    return NextResponse.json({ error: 'Failed to submit payroll dispute' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Review route `payroll-dispute/review/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { reviewQuery, markHandled } from '@/lib/forms/reviewQuery';

const COLLECTION = 'payrollDisputes';

export async function GET(request: NextRequest) {
  const result = await reviewQuery(COLLECTION, request);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ submissions: result.submissions });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id : '';
    const result = await markHandled(COLLECTION, request, id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating payroll dispute:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit` (no errors); `npm run build` (succeeds; both routes listed).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/portal/forms/payroll-dispute/route.ts src/app/api/portal/forms/payroll-dispute/review/route.ts
git commit -m "feat: add Payroll Dispute submit + review APIs"
```

---

## Task 5: Payroll Dispute pages (rep submit + admin review)

**Files:**
- Create: `src/app/portal/payroll-dispute/page.tsx`, `src/app/portal/admin/payroll-disputes/page.tsx`

**Interfaces:**
- Consumes: Task 4 APIs; the upload route (Task 2); `PAYROLL_CAMPAIGNS` (Task 1); `FORM_ATTACHMENT_TYPES` (Task 1); `FileUpload` (`@/components/onboarding/FileUpload`); `ReviewList` (`@/components/forms/ReviewList`); `auth` (`@/lib/firebase/config`); `useAuth`.

- [ ] **Step 1: Rep submit page `portal/payroll-dispute/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import FileUpload from '@/components/onboarding/FileUpload';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { PAYROLL_CAMPAIGNS } from '@/lib/forms/formOptions';
import { FORM_ATTACHMENT_TYPES } from '@/lib/forms/formUploads';

const EMPTY = {
  contractorName: '', contractorEmail: '', campaign: '',
  typeOfOrder: '', dateOfInstall: '', orderScreenshotPath: '',
};

export default function PayrollDisputePage() {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/portal/forms/payroll-dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit');
      setDone(true);
      setForm(EMPTY);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-2xl space-y-5">
              <h1 className="text-2xl font-semibold text-slate-950">Payroll Dispute</h1>
              <p className="text-sm text-slate-600">Submitting as {user?.displayName || user?.email}.</p>
              {done && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  Dispute submitted.
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}
              <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><Label>Contractor Name</Label><Input value={form.contractorName} onChange={(e) => setForm((p) => ({ ...p, contractorName: e.target.value }))} required /></div>
                <div><Label>Contractor Email</Label><Input value={form.contractorEmail} onChange={(e) => setForm((p) => ({ ...p, contractorEmail: e.target.value }))} required /></div>
                <div>
                  <Label>Campaign</Label>
                  <NativeSelect value={form.campaign} onChange={(e) => setForm((p) => ({ ...p, campaign: e.target.value }))} className="w-full" required>
                    <NativeSelectOption value="">Select campaign</NativeSelectOption>
                    {PAYROLL_CAMPAIGNS.map((c) => (
                      <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div><Label>Type of Order</Label><Input value={form.typeOfOrder} onChange={(e) => setForm((p) => ({ ...p, typeOfOrder: e.target.value }))} required /></div>
                <div><Label>Date of Install</Label><Input value={form.dateOfInstall} onChange={(e) => setForm((p) => ({ ...p, dateOfInstall: e.target.value }))} placeholder="MM/DD/YYYY" required /></div>
                <div className="sm:col-span-2">
                  <Label>Screenshot of Order</Label>
                  <FileUpload
                    itemId="payroll-dispute"
                    accept="image/*,application/pdf"
                    allowedTypes={FORM_ATTACHMENT_TYPES}
                    uploadUrl="/api/portal/forms/upload"
                    extraFields={{ formType: 'payroll-dispute' }}
                    getHeaders={async () => {
                      const t = await auth?.currentUser?.getIdToken();
                      return t ? { Authorization: `Bearer ${t}` } : {};
                    }}
                    onUploaded={(path) => setForm((p) => ({ ...p, orderScreenshotPath: path }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={saving} className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
                    {saving ? 'Submitting…' : 'Submit Dispute'}
                  </Button>
                </div>
              </form>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
```

> Note: `FileUpload` posts `multipart/form-data` with `itemId`, `file`, and `extraFields`. The generic upload route (Task 2) reads `formType` (from extraFields) + `file`; it ignores `itemId` (we pass `itemId="payroll-dispute"` only because the prop is required). Auth is the real `Authorization: Bearer` header supplied via the Task 1b `getHeaders` seam — no token in the form body, no special helper. The submit form's own POST (above) sends the header directly.

- [ ] **Step 2: Review page `portal/admin/payroll-disputes/page.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import ReviewList from '@/components/forms/ReviewList';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';

interface Row { id: string; status: string; orderScreenshotPath?: string; [key: string]: unknown }

const COLUMNS = [
  { key: 'repName', label: 'Submitted by' },
  { key: 'contractorName', label: 'Contractor' },
  { key: 'contractorEmail', label: 'Email' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'typeOfOrder', label: 'Order Type' },
  { key: 'dateOfInstall', label: 'Install Date' },
  { key: 'createdAt', label: 'Submitted' },
];

export default function PayrollDisputesReviewPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = await auth?.currentUser?.getIdToken();
    return fetch(url, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token ?? ''}` } });
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/portal/forms/payroll-dispute/review');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows(json.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [user, authedFetch]);

  useEffect(() => { load(); }, [load]);

  const markHandled = async (id: string) => {
    const res = await authedFetch('/api/portal/forms/payroll-dispute/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)));
  };

  const viewScreenshot = async (path: string) => {
    const res = await authedFetch(`/api/portal/forms/attachment?path=${encodeURIComponent(path)}`);
    const json = await res.json();
    if (json.url) window.open(json.url, '_blank', 'noopener,noreferrer');
  };

  // Decorate rows with a screenshot action via an extra column rendered by ReviewList?
  // ReviewList only renders text columns + Mark handled. To add "View screenshot",
  // pass a synthetic column whose value is a clickable hint, and render the button
  // by wrapping: simplest is to add a 'screenshot' column showing 'View' and handle
  // the click below the list. Implement a thin wrapper instead:

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="space-y-4">
        <ReviewList
          title="Payroll Disputes"
          columns={COLUMNS}
          rows={rows}
          onMarkHandled={markHandled}
          loading={loading}
          error={error}
        />
        {rows.some((r) => r.orderScreenshotPath) && (
          <div className="mx-auto max-w-[1500px] space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Screenshots</p>
            {rows.filter((r) => r.orderScreenshotPath).map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-sm">
                <span className="text-slate-700">{String(r.contractorName ?? r.id)}</span>
                <Button type="button" variant="outline" onClick={() => viewScreenshot(r.orderScreenshotPath as string)}>
                  View screenshot
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
```

> The screenshot viewing is rendered as a small section below the list (ReviewList stays generic — no need to change it). Implementer may instead extend ReviewList with an optional action-render prop; either is acceptable, but the above keeps ReviewList unchanged.

- [ ] **Step 3: Verify typecheck + lint + build**

Run: `npx tsc --noEmit` (no errors); `npx eslint src/app/portal/payroll-dispute/page.tsx src/app/portal/admin/payroll-disputes/page.tsx` (clean); `npm run build` (succeeds).

- [ ] **Step 4: Commit**

```bash
git add src/app/portal/payroll-dispute/page.tsx src/app/portal/admin/payroll-disputes/page.tsx
git commit -m "feat: add Payroll Dispute rep page + admin review with screenshot viewing"
```

---

## Task 6: Navigation links

**Files:**
- Modify: `src/components/portal/PortalSidebar.tsx`

- [ ] **Step 1: Add rep link to `navigationItems`** (after 'Expedite Order'):

```tsx
  {
    name: 'Payroll Dispute',
    href: '/portal/payroll-dispute',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
```

- [ ] **Step 2: Add admin link to `operationsItems`** (after 'Expedite Orders'), `roles: ['admin','operations']`:

```tsx
  {
    name: 'Payroll Disputes',
    href: '/portal/admin/payroll-disputes',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m-6 4h6m-6 4h4m-9 4h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    roles: ['admin', 'operations'],
  },
```

- [ ] **Step 3: Verify typecheck + lint + build + commit**

Run: `npx tsc --noEmit` (no errors); `npx eslint src/components/portal/PortalSidebar.tsx` (clean); `npm run build` (succeeds). Then:

```bash
git add src/components/portal/PortalSidebar.tsx
git commit -m "feat: add sidebar nav for Payroll Dispute + admin review"
```

---

## Final Verification (per spec §7)

- [ ] `npx tsc --noEmit` + `npm run build` green; `npm test` green (formUploads + formOptions).
- [ ] Log in; on Payroll Dispute, upload a screenshot (lands in form-attachments/{uid}/payroll-dispute/) and submit; confirm it saves.
- [ ] As admin/operations, open Payroll Disputes; confirm the dispute appears, "View screenshot" opens the signed URL, and "Mark handled" works.
- [ ] Confirm the submitted screenshot path is rejected if it isn't the caller's own folder.
- [ ] Confirm a non-management user gets 403 from the review + attachment routes.
- [ ] Confirm blank required fields + an invalid campaign are rejected server-side.

## Out of Scope (queued)

Leads Request (3 uploads + conditional fields) on this proven base; multi-file-per-field; the 2 parity forms; email notifications.
