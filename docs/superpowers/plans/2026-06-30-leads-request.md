# 3C Leads Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Formstack "3C Leads Request" as a native portal form (rep submit page + admin review page) with 3 conditional file uploads, on the existing rep-forms foundation.

**Architecture:** Thin form on top of the reusable foundation. Options + conditional predicates live in small pure modules (unit-tested). The generic upload route gains an optional `slot` so one form can hold 3 independent attachments. Firestore collection `leadsRequests` is server-only-write, read via a verified-management API.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, firebase-admin, Tailwind v4, shadcn/ui, Vitest.

## Global Constraints
- All option strings VERBATIM from the spec (preserve the source-form misspellings; do not "fix" them).
- Rep submit routes: `requireVerifiedUser`. Management read/mark: `requireVerifiedManagement`. Never trust a client-supplied UID.
- Upload writes go ONLY under the verified caller's own folder. Any client-supplied storage path is accepted only if it exactly equals the caller's expected folder for that formType+slot; otherwise stored as empty string.
- Conditional field values are dropped to `''` server-side when their trigger predicate is false.
- New Firestore collection `leadsRequests`: `allow read, write: if false` (server-only via Admin SDK).
- Max upload 4 MB; allowed MIME per existing `FORM_ATTACHMENT_TYPES`.
- Follow existing file/naming/style conventions exactly (see referenced pattern files).

---

### Task 1: Options + conditional predicates (pure, tested)

**Files:**
- Modify: `src/lib/forms/formOptions.ts`
- Create: `src/lib/forms/leadsPredicates.ts`
- Test: `src/lib/forms/formOptions.test.ts` (extend), `src/lib/forms/leadsPredicates.test.ts` (new)

**Interfaces:**
- Produces: `LEADS_CAMPAIGNS`, `LEADS_MANAGERS`, `LEADS_LOCATIONS`, `LEADS_CATEGORIES`, `LEADS_REASONS` (all `string[]`); `leadsConditions(input: { category: string; reason: string; location: string }): LeadsConditions` where `LeadsConditions = { needsHostile: boolean; needsBlindKnock: boolean; needsLasso: boolean; needsNewRep: boolean; needsLeadPackCode: boolean; needsSpecialRequest: boolean }`.

- [ ] **Step 1: Extend formOptions.test.ts** — add a describe block asserting each new list equals the verbatim array (copy exact strings from the spec's Fields section). Include all 12 locations, 5 categories, 4 reasons, 3 campaigns, 3 managers.

- [ ] **Step 2: Run tests, verify the new assertions FAIL** (`npx vitest run src/lib/forms/formOptions.test.ts`) — fail because the lists don't exist yet.

- [ ] **Step 3: Add the lists to formOptions.ts** — append these exports (strings VERBATIM from spec):

```ts
export const LEADS_CAMPAIGNS: string[] = ['T-Fiber', 'Verizon', 'AT&T'];

export const LEADS_MANAGERS: string[] = ['Jordan Zuber', 'Will Teasdale', 'Jeremy McFarland'];

export const LEADS_LOCATIONS: string[] = [
  'Des Moines IA', 'St Joeseph MO', 'Iowa City IA', 'Davenport/Moline IA',
  'Rochester MN', 'Geneva IL', 'Grand Rapids MI', 'Lansing MI',
  'Colorado Springs CO', 'Westminster CO', 'Aurora CO',
  'What ever you feel as the best potential to make sales', 'Special Request',
];

export const LEADS_CATEGORIES: string[] = [
  'New Rep that needs leads and Salesrabbit Logins',
  'Returning pack',
  'Assign new leads and Returning Pack',
  'Road trip ending Returning Pack',
  'Another Rep Blind Knocking territory Assigned to 3C Rep',
];

export const LEADS_REASONS: string[] = [
  'New rep neads logins and leads assigned',
  'Terrtory has been worked and knocked multiple times with 2-3 knock dispositions',
  'Hostile situation happened a the territory, requesting switch',
  'another rep was caught knocking in our reps territory',
];
```

- [ ] **Step 4: Run tests, verify PASS** (`npx vitest run src/lib/forms/formOptions.test.ts`).

- [ ] **Step 5: Write leadsPredicates.test.ts** — table-driven. Reference the exact strings via the constants. Assert:
  - reason `'Hostile situation happened a the territory, requesting switch'` → `needsHostile === true`.
  - reason `'another rep was caught knocking in our reps territory'` → `needsBlindKnock === true`; also category `'Another Rep Blind Knocking territory Assigned to 3C Rep'` → `needsBlindKnock === true`.
  - reason `'Terrtory has been worked and knocked multiple times with 2-3 knock dispositions'` → `needsLasso === true`.
  - reason `'New rep neads logins and leads assigned'` → `needsNewRep === true`; also category `'New Rep that needs leads and Salesrabbit Logins'` → `needsNewRep === true`.
  - each of `'Returning pack'`, `'Assign new leads and Returning Pack'`, `'Road trip ending Returning Pack'` → `needsLeadPackCode === true`.
  - location `'Special Request'` → `needsSpecialRequest === true`.
  - empty input `{category:'',reason:'',location:''}` → all six false.

- [ ] **Step 6: Run it, verify FAIL** (module missing).

- [ ] **Step 7: Implement leadsPredicates.ts**:

```ts
import { LEADS_CATEGORIES, LEADS_REASONS } from './formOptions';

export interface LeadsConditions {
  needsHostile: boolean;
  needsBlindKnock: boolean;
  needsLasso: boolean;
  needsNewRep: boolean;
  needsLeadPackCode: boolean;
  needsSpecialRequest: boolean;
}

// Single source of truth for which conditional fields apply, shared by the rep
// page (to show/hide) and the API route (to drop untriggered values). Matches on
// the verbatim option strings so the two sides can never drift.
export function leadsConditions(input: {
  category: string;
  reason: string;
  location: string;
}): LeadsConditions {
  const { category, reason, location } = input;
  const needsHostile = reason === LEADS_REASONS[2];
  const needsBlindKnock = reason === LEADS_REASONS[3] || category === LEADS_CATEGORIES[4];
  const needsLasso = reason === LEADS_REASONS[1];
  const needsNewRep = reason === LEADS_REASONS[0] || category === LEADS_CATEGORIES[0];
  const needsLeadPackCode =
    category === LEADS_CATEGORIES[1] ||
    category === LEADS_CATEGORIES[2] ||
    category === LEADS_CATEGORIES[3];
  const needsSpecialRequest = location === 'Special Request';
  return { needsHostile, needsBlindKnock, needsLasso, needsNewRep, needsLeadPackCode, needsSpecialRequest };
}
```

- [ ] **Step 8: Run both test files, verify PASS** (`npx vitest run src/lib/forms/formOptions.test.ts src/lib/forms/leadsPredicates.test.ts`).

- [ ] **Step 9: Commit** — `git add src/lib/forms/formOptions.ts src/lib/forms/leadsPredicates.ts src/lib/forms/*.test.ts && git commit -m "feat: leads-request options + conditional predicates"`

---

### Task 2: Multi-slot upload foundation

**Files:**
- Modify: `src/lib/forms/formUploads.ts`
- Modify: `src/app/api/portal/forms/upload/route.ts`
- Test: `src/lib/forms/formUploads.test.ts` (extend)

**Interfaces:**
- Consumes: existing `validateFormUpload`, `EXT_BY_MIME`, `MAX_FORM_FILE_BYTES`.
- Produces: `buildFormAttachmentFolder(uid, formType, slot?)` (optional 3rd arg); `FORM_UPLOAD_SLOTS: Record<string, string[]>` mapping formType → allowed slots; `isAllowedFormUpload(formType: string, slot: string): boolean`.

- [ ] **Step 1: Extend formUploads.test.ts** — assert:
  - `buildFormAttachmentFolder('u1','payroll-dispute')` === `'form-attachments/u1/payroll-dispute/'` (unchanged).
  - `buildFormAttachmentFolder('u1','leads-request','hostile')` === `'form-attachments/u1/leads-request/hostile/'`.
  - `isAllowedFormUpload('payroll-dispute','')` === true; `isAllowedFormUpload('payroll-dispute','hostile')` === false.
  - `isAllowedFormUpload('leads-request','hostile')` / `'blind-knock'` / `'lasso'` === true; `isAllowedFormUpload('leads-request','bogus')` === false; `isAllowedFormUpload('leads-request','')` === false.
  - `isAllowedFormUpload('unknown-form','')` === false.

- [ ] **Step 2: Run it, verify FAIL.**

- [ ] **Step 3: Update formUploads.ts** — change the folder builder to accept an optional slot, and add the slot allowlist:

```ts
export function buildFormAttachmentFolder(uid: string, formType: string, slot?: string): string {
  const base = `form-attachments/${uid}/${formType}/`;
  return slot ? `${base}${slot}/` : base;
}

// Which slots each form's uploads may use. Empty string = the single-file forms
// (Payroll Dispute) that write straight into the formType folder. Leads Request
// uses three named slots so its attachments never collide.
export const FORM_UPLOAD_SLOTS: Record<string, string[]> = {
  'payroll-dispute': [''],
  'leads-request': ['hostile', 'blind-knock', 'lasso'],
};

export function isAllowedFormUpload(formType: string, slot: string): boolean {
  const slots = FORM_UPLOAD_SLOTS[formType];
  return Array.isArray(slots) && slots.includes(slot);
}
```

- [ ] **Step 4: Run tests, verify PASS.**

- [ ] **Step 5: Update the upload route** to read + validate `slot` and scope the folder. Replace the allowlist/validate/folder section of `src/app/api/portal/forms/upload/route.ts` so it reads:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getOnboardingBucket } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import {
  validateFormUpload,
  buildFormAttachmentFolder,
  isAllowedFormUpload,
} from '@/lib/forms/formUploads';

// POST /api/portal/forms/upload - verified user uploads a form attachment.
// Writes ONLY under the verified caller's own folder. Returns the folder path.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const form = await request.formData();
    const formType = String(form.get('formType') ?? '');
    const slot = String(form.get('slot') ?? '');
    const file = form.get('file');

    if (!isAllowedFormUpload(formType, slot) || !(file instanceof File)) {
      return NextResponse.json({ error: 'Missing or invalid formType/slot/file' }, { status: 400 });
    }

    const check = validateFormUpload({ mime: file.type, size: file.size });
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const folder = buildFormAttachmentFolder(gate.uid, formType, slot || undefined);
    const objectPath = `${folder}file.${check.ext}`;

    const bucket = getOnboardingBucket();
    // Clear any prior attachment in this slot folder first, so a replacement with a
    // different extension can't leave a stale object the viewer might sign instead.
    await bucket.deleteFiles({ prefix: folder, force: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await bucket.file(objectPath).save(buffer, { contentType: file.type, resumable: false });

    return NextResponse.json({ path: folder });
  } catch (error) {
    console.error('Error uploading form attachment:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
```

Note: for `payroll-dispute`, `slot` is `''` → `buildFormAttachmentFolder(uid,'payroll-dispute',undefined)` → the SAME path as before. The Payroll page sends no `slot`, so `form.get('slot')` is `''` and `isAllowedFormUpload('payroll-dispute','')` is true. Fully backward-compatible.

- [ ] **Step 6: Typecheck** — `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 7: Run the whole suite** — `npx vitest run`. Expected: all pass.

- [ ] **Step 8: Commit** — `git add src/lib/forms/formUploads.ts src/lib/forms/formUploads.test.ts src/app/api/portal/forms/upload/route.ts && git commit -m "feat: optional upload slot so one form can hold multiple attachments"`

---

### Task 3: Submit + review API routes

**Files:**
- Create: `src/app/api/portal/forms/leads-request/route.ts`
- Create: `src/app/api/portal/forms/leads-request/review/route.ts`
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: `requireVerifiedUser`, `submitFormRecord`, `reviewQuery`, `markHandled`, `isValidOption`, the Task 1 lists + `leadsConditions`, `buildFormAttachmentFolder`.
- Produces: `POST /api/portal/forms/leads-request` (`{success,id}`); `GET`+`POST /api/portal/forms/leads-request/review`.

- [ ] **Step 1: Add the Firestore rule** — in `firestore.rules`, immediately after the `payrollDisputes` match block, add:

```
    match /leadsRequests/{id} {
      allow read, write: if false;
    }
```

- [ ] **Step 2: Create the submit route** `src/app/api/portal/forms/leads-request/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { buildFormAttachmentFolder } from '@/lib/forms/formUploads';
import { leadsConditions } from '@/lib/forms/leadsPredicates';
import {
  LEADS_CAMPAIGNS,
  LEADS_MANAGERS,
  LEADS_LOCATIONS,
  LEADS_CATEGORIES,
  LEADS_REASONS,
  isValidOption,
} from '@/lib/forms/formOptions';

function s(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// Accept an uploaded path only if it exactly matches THIS caller's own folder for
// the given slot; otherwise store empty (prevents cross-user/path injection).
function scopedPath(raw: unknown, uid: string, slot: string): string {
  const path = s(raw, 300);
  return path === buildFormAttachmentFolder(uid, 'leads-request', slot) ? path : '';
}

// POST /api/portal/forms/leads-request - a verified rep/manager requests leads.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = await request.json();
    const campaign = s(body.campaign, 40);
    const managerName = s(body.managerName, 120);
    const managerEmail = s(body.managerEmail, 180);
    const repFirstName = s(body.repFirstName, 120);
    const repLastName = s(body.repLastName, 120);
    const location = s(body.location, 120);
    const category = s(body.category, 120);
    const reason = s(body.reason, 160);

    // Required core fields.
    if (!managerEmail || !repFirstName || !repLastName) {
      return NextResponse.json({ error: 'Please complete all required fields' }, { status: 400 });
    }
    if (!isValidOption(LEADS_CAMPAIGNS, campaign)) {
      return NextResponse.json({ error: 'Select a valid campaign' }, { status: 400 });
    }
    if (!isValidOption(LEADS_MANAGERS, managerName)) {
      return NextResponse.json({ error: 'Select a valid manager' }, { status: 400 });
    }
    if (!isValidOption(LEADS_LOCATIONS, location)) {
      return NextResponse.json({ error: 'Select a valid location' }, { status: 400 });
    }
    // Category + reason are optional, but if provided must be valid options.
    if (category && !isValidOption(LEADS_CATEGORIES, category)) {
      return NextResponse.json({ error: 'Select a valid category' }, { status: 400 });
    }
    if (reason && !isValidOption(LEADS_REASONS, reason)) {
      return NextResponse.json({ error: 'Select a valid reason' }, { status: 400 });
    }

    // Re-derive which conditional fields apply; drop anything not triggered.
    const cond = leadsConditions({ category, reason, location });
    const specialRequest = cond.needsSpecialRequest ? s(body.specialRequest, 2000) : '';
    const leadPackCode = cond.needsLeadPackCode ? s(body.leadPackCode, 60) : '';
    const situationDescription =
      cond.needsHostile || cond.needsBlindKnock ? s(body.situationDescription, 2000) : '';
    const newRepPhone = cond.needsNewRep ? s(body.newRepPhone, 40) : '';
    const newRepEmail = cond.needsNewRep ? s(body.newRepEmail, 180) : '';
    const hostileUploadPath = cond.needsHostile ? scopedPath(body.hostileUploadPath, gate.uid, 'hostile') : '';
    const blindKnockUploadPath = cond.needsBlindKnock ? scopedPath(body.blindKnockUploadPath, gate.uid, 'blind-knock') : '';
    const lassoUploadPath = cond.needsLasso ? scopedPath(body.lassoUploadPath, gate.uid, 'lasso') : '';

    const { id } = await submitFormRecord(
      'leadsRequests',
      { uid: gate.uid, name: gate.name, email: gate.email },
      {
        campaign, managerName, managerEmail, repFirstName, repLastName, location,
        category, reason, specialRequest, leadPackCode, situationDescription,
        hostileUploadPath, blindKnockUploadPath, lassoUploadPath, newRepPhone, newRepEmail,
      }
    );
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error submitting leads request:', error);
    return NextResponse.json({ error: 'Failed to submit leads request' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create the review route** `src/app/api/portal/forms/leads-request/review/route.ts` (identical shape to the expedite review route, collection `leadsRequests`):

```ts
import { NextRequest, NextResponse } from 'next/server';
import { reviewQuery, markHandled } from '@/lib/forms/reviewQuery';

const COLLECTION = 'leadsRequests';

// GET - verified-management list of leads requests.
export async function GET(request: NextRequest) {
  const result = await reviewQuery(COLLECTION, request);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ submissions: result.submissions });
}

// POST - mark a submission handled (verified management, new -> handled, atomic).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id : '';
    const result = await markHandled(COLLECTION, request, id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating leads request:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 5: Commit** — `git add firestore.rules src/app/api/portal/forms/leads-request && git commit -m "feat: leads-request submit + review API routes and firestore rule"`

---

### Task 4: Rep submit page (conditional UI)

**Files:**
- Create: `src/app/portal/leads-request/page.tsx`

**Interfaces:**
- Consumes: `leadsConditions`, the Task 1 lists, `FORM_ATTACHMENT_TYPES`, `FileUpload`, `NativeSelect`, `auth`. Posts to `/api/portal/forms/leads-request`; uploads to `/api/portal/forms/upload` with `extraFields={{ formType:'leads-request', slot }}`.

- [ ] **Step 1: Create the page.** Model it on `src/app/portal/payroll-dispute/page.tsx` (same shell: `ProtectedRoute`, `PortalHeader`, `PortalSidebar`, `max-w-2xl`, green submit button, token-authed fetch). Differences:
  - State object holds all fields listed in the spec's data model.
  - Compute `const cond = leadsConditions({ category: form.category, reason: form.reason, location: form.location });` each render.
  - Always render: Campaign (`LEADS_CAMPAIGNS`), Manager Name (`LEADS_MANAGERS`), Manager Email, Rep First/Last, Location (`LEADS_LOCATIONS`), Category (`LEADS_CATEGORIES`, with a leading blank "Select…" option since optional), Reason (`LEADS_REASONS`, blank option).
  - Conditionally render (guarded by the matching `cond.*`): Special Request Explanation (textarea, `needsSpecialRequest`); Lead Pack Code (`needsLeadPackCode`); Situation Description (textarea, `needsHostile || needsBlindKnock`); three `FileUpload`s — hostile (`needsHostile`, slot `hostile`, onUploaded sets `hostileUploadPath`), blind-knock (`needsBlindKnock`, slot `blind-knock`, sets `blindKnockUploadPath`), lasso (`needsLasso`, slot `lasso`, sets `lassoUploadPath`); New-rep Phone + Email (`needsNewRep`).
  - Each `FileUpload` uses the same `getHeaders` token seam as Payroll and `extraFields={{ formType: 'leads-request', slot: '<slot>' }}`, `accept="image/*,application/pdf"`, `allowedTypes={FORM_ATTACHMENT_TYPES}`, unique `itemId` per slot.
  - Textareas: use the shadcn `Textarea` from `@/components/ui/textarea` if it exists; else a plain `<textarea>` with the same classes as `Input`. (Check with a quick read before writing.)
  - On successful submit, reset to the empty state and show the green "Request submitted." banner.

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 3: Commit** — `git add src/app/portal/leads-request/page.tsx && git commit -m "feat: leads-request rep submit page with conditional fields"`

---

### Task 5: Admin review page + nav

**Files:**
- Create: `src/app/portal/admin/leads-requests/page.tsx`
- Modify: `src/components/portal/PortalSidebar.tsx`

**Interfaces:**
- Consumes: `ReviewList`, `auth`, the review route, the attachment route.

- [ ] **Step 1: Create the admin page.** Model it on `src/app/portal/admin/payroll-disputes/page.tsx`:
  - `ProtectedRoute roles={['admin','operations']}`.
  - `COLUMNS`: Submitted by (`repName`), Campaign, Manager (`managerName`), Rep (`repFirstName`), Location, Category, Reason, Submitted (`createdAt`).
  - `authedFetch`, `load` from `/api/portal/forms/leads-request/review`, `markHandled` POST to same, optimistic row update.
  - Attachments block below the list: for each row, render up to three "View …" buttons — "View hostile", "View blind-knock", "View lasso" — one per non-empty path (`hostileUploadPath` / `blindKnockUploadPath` / `lassoUploadPath`), each calling the same `viewAttachment(path)` that GETs `/api/portal/forms/attachment?path=...` and `window.open`s the signed URL. Only show a row in the block if it has at least one path.

- [ ] **Step 2: Add nav entries** to `src/components/portal/PortalSidebar.tsx`:
  - In `navigationItems` (rep), add a "Leads Request" item with `href: '/portal/leads-request'` (reuse an existing inline SVG icon, e.g. the users/pipeline icon).
  - In `operationsItems`, add "Leads Requests" with `href: '/portal/admin/leads-requests'`, `roles: ['admin', 'operations']`.

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 4: Build** — `npm run build`. Expected: green; new routes `/portal/leads-request`, `/portal/admin/leads-requests`, `/api/portal/forms/leads-request`, `/api/portal/forms/leads-request/review` all registered.

- [ ] **Step 5: Full suite** — `npx vitest run`. Expected: all pass.

- [ ] **Step 6: Commit** — `git add src/app/portal/admin/leads-requests/page.tsx src/components/portal/PortalSidebar.tsx && git commit -m "feat: leads-request admin review page + nav"`

---

## Self-Review Notes
- Spec coverage: Task 1 (options+predicates), Task 2 (multi-slot uploads), Task 3 (routes+rule), Task 4 (rep page), Task 5 (admin+nav) cover every spec section.
- Backward-compat: Payroll upload path unchanged (slot `''` → same folder). Verified by the Task 2 test asserting the no-slot path string is identical.
- Security: verified-token auth on all routes; per-slot caller-scoped path validation; conditional values dropped server-side; new collection is server-only-write.
