# 3C Leads Request — Native Form Design

**Status:** approved (layout = smart/conditional, confirmed by user 2026-06-30)
**Replaces:** Formstack `forms/3c_leads_request`
**Maps to:** NEW portal form #3 of the Formstack-replacement set (5th form rebuilt overall).

## Goal
Rebuild the Formstack "3C Leads Request" natively in the portal: a rep/manager
requests leads or a territory change. It is the largest of the intake forms — 15
fields and **3 separate file uploads** — and rides on the reusable rep-forms
foundation (`submitFormRecord` / `reviewQuery` / `markHandled` / `ReviewList` /
`FileUpload`) plus the generic upload route we built for Payroll Dispute.

## Audience & auth
- **Rep page** (`/portal/leads-request`): any authenticated user. Submits under a
  VERIFIED Firebase token (`requireVerifiedUser`) — identity stamped server-side.
- **Admin page** (`/portal/admin/leads-requests`): `admin` + `operations` only,
  via `requireVerifiedManagement`. Exposes the submissions + signed attachment URLs.

## Fields (verbatim from the Formstack PDF)

### Always shown (core)
| Field | Type | Required | Source list |
|---|---|---|---|
| Campaign | select | ✅ | `LEADS_CAMPAIGNS` = `T-Fiber, Verizon, AT&T` |
| 3C Manager Name | select | ✅ | `LEADS_MANAGERS` = `Jordan Zuber, Will Teasdale, Jeremy McFarland` |
| 3C Manager Email | email input | ✅ | — |
| Rep First Name | text | ✅ | — |
| Rep Last Name | text | ✅ | — |
| Leads Request Location | select | ✅ | `LEADS_LOCATIONS` (12, verbatim below) |
| Leads Request Category | select | ⬜ | `LEADS_CATEGORIES` (5, verbatim below) |
| Reason for Request | select | ⬜ | `LEADS_REASONS` (4, verbatim below) |

`LEADS_LOCATIONS` (verbatim, order preserved):
`Des Moines IA`, `St Joeseph MO`, `Iowa City IA`, `Davenport/Moline IA`,
`Rochester MN`, `Geneva IL`, `Grand Rapids MI`, `Lansing MI`,
`Colorado Springs CO`, `Westminster CO`, `Aurora CO`,
`What ever you feel as the best potential to make sales`, `Special Request`.

`LEADS_CATEGORIES` (verbatim): `New Rep that needs leads and Salesrabbit Logins`,
`Returning pack`, `Assign new leads and Returning Pack`,
`Road trip ending Returning Pack`, `Another Rep Blind Knocking territory Assigned to 3C Rep`.

`LEADS_REASONS` (verbatim): `New rep neads logins and leads assigned`,
`Terrtory has been worked and knocked multiple times with 2-3 knock dispositions`,
`Hostile situation happened a the territory, requesting switch`,
`another rep was caught knocking in our reps territory`.

> Spelling is intentionally preserved from the source form so option strings match
> historical data and manager expectations. Do not "fix" them.

### Conditional (shown only when relevant)
Derived booleans on the client; the server re-derives the same predicates and
**ignores** (drops to empty) any conditional value whose trigger isn't met, so a
crafted request can't smuggle irrelevant data.

| Conditional field | Type | Shown when |
|---|---|---|
| Special Request Explanation | textarea | `location === 'Special Request'` |
| Lead Pack Code | text | `category` ∈ the three "…Returning…" categories |
| Situation Description | textarea | `needsHostile \|\| needsBlindKnock` |
| Hostile upload (police report/texts/photos) | file (slot `hostile`) | `needsHostile` |
| Blind-knocking upload | file (slot `blind-knock`) | `needsBlindKnock` |
| Lasso screenshot upload | file (slot `lasso`) | `needsLasso` |
| New-rep SalesRabbit Phone | tel input | `needsNewRep` |
| New-rep SalesRabbit Email | email input | `needsNewRep` |

Predicates (single source of truth, exported for reuse by page + route):
- `needsHostile`   = reason is the "Hostile situation happened…" reason.
- `needsBlindKnock`= reason is "another rep was caught knocking…" OR category is
  "Another Rep Blind Knocking territory Assigned to 3C Rep".
- `needsLasso`     = reason is "Terrtory has been worked and knocked multiple times…".
- `needsNewRep`    = reason is "New rep neads logins and leads assigned" OR
  category is "New Rep that needs leads and Salesrabbit Logins".
- `needsLeadPackCode` = category ∈ {`Returning pack`, `Assign new leads and Returning Pack`, `Road trip ending Returning Pack`}.

## Uploads — multi-slot foundation change
The generic upload route (`/api/portal/forms/upload`) currently deletes the entire
`form-attachments/{uid}/{formType}/` folder before saving (guarantees one file per
form). Leads Request needs 3 independent attachments, so we add an optional **slot**:

- `buildFormAttachmentFolder(uid, formType, slot?)`:
  - no slot → `form-attachments/{uid}/{formType}/` (unchanged; Payroll still works)
  - with slot → `form-attachments/{uid}/{formType}/{slot}/`
- Upload route: allowlist `formType` (`payroll-dispute`, `leads-request`) AND, per
  formType, allowlist the permitted `slot` values. For `leads-request`:
  `hostile`, `blind-knock`, `lasso`. For `payroll-dispute`: none. An invalid
  slot → 400. The delete-before-write then clears only that slot's subfolder.
- Attachment-view route is unchanged: it lists `getFiles({prefix})` under whatever
  folder path is submitted and signs `files[0]`. With one file per slot folder, each
  of the 3 paths resolves to exactly its own attachment.

Storage paths saved on the record (each validated server-side to equal the caller's
own expected folder, exactly like Payroll's `orderScreenshotPath`):
`hostileUploadPath`, `blindKnockUploadPath`, `lassoUploadPath`.

## Data model — `leadsRequests` collection
Server-only (Admin SDK) writes; Firestore rules `allow read, write: if false` (same
as `fiberReports` / `expediteOrders` / `payrollDisputes`). Document fields:
`campaign, managerName, managerEmail, repFirstName, repLastName, location,
category, reason, specialRequest, leadPackCode, situationDescription,
hostileUploadPath, blindKnockUploadPath, lassoUploadPath, newRepPhone,
newRepEmail` + foundation stamps (`repUid/repName/repEmail/status/createdAt/updatedAt`).
Conditional fields that weren't triggered are stored as empty strings.

## Admin review
`/portal/admin/leads-requests` reuses `ReviewList` (columns: Submitted by, Campaign,
Manager, Rep, Location, Category, Reason, Submitted) + `Mark handled`. Below the
list, a per-row "Attachments" block shows up to 3 "View …" buttons (only for the
paths that exist), each minting a 15-min signed URL via the existing attachment route.

## Testing
- `formOptions`: assert the 3 new lists equal the verbatim arrays.
- `leadsPredicates`: table-driven — each reason/category maps to the correct
  `needs*` booleans; empty/unknown inputs yield all-false.
- `formUploads`: `buildFormAttachmentFolder` with and without slot; slot allowlist
  helper accepts valid slots and rejects unknown ones per formType.

## Out of scope (YAGNI)
No territory/pipeline auto-assignment, no notifications/email, no edit-after-submit,
no file preview thumbnails. Submissions land in the review queue; ops acts manually —
same as the other rebuilt forms.
