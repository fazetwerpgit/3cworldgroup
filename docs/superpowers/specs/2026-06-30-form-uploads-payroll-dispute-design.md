# Phase 4 (Slice 4) — Generic Form Uploads + Payroll Dispute

**Date:** 2026-06-30
**Status:** Design — approved in brainstorm (plain-language), pending spec review
**Scope:** A generic (non-onboarding) form-attachment upload system, proven on the Payroll Dispute form — a logged-in rep/contractor submits contractor + order details plus a screenshot upload; management reviews in a list and can view the attachment.
**Nature:** Additive. Reuses the rep-forms foundation (submit helper, ReviewList, verified auth) + the existing `FileUpload` component; the one new piece is a generic upload route + folder convention.

---

## 1. Problem & Goal

Two remaining Formstack forms have file uploads (Payroll Dispute, Leads Request). The verification pass found the onboarding upload system is onboarding-specific (locked to checklist item IDs + onboarding folder paths) and can't be reused as-is. This slice builds a **generic form-attachment upload** and proves it on the small Payroll Dispute form. Leads Request (3 uploads) is a follow-up slice on this proven base.

**Goal:** a rep opens Payroll Dispute (logged in), fills contractor + order fields, uploads a screenshot, submits; it saves to `payrollDisputes`; management sees it in a review list and views the screenshot via a signed URL.

**Non-goals:** Leads Request (next slice); making the upload support multiple files per field (Payroll Dispute needs one — multi-file is a Leads-Request concern); the 2 parity-check forms.

---

## 2. Locked Decisions (from brainstorm)

1. **Upload-first model:** the rep picks a file → it uploads immediately to a per-user form-attachments folder → the upload returns a storage path → that path rides in the form submission and is saved on the record. (Same proven model as onboarding DL-photo/badge upload.)
2. **Generic, NOT onboarding-coupled:** new folder convention `form-attachments/{uid}/{formType}/...`; a new upload route; reuse the existing `FileUpload` component as-is.
3. **Verified-token auth from the start** (the pattern we just hardened the rep forms to): the upload route and the submit route verify a real Firebase ID token; the review list requires verified management. No trust-the-UID.
4. **Management views the attachment via a signed URL** (admin/operations), same as badge photos.
5. **Payroll Dispute first; Leads Request next slice.**

---

## 3. Data Model

New Firestore collection, server-only write, management-read (same convention as `fiberReports`):

```
payrollDisputes/{id}:
  repUid, repName, repEmail       // stamped from the verified caller
  contractorName, contractorEmail
  campaign                        // T-Fiber|Frontier|AT&T|Verizon|Brightspeed|Centurylink/Quantum|Ripple
  typeOfOrder, dateOfInstall      // text
  orderScreenshotPath             // form-attachments folder path (storage)
  status: 'new' | 'handled'
  createdAt, updatedAt
```

The `User` type is unchanged. The campaign list is added to `src/lib/forms/formOptions.ts` (`PAYROLL_CAMPAIGNS`).

---

## 4. Components & Changes

### 4.1 Generic upload validation (`src/lib/forms/formUploads.ts`, NEW)

A small generic validator, separate from the onboarding `uploads.ts` (which is checklist-coupled):

- `FORM_ATTACHMENT_TYPES = ['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']` (order screenshots are usually images; allow PDF too).
- `MAX_FORM_FILE_BYTES = 4 * 1024 * 1024` (Vercel cap).
- `validateFormUpload({ mime, size }): { ok: true; ext } | { ok: false; error }` — type allowlist + size cap; extension from validated MIME.
- `buildFormAttachmentFolder(uid: string, formType: string): string` → `form-attachments/{uid}/{formType}/`.
- Unit-testable.

### 4.2 Generic upload route (`src/app/api/portal/forms/upload/route.ts`, NEW)

`POST` (multipart): verified-token auth (`requireVerifiedUser`); body `{ formType, file }`. Validates via `validateFormUpload`, writes to `form-attachments/{verifiedUid}/{formType}/file.<ext>` via the Admin SDK bucket, returns `{ path: folder }`. The folder is scoped to the verified caller's uid, so a rep can only write under their own folder. `formType` is constrained to a known allowlist (e.g. `['payroll-dispute']`) to prevent arbitrary folders.

### 4.3 Attachment view route (`src/app/api/portal/forms/attachment/route.ts`, NEW)

`GET ?path=<folder>`: verified-management auth (`requireVerifiedManagement`); validates the path starts with `form-attachments/`; lists files under the prefix, mints a 15-min signed URL for the first, returns `{ url }`. (Reuses the badge-photo signing approach; management-only since it could be any user's attachment.)

### 4.4 Payroll Dispute submit + review APIs

- `src/app/api/portal/forms/payroll-dispute/route.ts` (NEW) — `POST`, `requireVerifiedUser`; validate required fields (contractorName, contractorEmail, campaign ∈ list, typeOfOrder, dateOfInstall) and reject blanks; `orderScreenshotPath` must equal `buildFormAttachmentFolder(verifiedUid, 'payroll-dispute')` (scope check); `submitFormRecord('payrollDisputes', verifiedRep, fields)`.
- `src/app/api/portal/forms/payroll-dispute/review/route.ts` (NEW) — `GET` via `reviewQuery('payrollDisputes', request)`; `POST` via `markHandled('payrollDisputes', request, id)`. (Both already verified-management from the foundation.)

### 4.5 Payroll Dispute pages

- `src/app/portal/payroll-dispute/page.tsx` (NEW) — rep submit page (logged in), fields + a `FileUpload` for the screenshot (uploadUrl = the generic upload route, `extraFields: { formType: 'payroll-dispute' }`, `itemId` unused-but-required so pass `'payroll-dispute'`); the returned path goes into the submit body; sends `Authorization: Bearer` token.
- `src/app/portal/admin/payroll-disputes/page.tsx` (NEW) — verified-management review page using `ReviewList`; an extra "View screenshot" action per row that calls the attachment route and opens the signed URL.

### 4.6 `firestore.rules` + nav

- `payrollDisputes` → `allow read, write: if false`.
- `PortalSidebar.tsx` → a rep link (Payroll Dispute) + an operations link (Payroll Disputes review, `roles: ['admin','operations']`), distinct hrefs.

---

## 5. Data Flow

Rep opens Payroll Dispute → picks a screenshot → `FileUpload` POSTs it (with token) to the generic upload route → file lands in `form-attachments/{uid}/payroll-dispute/` → path returned → rep submits the form (token) → submit route verifies caller, validates fields + scopes the screenshot path to the caller's folder, stamps the rep, writes the record → management opens the review list (verified) → sees the dispute + a "View screenshot" button → attachment route mints a signed URL → screenshot opens.

---

## 6. Validation, Auth & Error Handling

- **Verified token on every route** (upload, submit, review GET/POST, attachment) — no trust-the-UID. Upload writes only under the verified caller's folder; submit scopes the screenshot path to that same folder.
- **Required fields rejected server-side** if blank; campaign validated against the list.
- **File validation:** type allowlist + 4 MB cap; extension from MIME, not filename.
- **Attachment view is management-only** (could be any user's file) and returns a time-limited signed URL, never a raw path.
- **mark-handled** is the foundation's atomic transaction (`new → handled`).

---

## 7. Testing

- **`formUploads.ts` → Vitest:** `validateFormUpload` accepts image + pdf, rejects other types + oversize; `buildFormAttachmentFolder` shape.
- **`formOptions.ts` → Vitest:** `PAYROLL_CAMPAIGNS` exact values.
- **Build/flow:** `tsc` + `build` green; manual — log in, upload a screenshot + submit a dispute, confirm it saves; as management, view the list + open the screenshot + mark handled; confirm a non-management user can't view attachments or the list.

---

## 8. Out of Scope (queued)

Leads Request (3 uploads, conditional fields) on this proven upload base; multi-file-per-field uploads; the 2 parity-check forms (Application, Sale); email notifications.
