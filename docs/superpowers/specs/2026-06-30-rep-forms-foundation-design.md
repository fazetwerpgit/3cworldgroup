# Phase 4 (Slice 3) — Rep Forms Foundation + 2 Simple Forms

**Date:** 2026-06-30
**Status:** Design — approved in brainstorm (plain-language), pending spec review
**Scope:** A reusable foundation for portal-native rep forms, plus the first 2 (no-upload) forms — **New Fiber Report** and **Expedite Internet Order** — each with a logged-in rep submit page and a management review list.
**Nature:** Additive. Establishes the pattern that the remaining Formstack forms reuse. Grounded in a verification pass of the existing code (see §9 findings).

---

## 1. Problem & Goal

To cancel Formstack, its forms must be rebuilt natively. Two of the simplest — New Fiber Report (rep knock metrics) and Expedite Internet Order (rep requests a faster install) — are pure "fill fields → submit → management reviews" with no file uploads. Building them on a **reusable foundation** makes the remaining forms fast and consistent.

**Goal:** a logged-in rep opens a form inside the portal (name/email auto-filled), submits it, the submission saves to Firestore, and management (admin/operations) sees it in a review list. A shared submit-helper + review-list pattern is established for reuse.

**Non-goals (this slice):** the 2 upload forms (Payroll Dispute, Leads Request — need a generic upload foundation, next slice); the 2 existing-form parity checks (Application, Sale); email notifications; approve/reject *workflow* beyond viewing (these forms are informational — a simple "mark handled" status is enough, no rejection-reason flow).

---

## 2. Locked Decisions (from brainstorm)

1. **Submissions save to the portal DB + appear in a management review list** (no dependence on email). Modeled on the existing onboarding review queue.
2. **Reviewers: management (admin + operations).** *Note from verification:* the server `requireManagement` helper means admin/operations only; managers (L1/L2) are NOT included by it. We use `requireManagement` for these review lists — admin/operations only — matching the onboarding review queue exactly. (Widening to L1/L2 later is a deliberate helper change, not assumed here.)
3. **Reps fill the forms while logged into the portal.** Rep identity (uid/name/email) comes from `AuthContext`; the server stamps the canonical rep from the verified user doc.
4. **Build a reusable foundation:** a shared submit helper + a reusable review-list component/API shape; each form is a thin config (its fields + collection name).
5. **2 simple forms only this slice;** the 2 upload forms are a separate next slice.

---

## 3. Data Model

Two new Firestore collections, **server-only write** (Admin SDK), management-read — same convention as `userOnboarding`:

```
fiberReports/{id}:
  repUid, repName, repEmail            // stamped server-side from the verified user
  companySold                          // T-Fiber|Verizon|AT&T|Frontier|Spectrum
  dateKnocked, packNumber, numberOfReps, doorsKnocked,
  customerContacts, numberOfSales, orderNumber   // text/number fields
  status: 'new' | 'handled'
  createdAt, updatedAt

expediteOrders/{id}:
  repUid, repName, repEmail
  customerName, customerPhone, customerEmail, customerAddress (address/city/state/zip),
  orderNumber, expediteDates, reason   // reason ∈ {Install too far out, Tech missed install, Customer no-showed}
  status: 'new' | 'handled'
  createdAt, updatedAt
```

No `User` change. No raw PII (these are customer/operational fields, not SSN/DL).

---

## 4. Components & Changes

### 4.1 Shared foundation

- **`src/lib/forms/submitForm.ts` (NEW)** — a server helper used by each form's submit route. Signature: `submitFormRecord(collection: string, repUid: string, fields: Record<string, unknown>): Promise<{ id: string }>`. It loads `users/{repUid}` to stamp canonical `repName`/`repEmail` (per verification: `getRequester` doesn't return email, so the route loads the user doc), sets `status: 'new'`, `createdAt`/`updatedAt`, and writes via Admin SDK. The route (not this helper) does the auth gate + field validation.
- **`src/components/forms/ReviewList.tsx` (NEW)** — a reusable management review component. Props: `{ title, columns, rows, onMarkHandled }`. Renders the FIFO card/table list, empty state, a "Mark handled" action per row. Mirrors the onboarding review UI structure (which renders inner content only — the admin layout provides header/sidebar).
- **`src/lib/forms/reviewQuery.ts` (NEW)** — a server helper for the review GET: gate with `requireManagement(requestedBy)`, query the collection (newest-or-oldest first), convert Firestore timestamps with `.toDate()`, return `{ submissions }`. Each form's review route calls it with its collection name.

### 4.2 New Fiber Report

- **Rep page `src/app/portal/fiber-report/page.tsx` (NEW)** — under `ProtectedRoute`, `useAuth()` for the rep; renders the fields (company-sold dropdown + the numeric/text fields); auto-fills rep name/email read-only; POSTs to its submit route.
- **Submit route `src/app/api/portal/forms/fiber-report/route.ts` (NEW)** — `POST`: gate with `requireSelfOrManagement(requestedBy, requestedBy)` (a rep submits as themselves; the route ensures the stamped rep is the verified caller), validate fields, call `submitFormRecord('fiberReports', repUid, fields)`.
- **Review route `src/app/api/portal/forms/fiber-report/review/route.ts` (NEW)** — `GET` via `reviewQuery('fiberReports', ...)`; `POST` to set `status: 'handled'` (gated `requireManagement`).
- **Review page `src/app/portal/admin/fiber-reports/page.tsx` (NEW)** — `ProtectedRoute roles={['admin','operations']}`, renders `<ReviewList>` from the GET.

### 4.3 Expedite Internet Order

Same four pieces, collection `expediteOrders`, routes under `forms/expedite-order/`, rep page `src/app/portal/expedite-order/page.tsx`, review page `src/app/portal/admin/expedite-orders/page.tsx`. Customer address reuses the `US_STATES` dropdown + `validateAddress` helper from the address slice.

### 4.4 Navigation + rules

- **`src/components/portal/PortalSidebar.tsx` (CHANGED)** — add rep-facing nav links (Fiber Report, Expedite Order) and admin-section links to the two review lists, role-gated (UI gating only — the routes are the real gate). Use distinct href prefixes (verification: active-match is `startsWith`).
- **`firestore.rules` (CHANGED)** — add `fiberReports` + `expediteOrders` as `allow read, write: if false` (server-only; client never reads/writes directly — all via Admin SDK routes).

---

## 5. Data Flow

Rep opens the form (logged in) → name/email auto-filled → fills fields → POST to the form's submit route → route verifies the caller, stamps canonical rep from `users/{uid}`, writes the record (`status: 'new'`) → management opens the form's review list → GET (management-gated) returns submissions newest-first → manager reviews, clicks "Mark handled" → status → `'handled'`.

---

## 6. Validation, Auth & Error Handling

- **Every API route is server-gated** (verification: hiding nav/`ProtectedRoute` is UI-only). Submit routes use `requireSelfOrManagement` so a rep can only submit as themselves; review routes use `requireManagement`.
- **Canonical rep stamping:** the server ignores any client-supplied repName/email and loads them from `users/{uid}` — the client can't spoof identity.
- **Field validation** server-side: required fields present; dropdown values constrained to their option lists; numeric fields coerced/bounded; address (Expedite) via `validateAddress`.
- **Timestamps** converted with `.toDate()` before JSON (verification gotcha).
- **Mark-handled** re-reads the doc and only transitions `new → handled` (state guard, per verification).
- No file uploads, no sensitive PII in this slice.

---

## 7. Testing

- **`submitForm.ts` / `reviewQuery.ts` → Vitest** where logic is pure-ish (field stamping shape, status defaults); route-level auth is integration (manual).
- **Form option lists** (company-sold, expedite reasons) → Vitest exact-value checks.
- **Build/flow:** `tsc` + `build` green; manual — log in as a rep, submit each form, confirm it saves; log in as admin, confirm it appears in the review list and "Mark handled" works; confirm a non-management user cannot hit the review API.

---

## 8. Out of Scope (queued)

The 2 upload forms (Payroll Dispute, Leads Request) + the generic form-attachment upload foundation they need; Application + Sale parity checks; email notifications; richer review workflow (assignment, comments); widening review access to L1/L2 managers.

---

## 9. Grounding (from the pre-spec verification pass)

A 3-agent verification of the real code established: (a) the onboarding **upload** system is onboarding-specific and would need real adaptation — hence uploads are deferred to a later slice; (b) the **review-queue** pattern (onboarding admin review + `requireManagement`) is the right model to replicate, NOT the sales approve route (which is under-gated); (c) **nav + folder + rules conventions** are clean to reuse. Key gotchas folded into §4/§6: server-gate every route, stamp identity server-side, convert timestamps, state-guard status transitions, distinct nav href prefixes, admin pages render inner content only (layout provides chrome).
