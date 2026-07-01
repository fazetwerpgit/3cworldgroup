# Editable Form Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins edit form dropdown lists (managers, markets, campaigns, providers, job positions, expedite reasons) from an admin screen; forms resolve options as `override ?? code-default` on both client and server.

**Architecture:** Code arrays stay as defaults. A `formOptions` Firestore store holds overrides. A pure `mergeOptions` merges them; a server resolver reads Firestore + merges for validation; a read API + client hook feed the form pages; an admin-only write API + editor page manage overrides.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, firebase-admin, Tailwind v4, shadcn/ui, Vitest.

## Global Constraints
- Defaults ALWAYS present: if Firestore has no override for a key, the code default is used. Nothing breaks uncustomized.
- Client and server resolve options identically; submit validation uses the RESOLVED list, never the raw hardcoded array.
- Data corrections baked into new defaults: NO "Jordan Zuber" anywhere; leads managers default = `['Jacob Myers']`; hire managers default = `['Jacob Myers','Will Teasdale','Jeremy McFarland']`; hire job positions default = `['Account Executive','L1 Manager','L2 Manager']`; hire markets default = `[]`.
- `LEADS_CATEGORIES` and `LEADS_REASONS` are NOT editable (they drive conditional logic) — leave them code-only.
- Editing options = admins only (`requireVerifiedAdmin`). Reading resolved options = verified user.
- New Firestore collection `formOptions`: `allow read, write: if false`.
- Follow existing conventions (see referenced pattern files).

---

### Task 1: Option registry + pure merge (tested)

**Files:**
- Create: `src/lib/forms/formOptionsRegistry.ts`
- Test: `src/lib/forms/formOptionsRegistry.test.ts`
- Modify: `src/lib/forms/formOptions.ts` (correct the Jordan Zuber default → Jacob Myers; leads managers → just Jacob Myers)

**Interfaces:**
- Consumes: existing exports of `formOptions.ts`.
- Produces: `OptionKey` (union), `OPTION_KEYS: OptionKey[]`, `EDITABLE_OPTION_KEYS: OptionKey[]`, `FORM_OPTION_DEFAULTS: Record<OptionKey,string[]>`, `FORM_OPTION_LABELS: Record<OptionKey,string>`, `mergeOptions(overrides: Partial<Record<OptionKey,string[]>>): Record<OptionKey,string[]>`.

- [ ] **Step 1: Correct the defaults in `formOptions.ts`.** Change `LEADS_MANAGERS` to `['Jacob Myers']`. (Leave `LEADS_CAMPAIGNS`, `LEADS_LOCATIONS`, `LEADS_CATEGORIES`, `LEADS_REASONS`, `FIBER_COMPANIES`, `EXPEDITE_REASONS`, `PAYROLL_CAMPAIGNS` as they are.) Update `src/lib/forms/formOptions.test.ts`'s `LEADS_MANAGERS` assertion to expect `['Jacob Myers']`.

- [ ] **Step 2: Write `formOptionsRegistry.test.ts`:**

```ts
import { describe, it, expect } from 'vitest';
import { mergeOptions, FORM_OPTION_DEFAULTS, EDITABLE_OPTION_KEYS } from './formOptionsRegistry';

describe('mergeOptions', () => {
  it('returns all defaults when no overrides', () => {
    expect(mergeOptions({})).toEqual(FORM_OPTION_DEFAULTS);
  });
  it('override wins for a provided key', () => {
    const merged = mergeOptions({ hireMarkets: ['Dallas TX'] });
    expect(merged.hireMarkets).toEqual(['Dallas TX']);
    expect(merged.hireManagers).toEqual(FORM_OPTION_DEFAULTS.hireManagers);
  });
  it('respects an explicit empty-array override (admin cleared a list)', () => {
    expect(mergeOptions({ hireMarkets: [] }).hireMarkets).toEqual([]);
  });
  it('ignores unknown keys', () => {
    const merged = mergeOptions({ bogusKey: ['x'] } as never);
    expect('bogusKey' in merged).toBe(false);
  });
  it('hire + leads managers defaults reflect the corrected roster', () => {
    expect(FORM_OPTION_DEFAULTS.leadsManagers).toEqual(['Jacob Myers']);
    expect(FORM_OPTION_DEFAULTS.hireManagers).toEqual(['Jacob Myers', 'Will Teasdale', 'Jeremy McFarland']);
  });
  it('logic-bearing lists are NOT editable', () => {
    expect(EDITABLE_OPTION_KEYS).not.toContain('leadsCategories');
    expect(EDITABLE_OPTION_KEYS).not.toContain('leadsReasons');
  });
});
```

- [ ] **Step 3: Run it, verify FAIL.**

- [ ] **Step 4: Implement `formOptionsRegistry.ts`:**

```ts
import {
  FIBER_COMPANIES,
  EXPEDITE_REASONS,
  PAYROLL_CAMPAIGNS,
  LEADS_CAMPAIGNS,
  LEADS_MANAGERS,
  LEADS_LOCATIONS,
} from './formOptions';

// Stable keys for every editable form dropdown. Values are the code DEFAULTS;
// admin overrides (in Firestore) supersede these at resolve time.
export const FORM_OPTION_DEFAULTS = {
  providers: FIBER_COMPANIES,
  expediteReasons: EXPEDITE_REASONS,
  payrollCampaigns: PAYROLL_CAMPAIGNS,
  leadsCampaigns: LEADS_CAMPAIGNS,
  leadsManagers: LEADS_MANAGERS,
  leadsLocations: LEADS_LOCATIONS,
  hireManagers: ['Jacob Myers', 'Will Teasdale', 'Jeremy McFarland'],
  hireJobPositions: ['Account Executive', 'L1 Manager', 'L2 Manager'],
  hireMarkets: [] as string[],
} satisfies Record<string, string[]>;

export type OptionKey = keyof typeof FORM_OPTION_DEFAULTS;

export const OPTION_KEYS = Object.keys(FORM_OPTION_DEFAULTS) as OptionKey[];

// All keys above are editable in v1. (Leads categories/reasons are intentionally
// absent — they drive conditional show/hide logic and must stay code-defined.)
export const EDITABLE_OPTION_KEYS: OptionKey[] = [...OPTION_KEYS];

export const FORM_OPTION_LABELS: Record<OptionKey, string> = {
  providers: 'Internet Providers',
  expediteReasons: 'Expedite Reasons',
  payrollCampaigns: 'Payroll Campaigns',
  leadsCampaigns: 'Leads: Campaigns',
  leadsManagers: 'Leads: Managers',
  leadsLocations: 'Leads: Locations',
  hireManagers: 'Hire: Managers',
  hireJobPositions: 'Hire: Job Positions',
  hireMarkets: 'Hire: Markets',
};

// Pure merge: for each known key, an override (including an empty array) wins;
// otherwise the code default is used. Unknown keys in `overrides` are ignored.
export function mergeOptions(
  overrides: Partial<Record<OptionKey, string[]>>
): Record<OptionKey, string[]> {
  const out = {} as Record<OptionKey, string[]>;
  for (const key of OPTION_KEYS) {
    const o = overrides[key];
    out[key] = Array.isArray(o) ? o : FORM_OPTION_DEFAULTS[key];
  }
  return out;
}
```

- [ ] **Step 5: Run both test files, verify PASS** (`npx vitest run src/lib/forms/formOptionsRegistry.test.ts src/lib/forms/formOptions.test.ts`).

- [ ] **Step 6: Commit** — `git add src/lib/forms/formOptions*.ts src/lib/forms/formOptions*.test.ts && git commit -m "feat: form options registry + pure merge (Jordan->Jacob corrections)"`

---

### Task 2: Server resolver + Firestore rule

**Files:**
- Create: `src/lib/forms/resolveFormOptions.ts`
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: `adminDb`, `mergeOptions`, `OptionKey`, `OPTION_KEYS`.
- Produces: `getResolvedFormOptions(): Promise<Record<OptionKey,string[]>>`.

- [ ] **Step 1: Add the Firestore rule** after the `leadsRequests` block:

```
    match /formOptions/{key} {
      allow read, write: if false;
    }
```

- [ ] **Step 2: Implement `resolveFormOptions.ts`:**

```ts
import { adminDb } from '@/lib/firebase/admin';
import { mergeOptions, OPTION_KEYS, OptionKey } from './formOptionsRegistry';

// Reads admin overrides from Firestore (collection `formOptions`, one doc per key
// with a `values: string[]` field) and merges them over the code defaults. Server
// side of the resolver, used by submit routes so validation matches what reps saw.
export async function getResolvedFormOptions(): Promise<Record<OptionKey, string[]>> {
  const overrides: Partial<Record<OptionKey, string[]>> = {};
  if (adminDb) {
    try {
      const snap = await adminDb.collection('formOptions').get();
      snap.forEach((doc) => {
        const key = doc.id as OptionKey;
        if (!OPTION_KEYS.includes(key)) return;
        const values = doc.data()?.values;
        if (Array.isArray(values) && values.every((v) => typeof v === 'string')) {
          overrides[key] = values;
        }
      });
    } catch {
      // On any read failure, fall back to pure defaults — forms must never break.
    }
  }
  return mergeOptions(overrides);
}
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 4: Commit** — `git add src/lib/forms/resolveFormOptions.ts firestore.rules && git commit -m "feat: server resolver for form options + firestore rule"`

---

### Task 3: Read API + admin write API

**Files:**
- Create: `src/app/api/portal/forms/options/route.ts`

**Interfaces:**
- Consumes: `requireVerifiedUser`, `requireVerifiedAdmin`, `getResolvedFormOptions`, `EDITABLE_OPTION_KEYS`, `adminDb`.
- Produces: `GET /api/portal/forms/options` (`{ options }`); `PUT /api/portal/forms/options` (`{ success }`).

- [ ] **Step 1: Implement the route:**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser, requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';
import { getResolvedFormOptions } from '@/lib/forms/resolveFormOptions';
import { EDITABLE_OPTION_KEYS, OptionKey } from '@/lib/forms/formOptionsRegistry';

// GET - any verified user gets the resolved (default + override) option lists.
export async function GET(request: NextRequest) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const options = await getResolvedFormOptions();
  return NextResponse.json({ options });
}

// PUT - admins only. Body { key, values }. Overwrites one key's override list.
export async function PUT(request: NextRequest) {
  try {
    const gate = await requireVerifiedAdmin(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const key = body.key as OptionKey;
    if (!EDITABLE_OPTION_KEYS.includes(key)) {
      return NextResponse.json({ error: 'Invalid or non-editable option key' }, { status: 400 });
    }
    if (!Array.isArray(body.values)) {
      return NextResponse.json({ error: 'values must be an array' }, { status: 400 });
    }
    // Clean: strings only, trimmed, non-empty, deduped, capped.
    const seen = new Set<string>();
    const values: string[] = [];
    for (const raw of body.values) {
      if (typeof raw !== 'string') continue;
      const v = raw.trim().slice(0, 120);
      if (!v || seen.has(v)) continue;
      seen.add(v);
      values.push(v);
      if (values.length >= 100) break;
    }

    await adminDb.collection('formOptions').doc(key).set({
      values,
      updatedBy: gate.uid,
      updatedAt: new Date(),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving form options:', error);
    return NextResponse.json({ error: 'Failed to save options' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 3: Commit** — `git add src/app/api/portal/forms/options/route.ts && git commit -m "feat: form-options read API (verified user) + write API (admin only)"`

---

### Task 4: Client hook + refactor the 4 form pages to resolved options

**Files:**
- Create: `src/hooks/useFormOptions.ts`
- Modify: `src/app/portal/fiber-report/page.tsx`, `src/app/portal/expedite-order/page.tsx`, `src/app/portal/payroll-dispute/page.tsx`, `src/app/portal/leads-request/page.tsx`

**Interfaces:**
- Consumes: read API, `FORM_OPTION_DEFAULTS`, `auth`.
- Produces: `useFormOptions(): { options: Record<OptionKey,string[]>; loading: boolean }`.

- [ ] **Step 1: Implement the hook** — fetch the read API once on mount with the auth token; while loading, return `FORM_OPTION_DEFAULTS` so selects are never empty:

```ts
'use client';
import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase/config';
import { FORM_OPTION_DEFAULTS, OptionKey } from '@/lib/forms/formOptionsRegistry';

export function useFormOptions(): { options: Record<OptionKey, string[]>; loading: boolean } {
  const [options, setOptions] = useState<Record<OptionKey, string[]>>(FORM_OPTION_DEFAULTS);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch('/api/portal/forms/options', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (active && res.ok && json.options) setOptions(json.options);
      } catch {
        // keep defaults
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return { options, loading };
}
```

- [ ] **Step 2: Refactor each of the 4 form pages.** In each page: `import { useFormOptions } from '@/hooks/useFormOptions';`, call `const { options } = useFormOptions();`, and replace the imported constant in the JSX select with the resolved list:
  - `fiber-report/page.tsx`: `FIBER_COMPANIES.map(...)` → `options.providers.map(...)`. Remove the now-unused `FIBER_COMPANIES` import.
  - `expedite-order/page.tsx`: `EXPEDITE_REASONS.map(...)` → `options.expediteReasons.map(...)`.
  - `payroll-dispute/page.tsx`: `PAYROLL_CAMPAIGNS.map(...)` → `options.payrollCampaigns.map(...)`.
  - `leads-request/page.tsx`: `LEADS_CAMPAIGNS` → `options.leadsCampaigns`, `LEADS_MANAGERS` → `options.leadsManagers`, `LEADS_LOCATIONS` → `options.leadsLocations`. Keep `LEADS_CATEGORIES`/`LEADS_REASONS` imported as-is (not editable). Keep `leadsConditions` unchanged.
  - (Read each file first to place the hook call correctly; keep everything else — validation, submit, conditional rendering — unchanged.)

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`. Expected: clean (watch for unused imports — remove them).

- [ ] **Step 4: Run suite** — `npx vitest run`. Expected: all pass.

- [ ] **Step 5: Commit** — `git add src/hooks/useFormOptions.ts src/app/portal/fiber-report src/app/portal/expedite-order src/app/portal/payroll-dispute src/app/portal/leads-request && git commit -m "feat: form pages read resolved (editable) options via hook"`

---

### Task 5: Submit routes validate against resolved options

**Files:**
- Modify: `src/app/api/portal/forms/fiber-report/route.ts`, `src/app/api/portal/forms/expedite-order/route.ts`, `src/app/api/portal/forms/payroll-dispute/route.ts`, `src/app/api/portal/forms/leads-request/route.ts`

**Interfaces:**
- Consumes: `getResolvedFormOptions`, existing `isValidOption`.

- [ ] **Step 1: In each submit route, resolve options once and validate against them** instead of the hardcoded array. Pattern (fiber-report shown; apply the analogous change to each):
  - Add `import { getResolvedFormOptions } from '@/lib/forms/resolveFormOptions';`
  - After parsing the body, `const opts = await getResolvedFormOptions();`
  - Replace `isValidOption(FIBER_COMPANIES, companySold)` → `isValidOption(opts.providers, companySold)`. Remove the now-unused hardcoded import (keep `isValidOption`).
  - expedite-order: `EXPEDITE_REASONS` → `opts.expediteReasons`.
  - payroll-dispute: `PAYROLL_CAMPAIGNS` → `opts.payrollCampaigns`.
  - leads-request: `LEADS_CAMPAIGNS` → `opts.leadsCampaigns`, `LEADS_MANAGERS` → `opts.leadsManagers`, `LEADS_LOCATIONS` → `opts.leadsLocations`. Keep `LEADS_CATEGORIES`/`LEADS_REASONS` validation using the hardcoded imports (unchanged), and keep `leadsConditions` unchanged.

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 3: Run suite** — `npx vitest run`. Expected: all pass.

- [ ] **Step 4: Commit** — `git add src/app/api/portal/forms && git commit -m "feat: submit routes validate against resolved (editable) options"`

---

### Task 6: Admin editor page + nav

**Files:**
- Create: `src/app/portal/admin/form-options/page.tsx`
- Modify: `src/components/portal/PortalSidebar.tsx`

**Interfaces:**
- Consumes: read API (load current), write API (save), `EDITABLE_OPTION_KEYS`, `FORM_OPTION_LABELS`, `auth`.

- [ ] **Step 1: Create the admin editor page.** `ProtectedRoute roles={['admin']}`. On load, GET `/api/portal/forms/options` (authed) to get current resolved lists. Render one editable section per key in `EDITABLE_OPTION_KEYS`, using `FORM_OPTION_LABELS[key]` as the heading. Each section: the current values as a list of rows, each with a remove (×) button; an "Add" input+button to append a value; a "Save" button that PUTs `{ key, values }` and shows a saved/updated confirmation. Use existing shadcn `Input`/`Button`/`Card`/`Label`. Follow the visual style of the other admin pages. Keep it simple (no drag-reorder needed).
  - Include a short read-only note near the bottom: "Leads categories and reasons aren't editable here because they control which fields appear on the Leads Request form."
  - Use the same `authedFetch` pattern as the admin review pages (Bearer token from `auth.currentUser.getIdToken()`).

- [ ] **Step 2: Add nav entry** in `PortalSidebar.tsx` `adminItems` (admin-only section): "Form Options" → `/portal/admin/form-options` (reuse an existing inline SVG icon, e.g. the settings/adjust icon).

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 4: Build** — `npm run build`. Expected: green; `/portal/admin/form-options` and `/api/portal/forms/options` registered.

- [ ] **Step 5: Run suite** — `npx vitest run`. Expected: all pass.

- [ ] **Step 6: Commit** — `git add src/app/portal/admin/form-options src/components/portal/PortalSidebar.tsx && git commit -m "feat: admin form-options editor page + nav"`

---

## Self-Review Notes
- Spec coverage: registry+merge (T1), resolver+rule (T2), APIs (T3), client hook+page refactor (T4), submit validation (T5), admin editor+nav (T6). All spec components covered.
- Safety: defaults always present (hook + resolver both fall back); logic-bearing leads lists stay code-only; editing is admin-only, reading is verified-user; submit validates resolved list.
- Data corrections land in T1 defaults (no Jordan Zuber; corrected rosters).
- Backward-compat: uncustomized installs behave exactly as before (override absent → default).
