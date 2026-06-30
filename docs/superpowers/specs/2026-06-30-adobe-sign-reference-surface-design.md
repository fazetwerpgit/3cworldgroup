# Phase 3 — Adobe Sign Reference Surface

**Date:** 2026-06-30
**Status:** Design — approved in brainstorm (plain-language), pending build
**Scope:** Visually distinguish the three e-sign onboarding items (Contract / Direct Deposit / Compensation) as "signed in Adobe Sign," guide reps to confirm, and show management a badge + dashboard link on review.
**Nature:** Purely additive + presentational. No data-model change, no route/API change. Mirrors P1's `isStorageItem` branch pattern with an `isEsignItem` branch.

---

## 1. Problem & Goal

Three onboarding items are `referenceKind: 'esign'`, `signatureProvider: 'adobe_sign'`:

| id | label |
| --- | --- |
| `contract` | Contract |
| `direct_deposit` | Direct Deposit |
| `pay_structure` | Compensation |

Today they fall through to the generic free-text reference field with no Adobe Sign distinction — reps don't know signing happens elsewhere, and reviewers get no signal.

**Goal:** badge these three items as "Adobe Sign," guide the rep to confirm after signing externally, and show management the badge + a static link to the Adobe Sign dashboard on review. Signing itself stays **outside the app** (locked decision: manual, no Adobe Sign API).

**Non-goals:** Adobe Sign API integration (send-for-signature, webhooks, status sync); per-agreement deep links; any new field or persistence; changing the other reference kinds.

---

## 2. Locked Decisions (from brainstorm)

1. **Manual, no API.** Signing happens in Adobe Sign outside the portal. The portal only badges + captures a free-text confirmation in the existing `reference` field.
2. **No per-agreement deep link.** Admin review links to the Adobe Sign dashboard home (`https://secure.adobesign.com/public/agreements`) — agreement deep links aren't reliably constructible without the API and would break on free-text references.
3. **Rep capture = badge + helper + existing reference field.** Rep-facing copy: **"Sign this in Adobe Sign, then confirm here once it's done."** The reference input is the existing field, relabeled.
4. **Admin review = badge + reference text + static dashboard link.**

---

## 3. Data Model

No change. The three items already carry `referenceKind: 'esign'` + `signatureProvider: 'adobe_sign'`. The rep's confirmation is stored in the existing `UserOnboardingItem.reference` field — same field, same submit/review endpoints as every other item.

---

## 4. Components & Changes

### 4.1 `src/lib/onboarding/esign.ts` (NEW)

Pure helper, mirrors `src/lib/onboarding/uploads.ts`:

- `ESIGN_ITEM_IDS: string[]` — derived from `ONBOARDING_ITEMS.filter(i => i.referenceKind === 'esign')` (→ `contract`, `direct_deposit`, `pay_structure`).
- `isEsignItem(itemId: string): boolean`.
- `ADOBE_SIGN_DASHBOARD_URL = 'https://secure.adobesign.com/public/agreements'`.
- `ESIGN_HELPER_TEXT = 'Sign this in Adobe Sign, then confirm here once it\'s done.'` (single source for the rep copy).

### 4.2 `src/app/onboard/[token]/page.tsx` (CHANGED)

Add an `isEsignItem(item.id)` branch in the item render, before the existing `isStorageItem` branch (the two are mutually exclusive per item). The esign branch renders:
- An "Adobe Sign" `Badge`.
- `ESIGN_HELPER_TEXT` as helper copy.
- The existing reference `Textarea`/input (relabeled placeholder, e.g. "Adobe Sign confirmation"), wired to the same `references[item.id]` it uses today.

Non-esign, non-storage items keep the existing generic field.

### 4.3 `src/app/portal/onboarding/page.tsx` (CHANGED)

Same `isEsignItem(submitModal.id)` branch inside the submit dialog, before the `isStorageItem` branch: badge + helper + the existing reference input. The submit flow is unchanged (it already sends `reference`).

### 4.4 `src/app/portal/admin/onboarding/page.tsx` (CHANGED)

The `Submission` interface already carries `referenceKind`. Add a `referenceKind === 'esign'` branch next to the existing `=== 'storage'` branch:
- An "Adobe Sign" badge + the reference text (same "Reference:" block style as the manual/vendor fallback).
- A static link to `ADOBE_SIGN_DASHBOARD_URL` ("Open Adobe Sign ↗", `target="_blank" rel="noopener noreferrer"`).

Storage items and text (manual/vendor) items render exactly as today.

---

## 5. Data Flow

A rep opens an esign item → signs in Adobe Sign (external) → types a confirmation in the reference field → submits via the existing endpoint (no change). Management opens the review queue → the esign submission shows the Adobe Sign badge + the confirmation text + the dashboard link. No new persistence or endpoint touched.

---

## 6. Error Handling

Nothing new. The reference is free text passing through the existing submit validation (the `looksLikeRawSensitiveData` guard already applies to sensitive items; `direct_deposit` is sensitive, so that guard still runs unchanged). Static external link cannot break.

---

## 7. Testing

- **`src/lib/onboarding/esign.ts` → Vitest:** `isEsignItem` true for `contract`/`direct_deposit`/`pay_structure`, false for `w9`/`background_check`/`onboarding_submission`; `ESIGN_ITEM_IDS` has exactly those three.
- **UIs:** `npx tsc --noEmit` + `npm run build` green; manual — confirm the three items show the badge + helper on both onboarding pages, and the badge + reference + link on admin review; confirm a non-esign item is visually unchanged.

---

## 8. Out of Scope (queued)

Adobe Sign API integration; per-agreement deep links; status auto-sync; any change to storage/vendor/manual items.
