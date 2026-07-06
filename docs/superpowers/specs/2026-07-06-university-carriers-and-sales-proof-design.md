# University Carrier Categories & Sales Proof Fields — Design

Date: 2026-07-06

## Summary

Two independent changes to the rep portal:

1. **University tab** (`/portal/training`) — replace the current, easy-to-miss category
   dropdown with four **carrier categories**, surfaced as visible filter pills.
2. **Sales form / detail** — add proof-of-sale and product fields to the "Sale Details"
   section: an Order Number / BTN field, an optional-but-conditionally-required
   screenshot upload, and a Product Sold field.

The two changes share the carrier vocabulary but touch different parts of the app.

---

## Part 1 — University carrier categories

### Current state
`TrainingCategory` = `onboarding | product | sales_technique | compliance | general`
(`src/types/training.ts`). On the "My Path" tab (`src/app/portal/training/page.tsx`)
these are exposed only through a `NativeSelect` dropdown that users overlook.

### Target
New categories (replace the old set):

| value              | label            |
| ------------------ | ---------------- |
| `att_tfiber`       | AT&T T-Fiber     |
| `verizon_frontier` | Verizon/Frontier |
| `xfinity`          | Xfinity          |
| `directv`          | DirecTV          |

### Changes
- `src/types/training.ts`: update `TrainingCategory` union, `TRAINING_CATEGORIES`
  array, and `ResourceCategoryConfig` to the four carriers.
- `src/app/portal/training/page.tsx`: replace the Category `NativeSelect` with a row
  of **filter pills** (All + one per carrier) above the resource grid. The Type
  dropdown stays as-is. Selecting a pill sets `categoryFilter` (existing state/param
  plumbing is reused).
- `src/components/training/ResourceCard.tsx` and `training/[id]/page.tsx`: the
  `TRAINING_CATEGORIES.find(...)` lookups must **fall back gracefully** when a resource
  carries a legacy category value no longer in the list (show the raw value / no chip
  rather than crashing). Legacy-tagged resources still appear under the "All" filter.

### Out of scope
No data migration of existing training resources. Old content remains visible under
"All"; re-tagging to carriers is a content task for Operations, done in the admin UI.

---

## Part 2 — Sales proof & product fields

### Current state
`SaleForm.tsx` "Sale Details" card holds only Sale Type + Notes. `Sale` /
`CreateSaleData` (`src/types/sales.ts`) have no proof or product-name fields. Sales are
created via `POST /api/portal/sales` and viewed in `SaleDetailSheet.tsx`.

### New fields (added to the "Sale Details" card)
1. **Order Number / BTN** — single free-text input labeled "Order Number or BTN". The
   rep enters whichever their carrier uses. (Carrier→field mapping is undecided; one
   combined field now, can split into carrier-specific labels later.)
2. **Screenshot** — optional image upload, reusing `FileUpload` +
   `POST /api/portal/forms/upload`.
3. **Product Sold** — free-text input; required. Works for every carrier, including
   Xfinity/DirecTV which have no entries in the fiber plan picker.

### Validation rule (proof of sale)
**At least one of** Order Number / BTN **or** a screenshot must be provided — a rep can
never submit with neither. If they have the order number/BTN they type it; if they don't,
the screenshot satisfies the requirement. Product Sold is independently required.

Enforced client-side in `SaleForm` (blocks submit with a clear message) and server-side
in the `POST /api/portal/sales` route (rejects with 400 if neither proof is present).

### Data model (`src/types/sales.ts`)
Add optional fields to both `CreateSaleData` and `Sale`:
- `orderNumberOrBtn?: string`
- `proofScreenshotPath?: string`  — folder path returned by the upload endpoint
- `productSold?: string`

### Upload wiring
- `src/lib/forms/formUploads.ts`: add `'sale-proof': ['']` to `FORM_UPLOAD_SLOTS` so the
  generic upload endpoint accepts `formType=sale-proof`.
- `SaleForm` renders `FileUpload` with `uploadUrl=/api/portal/forms/upload`,
  `formType=sale-proof`, an auth header getter (matching other form uploads), and stores
  the returned `path` as `proofScreenshotPath`.
- `POST /api/portal/sales` persists the three new fields (falling back to `''`/`null`).
- `SaleDetailSheet.tsx`: display Order Number / BTN and Product Sold as `Field`s, and,
  when a screenshot path exists, a "View screenshot" link that signs the object via the
  existing forms-attachment viewer (`/api/portal/forms/attachment`).

### Edit path
`src/app/portal/sales/[id]/edit` and `PUT /api/portal/sales/[id]` should carry the new
fields through so admin edits don't wipe them. (Confirm scope during planning.)

---

## Testing
- Unit: `formOptions`/`formUploads` allowlist includes `sale-proof`; training category
  constants match the four carriers.
- Form validation: submit blocked when both Order#/BTN and screenshot are empty; allowed
  when either is present; Product Sold required.
- Manual: pills filter training; sale detail shows new fields + screenshot link.

## Open items
- Carrier → (Order Number vs BTN) mapping still TBD; combined field is the interim.
