# Manager Final Interview — Native Form Design

**Status:** approved (user 2026-06-30). The LAST Formstack form; after this the subscription can be cancelled.
**Replaces:** Formstack `forms/hire_candidate_manager`.

## Goal
Rebuild the "Manager Final Interview Submission Form" natively: a manager records a
hire decision on a candidate (show/no-show, rating, extend offer) and signs off with a
drawn signature. Reads its dropdowns from the editable form-options system; records
to its own review list. No recruiting-pipeline wiring in v1 (record-only).

## Audience & auth
- **Submit page** (`/portal/manager-interview`): field managers (`l1_manager`,
  `l2_manager`) + `admin` + `operations`. Gated via `ProtectedRoute roles={[...]}`
  and server-side `requireVerifiedManagement` is too narrow (excludes field managers),
  so submit uses a NEW gate `requireVerifiedFieldOrManagement` (see below).
- **Admin review** (`/portal/admin/manager-interviews`): `admin` + `operations` via
  `requireVerifiedManagement` (same as every other review page).

### New auth gate
`requireVerifiedFieldManagerOrManagement(request)` in `requireVerifiedAdmin.ts`:
verifies the token, resolves roles, allows `admin | operations | l1_manager |
l2_manager`; returns `{ ok, uid, name, email }` like `requireVerifiedUser`. Used only
by the manager-interview submit route (managers must be able to submit their own hire
decisions, but not every rep).

## Fields (from the Formstack PDF, with the agreed corrections)
Dropdowns marked **(editable)** resolve from the form-options system.

| Field | Type | Required | Source |
|---|---|---|---|
| Internet Provider | select | ✅ | `providers` (editable) |
| Job Position | select | ✅ | `hireJobPositions` (editable; default = app roles) |
| Hiring Manager | select | ✅ | `hireManagers` (editable; default Jacob/Will/Jeremy) |
| Hiring Manager Email | email | ✅ | — |
| Candidate First Name | text | ✅ | — |
| Candidate Last Name | text | ✅ | — |
| Candidate Email | email | ✅ | — |
| Market | select | ✅ | `hireMarkets` (editable; default empty — user fills in) |
| Did Candidate Show | Yes/No | ✅ | fixed |
| Extend Offer | Yes/No | ✅ | fixed |
| Rate Candidate | 1–5 | ✅ | fixed |
| Manager Signature | drawn | ✅ | signature pad → PNG data URL |

### Conditional — "For Promotion Only" (3 questions)
Shown only when the selected Job Position is a **promotion role** (anything other than
"Account Executive" — i.e. L1/L2 Manager and any future GM/Director/etc. the admin
adds). Predicate: `isPromotionRole(jobPosition) = jobPosition !== 'Account Executive'`.
When hidden, the three values are stored as empty. Each is Yes/No:
- Completed Production Requirements?
- Completed Reading Assignments?
- Completed Training and Developing Team to Sales Per Rep Daily Metric?

> Note: because job positions are admin-editable, the predicate keys off the ONE
> non-promotion role ("Account Executive"). If the admin renames that role, they should
> keep an entry-level role recognizable; documented in the editor. This is the pragmatic
> v1 rule (YAGNI vs. a per-role promotion flag).

## Signature capture
- A small reusable `SignaturePad` component (`src/components/forms/SignaturePad.tsx`):
  an HTML canvas (~600×200) the user draws in with mouse or touch; a "Clear" button;
  `onChange(dataUrl: string | null)` fires with a PNG data URL (or null when cleared).
- Stored INLINE on the record as `signatureDataUrl` (a `data:image/png;base64,...`
  string). Signatures are tiny (~10–30 KB) — well under Firestore's 1 MB doc limit —
  so no Storage round-trip or signed URLs needed. The admin page renders `<img>` directly.
- Server validation: `signatureDataUrl` must start with `data:image/png;base64,` and be
  ≤ 200 KB; otherwise the submission is rejected (required field).

## Data model — `managerInterviews` collection
Server-only writes; Firestore `allow read, write: if false`. Fields: `provider,
jobPosition, hiringManager, hiringManagerEmail, candidateFirstName, candidateLastName,
candidateEmail, market, didShow (bool), extendOffer (bool), rating (1–5 number),
completedProduction, completedReading, completedTeamMetric (bools|null via empty),
signatureDataUrl` + foundation stamps (`repUid/repName/repEmail/status/createdAt/updatedAt`).
The `repUid/repName` capture WHO submitted (the manager), from the verified token.

## Admin review
`/portal/admin/manager-interviews` reuses `ReviewList` (columns: Submitted by, Candidate,
Provider, Position, Manager, Market, Show?, Offer?, Rating, Submitted) + Mark handled +
Download CSV (via the existing `downloadFilename` prop). Below the list, each row shows
its signature image (`<img src={row.signatureDataUrl}>`). CSV omits the signature blob
(it's an image, not a cell) — export the text columns only.

## Testing
- `isPromotionRole`: 'Account Executive' → false; 'L1 Manager'/'L2 Manager'/'Director' → true; '' → false.
- `validateSignatureDataUrl`: accepts a valid small `data:image/png;base64,...`; rejects
  non-png prefixes, empty, and over-size strings.

## Out of scope (YAGNI)
No pipeline auto-advance (record only), no e-sign vendor, no candidate matching, no
notifications (that's the separate deferred alerts slice), no editing after submit.
