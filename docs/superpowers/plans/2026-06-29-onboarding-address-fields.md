# Onboarding Address Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-typed-but-orphaned `User.address/city/state/zip` fields through public-onboarding + admin capture, the create/update/public persist routes, AuthContext, and a read-only Settings display.

**Architecture:** A single pure validation helper (`src/lib/validation/address.ts`) shared by client and server holds the 50-state list, zip regex, and a `validateAddress` function that trims fields, drops empties, and rejects a bad zip/state. Every capture form and persist route calls it; no data-model change (the four optional fields already exist on `User`).

**Tech Stack:** Next.js 16.1.1 (App Router), React 19.2.3, TypeScript 5 (strict), firebase-admin 13.6.0, Tailwind v4 + shadcn/ui (incl. existing `NativeSelect`), Vitest (helper unit tests only).

## Global Constraints

- **Additive only:** no `User` type change (fields already exist). No change to the `OnboardingInvite` type, the recruiting invite form, or `api/portal/profile`. The public submit's Auth-user creation and onboarding-items batch are unchanged.
- **All four fields optional** — blank never blocks any submit.
- **Validation:** `state` from a 50-state (+DC) dropdown; `zip` must match `^\d{5}(-\d{4})?$` when non-empty; `address`/`city` trimmed free text. No external API.
- **Field names everywhere:** `address`, `city`, `state`, `zip` (exact).
- **Reuse existing primitives:** the `NativeSelect`/`NativeSelectOption` component (`@/components/ui/native-select`) for the state dropdown; the existing `clean()`-style trimming pattern in routes.
- **Validation per task:** `npx tsc --noEmit` and `npm run build` stay green. `npm test` (vitest) for the helper task.
- **Commit hygiene:** stage only this task's files by explicit path. The repo has unrelated pre-existing uncommitted changes (`firestore.rules`, `src/types/*`, `src/components/admin/UserForm.tsx`*, `UserTable.tsx`) — *UserForm is modified by this plan; verify its diff before committing and include only this task's changes. Never `git add -A`.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/lib/validation/address.ts` (NEW) | US_STATES, isValidZip, validateAddress | 1 |
| `src/lib/validation/address.test.ts` (NEW) | Vitest for the helper | 1 |
| `src/app/api/public/onboarding/[token]/route.ts` (MODIFY) | persist address/state/zip on userProfile | 2 |
| `src/app/onboard/[token]/page.tsx` (MODIFY) | address/state/zip inputs beside City | 2 |
| `src/app/api/portal/auth/create-user/route.ts` (MODIFY) | accept+validate+persist 4 fields | 3 |
| `src/app/api/portal/auth/users/[id]/route.ts` (MODIFY) | GET serializes 4; PUT persists 4 | 3 |
| `src/components/admin/UserForm.tsx` (MODIFY) | 4 inputs (create+edit) | 4 |
| `src/contexts/AuthContext.tsx` (MODIFY) | map 4 fields into client User | 5 |
| `src/app/portal/settings/page.tsx` (MODIFY) | read-only Address block | 5 |

**Note on "admin user view":** the admin user detail page (`src/app/portal/admin/users/[id]/page.tsx`) renders `<UserForm user={user} isEdit />` — it is the edit form, not a separate read-only surface. So the spec's "admin user view" display is satisfied by Task 4 (UserForm fields) + Task 3 (GET serialization). No separate admin-display task.

---

## Task 1: Address validation helper + Vitest

**Files:**
- Create: `src/lib/validation/address.ts`
- Create: `src/lib/validation/address.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 2-5):
  - `US_STATES: { code: string; name: string }[]` (51 entries: 50 states + DC)
  - `isValidZip(zip: string): boolean`
  - `type AddressFields = { address?: string; city?: string; state?: string; zip?: string }`
  - `validateAddress(input: AddressFields): { ok: true; clean: AddressFields } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/validation/address.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { US_STATES, isValidZip, validateAddress } from './address';

describe('US_STATES', () => {
  it('has 51 entries (50 states + DC) with 2-letter codes', () => {
    expect(US_STATES).toHaveLength(51);
    for (const s of US_STATES) {
      expect(s.code).toMatch(/^[A-Z]{2}$/);
      expect(s.name.length).toBeGreaterThan(0);
    }
    expect(US_STATES.some((s) => s.code === 'DC')).toBe(true);
    expect(US_STATES.some((s) => s.code === 'CA')).toBe(true);
  });
});

describe('isValidZip', () => {
  it('accepts 5-digit and ZIP+4', () => {
    expect(isValidZip('12345')).toBe(true);
    expect(isValidZip('12345-6789')).toBe(true);
    expect(isValidZip('  12345 ')).toBe(true); // trimmed
  });
  it('rejects malformed zips', () => {
    expect(isValidZip('1234')).toBe(false);
    expect(isValidZip('123456')).toBe(false);
    expect(isValidZip('abcde')).toBe(false);
    expect(isValidZip('')).toBe(false);
  });
});

describe('validateAddress', () => {
  it('accepts all-empty input and returns an empty clean object', () => {
    expect(validateAddress({})).toEqual({ ok: true, clean: {} });
    expect(validateAddress({ address: '', city: '  ', state: '', zip: '' })).toEqual({
      ok: true,
      clean: {},
    });
  });

  it('trims and keeps only non-empty fields', () => {
    const r = validateAddress({ address: ' 1 Main St ', city: 'Austin', state: 'TX', zip: '78701' });
    expect(r).toEqual({
      ok: true,
      clean: { address: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' },
    });
  });

  it('accepts a valid ZIP+4', () => {
    const r = validateAddress({ zip: '78701-1234' });
    expect(r).toEqual({ ok: true, clean: { zip: '78701-1234' } });
  });

  it('rejects a non-empty invalid zip', () => {
    const r = validateAddress({ zip: '7870' });
    expect(r.ok).toBe(false);
  });

  it('rejects an unknown state code', () => {
    const r = validateAddress({ state: 'ZZ' });
    expect(r.ok).toBe(false);
  });

  it('caps overly long street and city', () => {
    const long = 'x'.repeat(300);
    const r = validateAddress({ address: long, city: long });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.clean.address!.length).toBe(200);
      expect(r.clean.city!.length).toBe(200);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./address` (module not created yet).

- [ ] **Step 3: Implement `src/lib/validation/address.ts`**

```typescript
// Shared address validation for onboarding intake. Client and server both call
// validateAddress so the rules never diverge. All four fields are optional.

export type AddressFields = {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export const US_STATES: { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

const STATE_CODES = new Set(US_STATES.map((s) => s.code));

export function isValidZip(zip: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(zip.trim());
}

// Trims every field, caps street/city at 200 chars, validates a non-empty zip
// and state, and returns only the keys that are non-empty (so empty strings are
// never written to Firestore). Empty input is valid (all fields optional).
export function validateAddress(
  input: AddressFields
): { ok: true; clean: AddressFields } | { ok: false; error: string } {
  const address = (input.address ?? '').trim().slice(0, 200);
  const city = (input.city ?? '').trim().slice(0, 200);
  const state = (input.state ?? '').trim().slice(0, 20);
  const zip = (input.zip ?? '').trim().slice(0, 20);

  if (zip && !isValidZip(zip)) {
    return { ok: false, error: 'Enter a valid ZIP code (12345 or 12345-6789)' };
  }
  if (state && !STATE_CODES.has(state)) {
    return { ok: false, error: 'Select a valid state' };
  }

  const clean: AddressFields = {};
  if (address) clean.address = address;
  if (city) clean.city = city;
  if (state) clean.state = state;
  if (zip) clean.zip = zip;
  return { ok: true, clean };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all assertions green.

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation/address.ts src/lib/validation/address.test.ts
git commit -m "feat: add shared address validation helper with vitest tests"
```

---

## Task 2: Capture + persist address on the public onboarding flow

**Files:**
- Modify: `src/app/api/public/onboarding/[token]/route.ts`
- Modify: `src/app/onboard/[token]/page.tsx`

**Interfaces:**
- Consumes: `validateAddress`, `US_STATES` (Task 1).
- Produces: a public candidate's address (`address`/`city`/`state`/`zip`) persisted on `users/{uid}`; the page's `profile` state gains `address`, `state`, `zip` (`city` already present) plus a `zipError` flag.

- [ ] **Step 1: Persist in the route**

In `src/app/api/public/onboarding/[token]/route.ts`, add the import alongside the existing `@/types` import:

```typescript
import { validateAddress } from '@/lib/validation/address';
```

Find where `city` is read (currently `const city = clean(body.city, 120) || data.candidateCity || '';`). Immediately after it, add:

```typescript
    const addressCheck = validateAddress({
      address: body.address,
      city,
      state: body.state,
      zip: body.zip,
    });
    if (!addressCheck.ok) {
      return NextResponse.json({ error: addressCheck.error }, { status: 400 });
    }
    const addressFields = addressCheck.clean;
```

Then in the `userProfile` object, replace the existing `city,` line with a spread of the validated fields:

```typescript
      ...addressFields,
```

(Remove the standalone `city,` property — `addressFields` now carries `city` when present. Keep `phone` and everything else unchanged.)

- [ ] **Step 2: Verify typecheck of the route**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Add the inputs to the page**

In `src/app/onboard/[token]/page.tsx`, add the imports (alongside the other component imports). The page does NOT yet import `NativeSelect`, so add both:

```typescript
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { US_STATES } from '@/lib/validation/address';
```

Extend the `profile` state initializer (currently `{ displayName: '', phone: '', city: '', password: '' }`) to:

```typescript
  const [profile, setProfile] = useState({
    displayName: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    password: '',
  });
```

Find the `setProfile({ ... })` call inside `loadInvite` (sets displayName/phone/city/password from the invite). Add the three new keys so the reset stays total:

```typescript
        setProfile({
          displayName: json.invite.candidateName || '',
          phone: json.invite.candidatePhone || '',
          address: '',
          city: json.invite.candidateCity || '',
          state: '',
          zip: '',
          password: '',
        });
```

Then locate the City field block (the `<Label>City</Label>` + its `<Input>`). Replace that single field's wrapping `<div>` with this group (Street full-width, then City / State / ZIP):

```tsx
              <div className="sm:col-span-2">
                <Label>Street Address</Label>
                <Input
                  value={profile.address}
                  onChange={(event) =>
                    setProfile((prev) => ({ ...prev, address: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label>City</Label>
                <Input
                  value={profile.city}
                  onChange={(event) =>
                    setProfile((prev) => ({ ...prev, city: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label>State</Label>
                <NativeSelect
                  value={profile.state}
                  onChange={(event) =>
                    setProfile((prev) => ({ ...prev, state: event.target.value }))
                  }
                  className="w-full"
                >
                  <NativeSelectOption value="">Select state</NativeSelectOption>
                  {US_STATES.map((s) => (
                    <NativeSelectOption key={s.code} value={s.code}>
                      {s.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <Label>ZIP</Label>
                <Input
                  value={profile.zip}
                  onChange={(event) =>
                    setProfile((prev) => ({ ...prev, zip: event.target.value }))
                  }
                  onBlur={() => setZipError(profile.zip !== '' && !isValidZip(profile.zip))}
                  placeholder="12345"
                />
                {zipError && (
                  <p className="mt-1 text-xs text-red-600">
                    Enter a valid ZIP (12345 or 12345-6789)
                  </p>
                )}
              </div>
```

The submit already sends `...profile`, so the new fields ride along with no change to the submit handler. The on-blur hint gives instant feedback per spec §6; the server still validates authoritatively.

This needs `isValidZip` in the import (update Step 3's import to include it) and a `zipError` state. Update the import added above to:

```typescript
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { US_STATES, isValidZip } from '@/lib/validation/address';
```

And add the state next to the existing `profile` state declaration:

```typescript
  const [zipError, setZipError] = useState(false);
```

- [ ] **Step 4: Verify typecheck + lint**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx eslint "src/app/onboard/[token]/page.tsx" "src/app/api/public/onboarding/[token]/route.ts"`
Expected: no errors.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/public/onboarding/[token]/route.ts" "src/app/onboard/[token]/page.tsx"
git commit -m "feat: capture and persist full address on public onboarding flow"
```

---

## Task 3: Accept, persist, and serialize address in admin user routes

**Files:**
- Modify: `src/app/api/portal/auth/create-user/route.ts`
- Modify: `src/app/api/portal/auth/users/[id]/route.ts`

**Interfaces:**
- Consumes: `validateAddress` (Task 1).
- Produces: create-user + PUT persist the four fields; the GET serializes them into the returned `User` (relied on by Task 4's edit form).

- [ ] **Step 1: create-user route**

In `src/app/api/portal/auth/create-user/route.ts`, add the import:

```typescript
import { validateAddress } from '@/lib/validation/address';
```

Add `address, city, state, zip` to the destructured `body`:

```typescript
    const {
      requestedBy,
      email,
      password,
      displayName,
      role,
      fieldRole,
      managerId,
      territoryId,
      phone,
      address,
      city,
      state,
      zip,
    } = body;
```

After the role validation (just before `adminAuth.createUser`), add:

```typescript
    const addressCheck = validateAddress({ address, city, state, zip });
    if (!addressCheck.ok) {
      return NextResponse.json({ error: addressCheck.error }, { status: 400 });
    }
```

In the `userProfile` object, spread the validated fields (after `phone`):

```typescript
      phone: phone || '',
      ...addressCheck.clean,
```

- [ ] **Step 2: users/[id] route — PUT persist + GET serialize**

In `src/app/api/portal/auth/users/[id]/route.ts`, add the import:

```typescript
import { validateAddress } from '@/lib/validation/address';
```

In the **GET** handler's serialized `user` object, add the four fields (after `phone: data?.phone,`):

```typescript
      phone: data?.phone,
      address: data?.address,
      city: data?.city,
      state: data?.state,
      zip: data?.zip,
```

In the **PUT** handler, add `address, city, state, zip` to the destructured body:

```typescript
    const { requestedBy, displayName, role, fieldRole, managerId, territoryId, phone, status, address, city, state, zip } = body;
```

After the `status` validation block (before building `updateData`), add:

```typescript
    const addressCheck = validateAddress({ address, city, state, zip });
    if (!addressCheck.ok) {
      return NextResponse.json({ error: addressCheck.error }, { status: 400 });
    }
```

Then, after the existing `if (phone !== undefined) updateData.phone = phone;` line, add. Per spec §6, empty strings are never written — when the caller clears a field, delete the key (the route already imports `FieldValue` from `firebase-admin/firestore`):

```typescript
    if (address !== undefined)
      updateData.address = addressCheck.clean.address ?? FieldValue.delete();
    if (city !== undefined)
      updateData.city = addressCheck.clean.city ?? FieldValue.delete();
    if (state !== undefined)
      updateData.state = addressCheck.clean.state ?? FieldValue.delete();
    if (zip !== undefined)
      updateData.zip = addressCheck.clean.zip ?? FieldValue.delete();
```

(`addressCheck.clean` only contains a key when it was non-empty, so a cleared field is `undefined` → `FieldValue.delete()` removes it from the doc rather than storing `''`. Consistent with §6 and with how the route already deletes `role`/`fieldRole`.)

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/portal/auth/create-user/route.ts" "src/app/api/portal/auth/users/[id]/route.ts"
git commit -m "feat: accept, persist, and serialize address in admin user routes"
```

---

## Task 4: Address inputs in the admin UserForm

**Files:**
- Modify: `src/components/admin/UserForm.tsx`

**Interfaces:**
- Consumes: `US_STATES` (Task 1); the `users/[id]` GET serialization (Task 3) for edit prefill; the create-user + PUT routes (Task 3) for persistence.
- Produces: admins can set/edit address on create and edit; serves as the admin "user view" display.

> **Commit rule for `UserForm.tsx` (it has pre-existing uncommitted changes):** before committing, run `git diff src/components/admin/UserForm.tsx` and confirm the diff contains exactly two things: (a) the pre-existing label-map change from earlier work, and (b) this task's address additions (Steps 1-4). If both are present and intended, `git add src/components/admin/UserForm.tsx` and commit. If the diff shows anything you did not expect, STOP and surface it to the controller rather than committing. Do not use `git add -A`.

- [ ] **Step 1: Add the import**

`UserForm.tsx` already imports `NativeSelect, NativeSelectOption`. Add:

```typescript
import { US_STATES } from '@/lib/validation/address';
```

- [ ] **Step 2: Extend formData state**

Add the four fields to the `formData` initializer (after `phone`):

```typescript
    phone: user?.phone || '',
    address: user?.address || '',
    city: user?.city || '',
    state: user?.state || '',
    zip: user?.zip || '',
```

- [ ] **Step 3: Send the fields in both submit bodies**

In the **edit** (`PUT`) body, insert these four lines immediately after the existing `phone: formData.phone,` line (do NOT repeat the `phone` line — it is already there):

```typescript
            address: formData.address,
            city: formData.city,
            state: formData.state,
            zip: formData.zip,
```

In the **create** (`POST`) body, insert the same four lines immediately after the existing `phone: formData.phone,` line (again, do NOT repeat `phone`):

```typescript
            address: formData.address,
            city: formData.city,
            state: formData.state,
            zip: formData.zip,
```

- [ ] **Step 4: Add the inputs to the Account Information card**

Inside the `Account Information` card's grid (the `<div className="grid grid-cols-1 gap-4 md:grid-cols-2">` that holds Email/Password/DisplayName/Phone), after the Phone field's closing `</div>`, add:

```tsx
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Street Address
              </label>
              <Input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="123 Main St"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                City
              </label>
              <Input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="Austin"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                State
              </label>
              <NativeSelect
                name="state"
                value={formData.state}
                onChange={handleChange}
                className="w-full"
              >
                <NativeSelectOption value="">Select state</NativeSelectOption>
                {US_STATES.map((s) => (
                  <NativeSelectOption key={s.code} value={s.code}>
                    {s.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                ZIP Code
              </label>
              <Input
                type="text"
                name="zip"
                value={formData.zip}
                onChange={handleChange}
                placeholder="78701"
              />
            </div>
```

- [ ] **Step 5: Verify typecheck + lint**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx eslint src/components/admin/UserForm.tsx`
Expected: no errors.

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/UserForm.tsx
git commit -m "feat: add address fields to admin user form"
```

---

## Task 5: Map address into AuthContext + read-only Settings display

**Files:**
- Modify: `src/contexts/AuthContext.tsx`
- Modify: `src/app/portal/settings/page.tsx`

**Interfaces:**
- Consumes: the `User` type's address fields (already exist); the Firestore `users` doc.
- Produces: the logged-in rep's address on the client `user`, shown read-only on Settings.

- [ ] **Step 1: Map the fields in AuthContext**

In `src/contexts/AuthContext.tsx`, in the object returned from the user-doc builder (the one with `phone: userData.phone,`), add after `phone`:

```typescript
          phone: userData.phone,
          address: userData.address,
          city: userData.city,
          state: userData.state,
          zip: userData.zip,
```

- [ ] **Step 2: Add the read-only Address block to Settings**

In `src/app/portal/settings/page.tsx`, inside the profile grid (`<div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">`), after the Phone field's closing `</div>` and before the Hire Date field, add:

```tsx
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Address
                      </label>
                      {user?.address || user?.city || user?.state || user?.zip ? (
                        <div className="text-gray-900">
                          {user?.address && <p>{user.address}</p>}
                          <p>
                            {[user?.city, user?.state].filter(Boolean).join(', ')}
                            {user?.zip ? ` ${user.zip}` : ''}
                          </p>
                        </div>
                      ) : (
                        <p className="text-gray-900">Not on file</p>
                      )}
                    </div>
```

> This block is read-only — it is NOT inside the `isEditing` conditional, so it always renders as text (address is set via onboarding/admin only, per the spec).

- [ ] **Step 3: Verify typecheck + lint**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx eslint src/contexts/AuthContext.tsx src/app/portal/settings/page.tsx`
Expected: no errors.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AuthContext.tsx src/app/portal/settings/page.tsx
git commit -m "feat: surface read-only address on settings via AuthContext"
```

---

## Final Verification (per spec §7)

- [ ] `npx tsc --noEmit` and `npm run build` green; `npm test` green.
- [ ] Create a candidate via the public token flow with a full address; confirm `users/{uid}` holds `address/city/state/zip`.
- [ ] Open that user in admin edit (`/portal/admin/users/{id}`); confirm the address prefills (proves GET serialization + UserForm).
- [ ] Edit the address as admin; confirm it persists.
- [ ] Log in as that rep; confirm Settings shows the address read-only.
- [ ] Submit a bad ZIP (e.g. `1234`) via public flow and via UserForm; confirm a 400 with the zip error message.
- [ ] Non-regression: a user with no address shows "Not on file" on Settings and blank inputs in UserForm; submitting blank address never blocks.

## Out of Scope (queued)

IBO owner picker; external address verification; editable address on Settings (`api/portal/profile`); admin invite-time address prefill.
