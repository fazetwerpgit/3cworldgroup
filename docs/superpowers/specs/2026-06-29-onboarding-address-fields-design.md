# Phase 2 (Slice A) — Onboarding Address Fields

**Date:** 2026-06-29
**Status:** Design — approved in brainstorm, pending spec review
**Scope:** Address intake (`address`/`city`/`state`/`zip`) for the employee-portal onboarding system
**Nature:** Purely additive wiring. No data-model change — `User` already types these four fields; they are orphaned (defined but never read/written below the type layer). This slice finishes the half-done wiring (only `city`, only on the public flow today).

---

## 1. Problem & Goal

`src/types/auth.ts` defines four optional contact-address fields on `User` (lines 150-153: `address`, `city`, `state`, `zip`), but nothing below the type layer reads or writes them end-to-end. Only `city` is partially wired — captured on the public onboarding flow and persisted by the public submit route. `address`/`state`/`zip` exist nowhere in any form, route, or display.

**Goal:** capture the full address at two points (public onboarding flow + admin UserForm), persist it consistently across the create/update/public routes, and surface it read-only in the rep's Settings page and the admin user view. Light validation only; all four fields optional.

**Non-goals (this slice):** the IBO owner picker (separate next slice); external address-verification/autocomplete APIs; making address editable on Settings; admin pre-fill of address at invite time; any change to the `OnboardingInvite` type or the recruiting invite form.

---

## 2. Locked Decisions (from brainstorm)

1. **Slice scope: address fields only.** The IBO owner picker is a separate later slice.
2. **Capture at two points:** the public onboarding flow (candidate self-service) AND the admin UserForm (create + edit).
3. **All four fields optional** — blank never blocks onboarding submit or user create/edit.
4. **Light validation:** `state` chosen from a 50-state (+DC) dropdown; `zip` must match `^\d{5}(-\d{4})?$` when non-empty; `address`/`city` are trimmed free text. No external verification API.
5. **Invite flow unchanged:** the candidate enters their own address during onboarding. No change to `OnboardingInvite` or the recruiting invite form.
6. **Settings shows address read-only.** Address is set only by onboarding + admin UserForm. `api/portal/profile` (PUT-only) is unchanged.

---

## 3. Data Model

No change. `User` already declares:

```ts
// src/types/auth.ts (existing)
address?: string;
city?: string;
state?: string;   // 2-letter US code
zip?: string;
```

All four are optional strings. Firestore `users` docs simply gain these keys when set. Reps with no address have the keys absent — every consumer treats absent as empty.

---

## 4. Components & Changes

### 4.1 `src/lib/validation/address.ts` (NEW)

A small pure module shared by client and server so validation never diverges.

- `US_STATES: { code: string; name: string }[]` — the 50 states + DC (51 entries), for the `<select>`.
- `isValidZip(zip: string): boolean` — `^\d{5}(-\d{4})?$` against the trimmed value.
- `AddressInput` / `AddressFields` types: `{ address?: string; city?: string; state?: string; zip?: string }`.
- `validateAddress(input: AddressInput): { ok: true; clean: AddressFields } | { ok: false; error: string }`:
  - Trims every field; caps `address`/`city` at 200 chars, `state`/`zip` at 20.
  - Empty everywhere → `{ ok: true, clean: {} }` (all optional).
  - Non-empty `zip` failing `isValidZip` → `{ ok: false, error: 'Enter a valid ZIP code (12345 or 12345-6789)' }`.
  - Non-empty `state` not in `US_STATES` codes → `{ ok: false, error: 'Select a valid state' }` (defensive; the dropdown already constrains this).
  - Returns only the keys that are non-empty after trimming (so we never write empty strings).

### 4.2 `src/app/onboard/[token]/page.tsx` (CHANGED)

The public onboarding "Portal Account" card currently has Name / Phone / City / Password. Add three inputs next to City, all wired into the existing `profile` state object (which already holds `city`):

- `address` — text input "Street Address".
- `state` — `<select>` populated from `US_STATES` (label "State", blank default).
- `zip` — text input "ZIP", with inline validity hint on blur using `isValidZip`.

All optional; no change to the submit-gating logic. The four fields ride along in the existing `POST` body (which already sends `...profile`).

### 4.3 `src/app/api/public/onboarding/[token]/route.ts` (CHANGED — additive)

Today builds `userProfile` with `city` only (from `clean(body.city)`). Change:

- Read `address`, `state`, `zip` from the body alongside `city`.
- Run `validateAddress({ address, city, state, zip })`; on `!ok`, return `400 { error }`.
- Spread the validated `clean` fields onto `userProfile` instead of the lone `city`.

No change to Auth user creation, the onboarding-items batch, or any other persisted doc.

### 4.4 `src/components/admin/UserForm.tsx` (CHANGED)

Add four inputs (Street Address, City, State `<select>` from `US_STATES`, ZIP) to the form, shown on both create and edit. Wire into the form's existing state. On edit, initialize from the user fetched via the `users/[id]` GET (which §4.6 makes return these fields).

### 4.5 `src/app/api/portal/auth/create-user/route.ts` (CHANGED — additive)

- Destructure `address`, `city`, `state`, `zip` from the body.
- `validateAddress(...)`; on `!ok`, return `400 { error }`.
- Spread the validated `clean` fields into `userProfile` (alongside the existing `phone`, etc.).

### 4.6 `src/app/api/portal/auth/users/[id]/route.ts` (CHANGED — additive)

- **GET:** add `address`, `city`, `state`, `zip` to the serialized `User` object (currently absent — without this the edit form and admin view render blank).
- **PUT:** accept the four fields; `validateAddress(...)` on the provided subset; persist with the existing `if (x !== undefined) updateData.x = x` pattern (one line per field). On validation failure return `400`.

### 4.7 `src/contexts/AuthContext.tsx` (CHANGED — additive)

The client `User` builder (lines 43-58) omits the address fields. Add `address: userData.address`, `city: userData.city`, `state: userData.state`, `zip: userData.zip` so the logged-in rep's address reaches the Settings page.

### 4.8 Read-only display (CHANGED)

- **`src/app/portal/settings/page.tsx`:** render the rep's address (from the AuthContext `user`) as read-only text — a labeled "Address" block showing `address`, `city, state zip` on a second line; show a muted "Not on file" when all four are empty.
- **Admin user view (`src/app/portal/admin/users/[id]/page.tsx`):** display the address read-only in the user detail surface (consumes the `users/[id]` GET). The create/edit form surfaces are `src/app/portal/admin/users/new/page.tsx` and the shared `UserForm.tsx` (§4.4).

---

## 5. Data Flow

**Public candidate:** fills address inputs → fields ride in the existing `POST [token]` body → `validateAddress` → persisted on `users/{uid}` at account creation. Later visible read-only in their Settings and in the admin user view.

**Admin-created user:** UserForm address inputs → `create-user` body → `validateAddress` → `users/{uid}`. Editable later via UserForm → `users/[id]` PUT.

**Rep viewing Settings:** AuthContext reads `users/{uid}` → maps the four fields into the client `User` → Settings renders them read-only.

---

## 6. Validation & Error Handling

- Single shared `validateAddress` on both client (instant feedback) and server (authority).
- Only an invalid non-empty `zip` (or a non-`US_STATES` `state`) produces an error; everything else is optional and trimmed.
- Server returns `400 { error }` on validation failure; no partial writes (single-doc writes, as today).
- Absent fields are never written as empty strings (helper returns only non-empty keys).

---

## 7. Testing

- **`src/lib/validation/address.ts` → Vitest** (pure, same pattern as P1's `uploads.ts`):
  - `isValidZip`: accepts `12345` and `12345-6789`; rejects `1234`, `123456`, `abcde`, empty.
  - `validateAddress`: all-empty → `{ ok: true, clean: {} }`; trims fields; drops empty keys; rejects bad zip; rejects unknown state code; caps long street/city.
  - `US_STATES`: has 51 entries (50 + DC), all 2-letter codes.
- **Routes/forms/display:** `npx tsc --noEmit` + `npm run build` green; manual check — create a candidate via the public flow with a full address, confirm it persists, renders in admin + settings, and a bad zip is rejected.

---

## 8. Out of Scope (queued)

- IBO owner picker + `iboOwnerId`/`iboName` wiring + `getOnboardingItemsForUser` change (next slice).
- External address verification / autocomplete.
- Editable address on Settings (`api/portal/profile`).
- Admin pre-fill of address at invite time.
