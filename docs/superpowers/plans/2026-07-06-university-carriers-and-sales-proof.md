# University Carrier Categories & Sales Proof Fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the University tab four carrier categories (as visible filter pills) and add proof-of-sale + product fields to the sales flow.

**Architecture:** Part 1 swaps the training category constants to carriers and replaces the hidden category dropdown with pills. Part 2 adds three fields to the sales data model, form, edit page, API, and detail view, with a shared pure `hasSaleProof` validator enforced on both client and server, and screenshot uploads reusing the existing `/api/portal/forms/upload` + `/api/portal/forms/attachment` infrastructure.

**Tech Stack:** Next.js (App Router), TypeScript, React client components, Firestore (admin SDK), Firebase Storage, Vitest, Tailwind.

## Global Constraints

- Test runner: `npx vitest run <file>` (colocated `*.test.ts`). Full suite: `npm run test`.
- Typecheck: `npx tsc --noEmit`. Build: `npm run build`. Both must pass before a task is done.
- New commits, never amend. No emojis in code/UI unless already present.
- Carrier category values (verbatim): `att_tfiber`=`AT&T T-Fiber`, `verizon_frontier`=`Verizon/Frontier`, `xfinity`=`Xfinity`, `directv`=`DirecTV`.
- Screenshot upload `formType` (verbatim): `sale-proof`, single slot `''`.
- Proof rule: a sale must have a non-empty `orderNumberOrBtn` **OR** a non-empty `proofScreenshotPath`. `productSold` is independently required (non-empty).
- Brand tokens already in use: primary navy `#0A1F44`, lime `#8dc63f`, lime-text `#5a8f1f`. Reuse; do not introduce new colors.

---

### Task 1: Carrier training categories (types + constants)

**Files:**
- Modify: `src/types/training.ts` (lines 4, 49-55, 65-71)
- Test: `src/types/training.test.ts` (create)

**Interfaces:**
- Produces: `TrainingCategory = 'att_tfiber' | 'verizon_frontier' | 'xfinity' | 'directv'`; `TRAINING_CATEGORIES: { value: TrainingCategory; label: string }[]`; `ResourceCategoryConfig: Record<ResourceCategory, { name: string; description: string }>`.
- Consumers `ResourceCard.tsx` and `training/[id]/page.tsx` already use `categoryConfig?.label || resource.category`, so legacy Firestore values fall back to the raw string — no consumer edit required.

- [ ] **Step 1: Write the failing test**

Create `src/types/training.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TRAINING_CATEGORIES, ResourceCategoryConfig } from './training';

describe('training carrier categories', () => {
  it('exposes exactly the four carriers in order', () => {
    expect(TRAINING_CATEGORIES).toEqual([
      { value: 'att_tfiber', label: 'AT&T T-Fiber' },
      { value: 'verizon_frontier', label: 'Verizon/Frontier' },
      { value: 'xfinity', label: 'Xfinity' },
      { value: 'directv', label: 'DirecTV' },
    ]);
  });

  it('has a config entry for every category value', () => {
    for (const { value } of TRAINING_CATEGORIES) {
      expect(ResourceCategoryConfig[value]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/types/training.test.ts`
Expected: FAIL (old categories still present).

- [ ] **Step 3: Update the type and constants**

In `src/types/training.ts` replace line 4:

```ts
export type TrainingCategory = 'att_tfiber' | 'verizon_frontier' | 'xfinity' | 'directv';
```

Replace `ResourceCategoryConfig` (lines 49-55) with:

```ts
export const ResourceCategoryConfig: Record<ResourceCategory, { name: string; description: string }> = {
  att_tfiber: { name: 'AT&T T-Fiber', description: 'AT&T T-Fiber training and resources' },
  verizon_frontier: { name: 'Verizon/Frontier', description: 'Verizon and Frontier training and resources' },
  xfinity: { name: 'Xfinity', description: 'Xfinity training and resources' },
  directv: { name: 'DirecTV', description: 'DirecTV training and resources' },
};
```

Replace `TRAINING_CATEGORIES` (lines 65-71) with:

```ts
export const TRAINING_CATEGORIES: { value: TrainingCategory; label: string }[] = [
  { value: 'att_tfiber', label: 'AT&T T-Fiber' },
  { value: 'verizon_frontier', label: 'Verizon/Frontier' },
  { value: 'xfinity', label: 'Xfinity' },
  { value: 'directv', label: 'DirecTV' },
];
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/types/training.test.ts` → Expected: PASS
Run: `npx tsc --noEmit` → Expected: no errors (consumers use optional chaining, so the narrower union still compiles).

- [ ] **Step 5: Commit**

```bash
git add src/types/training.ts src/types/training.test.ts
git commit -m "feat(training): carrier-based University categories"
```

---

### Task 2: University filter pills

**Files:**
- Modify: `src/app/portal/training/page.tsx` (imports line 19; Category filter block lines 114-131)

**Interfaces:**
- Consumes: `TRAINING_CATEGORIES`, existing `categoryFilter` state + `setCategoryFilter` (line 55).
- Produces: no new exports; purely UI.

- [ ] **Step 1: Replace the Category dropdown with pills**

In `src/app/portal/training/page.tsx`, replace the Category `<div className="grid gap-2">` block (lines 114-131, the one containing the `training-category` `NativeSelect`) with a pill row:

```tsx
<div className="grid gap-2">
  <Label className="text-sm text-slate-700 dark:text-muted-foreground">Carrier</Label>
  <div className="flex flex-wrap gap-2">
    <button
      type="button"
      onClick={() => setCategoryFilter('')}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        categoryFilter === ''
          ? 'border-[#8dc63f] bg-[#8dc63f]/10 text-[#5a8f1f]'
          : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-border dark:text-muted-foreground dark:hover:bg-muted'
      }`}
    >
      All
    </button>
    {TRAINING_CATEGORIES.map((category) => (
      <button
        key={category.value}
        type="button"
        onClick={() => setCategoryFilter(category.value)}
        className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
          categoryFilter === category.value
            ? 'border-[#8dc63f] bg-[#8dc63f]/10 text-[#5a8f1f]'
            : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-border dark:text-muted-foreground dark:hover:bg-muted'
        }`}
      >
        {category.label}
      </button>
    ))}
  </div>
</div>
```

Leave the Type `NativeSelect` and the "Clear" button untouched. `NativeSelect` may now be unused for the category — keep the import (still used by Type filter). Remove the now-unused `htmlFor="training-category"` reference only if present.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` → Expected: no errors.
Run: `npx eslint src/app/portal/training/page.tsx` → Expected: no errors (no unused vars).

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open `/portal/training`. Expected: a "Carrier" pill row (All + four carriers) above the resource grid; clicking a carrier filters and highlights lime; "All" clears.

- [ ] **Step 4: Commit**

```bash
git add src/app/portal/training/page.tsx
git commit -m "feat(training): surface carrier categories as filter pills"
```

---

### Task 3: Sales proof lib — types, validator, upload allowlist

**Files:**
- Modify: `src/types/sales.ts` (CreateSaleData lines 23-36; Sale lines 51-56 area)
- Create: `src/lib/sales/proof.ts`
- Create: `src/lib/sales/proof.test.ts`
- Modify: `src/lib/forms/formUploads.ts` (FORM_UPLOAD_SLOTS lines 35-38)
- Modify: `src/lib/forms/formOptions.test.ts` OR create `src/lib/forms/formUploads.test.ts` (create new — formUploads has no test yet)

**Interfaces:**
- Produces: `hasSaleProof(input: { orderNumberOrBtn?: string; proofScreenshotPath?: string }): boolean`; new optional fields `orderNumberOrBtn?`, `proofScreenshotPath?`, `productSold?` on `CreateSaleData` and `Sale`; `FORM_UPLOAD_SLOTS['sale-proof'] = ['']`.
- Consumed by Tasks 4 (POST route), 5 (SaleForm), 6 (edit page/PUT), 7 (detail sheet).

- [ ] **Step 1: Write the failing validator test**

Create `src/lib/sales/proof.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hasSaleProof } from './proof';

describe('hasSaleProof', () => {
  it('true when order/BTN present', () => {
    expect(hasSaleProof({ orderNumberOrBtn: 'ABC123' })).toBe(true);
  });
  it('true when screenshot path present', () => {
    expect(hasSaleProof({ proofScreenshotPath: 'form-attachments/u/sale-proof/' })).toBe(true);
  });
  it('false when neither present', () => {
    expect(hasSaleProof({})).toBe(false);
  });
  it('false when both blank/whitespace', () => {
    expect(hasSaleProof({ orderNumberOrBtn: '   ', proofScreenshotPath: '' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sales/proof.test.ts`
Expected: FAIL ("Failed to resolve import './proof'").

- [ ] **Step 3: Implement the validator**

Create `src/lib/sales/proof.ts`:

```ts
// A sale needs at least one proof: an order number / BTN, or an uploaded
// screenshot. Shared by the sale form (client) and the sales API (server).
export function hasSaleProof(input: {
  orderNumberOrBtn?: string;
  proofScreenshotPath?: string;
}): boolean {
  return Boolean(input.orderNumberOrBtn?.trim() || input.proofScreenshotPath?.trim());
}
```

- [ ] **Step 4: Run validator test**

Run: `npx vitest run src/lib/sales/proof.test.ts` → Expected: PASS.

- [ ] **Step 5: Write the failing upload-allowlist test**

Create `src/lib/forms/formUploads.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isAllowedFormUpload } from './formUploads';

describe('sale-proof uploads', () => {
  it('accepts the sale-proof single slot', () => {
    expect(isAllowedFormUpload('sale-proof', '')).toBe(true);
  });
  it('rejects an unknown slot for sale-proof', () => {
    expect(isAllowedFormUpload('sale-proof', 'nope')).toBe(false);
  });
});
```

- [ ] **Step 6: Run to verify it fails, then add the allowlist entry**

Run: `npx vitest run src/lib/forms/formUploads.test.ts` → Expected: FAIL.

In `src/lib/forms/formUploads.ts`, update `FORM_UPLOAD_SLOTS` (lines 35-38) to add `sale-proof`:

```ts
export const FORM_UPLOAD_SLOTS: Record<string, string[]> = {
  'payroll-dispute': [''],
  'leads-request': ['hostile', 'blind-knock', 'lasso'],
  'sale-proof': [''],
};
```

Run: `npx vitest run src/lib/forms/formUploads.test.ts` → Expected: PASS.

- [ ] **Step 7: Add the three fields to the sales types**

In `src/types/sales.ts`, inside `CreateSaleData` (after `notes?: string;`, line 35) add:

```ts
  orderNumberOrBtn?: string;
  proofScreenshotPath?: string;
  productSold?: string;
```

In `Sale`, in the "Sale details" group (after `commission?: number;`, ~line 56) add the same three lines:

```ts
  orderNumberOrBtn?: string;
  proofScreenshotPath?: string;
  productSold?: string;
```

- [ ] **Step 8: Typecheck + commit**

Run: `npx tsc --noEmit` → Expected: no errors.

```bash
git add src/types/sales.ts src/lib/sales/proof.ts src/lib/sales/proof.test.ts src/lib/forms/formUploads.ts src/lib/forms/formUploads.test.ts
git commit -m "feat(sales): proof validator, sale fields, sale-proof upload slot"
```

---

### Task 4: Sales POST route — persist fields + server validation

**Files:**
- Modify: `src/app/api/portal/sales/route.ts` (POST: destructure lines 122-135; validation lines 137-143; newSale lines 153-170)

**Interfaces:**
- Consumes: `hasSaleProof` from `src/lib/sales/proof`.
- Produces: persisted `orderNumberOrBtn`, `proofScreenshotPath`, `productSold` on new sale docs; 400 when proof missing or `productSold` empty.

- [ ] **Step 1: Import the validator**

At the top of `src/app/api/portal/sales/route.ts`, add after line 5:

```ts
import { hasSaleProof } from '@/lib/sales/proof';
```

- [ ] **Step 2: Destructure the new fields**

In `POST`, extend the destructure (lines 122-135) to include:

```ts
      notes,
      orderNumberOrBtn,
      proofScreenshotPath,
      productSold,
    } = body;
```

- [ ] **Step 3: Add server-side validation**

Immediately after the existing required-fields check (after line 143), add:

```ts
    if (!productSold || !String(productSold).trim()) {
      return NextResponse.json({ error: 'Product sold is required' }, { status: 400 });
    }

    if (!hasSaleProof({ orderNumberOrBtn, proofScreenshotPath })) {
      return NextResponse.json(
        { error: 'Provide an order number / BTN or upload a screenshot' },
        { status: 400 }
      );
    }
```

- [ ] **Step 4: Persist the fields**

In the `newSale` object (lines 153-170), add after `notes: notes || '',`:

```ts
      orderNumberOrBtn: orderNumberOrBtn || '',
      proofScreenshotPath: proofScreenshotPath || '',
      productSold: productSold || '',
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit` → Expected: no errors.
Run: `npm run build` → Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/portal/sales/route.ts
git commit -m "feat(sales): persist and validate proof + product on create"
```

---

### Task 5: SaleForm — new fields, upload, client validation

**Files:**
- Modify: `src/components/sales/SaleForm.tsx` (imports 3-21; formData 32-39; validation 92-110; Sale Details card 308-341)

**Interfaces:**
- Consumes: `hasSaleProof` from `@/lib/sales/proof`; `FileUpload` from `@/components/onboarding/FileUpload`; `FORM_ATTACHMENT_TYPES` from `@/lib/forms/formUploads`; `auth` from `@/lib/firebase/config`.
- Produces: sends `orderNumberOrBtn`, `proofScreenshotPath`, `productSold` in `saleData` to `createSale`.

- [ ] **Step 1: Add imports**

In `src/components/sales/SaleForm.tsx` add after the existing imports (around line 21):

```ts
import FileUpload from '@/components/onboarding/FileUpload';
import { FORM_ATTACHMENT_TYPES } from '@/lib/forms/formUploads';
import { hasSaleProof } from '@/lib/sales/proof';
import { auth } from '@/lib/firebase/config';
```

- [ ] **Step 2: Extend form state**

Replace the `useState` init (lines 32-39) to add the three fields:

```ts
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    saleType: 'new_service' as SaleType,
    notes: '',
    orderNumberOrBtn: '',
    proofScreenshotPath: '',
    productSold: '',
  });
```

- [ ] **Step 3: Add client validation**

In `handleSubmit`, after the `products.length === 0` check (after line 104) add:

```ts
    if (!formData.productSold.trim()) {
      setFormError('Please enter the product sold');
      return;
    }

    if (!hasSaleProof(formData)) {
      setFormError('Enter an order number / BTN, or upload a screenshot');
      return;
    }
```

(`saleData` already spreads `...formData`, so the three fields are sent automatically.)

- [ ] **Step 4: Add the fields to the Sale Details card**

In the "Sale Details" `<CardContent>` (lines 312-339), replace the inner grid so it becomes:

```tsx
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="mb-1">Sale Type</Label>
            <NativeSelect
              name="saleType"
              value={formData.saleType}
              onChange={handleChange}
              className="w-full"
            >
              {SALE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label className="mb-1">Product Sold *</Label>
            <Input
              type="text"
              name="productSold"
              value={formData.productSold}
              onChange={handleChange}
              placeholder="e.g. AT&T Fiber 1 Gig, DirecTV Choice"
            />
          </div>
          <div>
            <Label className="mb-1">Order Number or BTN</Label>
            <Input
              type="text"
              name="orderNumberOrBtn"
              value={formData.orderNumberOrBtn}
              onChange={handleChange}
              placeholder="Order # or billing phone number"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
              Required unless you upload a screenshot below.
            </p>
          </div>
          <div>
            <Label className="mb-1">Screenshot (if no order # / BTN)</Label>
            <FileUpload
              itemId="sale-proof"
              accept="image/*,application/pdf"
              allowedTypes={FORM_ATTACHMENT_TYPES}
              uploadUrl="/api/portal/forms/upload"
              extraFields={{ formType: 'sale-proof' }}
              existingPath={formData.proofScreenshotPath || undefined}
              getHeaders={async (): Promise<HeadersInit> => {
                const t = await auth?.currentUser?.getIdToken();
                return t ? { Authorization: `Bearer ${t}` } : {};
              }}
              onUploaded={(path) => setFormData((p) => ({ ...p, proofScreenshotPath: path }))}
            />
          </div>
          <div className="md:col-span-2">
            <Label className="mb-1">Notes</Label>
            <Input
              type="text"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Additional context for review"
            />
          </div>
        </div>
```

- [ ] **Step 5: Typecheck + manual**

Run: `npx tsc --noEmit` → Expected: no errors.
Manual (`npm run dev`, `/portal/sales/new`): submitting with a plan but no Product Sold shows the product error; with Product Sold but no order#/BTN and no screenshot shows the proof error; entering an order # OR uploading an image allows submit.

- [ ] **Step 6: Commit**

```bash
git add src/components/sales/SaleForm.tsx
git commit -m "feat(sales): order#/BTN, screenshot, product sold on new-sale form"
```

---

### Task 6: Edit page + PUT route carry-through

**Files:**
- Modify: `src/app/api/portal/sales/[id]/route.ts` (EDITABLE_FIELDS lines 102-112)
- Modify: `src/app/portal/sales/[id]/edit/page.tsx` (imports; formData 49-57; load 71-79; validation 129-141; Sale Details card 389-411)

**Interfaces:**
- Consumes: `hasSaleProof`, `FileUpload`, `FORM_ATTACHMENT_TYPES`, `auth`.
- Produces: edits persist the three fields.

- [ ] **Step 1: Allow the fields in the PUT route**

In `src/app/api/portal/sales/[id]/route.ts`, add to `EDITABLE_FIELDS` (before the closing `] as const;`, line 111):

```ts
      'orderNumberOrBtn',
      'proofScreenshotPath',
      'productSold',
```

- [ ] **Step 2: Edit-page imports + state**

In `src/app/portal/sales/[id]/edit/page.tsx` add imports (after line 28):

```ts
import FileUpload from '@/components/onboarding/FileUpload';
import { FORM_ATTACHMENT_TYPES } from '@/lib/forms/formUploads';
import { hasSaleProof } from '@/lib/sales/proof';
import { auth } from '@/lib/firebase/config';
```

Extend `formData` init (lines 49-57) with `orderNumberOrBtn: '', proofScreenshotPath: '', productSold: ''` and, in the `setFormData` inside `loadSale` (lines 71-79), add:

```ts
          orderNumberOrBtn: saleData.orderNumberOrBtn || '',
          proofScreenshotPath: saleData.proofScreenshotPath || '',
          productSold: saleData.productSold || '',
```

- [ ] **Step 3: Edit-page validation**

In `handleSubmit`, after the `products.length === 0` check (after line 141) add:

```ts
    if (!formData.productSold.trim()) {
      setFormError('Please enter the product sold');
      return;
    }
    if (!hasSaleProof(formData)) {
      setFormError('Enter an order number / BTN, or upload a screenshot');
      return;
    }
```

(`updates` spreads `...formData`, so the fields flow to `updateSale`.)

- [ ] **Step 4: Edit-page Sale Details card**

Apply the same field additions as Task 5 Step 4 (Product Sold, Order Number or BTN, Screenshot `FileUpload` with `existingPath={formData.proofScreenshotPath || undefined}`, Notes spanning two columns) to the "Sale Details" `<CardContent>` (lines 393-410). Use identical field names, labels, and placeholders as Task 5 for consistency.

- [ ] **Step 5: Typecheck + build + commit**

Run: `npx tsc --noEmit` → Expected: no errors.
Run: `npm run build` → Expected: succeeds.

```bash
git add src/app/api/portal/sales/[id]/route.ts src/app/portal/sales/[id]/edit/page.tsx
git commit -m "feat(sales): carry proof + product fields through edit"
```

---

### Task 7: SaleDetailSheet — display fields + screenshot link

**Files:**
- Modify: `src/components/sales/SaleDetailSheet.tsx` (imports; body Fields ~185-199)

**Interfaces:**
- Consumes: `sale.orderNumberOrBtn`, `sale.productSold`, `sale.proofScreenshotPath`; `/api/portal/forms/attachment?path=` (management-only signed URL); `auth`.
- Produces: no exports.

- [ ] **Step 1: Add imports + screenshot handler**

In `src/components/sales/SaleDetailSheet.tsx` add:

```ts
import { useState } from 'react';
import { auth } from '@/lib/firebase/config';
```

Inside the component (after the `showApproval` const, ~line 101) add:

```tsx
  const [proofLoading, setProofLoading] = useState(false);
  const openScreenshot = async () => {
    if (!sale.proofScreenshotPath) return;
    setProofLoading(true);
    try {
      const t = await auth?.currentUser?.getIdToken();
      const res = await fetch(
        `/api/portal/forms/attachment?path=${encodeURIComponent(sale.proofScreenshotPath)}`,
        { headers: t ? { Authorization: `Bearer ${t}` } : undefined }
      );
      const json = await res.json();
      if (res.ok && json.url) window.open(json.url, '_blank', 'noopener');
    } finally {
      setProofLoading(false);
    }
  };
```

- [ ] **Step 2: Render the new fields**

In the scrollable body, after the Address `Field` (after line 184) add:

```tsx
          {sale.productSold && <Field label="Product sold">{sale.productSold}</Field>}
          {sale.orderNumberOrBtn && (
            <Field label="Order # / BTN">
              <span className="portal-num">{sale.orderNumberOrBtn}</span>
            </Field>
          )}
          {sale.proofScreenshotPath && (
            <Field label="Screenshot">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openScreenshot}
                disabled={proofLoading}
              >
                {proofLoading ? 'Opening…' : 'View screenshot'}
              </Button>
            </Field>
          )}
```

Note: the attachment endpoint is management-only, so the button surfaces the image for managers/admins reviewing the sale. Reps viewing their own sale will simply get no URL (button no-ops) — acceptable for v1.

- [ ] **Step 3: Typecheck + manual + commit**

Run: `npx tsc --noEmit` → Expected: no errors.
Manual: open a sale with the new fields in the detail sheet; Product sold + Order#/BTN show; "View screenshot" opens the image in a new tab when a screenshot exists.

```bash
git add src/components/sales/SaleDetailSheet.tsx
git commit -m "feat(sales): show proof + product in sale detail"
```

---

### Task 8: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm run test` → Expected: all pass (incl. new `training`, `proof`, `formUploads` tests).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` && `npm run build` → Expected: both clean.

- [ ] **Step 3: End-to-end manual smoke**

1. `/portal/training`: carrier pills filter content.
2. `/portal/sales/new`: cannot submit without Product Sold; cannot submit without order#/BTN or screenshot; can submit with either.
3. Approvals/detail sheet: new fields + screenshot link visible to a manager.
4. `/portal/sales/[id]/edit` (admin): fields prefill and save.

---

## Notes / deferred
- Carrier → (order number vs BTN) mapping is intentionally deferred; the combined field covers it. When decided, make the label carrier-aware in SaleForm/edit.
- No migration of legacy training resources; they show under "All" with their raw category string.
