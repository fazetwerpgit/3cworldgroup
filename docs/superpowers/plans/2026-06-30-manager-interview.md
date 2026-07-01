# Manager Final Interview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Manager Final Interview form (submit page + admin review) with a drawn signature pad and editable-option dropdowns; the last Formstack form to rebuild.

**Architecture:** Thin form on the existing rep-forms foundation (`submitFormRecord`/`reviewQuery`/`markHandled`/`ReviewList`). Dropdowns come from the editable form-options system. A new `SignaturePad` canvas component captures a PNG data URL stored inline. A new auth gate lets field managers (not all reps) submit.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, firebase-admin, Tailwind v4, shadcn/ui, Vitest.

## Global Constraints
- Submit gate = admin | operations | l1_manager | l2_manager (NOT every rep). Review gate = admin | operations (existing `requireVerifiedManagement`).
- Dropdowns (provider, job position, hiring manager, market) resolve from the editable options system (`getResolvedFormOptions` server-side, `useFormOptions` client-side). Yes/No and 1–5 rating are fixed.
- The 3 "For Promotion Only" questions show only when Job Position is a promotion role (`jobPosition !== 'Account Executive'`); stored empty otherwise, both client and server.
- Signature required: a `data:image/png;base64,...` string ≤ 200 KB, stored inline as `signatureDataUrl`.
- New collection `managerInterviews`: `allow read, write: if false`.
- Identity (who submitted) comes from the verified token, never client input.
- Follow existing conventions (see referenced pattern files).

---

### Task 1: Promotion + signature validators (pure, tested)

**Files:**
- Create: `src/lib/forms/managerInterview.ts`
- Test: `src/lib/forms/managerInterview.test.ts`

**Interfaces:**
- Produces: `isPromotionRole(jobPosition: string): boolean`; `validateSignatureDataUrl(value: unknown): boolean`.

- [ ] **Step 1: Write the test:**

```ts
import { describe, it, expect } from 'vitest';
import { isPromotionRole, validateSignatureDataUrl } from './managerInterview';

describe('isPromotionRole', () => {
  it('Account Executive is not a promotion', () => {
    expect(isPromotionRole('Account Executive')).toBe(false);
  });
  it('manager/other roles are promotions', () => {
    expect(isPromotionRole('L1 Manager')).toBe(true);
    expect(isPromotionRole('L2 Manager')).toBe(true);
    expect(isPromotionRole('Director')).toBe(true);
  });
  it('empty is not a promotion', () => {
    expect(isPromotionRole('')).toBe(false);
  });
});

describe('validateSignatureDataUrl', () => {
  it('accepts a small png data url', () => {
    expect(validateSignatureDataUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==')).toBe(true);
  });
  it('rejects non-png / non-data-url', () => {
    expect(validateSignatureDataUrl('data:image/jpeg;base64,xxxx')).toBe(false);
    expect(validateSignatureDataUrl('https://evil.example/x.png')).toBe(false);
    expect(validateSignatureDataUrl('')).toBe(false);
    expect(validateSignatureDataUrl(null)).toBe(false);
    expect(validateSignatureDataUrl(123)).toBe(false);
  });
  it('rejects an over-size string', () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(200 * 1024 + 1);
    expect(validateSignatureDataUrl(big)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify FAIL.**

- [ ] **Step 3: Implement `managerInterview.ts`:**

```ts
// The only non-promotion job position; everything else (manager tiers and any
// future GM/Director/etc.) is treated as a promotion, which reveals the three
// "For Promotion Only" questions. Kept as a single rule because job positions are
// admin-editable (see the editable-form-options design).
const ENTRY_ROLE = 'Account Executive';

export function isPromotionRole(jobPosition: string): boolean {
  return jobPosition.trim() !== '' && jobPosition.trim() !== ENTRY_ROLE;
}

const MAX_SIGNATURE_BYTES = 200 * 1024;

// A drawn signature arrives as a PNG data URL. Accept only that shape and cap the
// size so a crafted request can't store an arbitrary/huge blob.
export function validateSignatureDataUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('data:image/png;base64,')) return false;
  if (value.length > MAX_SIGNATURE_BYTES) return false;
  return true;
}
```

- [ ] **Step 4: Run tests, verify PASS.**

- [ ] **Step 5: Commit** — `git add src/lib/forms/managerInterview.ts src/lib/forms/managerInterview.test.ts && git commit -m "feat: manager-interview promotion + signature validators"`

---

### Task 2: SignaturePad component + new auth gate + firestore rule

**Files:**
- Create: `src/components/forms/SignaturePad.tsx`
- Modify: `src/lib/auth/requireVerifiedAdmin.ts`
- Modify: `firestore.rules`

**Interfaces:**
- Produces: `SignaturePad` (props `{ onChange: (dataUrl: string | null) => void }`); `requireVerifiedFieldManagerOrManagement(request)` returning `{ ok, uid, name, email } | { ok:false, error, status }`.

- [ ] **Step 1: Add the auth gate** to `requireVerifiedAdmin.ts` (after `requireVerifiedManagement`). It reuses the file's existing `verifyCaller` helper and `resolveRoles`:

```ts
// Verifies a token and allows field managers OR back-office management to submit
// (e.g. the Manager Final Interview). Broader than requireVerifiedManagement (which
// is admin/operations only) but still excludes entry reps. Returns the verified
// identity for stamping.
export async function requireVerifiedFieldManagerOrManagement(
  request: NextRequest
): Promise<{ ok: true; uid: string; name: string; email: string } | { ok: false; error: string; status: number }> {
  const c = await verifyCaller(request);
  if (!c.ok) return c;
  const { role, fieldRole } = resolveRoles(c.data.role, c.data.fieldRole);
  const allowed =
    role === 'admin' || role === 'operations' || fieldRole === 'l1_manager' || fieldRole === 'l2_manager';
  if (!allowed) {
    return { ok: false, error: 'Forbidden: manager access required', status: 403 };
  }
  return {
    ok: true,
    uid: c.uid,
    name: c.data.displayName || c.data.email || c.uid,
    email: c.data.email || '',
  };
}
```

(Confirm `verifyCaller` and `resolveRoles` are in scope in this file — they are used by the existing gates.)

- [ ] **Step 2: Add the Firestore rule** after the `formOptions` block:

```
    match /managerInterviews/{id} {
      allow read, write: if false;
    }
```

- [ ] **Step 3: Implement `SignaturePad.tsx`** — a client canvas the user draws in, with a Clear button; emits a PNG data URL via `onChange`:

```tsx
'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
  width?: number;
  height?: number;
}

// A small draw-with-mouse/finger signature box. Emits a PNG data URL on each stroke
// end, or null when cleared. Intentionally dependency-free (raw canvas).
export default function SignaturePad({ onChange, width = 600, height = 200 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (e.currentTarget.width / rect.width),
      y: (e.clientY - rect.top) * (e.currentTarget.height / rect.height),
    };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#0A1F44';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    hasInk.current = true;
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk.current && canvasRef.current) {
      setEmpty(false);
      onChange(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full touch-none rounded-md border border-slate-300 bg-white"
        style={{ aspectRatio: `${width} / ${height}` }}
      />
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          Clear
        </Button>
        <span className="text-xs text-slate-500">
          {empty ? 'Draw your signature above' : 'Signature captured'}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 5: Commit** — `git add src/components/forms/SignaturePad.tsx src/lib/auth/requireVerifiedAdmin.ts firestore.rules && git commit -m "feat: SignaturePad component + field-manager auth gate + managerInterviews rule"`

---

### Task 3: Submit + review API routes

**Files:**
- Create: `src/app/api/portal/forms/manager-interview/route.ts`
- Create: `src/app/api/portal/forms/manager-interview/review/route.ts`

**Interfaces:**
- Consumes: `requireVerifiedFieldManagerOrManagement`, `submitFormRecord`, `reviewQuery`, `markHandled`, `getResolvedFormOptions`, `isValidOption`, `isPromotionRole`, `validateSignatureDataUrl`.

- [ ] **Step 1: Create the submit route** `src/app/api/portal/forms/manager-interview/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedFieldManagerOrManagement } from '@/lib/auth/requireVerifiedAdmin';
import { submitFormRecord } from '@/lib/forms/submitForm';
import { getResolvedFormOptions } from '@/lib/forms/resolveFormOptions';
import { isValidOption } from '@/lib/forms/formOptions';
import { isPromotionRole, validateSignatureDataUrl } from '@/lib/forms/managerInterview';

function s(v: unknown, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function yn(v: unknown): boolean {
  return v === true || v === 'yes' || v === 'Yes';
}

// POST /api/portal/forms/manager-interview - a manager records a hire decision.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireVerifiedFieldManagerOrManagement(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = await request.json();
    const opts = await getResolvedFormOptions();

    const provider = s(body.provider, 60);
    const jobPosition = s(body.jobPosition, 80);
    const hiringManager = s(body.hiringManager, 120);
    const hiringManagerEmail = s(body.hiringManagerEmail, 180);
    const candidateFirstName = s(body.candidateFirstName, 120);
    const candidateLastName = s(body.candidateLastName, 120);
    const candidateEmail = s(body.candidateEmail, 180);
    const market = s(body.market, 120);
    const rating = Number(body.rating);

    if (!hiringManagerEmail || !candidateFirstName || !candidateLastName || !candidateEmail) {
      return NextResponse.json({ error: 'Please complete all required fields' }, { status: 400 });
    }
    if (!isValidOption(opts.providers, provider)) {
      return NextResponse.json({ error: 'Select a valid provider' }, { status: 400 });
    }
    if (!isValidOption(opts.hireJobPositions, jobPosition)) {
      return NextResponse.json({ error: 'Select a valid job position' }, { status: 400 });
    }
    if (!isValidOption(opts.hireManagers, hiringManager)) {
      return NextResponse.json({ error: 'Select a valid hiring manager' }, { status: 400 });
    }
    // Market is required; must be one of the configured markets. If none are
    // configured yet, this correctly blocks submission until an admin adds them.
    if (!isValidOption(opts.hireMarkets, market)) {
      return NextResponse.json({ error: 'Select a valid market' }, { status: 400 });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be 1 to 5' }, { status: 400 });
    }
    if (!validateSignatureDataUrl(body.signatureDataUrl)) {
      return NextResponse.json({ error: 'A signature is required' }, { status: 400 });
    }

    // Promotion-only answers apply only for promotion roles; drop otherwise.
    const promo = isPromotionRole(jobPosition);
    const completedProduction = promo ? yn(body.completedProduction) : '';
    const completedReading = promo ? yn(body.completedReading) : '';
    const completedTeamMetric = promo ? yn(body.completedTeamMetric) : '';

    const { id } = await submitFormRecord(
      'managerInterviews',
      { uid: gate.uid, name: gate.name, email: gate.email },
      {
        provider, jobPosition, hiringManager, hiringManagerEmail,
        candidateFirstName, candidateLastName, candidateEmail, market,
        didShow: yn(body.didShow),
        extendOffer: yn(body.extendOffer),
        rating,
        completedProduction, completedReading, completedTeamMetric,
        signatureDataUrl: body.signatureDataUrl,
      }
    );
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error submitting manager interview:', error);
    return NextResponse.json({ error: 'Failed to submit manager interview' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the review route** `src/app/api/portal/forms/manager-interview/review/route.ts` (identical shape to the payroll-dispute review route, collection `managerInterviews`):

```ts
import { NextRequest, NextResponse } from 'next/server';
import { reviewQuery, markHandled } from '@/lib/forms/reviewQuery';

const COLLECTION = 'managerInterviews';

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
    console.error('Error updating manager interview:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 4: Commit** — `git add src/app/api/portal/forms/manager-interview && git commit -m "feat: manager-interview submit + review API routes"`

---

### Task 4: Submit page (conditional + signature)

**Files:**
- Create: `src/app/portal/manager-interview/page.tsx`

**Interfaces:**
- Consumes: `useFormOptions`, `isPromotionRole`, `SignaturePad`, `NativeSelect`, `Input`, `auth`. Posts to `/api/portal/forms/manager-interview`.

- [ ] **Step 1: Create the page.** Model the shell on `src/app/portal/payroll-dispute/page.tsx` (`ProtectedRoute`, `PortalHeader`, `PortalSidebar`, `max-w-2xl`, green submit button, token-authed JSON fetch). Specifics:
  - `ProtectedRoute roles={['admin', 'operations', 'l1_manager', 'l2_manager']}`.
  - `const { options } = useFormOptions();`
  - State holds all fields (provider, jobPosition, hiringManager, hiringManagerEmail, candidateFirstName, candidateLastName, candidateEmail, market, didShow, extendOffer, rating, completedProduction, completedReading, completedTeamMetric, signatureDataUrl).
  - Selects: Provider (`options.providers`), Job Position (`options.hireJobPositions`), Hiring Manager (`options.hireManagers`), Market (`options.hireMarkets`) — each with a leading "Select…" option.
  - Did Candidate Show / Extend Offer: a Yes/No select or two-button toggle storing booleans.
  - Rate Candidate: a 1–5 select (store as number).
  - `const promo = isPromotionRole(form.jobPosition);` — when true, render the 3 Yes/No "For Promotion Only" questions; when false, don't render them (and they stay default in state).
  - Signature: `<SignaturePad onChange={(d) => setForm((p) => ({ ...p, signatureDataUrl: d ?? '' }))} />` with a "Manager Signature For Approval" label.
  - Submit: disable while saving OR when `!form.signatureDataUrl`. POST JSON with the Bearer token (same pattern as payroll page). On success, reset + green "Interview submitted." banner.
  - If `options.hireMarkets` is empty, show a small hint under the Market select: "No markets configured yet — an admin can add them in Form Options." (Purely informational.)

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 3: Commit** — `git add src/app/portal/manager-interview/page.tsx && git commit -m "feat: manager-interview submit page with signature + conditional promotion questions"`

---

### Task 5: Admin review page + nav

**Files:**
- Create: `src/app/portal/admin/manager-interviews/page.tsx`
- Modify: `src/components/portal/PortalSidebar.tsx`

**Interfaces:**
- Consumes: `ReviewList`, `auth`, the review route.

- [ ] **Step 1: Create the admin page.** Model on `src/app/portal/admin/payroll-disputes/page.tsx`:
  - `ProtectedRoute roles={['admin', 'operations']}`.
  - `COLUMNS`: Submitted by (`repName`), Candidate (`candidateFirstName`), Provider (`provider`), Position (`jobPosition`), Manager (`hiringManager`), Market (`market`), Show? (`didShow`), Offer? (`extendOffer`), Rating (`rating`), Submitted (`createdAt`).
  - `authedFetch`, `load` from `/api/portal/forms/manager-interview/review`, `markHandled` POST to same, optimistic update.
  - Pass `downloadFilename="manager-interviews.csv"` to `ReviewList` (CSV covers the text columns; the signature is not a column).
  - Below the list, a "Signatures" block: for each row with `signatureDataUrl`, show the candidate name + `<img src={row.signatureDataUrl as string} alt="Signature" className="h-24 rounded border border-slate-200 bg-white" />`.
  - Note: `didShow`/`extendOffer` are booleans; `ReviewList.formatValue` will render them as `true`/`false`. That's acceptable for v1. (If trivial, map them to Yes/No when building the rows; optional.)

- [ ] **Step 2: Add nav entries** in `PortalSidebar.tsx`:
  - In `navigationItems` (visible to managers): a "Manager Interview" item → `/portal/manager-interview` with `roles: ['admin','operations','l1_manager','l2_manager']` (reuse a clipboard/check inline SVG icon).
  - In `operationsItems`: "Manager Interviews" → `/portal/admin/manager-interviews`, `roles: ['admin','operations']`.

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 4: Build** — `npm run build`. Expected: green; `/portal/manager-interview`, `/portal/admin/manager-interviews`, `/api/portal/forms/manager-interview`, `/api/portal/forms/manager-interview/review` all registered.

- [ ] **Step 5: Full suite** — `npx vitest run`. Expected: all pass.

- [ ] **Step 6: Commit** — `git add src/app/portal/admin/manager-interviews/page.tsx src/components/portal/PortalSidebar.tsx && git commit -m "feat: manager-interview admin review page + nav"`

---

## Self-Review Notes
- Spec coverage: validators (T1), signature+gate+rule (T2), routes (T3), submit page (T4), admin+nav (T5). All spec sections covered.
- Security: new gate excludes entry reps; submit validates every dropdown against resolved options + rating range + signature shape/size; new collection server-only; identity from token.
- Editable-options integration: all four dropdowns resolve from the options system (client via useFormOptions, server via getResolvedFormOptions).
- Signature stored inline (small PNG data URL); admin views via <img>; CSV excludes it.
