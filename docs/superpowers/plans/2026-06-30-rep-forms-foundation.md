# Rep Forms Foundation + 2 Simple Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable rep-forms foundation (server submit helper + review-query helper + review-list UI) and the first 2 no-upload Formstack forms — New Fiber Report and Expedite Internet Order — each with a logged-in rep submit page and a management review list.

**Architecture:** Each form = a Firestore collection (server-only write) + a rep submit page (logged in, identity auto-filled) + a submit API (gated, stamps the rep server-side) + a review API (management-gated) + an admin review page. Two shared helpers (`submitFormRecord`, `reviewQuery`) and one shared component (`ReviewList`) keep the forms thin and consistent. Modeled on the existing onboarding review queue, NOT the under-gated sales routes.

**Tech Stack:** Next.js 16.1.1 (App Router), React 19.2.3, TypeScript 5 (strict), firebase-admin 13.6.0, Tailwind v4 + shadcn/ui, Vitest.

## Global Constraints

- **Server-only-write collections:** `fiberReports`, `expediteOrders` get `allow read, write: if false` in firestore.rules. All reads/writes go through Admin SDK routes.
- **Every API route is server-gated.** Submit routes: `requireSelfOrManagement(requestedBy, requestedBy)` (rep submits as self). Review GET + mark-handled POST: `requireManagement(requestedBy)` (admin/operations only). UI `ProtectedRoute`/sidebar gating is NOT a substitute. NOTE: this uses the repo's established client-supplied-`requestedBy` + Firestore-role pattern (NOT Firebase ID-token verification) — consistent with every other portal route. That pattern is acceptable here because these forms hold no sensitive PII; do not claim token-level identity verification. (The verified-token pattern was reserved for SSN reveal only.)
- **`requireManagement`/`requireSelfOrManagement` success returns `{ ok: true; requester }`** where `requester` includes `uid`, `name`, `role?`, `fieldRole?`, `isManagement`, `isAdmin`, `isManagerOrAbove`. The plan only uses `requester.uid`.
- **Canonical rep stamping:** submit routes IGNORE any client-supplied repName/email and load them from `users/{uid}`. The client cannot spoof identity.
- **Timestamps:** convert Firestore `Timestamp` with `.toDate()` before `NextResponse.json`.
- **Status state-guard:** mark-handled only transitions `new -> handled` (re-read doc, verify current status).
- **Dropdown values exact (from Formstack):** Fiber `companySold` ∈ {T-Fiber, Verizon, AT&T, Frontier, Spectrum}. Expedite `reason` ∈ {Install too far out, Tech missed install need install asap, Customer no showed need it rescheduled asap}.
- **Distinct nav hrefs** (active-match is `startsWith`): `/portal/fiber-report`, `/portal/expedite-order`, `/portal/admin/fiber-reports`, `/portal/admin/expedite-orders`.
- **Rep pages** wrap `ProtectedRoute` + `PortalHeader` + `PortalSidebar` (sales/new pattern). **Admin review pages** under `/portal/admin/*` use `ProtectedRoute roles={['admin','operations']}` and render inner content only (admin layout provides chrome).
- **Validation per task:** `npx tsc --noEmit` + `npm run build` green; `npm test` for helper/option tasks. Stage only each task's files; never `git add -A`.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/lib/forms/formOptions.ts` (NEW) + test | Fiber/Expedite dropdown option lists | 1 |
| `src/lib/forms/submitForm.ts` (NEW) | server submit helper (stamp rep, write record) | 2 |
| `src/lib/forms/reviewQuery.ts` (NEW) | server review-list query (gate, fetch, serialize) | 2 |
| `firestore.rules` (MODIFY) | deny-all client for the 2 collections | 3 |
| `src/components/forms/ReviewList.tsx` (NEW) | reusable management review list UI | 4 |
| `src/app/api/portal/forms/fiber-report/route.ts` (NEW) | Fiber submit API | 5 |
| `src/app/api/portal/forms/fiber-report/review/route.ts` (NEW) | Fiber review API (GET + mark-handled) | 5 |
| `src/app/portal/fiber-report/page.tsx` (NEW) | Fiber rep submit page | 6 |
| `src/app/portal/admin/fiber-reports/page.tsx` (NEW) | Fiber review page | 6 |
| `src/app/api/portal/forms/expedite-order/route.ts` (NEW) | Expedite submit API | 7 |
| `src/app/api/portal/forms/expedite-order/review/route.ts` (NEW) | Expedite review API | 7 |
| `src/app/portal/expedite-order/page.tsx` (NEW) | Expedite rep submit page | 8 |
| `src/app/portal/admin/expedite-orders/page.tsx` (NEW) | Expedite review page | 8 |
| `src/components/portal/PortalSidebar.tsx` (MODIFY) | nav links (rep + admin) | 9 |

---

## Task 1: Form option lists

**Files:**
- Create: `src/lib/forms/formOptions.ts`, `src/lib/forms/formOptions.test.ts`

**Interfaces:**
- Produces: `FIBER_COMPANIES: string[]`, `EXPEDITE_REASONS: string[]`, `isValidOption(list, value): boolean` (used by Tasks 5, 7).

- [ ] **Step 1: Write the failing test**

`src/lib/forms/formOptions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { FIBER_COMPANIES, EXPEDITE_REASONS, isValidOption } from './formOptions';

describe('form options', () => {
  it('has the exact Fiber companies', () => {
    expect(FIBER_COMPANIES).toEqual(['T-Fiber', 'Verizon', 'AT&T', 'Frontier', 'Spectrum']);
  });
  it('has the exact Expedite reasons', () => {
    expect(EXPEDITE_REASONS).toEqual([
      'Install too far out',
      'Tech missed install need install asap',
      'Customer no showed need it rescheduled asap',
    ]);
  });
  it('isValidOption accepts members and rejects non-members', () => {
    expect(isValidOption(FIBER_COMPANIES, 'Verizon')).toBe(true);
    expect(isValidOption(FIBER_COMPANIES, 'Comcast')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/forms/formOptions.test.ts`
Expected: FAIL — cannot resolve `./formOptions`.

- [ ] **Step 3: Implement**

`src/lib/forms/formOptions.ts`:

```typescript
// Option lists for the rebuilt Formstack rep forms (verbatim values).
export const FIBER_COMPANIES: string[] = ['T-Fiber', 'Verizon', 'AT&T', 'Frontier', 'Spectrum'];

export const EXPEDITE_REASONS: string[] = [
  'Install too far out',
  'Tech missed install need install asap',
  'Customer no showed need it rescheduled asap',
];

export function isValidOption(list: string[], value: string): boolean {
  return list.includes(value);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/forms/formOptions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/forms/formOptions.ts src/lib/forms/formOptions.test.ts
git commit -m "feat: add rep-form dropdown option lists"
```

---

## Task 2: Shared submit + review-query helpers

**Files:**
- Create: `src/lib/forms/submitForm.ts`, `src/lib/forms/reviewQuery.ts`

**Interfaces:**
- Consumes: `adminDb` (`@/lib/firebase/admin`), `requireManagement` (`@/lib/auth/requireManagement`).
- Produces (used by Tasks 5, 7):
  - `submitFormRecord(collection: string, repUid: string, fields: Record<string, unknown>): Promise<{ id: string }>` — loads `users/{repUid}`, stamps `repUid`/`repName`/`repEmail`, sets `status:'new'` + timestamps, writes, returns the new id. Throws if adminDb is unavailable or the user doc is missing.
  - `reviewQuery(collection: string, requestedBy: string | null): Promise<{ ok: true; submissions: Record<string, unknown>[] } | { ok: false; error: string; status: number }>` — gates with `requireManagement`, fetches the collection newest-first, converts timestamps, returns serialized rows.

- [ ] **Step 1: Implement `submitForm.ts`**

```typescript
import { adminDb } from '@/lib/firebase/admin';

// Writes a rep-form submission. Stamps the canonical rep identity from the user
// doc (never trusts client-supplied name/email) and a 'new' status.
export async function submitFormRecord(
  collection: string,
  repUid: string,
  fields: Record<string, unknown>
): Promise<{ id: string }> {
  if (!adminDb) throw new Error('Database not configured');

  const userSnap = await adminDb.collection('users').doc(repUid).get();
  if (!userSnap.exists) throw new Error('Submitting user not found');
  const u = userSnap.data();

  const now = new Date();
  const ref = await adminDb.collection(collection).add({
    ...fields,
    repUid,
    repName: u?.displayName ?? u?.email ?? repUid,
    repEmail: u?.email ?? '',
    status: 'new',
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id };
}
```

- [ ] **Step 2: Implement `reviewQuery.ts`**

```typescript
import { adminDb } from '@/lib/firebase/admin';
import { requireManagement } from '@/lib/auth/requireManagement';

// Management-gated fetch of a form's submissions, newest first, timestamps
// serialized to Dates so NextResponse.json yields ISO strings.
export async function reviewQuery(
  collection: string,
  requestedBy: string | null
): Promise<
  | { ok: true; submissions: Record<string, unknown>[] }
  | { ok: false; error: string; status: number }
> {
  if (!adminDb) return { ok: false, error: 'Database not configured', status: 500 };

  const gate = await requireManagement(requestedBy);
  if (!gate.ok) return { ok: false, error: gate.error, status: gate.status };

  const snap = await adminDb.collection(collection).orderBy('createdAt', 'desc').limit(200).get();
  const submissions = snap.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      id: d.id,
      createdAt: data.createdAt?.toDate() ?? null,
      updatedAt: data.updatedAt?.toDate() ?? null,
    };
  });
  return { ok: true, submissions };
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/forms/submitForm.ts src/lib/forms/reviewQuery.ts
git commit -m "feat: add shared rep-form submit + review-query helpers"
```

---

## Task 3: Firestore rules for the 2 collections

**Files:**
- Modify: `firestore.rules`

**Interfaces:** none. Produces: client access denied on `fiberReports` + `expediteOrders`.

- [ ] **Step 1: Add the rules**

In `firestore.rules`, after the `sensitiveAccessLog` match block (the last match before the closing braces), add:

```
    // Rep-form submissions (Fiber Report, Expedite Order). Server-only (Admin
    // SDK); reps submit and management reads via gated API routes, not direct
    // client Firestore access.
    match /fiberReports/{id} {
      allow read, write: if false;
    }
    match /expediteOrders/{id} {
      allow read, write: if false;
    }
```

- [ ] **Step 2: Verify build unaffected**

Run: `npm run build`
Expected: succeeds (rules not compiled by Next).

> Controller note (not a code step): after merge, deploy rules — `npx -y firebase-tools deploy --only firestore:rules --project cworldgroup-cca68`.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: deny-all firestore rules for fiberReports + expediteOrders"
```

---

## Task 4: Reusable ReviewList component

**Files:**
- Create: `src/components/forms/ReviewList.tsx`

**Interfaces:**
- Produces: default-exported `ReviewList` with props:
  ```typescript
  interface ReviewRow { id: string; status: string; [key: string]: unknown }
  interface ReviewColumn { key: string; label: string }
  interface ReviewListProps {
    title: string;
    columns: ReviewColumn[];     // which row fields to show + their labels
    rows: ReviewRow[];
    onMarkHandled: (id: string) => void;
    loading?: boolean;
    error?: string;
  }
  ```
  Consumed by Tasks 6, 8.

- [ ] **Step 1: Implement the component**

```tsx
'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ReviewRow {
  id: string;
  status: string;
  [key: string]: unknown;
}
interface ReviewColumn {
  key: string;
  label: string;
}
interface ReviewListProps {
  title: string;
  columns: ReviewColumn[];
  rows: ReviewRow[];
  onMarkHandled: (id: string) => void;
  loading?: boolean;
  error?: string;
}

function formatValue(v: unknown): string {
  if (v == null) return '—';
  if (v instanceof Date) return v.toLocaleString();
  // ISO date strings from JSON
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  return String(v);
}

export default function ReviewList({
  title,
  columns,
  rows,
  onMarkHandled,
  loading = false,
  error = '',
}: ReviewListProps) {
  const pending = rows.filter((r) => r.status === 'new').length;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
          <Badge variant="outline" className="rounded-md border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
            {pending} new
          </Badge>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <Card className="rounded-lg border-slate-200 bg-white py-0 text-center shadow-sm">
          <CardContent className="py-8">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-[#8dc63f]" />
            <p className="mt-4 text-sm text-slate-500">Loading…</p>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="rounded-lg border-slate-200 bg-white py-0 text-center shadow-sm">
          <CardContent className="py-12">
            <h3 className="font-semibold text-slate-950">Nothing to review</h3>
            <p className="mt-1 text-sm text-slate-500">No submissions yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className="rounded-lg border-slate-200 bg-white py-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {columns.map((col) => (
                      <div key={col.key}>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{col.label}</p>
                        <p className="mt-1 text-sm font-medium text-slate-950">{formatValue(row[col.key])}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    {row.status === 'handled' ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        Handled
                      </Badge>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => onMarkHandled(row.id)}
                        className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                      >
                        Mark handled
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/forms/ReviewList.tsx
git commit -m "feat: add reusable management ReviewList component"
```

---

## Task 5: Fiber Report APIs (submit + review)

**Files:**
- Create: `src/app/api/portal/forms/fiber-report/route.ts`, `src/app/api/portal/forms/fiber-report/review/route.ts`

**Interfaces:**
- Consumes: `submitFormRecord`, `reviewQuery` (Task 2); `FIBER_COMPANIES`, `isValidOption` (Task 1); `requireManagement`, `requireSelfOrManagement` (`@/lib/auth/requireManagement`); `adminDb`.

- [ ] **Step 1: Submit route `fiber-report/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireSelfOrManagement } from '@/lib/auth/requireManagement';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { FIBER_COMPANIES, isValidOption } from '@/lib/forms/formOptions';

function s(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// POST /api/portal/forms/fiber-report - a logged-in rep submits a fiber report.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const requestedBy = s(body.requestedBy, 128);

    const gate = await requireSelfOrManagement(requestedBy, requestedBy);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const companySold = s(body.companySold, 40);
    const fields = {
      companySold: isValidOption(FIBER_COMPANIES, companySold) ? companySold : '',
      dateKnocked: s(body.dateKnocked, 40),
      packNumber: s(body.packNumber, 40),
      numberOfReps: s(body.numberOfReps, 20),
      doorsKnocked: s(body.doorsKnocked, 20),
      customerContacts: s(body.customerContacts, 20),
      numberOfSales: s(body.numberOfSales, 20),
      orderNumber: s(body.orderNumber, 120),
    };

    const { id } = await submitFormRecord('fiberReports', gate.requester.uid, fields);
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error submitting fiber report:', error);
    return NextResponse.json({ error: 'Failed to submit fiber report' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Review route `fiber-report/review/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireManagement } from '@/lib/auth/requireManagement';
import { reviewQuery } from '@/lib/forms/reviewQuery';

const COLLECTION = 'fiberReports';

// GET - management-gated list of fiber reports.
export async function GET(request: NextRequest) {
  const result = await reviewQuery(COLLECTION, request.nextUrl.searchParams.get('requestedBy'));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ submissions: result.submissions });
}

// POST - mark a submission handled (management only, new -> handled).
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    const body = await request.json();
    const gate = await requireManagement(body.requestedBy);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const ref = adminDb.collection(COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (doc.data()?.status !== 'new') {
      return NextResponse.json({ error: 'Already handled' }, { status: 400 });
    }
    await ref.update({ status: 'handled', handledBy: gate.requester.uid, updatedAt: new Date() });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating fiber report:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit` (no errors); `npm run build` (succeeds; both routes listed).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/portal/forms/fiber-report/route.ts src/app/api/portal/forms/fiber-report/review/route.ts
git commit -m "feat: add Fiber Report submit + review APIs"
```

---

## Task 6: Fiber Report pages (rep submit + admin review)

**Files:**
- Create: `src/app/portal/fiber-report/page.tsx`, `src/app/portal/admin/fiber-reports/page.tsx`

**Interfaces:**
- Consumes: Task 5 APIs; `FIBER_COMPANIES` (Task 1); `ReviewList` (Task 4); `useAuth`.

- [ ] **Step 1: Rep submit page `portal/fiber-report/page.tsx`**

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
import { useAuth } from '@/contexts/AuthContext';
import { FIBER_COMPANIES } from '@/lib/forms/formOptions';

const EMPTY = {
  companySold: '', dateKnocked: '', packNumber: '', numberOfReps: '',
  doorsKnocked: '', customerContacts: '', numberOfSales: '', orderNumber: '',
};

export default function FiberReportPage() {
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
      const res = await fetch('/api/portal/forms/fiber-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, requestedBy: user.uid }),
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
              <h1 className="text-2xl font-semibold text-slate-950">New Fiber Report</h1>
              <p className="text-sm text-slate-600">
                Submitting as {user?.displayName || user?.email}.
              </p>
              {done && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  Report submitted. Thank you!
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}
              <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Company Sold</Label>
                  <NativeSelect
                    value={form.companySold}
                    onChange={(e) => setForm((p) => ({ ...p, companySold: e.target.value }))}
                    className="w-full"
                  >
                    <NativeSelectOption value="">Select company</NativeSelectOption>
                    {FIBER_COMPANIES.map((c) => (
                      <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div><Label>Date Knocked</Label><Input value={form.dateKnocked} onChange={(e) => setForm((p) => ({ ...p, dateKnocked: e.target.value }))} placeholder="MM/DD/YYYY" /></div>
                <div><Label>Pack Number</Label><Input value={form.packNumber} onChange={(e) => setForm((p) => ({ ...p, packNumber: e.target.value }))} /></div>
                <div><Label>Number of Reps</Label><Input value={form.numberOfReps} onChange={(e) => setForm((p) => ({ ...p, numberOfReps: e.target.value }))} inputMode="numeric" /></div>
                <div><Label>Doors Knocked</Label><Input value={form.doorsKnocked} onChange={(e) => setForm((p) => ({ ...p, doorsKnocked: e.target.value }))} inputMode="numeric" /></div>
                <div><Label>Customer Contacts</Label><Input value={form.customerContacts} onChange={(e) => setForm((p) => ({ ...p, customerContacts: e.target.value }))} inputMode="numeric" /></div>
                <div><Label># of Sales</Label><Input value={form.numberOfSales} onChange={(e) => setForm((p) => ({ ...p, numberOfSales: e.target.value }))} inputMode="numeric" /></div>
                <div className="sm:col-span-2"><Label>Order Number</Label><Input value={form.orderNumber} onChange={(e) => setForm((p) => ({ ...p, orderNumber: e.target.value }))} /></div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={saving} className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
                    {saving ? 'Submitting…' : 'Submit Report'}
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

- [ ] **Step 2: Review page `portal/admin/fiber-reports/page.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import ReviewList from '@/components/forms/ReviewList';
import { useAuth } from '@/contexts/AuthContext';

interface Row { id: string; status: string; [key: string]: unknown }

const COLUMNS = [
  { key: 'repName', label: 'Rep' },
  { key: 'companySold', label: 'Company' },
  { key: 'dateKnocked', label: 'Date Knocked' },
  { key: 'doorsKnocked', label: 'Doors' },
  { key: 'customerContacts', label: 'Contacts' },
  { key: 'numberOfSales', label: 'Sales' },
  { key: 'orderNumber', label: 'Order #' },
  { key: 'createdAt', label: 'Submitted' },
];

export default function FiberReportsReviewPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/portal/forms/fiber-report/review?requestedBy=${user.uid}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows(json.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const markHandled = async (id: string) => {
    if (!user) return;
    const res = await fetch('/api/portal/forms/fiber-report/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, requestedBy: user.uid }),
    });
    if (res.ok) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)));
  };

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <ReviewList title="Fiber Reports" columns={COLUMNS} rows={rows} onMarkHandled={markHandled} loading={loading} error={error} />
    </ProtectedRoute>
  );
}
```

- [ ] **Step 3: Verify typecheck + lint + build**

Run: `npx tsc --noEmit` (no errors); `npx eslint src/app/portal/fiber-report/page.tsx src/app/portal/admin/fiber-reports/page.tsx` (clean); `npm run build` (succeeds).

- [ ] **Step 4: Commit**

```bash
git add src/app/portal/fiber-report/page.tsx src/app/portal/admin/fiber-reports/page.tsx
git commit -m "feat: add Fiber Report rep page + admin review page"
```

---

## Task 7: Expedite Order APIs (submit + review)

**Files:**
- Create: `src/app/api/portal/forms/expedite-order/route.ts`, `src/app/api/portal/forms/expedite-order/review/route.ts`

**Interfaces:**
- Consumes: `submitFormRecord`, `reviewQuery` (Task 2); `EXPEDITE_REASONS`, `isValidOption` (Task 1); `validateAddress` (`@/lib/validation/address`); `requireManagement`, `requireSelfOrManagement`; `adminDb`.

- [ ] **Step 1: Submit route `expedite-order/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireSelfOrManagement } from '@/lib/auth/requireManagement';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { EXPEDITE_REASONS, isValidOption } from '@/lib/forms/formOptions';
import { validateAddress } from '@/lib/validation/address';

function s(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// POST /api/portal/forms/expedite-order - a logged-in rep requests an expedite.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const requestedBy = s(body.requestedBy, 128);

    const gate = await requireSelfOrManagement(requestedBy, requestedBy);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const addr = validateAddress({ address: body.address, city: body.city, state: body.state, zip: body.zip });
    if (!addr.ok) return NextResponse.json({ error: addr.error }, { status: 400 });

    const reason = s(body.reason, 80);
    const fields = {
      customerName: s(body.customerName, 180),
      customerPhone: s(body.customerPhone, 40),
      customerEmail: s(body.customerEmail, 180),
      ...addr.clean,
      orderNumber: s(body.orderNumber, 120),
      expediteDates: s(body.expediteDates, 300),
      reason: isValidOption(EXPEDITE_REASONS, reason) ? reason : '',
    };

    const { id } = await submitFormRecord('expediteOrders', gate.requester.uid, fields);
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error submitting expedite order:', error);
    return NextResponse.json({ error: 'Failed to submit expedite order' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Review route `expedite-order/review/route.ts`**

Same structure as Task 5 Step 2, with `const COLLECTION = 'expediteOrders';`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireManagement } from '@/lib/auth/requireManagement';
import { reviewQuery } from '@/lib/forms/reviewQuery';

const COLLECTION = 'expediteOrders';

export async function GET(request: NextRequest) {
  const result = await reviewQuery(COLLECTION, request.nextUrl.searchParams.get('requestedBy'));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ submissions: result.submissions });
}

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    const body = await request.json();
    const gate = await requireManagement(body.requestedBy);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const ref = adminDb.collection(COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (doc.data()?.status !== 'new') {
      return NextResponse.json({ error: 'Already handled' }, { status: 400 });
    }
    await ref.update({ status: 'handled', handledBy: gate.requester.uid, updatedAt: new Date() });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating expedite order:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit` (no errors); `npm run build` (succeeds; both routes listed).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/portal/forms/expedite-order/route.ts src/app/api/portal/forms/expedite-order/review/route.ts
git commit -m "feat: add Expedite Order submit + review APIs"
```

---

## Task 8: Expedite Order pages (rep submit + admin review)

**Files:**
- Create: `src/app/portal/expedite-order/page.tsx`, `src/app/portal/admin/expedite-orders/page.tsx`

**Interfaces:**
- Consumes: Task 7 APIs; `EXPEDITE_REASONS` (Task 1); `US_STATES` (`@/lib/validation/address`); `ReviewList` (Task 4); `useAuth`.

- [ ] **Step 1: Rep submit page `portal/expedite-order/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAuth } from '@/contexts/AuthContext';
import { EXPEDITE_REASONS } from '@/lib/forms/formOptions';
import { US_STATES } from '@/lib/validation/address';

const EMPTY = {
  customerName: '', customerPhone: '', customerEmail: '',
  address: '', city: '', state: '', zip: '',
  orderNumber: '', expediteDates: '', reason: '',
};

export default function ExpediteOrderPage() {
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
      const res = await fetch('/api/portal/forms/expedite-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, requestedBy: user.uid }),
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
              <h1 className="text-2xl font-semibold text-slate-950">Expedite Internet Order</h1>
              <p className="text-sm text-slate-600">Submitting as {user?.displayName || user?.email}.</p>
              {done && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  Expedite request submitted.
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}
              <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><Label>Customer Name</Label><Input value={form.customerName} onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))} required /></div>
                <div><Label>Customer Phone</Label><Input value={form.customerPhone} onChange={(e) => setForm((p) => ({ ...p, customerPhone: e.target.value }))} required /></div>
                <div className="sm:col-span-2"><Label>Customer Email</Label><Input value={form.customerEmail} onChange={(e) => setForm((p) => ({ ...p, customerEmail: e.target.value }))} /></div>
                <div className="sm:col-span-2"><Label>Street Address</Label><Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} /></div>
                <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} /></div>
                <div>
                  <Label>State</Label>
                  <NativeSelect value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} className="w-full">
                    <NativeSelectOption value="">Select state</NativeSelectOption>
                    {US_STATES.map((st) => (
                      <NativeSelectOption key={st.code} value={st.code}>{st.name}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div><Label>ZIP</Label><Input value={form.zip} onChange={(e) => setForm((p) => ({ ...p, zip: e.target.value }))} placeholder="12345" /></div>
                <div><Label>Order Number</Label><Input value={form.orderNumber} onChange={(e) => setForm((p) => ({ ...p, orderNumber: e.target.value }))} required /></div>
                <div className="sm:col-span-2"><Label>Desired expedite dates</Label><Textarea value={form.expediteDates} onChange={(e) => setForm((p) => ({ ...p, expediteDates: e.target.value }))} required /></div>
                <div className="sm:col-span-2">
                  <Label>Reason for expedite</Label>
                  <NativeSelect value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} className="w-full" required>
                    <NativeSelectOption value="">Select reason</NativeSelectOption>
                    {EXPEDITE_REASONS.map((r) => (
                      <NativeSelectOption key={r} value={r}>{r}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={saving} className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
                    {saving ? 'Submitting…' : 'Submit Request'}
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

- [ ] **Step 2: Review page `portal/admin/expedite-orders/page.tsx`**

Same structure as Task 6 Step 2 with these columns and endpoints:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import ReviewList from '@/components/forms/ReviewList';
import { useAuth } from '@/contexts/AuthContext';

interface Row { id: string; status: string; [key: string]: unknown }

const COLUMNS = [
  { key: 'repName', label: 'Rep' },
  { key: 'customerName', label: 'Customer' },
  { key: 'customerPhone', label: 'Phone' },
  { key: 'orderNumber', label: 'Order #' },
  { key: 'reason', label: 'Reason' },
  { key: 'expediteDates', label: 'Dates' },
  { key: 'createdAt', label: 'Submitted' },
];

export default function ExpediteOrdersReviewPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/portal/forms/expedite-order/review?requestedBy=${user.uid}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows(json.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const markHandled = async (id: string) => {
    if (!user) return;
    const res = await fetch('/api/portal/forms/expedite-order/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, requestedBy: user.uid }),
    });
    if (res.ok) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'handled' } : r)));
  };

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <ReviewList title="Expedite Orders" columns={COLUMNS} rows={rows} onMarkHandled={markHandled} loading={loading} error={error} />
    </ProtectedRoute>
  );
}
```

- [ ] **Step 3: Verify typecheck + lint + build**

Run: `npx tsc --noEmit` (no errors); `npx eslint src/app/portal/expedite-order/page.tsx src/app/portal/admin/expedite-orders/page.tsx` (clean); `npm run build` (succeeds).

- [ ] **Step 4: Commit**

```bash
git add src/app/portal/expedite-order/page.tsx src/app/portal/admin/expedite-orders/page.tsx
git commit -m "feat: add Expedite Order rep page + admin review page"
```

---

## Task 9: Navigation links

**Files:**
- Modify: `src/components/portal/PortalSidebar.tsx`

**Interfaces:** Consumes nothing new. Adds nav entries.

- [ ] **Step 1: Add rep-facing form links**

In `src/components/portal/PortalSidebar.tsx`, in the **`navigationItems`** array (the rep-facing list at line ~25), add two entries (after an existing item like 'Calls Schedule'). Use simple inline SVG icons consistent with the file:

```tsx
  {
    name: 'Fiber Report',
    href: '/portal/fiber-report',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    name: 'Expedite Order',
    href: '/portal/expedite-order',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
```

- [ ] **Step 2: Add admin review links**

In the **`operationsItems`** array (the management/operations nav list at line ~127, containing the existing `{ name: 'Onboarding Review', href: '/portal/admin/onboarding', ... roles: ['admin','operations'] }` entry), add two entries with the same `roles: ['admin', 'operations']`:

```tsx
  {
    name: 'Fiber Reports',
    href: '/portal/admin/fiber-reports',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    roles: ['admin', 'operations'],
  },
  {
    name: 'Expedite Orders',
    href: '/portal/admin/expedite-orders',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    roles: ['admin', 'operations'],
  },
```

> Verified array names: rep list = `navigationItems`; management list = `operationsItems` (the 'Onboarding Review' entry lives there); there is also `adminItems` (admin-only) — do NOT use that one. Add to `navigationItems` (Step 1) and `operationsItems` (Step 2). Do not introduce overlapping href prefixes.

- [ ] **Step 3: Verify typecheck + lint + build**

Run: `npx tsc --noEmit` (no errors); `npx eslint src/components/portal/PortalSidebar.tsx` (clean); `npm run build` (succeeds).

- [ ] **Step 4: Commit**

```bash
git add src/components/portal/PortalSidebar.tsx
git commit -m "feat: add sidebar nav for rep forms + admin review lists"
```

---

## Final Verification (per spec §7)

- [ ] `npx tsc --noEmit` + `npm run build` green; `npm test` green (formOptions).
- [ ] Log in as a rep; submit a Fiber Report and an Expedite Order; confirm each saves (no error).
- [ ] Log in as admin/operations; open Fiber Reports + Expedite Orders review lists; confirm submissions appear with the rep's name and "Mark handled" works.
- [ ] Confirm the stamped `repName`/`repEmail` come from the user doc (not client-supplied).
- [ ] Confirm a non-management user gets 403 from the review GET.
- [ ] Confirm dropdown values out of the allowed lists are dropped (stored empty).

## Out of Scope (queued)

The 2 upload forms (Payroll Dispute, Leads Request) + generic upload foundation; Application + Sale parity; email notifications; richer review workflow.
