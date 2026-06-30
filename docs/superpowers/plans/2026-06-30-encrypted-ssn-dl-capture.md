# Encrypted SSN / DL# Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture a new hire's SSN + Driver's License # during onboarding, store them AES-256-GCM encrypted in a server-only `userSensitive` collection, and let only the `admin` role reveal them (masked last-4 for the admin list; every reveal logged).

**Architecture:** A pure server-only encryption helper (Node `crypto`, AES-256-GCM, key from env) + a data-model helper that validates/encrypts/computes last-4. The public onboarding route writes the encrypted doc in its existing create batch. A new admin-only API decrypts on demand and writes an access log. Raw values never touch the `User` doc, the `userOnboarding` reference field, or the existing `looksLikeRawSensitiveData` guardrail path.

**Tech Stack:** Next.js 16.1.1, TypeScript 5 (strict), firebase-admin 13.6.0, Node `crypto` (built-in, no new dep), Vitest.

## Global Constraints

- **Encryption: AES-256-GCM**, random 12-byte IV per value, auth tag for tamper detection. Payload format: `base64(iv).base64(authTag).base64(ciphertext)` (dot-separated).
- **Key:** `process.env.ONBOARDING_FIELD_ENCRYPTION_KEY`, a 32-byte key in base64. Helper throws loudly if missing/wrong length — NEVER silently store plaintext.
- **Storage:** new `userSensitive/{uid}` collection, server-only. Firestore rules deny ALL client access (read+write `if false`). Same for `sensitiveAccessLog`.
- **No raw PII** on `User` or `userOnboarding`. SSN/DL# travel as body keys `ssn`/`dlNumber`/`backgroundCheckAuth`, NEVER inside the `references` map. The `looksLikeRawSensitiveData` guardrail on `references` is unchanged.
- **Reveal access: VERIFIED `admin` role ONLY** via a new `requireVerifiedAdmin` helper that checks a real Firebase ID token (`Authorization: Bearer`), NOT a client-supplied UID. (The app's usual `requireAdmin` trusts a `requestedBy` UID — not acceptable for decrypting SSN/DL#.) Every reveal writes a `sensitiveAccessLog` row.
- **Masked display** uses stored plaintext last-4 (`ssnLast4`/`dlLast4`) — no decryption needed to show `•••••6789`.
- **Validation per task:** `npx tsc --noEmit` + `npm run build` green; `npm test` for helper tasks. Stage only each task's files by explicit path; never `git add -A`.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/lib/security/fieldEncryption.ts` (NEW) | AES-256-GCM encrypt/decrypt/last4 | 1 |
| `src/lib/security/fieldEncryption.test.ts` (NEW) | Vitest | 1 |
| `src/types/sensitive.ts` (NEW) | `SensitiveDoc` type | 2 |
| `src/lib/onboarding/sensitiveFields.ts` (NEW) | validate+encrypt+last4 / reveal | 2 |
| `src/lib/onboarding/sensitiveFields.test.ts` (NEW) | Vitest | 2 |
| `firestore.rules` (MODIFY) | deny-all userSensitive + sensitiveAccessLog | 3 |
| `src/app/api/public/onboarding/[token]/route.ts` (MODIFY) | write encrypted doc in create batch | 4 |
| `src/app/onboard/[token]/page.tsx` (MODIFY) | SSN/DL#/bg-auth capture fields | 5 |
| `src/lib/auth/requireVerifiedAdmin.ts` (NEW) | verified-admin auth (real ID-token check) | 6 |
| `src/app/api/portal/admin/sensitive/[uid]/route.ts` (NEW) | verified-admin reveal + access log | 7 |
| `src/app/portal/admin/users/[id]/page.tsx` (MODIFY) | masked display + Reveal button | 8 |
| `.env.example` (NEW or MODIFY) + spec note | document the key | 9 |

---

## Task 1: AES-256-GCM field encryption helper

**Files:**
- Create: `src/lib/security/fieldEncryption.ts`
- Create: `src/lib/security/fieldEncryption.test.ts`

**Interfaces:**
- Consumes: `process.env.ONBOARDING_FIELD_ENCRYPTION_KEY` (32-byte base64).
- Produces (used by Task 2): `encryptField(plaintext: string): string`, `decryptField(payload: string): string`, `last4(value: string): string`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/security/fieldEncryption.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';

// A fixed 32-byte key for tests, set before importing the module under test.
beforeAll(() => {
  process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('fieldEncryption', () => {
  it('round-trips: decrypt(encrypt(x)) === x', async () => {
    const { encryptField, decryptField } = await import('./fieldEncryption');
    const secret = '123-45-6789';
    expect(decryptField(encryptField(secret))).toBe(secret);
  });

  it('produces different ciphertext each call (random IV)', async () => {
    const { encryptField } = await import('./fieldEncryption');
    expect(encryptField('same')).not.toBe(encryptField('same'));
  });

  it('throws on a tampered payload', async () => {
    const { encryptField, decryptField } = await import('./fieldEncryption');
    const payload = encryptField('secret');
    // Flip a character in the ciphertext segment.
    const parts = payload.split('.');
    parts[2] = parts[2].slice(0, -2) + (parts[2].slice(-2) === 'AA' ? 'BB' : 'AA');
    expect(() => decryptField(parts.join('.'))).toThrow();
  });

  it('last4 returns the last 4 digits of a stripped value', async () => {
    const { last4 } = await import('./fieldEncryption');
    expect(last4('123-45-6789')).toBe('6789');
    expect(last4('D1234567')).toBe('4567');
  });

  it('throws if the key is missing', async () => {
    const saved = process.env.ONBOARDING_FIELD_ENCRYPTION_KEY;
    delete process.env.ONBOARDING_FIELD_ENCRYPTION_KEY;
    // Re-import a fresh module instance so the key check runs without a key.
    await expect(async () => {
      const mod = await import('./fieldEncryption?nokey' as string);
      mod.encryptField('x');
    }).rejects.toBeTruthy();
    process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = saved;
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./fieldEncryption`.

- [ ] **Step 3: Implement `src/lib/security/fieldEncryption.ts`**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM field-level encryption for onboarding PII (SSN, DL#). Server-only.
// The key lives in ONBOARDING_FIELD_ENCRYPTION_KEY (32 bytes, base64). If it is
// missing or the wrong length we throw — we never silently store plaintext.

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

function getKey(): Buffer {
  const raw = process.env.ONBOARDING_FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('ONBOARDING_FIELD_ENCRYPTION_KEY is not set');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('ONBOARDING_FIELD_ENCRYPTION_KEY must decode to 32 bytes');
  }
  return key;
}

// Returns base64(iv).base64(authTag).base64(ciphertext)
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptField(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted payload');
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

// Last 4 of the digit/alphanumeric value (separators stripped) for masked display.
export function last4(value: string): string {
  const stripped = value.replace(/[^A-Za-z0-9]/g, '');
  return stripped.slice(-4);
}
```

> Note on the missing-key test: the `import('./fieldEncryption?nokey')` trick forces a fresh module load; if your Vitest config rejects the query suffix, instead assert `encryptField` throws after deleting the env var by calling it directly (the key is read at call time via `getKey()`, not at import) — `getKey()` reads the env on every call, so simply `delete process.env...; expect(() => encryptField('x')).toThrow()` works. Use whichever passes; the requirement is "throws when key absent."

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/security/fieldEncryption.ts src/lib/security/fieldEncryption.test.ts
git commit -m "feat: add AES-256-GCM field encryption helper for onboarding PII"
```

---

## Task 2: Sensitive-fields data helper

**Files:**
- Create: `src/types/sensitive.ts`
- Create: `src/lib/onboarding/sensitiveFields.ts`
- Create: `src/lib/onboarding/sensitiveFields.test.ts`

**Interfaces:**
- Consumes: `encryptField`, `decryptField`, `last4` (Task 1).
- Produces (used by Tasks 4, 6):
  - `type SensitiveDoc` (in `src/types/sensitive.ts`)
  - `buildSensitiveDoc(input: { ssn?: string; dlNumber?: string; backgroundCheckAuth?: boolean }): { ok: true; doc: Partial<SensitiveDoc> } | { ok: false; error: string }`
  - `revealSensitive(doc: Pick<SensitiveDoc, 'ssnEncrypted' | 'dlNumberEncrypted'>): { ssn?: string; dlNumber?: string }`

- [ ] **Step 1: Create the type**

`src/types/sensitive.ts`:

```typescript
// Server-only sensitive onboarding fields, stored encrypted in userSensitive/{uid}.
export interface SensitiveDoc {
  ssnEncrypted?: string;
  ssnLast4?: string;
  dlNumberEncrypted?: string;
  dlLast4?: string;
  backgroundCheckAuth?: boolean;
  updatedAt: Date;
  updatedBy: string;
}
```

- [ ] **Step 2: Write the failing test**

`src/lib/onboarding/sensitiveFields.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';

beforeAll(() => {
  process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('buildSensitiveDoc', () => {
  it('encrypts a valid SSN + DL# and records last4', async () => {
    const { buildSensitiveDoc } = await import('./sensitiveFields');
    const r = buildSensitiveDoc({ ssn: '123-45-6789', dlNumber: 'D1234567', backgroundCheckAuth: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc.ssnLast4).toBe('6789');
      expect(r.doc.dlLast4).toBe('4567');
      expect(r.doc.backgroundCheckAuth).toBe(true);
      // Encrypted, not plaintext:
      expect(r.doc.ssnEncrypted).toBeDefined();
      expect(r.doc.ssnEncrypted).not.toContain('123456789');
    }
  });

  it('rejects an SSN that is not 9 digits', async () => {
    const { buildSensitiveDoc } = await import('./sensitiveFields');
    expect(buildSensitiveDoc({ ssn: '12345' }).ok).toBe(false);
  });

  it('allows omitting fields (all optional)', async () => {
    const { buildSensitiveDoc } = await import('./sensitiveFields');
    const r = buildSensitiveDoc({ backgroundCheckAuth: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc.ssnEncrypted).toBeUndefined();
      expect(r.doc.backgroundCheckAuth).toBe(false);
    }
  });

  it('round-trips via revealSensitive', async () => {
    const { buildSensitiveDoc, revealSensitive } = await import('./sensitiveFields');
    const r = buildSensitiveDoc({ ssn: '123-45-6789', dlNumber: 'D1234567' });
    if (!r.ok) throw new Error('expected ok');
    const revealed = revealSensitive({
      ssnEncrypted: r.doc.ssnEncrypted,
      dlNumberEncrypted: r.doc.dlNumberEncrypted,
    });
    expect(revealed.ssn).toBe('123456789'); // stored stripped of separators
    expect(revealed.dlNumber).toBe('D1234567');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./sensitiveFields`.

- [ ] **Step 4: Implement `src/lib/onboarding/sensitiveFields.ts`**

```typescript
import { encryptField, decryptField, last4 } from '@/lib/security/fieldEncryption';
import type { SensitiveDoc } from '@/types/sensitive';

const SSN_DIGITS = /^\d{9}$/;

// Validates and encrypts the sensitive onboarding fields. SSN is stored stripped
// of separators (9 digits); DL# stored as entered (trimmed). All fields optional.
export function buildSensitiveDoc(input: {
  ssn?: string;
  dlNumber?: string;
  backgroundCheckAuth?: boolean;
}): { ok: true; doc: Partial<SensitiveDoc> } | { ok: false; error: string } {
  const doc: Partial<SensitiveDoc> = {};

  const ssn = (input.ssn ?? '').replace(/[^0-9]/g, '');
  if (ssn) {
    if (!SSN_DIGITS.test(ssn)) {
      return { ok: false, error: 'Enter a valid 9-digit Social Security Number' };
    }
    doc.ssnEncrypted = encryptField(ssn);
    doc.ssnLast4 = last4(ssn);
  }

  const dl = (input.dlNumber ?? '').trim().slice(0, 40);
  if (dl) {
    doc.dlNumberEncrypted = encryptField(dl);
    doc.dlLast4 = last4(dl);
  }

  if (typeof input.backgroundCheckAuth === 'boolean') {
    doc.backgroundCheckAuth = input.backgroundCheckAuth;
  }

  return { ok: true, doc };
}

// Decrypts the stored encrypted fields for an authorized reveal.
export function revealSensitive(
  doc: Pick<SensitiveDoc, 'ssnEncrypted' | 'dlNumberEncrypted'>
): { ssn?: string; dlNumber?: string } {
  return {
    ssn: doc.ssnEncrypted ? decryptField(doc.ssnEncrypted) : undefined,
    dlNumber: doc.dlNumberEncrypted ? decryptField(doc.dlNumberEncrypted) : undefined,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Verify typecheck + commit**

Run: `npx tsc --noEmit` (expect no errors), then:

```bash
git add src/types/sensitive.ts src/lib/onboarding/sensitiveFields.ts src/lib/onboarding/sensitiveFields.test.ts
git commit -m "feat: add sensitive-fields validate/encrypt/reveal helper"
```

---

## Task 3: Firestore rules — deny-all sensitive collections

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: nothing. Produces: client access denied on `userSensitive` + `sensitiveAccessLog` (server-only via Admin SDK).

- [ ] **Step 1: Add the rules**

In `firestore.rules`, after the `candidateOnboarding` block (the last `match` before the closing braces), add:

```
    // Encrypted sensitive onboarding fields (SSN, DL#). Server-only (Admin SDK).
    // No client ever reads or writes these; the admin reveal goes through an
    // admin-gated API route, not direct Firestore access.
    match /userSensitive/{uid} {
      allow read, write: if false;
    }

    // Audit log of sensitive-field reveals. Server-only.
    match /sensitiveAccessLog/{logId} {
      allow read, write: if false;
    }
```

- [ ] **Step 2: Verify build is unaffected + deploy note**

Run: `npm run build`
Expected: build succeeds (rules are not compiled by Next, just confirm nothing broke).

> After merge, the rules must be deployed: `npx -y firebase-tools deploy --only firestore:rules --project cworldgroup-cca68`. (Note for the controller — not a code step.)

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: deny-all firestore rules for userSensitive + sensitiveAccessLog"
```

---

## Task 4: Capture — write encrypted doc on public onboarding submit

**Files:**
- Modify: `src/app/api/public/onboarding/[token]/route.ts`

**Interfaces:**
- Consumes: `buildSensitiveDoc` (Task 2); the existing `adminDb` batch + `userRecord.uid`.
- Produces: `userSensitive/{uid}` written in the create batch when SSN/DL#/bg-auth are provided.

- [ ] **Step 1: Add the import**

Near the other imports in the route:

```typescript
import { buildSensitiveDoc } from '@/lib/onboarding/sensitiveFields';
```

- [ ] **Step 2: Validate before user creation**

After the existing storage-reference verification loop (the `for (const item of items)` block that ends before `const now = new Date();`), add — this reads NEW body keys, never the `references` map:

```typescript
    const sensitive = buildSensitiveDoc({
      ssn: typeof body.ssn === 'string' ? body.ssn : undefined,
      dlNumber: typeof body.dlNumber === 'string' ? body.dlNumber : undefined,
      backgroundCheckAuth:
        typeof body.backgroundCheckAuth === 'boolean' ? body.backgroundCheckAuth : undefined,
    });
    if (!sensitive.ok) {
      return NextResponse.json({ error: sensitive.error }, { status: 400 });
    }
```

- [ ] **Step 3: Write the doc in the batch**

Immediately after `batch.set(adminDb.collection('users').doc(userRecord.uid), userProfile);`, add (only write when there is something to store):

```typescript
    if (Object.keys(sensitive.doc).length > 0) {
      batch.set(adminDb.collection('userSensitive').doc(userRecord.uid), {
        ...sensitive.doc,
        updatedAt: now,
        updatedBy: userRecord.uid,
      });
    }
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npx tsc --noEmit` (no errors), then `npm run build` (succeeds; route still compiles).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/public/onboarding/[token]/route.ts"
git commit -m "feat: persist encrypted SSN/DL# on public onboarding submit"
```

---

## Task 5: Capture UI — SSN/DL#/background-auth fields

**Files:**
- Modify: `src/app/onboard/[token]/page.tsx`

**Interfaces:**
- Consumes: the public submit route (Task 4) — sends body keys `ssn`, `dlNumber`, `backgroundCheckAuth`.
- Produces: three inputs in the onboarding profile section.

- [ ] **Step 1: Extend the profile state**

In the `profile` state initializer (currently includes `displayName`, `phone`, `address`, `city`, `state`, `zip`, `password`), add:

```typescript
    ssn: '',
    dlNumber: '',
    backgroundCheckAuth: false,
```

(and add the same three keys, with `''`/`false`, to the `setProfile({ ... })` reset inside `loadInvite` so the reset stays total.)

- [ ] **Step 2: Confirm they're in the submit body (separate from references)**

The submit POST sends `{ ...profile, references }` — `references` is its own separate state (verified). Because `profile` now includes `ssn`/`dlNumber`/`backgroundCheckAuth` from Step 1, they ride along in the body automatically and are NOT in the `references` map (so the `looksLikeRawSensitiveData` guardrail on references is never triggered). No code change is needed in this step beyond Step 1 — just confirm by reading the submit handler that the body is `{ ...profile, references }`-shaped and `references` does not include the profile spread. If (and only if) the body is built field-by-field instead, add exactly these three lines to it: `ssn: profile.ssn,` `dlNumber: profile.dlNumber,` `backgroundCheckAuth: profile.backgroundCheckAuth,`.

- [ ] **Step 3: Add the fields to the profile card**

In the profile inputs section (next to the address/password fields), add:

```tsx
              <div>
                <Label>Social Security Number</Label>
                <Input
                  value={profile.ssn}
                  onChange={(event) =>
                    setProfile((prev) => ({ ...prev, ssn: event.target.value }))
                  }
                  placeholder="123-45-6789"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label>Driver&apos;s License Number</Label>
                <Input
                  value={profile.dlNumber}
                  onChange={(event) =>
                    setProfile((prev) => ({ ...prev, dlNumber: event.target.value }))
                  }
                  autoComplete="off"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={profile.backgroundCheckAuth}
                  onChange={(event) =>
                    setProfile((prev) => ({ ...prev, backgroundCheckAuth: event.target.checked }))
                  }
                />
                I authorize a background / drug screen.
              </label>
              <p className="text-xs text-slate-400 sm:col-span-2">
                Your SSN and license number are encrypted and only visible to authorized administrators.
              </p>
```

- [ ] **Step 4: Verify typecheck + lint + build**

Run: `npx tsc --noEmit` (no errors); `npx eslint "src/app/onboard/[token]/page.tsx"` (clean); `npm run build` (succeeds).

- [ ] **Step 5: Commit**

```bash
git add "src/app/onboard/[token]/page.tsx"
git commit -m "feat: capture SSN/DL#/background-auth on onboarding form"
```

---

## Task 6: Verified-admin auth helper (real token check)

> **Security rationale:** the existing `requireAdmin` trusts a client-supplied `requestedBy` UID from the query string — anyone who knows an admin's UID could request decrypted PII. That trust-the-UID pattern is acceptable for low-stakes admin reads elsewhere in the app, but NOT for decrypting SSN/DL#. This task adds a helper that verifies a real Firebase ID token server-side before confirming admin role. Only the sensitive endpoint (Task 7) uses it; the rest of the app is unchanged (app-wide hardening is a separate future task).

**Files:**
- Create: `src/lib/auth/requireVerifiedAdmin.ts`

**Interfaces:**
- Consumes: `adminAuth`, `adminDb` (`@/lib/firebase/admin`); `resolveRoles` (`@/types`).
- Produces: `requireVerifiedAdmin(request: NextRequest): Promise<{ ok: true; uid: string; name: string } | { ok: false; error: string; status: number }>` — verifies the `Authorization: Bearer <idToken>` header via `adminAuth.verifyIdToken`, looks up the user, and confirms `role === 'admin'`. Used by Task 7.

- [ ] **Step 1: Implement the helper**

```typescript
import { NextRequest } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { resolveRoles } from '@/types';

// Verifies a real Firebase ID token (not a client-supplied UID) and confirms the
// caller is an admin. Use for sensitive operations (SSN/DL# reveal) where the
// trust-the-UID pattern is not acceptable. Expects: Authorization: Bearer <idToken>.
export async function requireVerifiedAdmin(
  request: NextRequest
): Promise<{ ok: true; uid: string; name: string } | { ok: false; error: string; status: number }> {
  if (!adminAuth || !adminDb) {
    return { ok: false, error: 'Auth not configured', status: 500 };
  }

  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return { ok: false, error: 'Missing authentication token', status: 401 };
  }

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return { ok: false, error: 'Invalid authentication token', status: 401 };
  }

  const snap = await adminDb.collection('users').doc(uid).get();
  if (!snap.exists) {
    return { ok: false, error: 'User not found', status: 403 };
  }
  const data = snap.data();
  const { role } = resolveRoles(data?.role, data?.fieldRole);
  if (role !== 'admin') {
    return { ok: false, error: 'Forbidden: admin access required', status: 403 };
  }

  return { ok: true, uid, name: data?.displayName || data?.email || 'Admin' };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/requireVerifiedAdmin.ts
git commit -m "feat: add verified-admin auth helper (real ID-token check) for sensitive ops"
```

---

## Task 7: Admin reveal API (mask + verified-admin reveal + access log)

**Files:**
- Create: `src/app/api/portal/admin/sensitive/[uid]/route.ts`

**Interfaces:**
- Consumes: `requireVerifiedAdmin` (Task 6), `revealSensitive` (Task 2), `adminDb`.
- Produces: `GET` for VERIFIED admins only (real ID token). Always returns `{ ssnLast4, dlLast4 }` (non-sensitive, no decryption). Only when `?reveal=true` does it decrypt, return `{ ssn, dlNumber }`, AND write a `sensitiveAccessLog` row. Consumed by Task 8.

- [ ] **Step 1: Implement the route (verified-admin, mask-vs-reveal)**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';
import { revealSensitive } from '@/lib/onboarding/sensitiveFields';

// GET /api/portal/admin/sensitive/[uid] - Sensitive onboarding fields for one user.
// VERIFIED admin only (real Firebase ID token via Authorization: Bearer header,
// NOT a client-supplied UID). Default returns only masked last-4 (no decryption,
// no log). With ?reveal=true it decrypts the full SSN/DL# AND writes an audit row.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const gate = await requireVerifiedAdmin(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const { uid } = await params;
    const reveal = request.nextUrl.searchParams.get('reveal') === 'true';

    const snap = await adminDb.collection('userSensitive').doc(uid).get();
    if (!snap.exists) {
      return NextResponse.json({ ssnLast4: null, dlLast4: null, ssn: null, dlNumber: null });
    }

    const data = snap.data() as {
      ssnEncrypted?: string;
      dlNumberEncrypted?: string;
      ssnLast4?: string;
      dlLast4?: string;
    };

    if (!reveal) {
      return NextResponse.json({
        ssnLast4: data.ssnLast4 ?? null,
        dlLast4: data.dlLast4 ?? null,
        ssn: null,
        dlNumber: null,
      });
    }

    const revealed = revealSensitive({
      ssnEncrypted: data.ssnEncrypted,
      dlNumberEncrypted: data.dlNumberEncrypted,
    });

    await adminDb.collection('sensitiveAccessLog').add({
      targetUid: uid,
      revealedBy: gate.uid,
      revealedByName: gate.name,
      at: new Date(),
    });

    return NextResponse.json({
      ssnLast4: data.ssnLast4 ?? null,
      dlLast4: data.dlLast4 ?? null,
      ssn: revealed.ssn ?? null,
      dlNumber: revealed.dlNumber ?? null,
    });
  } catch (error) {
    console.error('Error reading sensitive fields:', error);
    return NextResponse.json({ error: 'Failed to read sensitive fields' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npx tsc --noEmit` (no errors); `npm run build` (succeeds; new route listed).

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/portal/admin/sensitive/[uid]/route.ts"
git commit -m "feat: add verified-admin sensitive-fields route (mask + logged reveal)"
```

---

## Task 8: Admin display — masked value + Reveal button

**Files:**
- Modify: `src/app/portal/admin/users/[id]/page.tsx`

**Interfaces:**
- Consumes: the verified-admin reveal API (Task 7) for BOTH the masked last-4 and the reveal — NO direct client Firestore reads of `userSensitive` (rules deny them). The client gets a real ID token via `auth.currentUser.getIdToken()` and sends it as `Authorization: Bearer <token>`. Admin-gate the UI on `currentUser?.role === 'admin'` via `useAuth`.
- Produces: an admin-only "Sensitive" row with masked last-4 + a Reveal button.

> The page fetches the user via `users/[id]` GET and renders `<UserForm>`. The masked last-4 (`ssnLast4`) is NOT on the `User` doc — it lives in `userSensitive` and is served ONLY by Task 7's verified-admin route. One call (no `reveal`) gets the masked last-4; a second call with `?reveal=true` happens only when the admin clicks Reveal (when decryption + audit logging occur). Both calls must carry the `Authorization: Bearer` token.

- [ ] **Step 1: Add the admin-only sensitive block to the page**

In `src/app/portal/admin/users/[id]/page.tsx`, the page has `const { user: currentUser } = useAuth()` and a loaded `user`. Add an import for the client auth, then state + token-bearing fetches, rendered only for admins.

Add the import (alongside the existing imports):

```typescript
import { auth } from '@/lib/firebase/config';
```

After the existing `useState` declarations:

```typescript
  const [sensitive, setSensitive] = useState<{ ssnLast4: string | null; dlLast4: string | null } | null>(null);
  const [revealed, setRevealed] = useState<{ ssn: string | null; dlNumber: string | null } | null>(null);

  // Fetch the masked last-4 (admin only). Sends a REAL Firebase ID token, not a
  // UID — the server verifies it before returning anything.
  useEffect(() => {
    if (currentUser?.role !== 'admin' || !userId) return;
    let active = true;
    (async () => {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;
      const r = await fetch(`/api/portal/admin/sensitive/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (active) setSensitive({ ssnLast4: d.ssnLast4, dlLast4: d.dlLast4 });
    })().catch(() => active && setSensitive(null));
    return () => {
      active = false;
    };
  }, [currentUser, userId]);

  const doReveal = async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) return;
    const r = await fetch(`/api/portal/admin/sensitive/${userId}?reveal=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    setRevealed({ ssn: d.ssn, dlNumber: d.dlNumber });
  };
```

Then in the JSX, where the user detail renders (inside the `{user && ( ... )}` block), add an admin-gated card:

```tsx
            {currentUser?.role === 'admin' && sensitive && (sensitive.ssnLast4 || sensitive.dlLast4) && (
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
                <h2 className="text-sm font-semibold text-amber-900">Sensitive (admin only)</h2>
                <p className="mt-2 text-sm text-slate-700">
                  SSN: {revealed?.ssn ?? (sensitive.ssnLast4 ? `•••••${sensitive.ssnLast4}` : '—')}
                </p>
                <p className="text-sm text-slate-700">
                  DL #: {revealed?.dlNumber ?? (sensitive.dlLast4 ? `•••••${sensitive.dlLast4}` : '—')}
                </p>
                {!revealed && (
                  <button
                    onClick={doReveal}
                    className="mt-3 rounded-md border border-amber-300 px-3 py-1 text-sm font-medium text-amber-900 hover:bg-amber-100"
                  >
                    Reveal
                  </button>
                )}
              </section>
            )}
```

- [ ] **Step 2: Verify typecheck + lint + build**

Run: `npx tsc --noEmit` (no errors); `npx eslint "src/app/portal/admin/users/[id]/page.tsx"` (clean); `npm run build` (succeeds).

- [ ] **Step 3: Commit**

```bash
git add "src/app/portal/admin/users/[id]/page.tsx"
git commit -m "feat: admin-only masked SSN/DL# display with reveal"
```

---

## Task 9: Document the encryption key

**Files:**
- Create or Modify: `.env.example`

**Interfaces:** none (docs/config only).

- [ ] **Step 1: Add the key to `.env.example` with a warning**

Append to `.env.example` (create it if absent):

```
# Field-level encryption key for onboarding PII (SSN, DL#). 32 bytes, base64.
# Generate once with: openssl rand -base64 32
# CRITICAL: back this up securely. If lost, all stored SSN/DL# become permanently
# unreadable. Never commit the real value. Set it in .env.local and in Vercel.
ONBOARDING_FIELD_ENCRYPTION_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: document ONBOARDING_FIELD_ENCRYPTION_KEY env var"
```

> Controller note (not a code step): before this feature works in any environment, generate the key (`openssl rand -base64 32`) and set `ONBOARDING_FIELD_ENCRYPTION_KEY` in `.env.local` AND in Vercel project settings. Back it up securely.

---

## Final Verification (per spec §7)

- [ ] `npm test` green (encryption + sensitive-fields suites); `npx tsc --noEmit` + `npm run build` green.
- [ ] Onboard a test hire with SSN/DL#; confirm `userSensitive/{uid}` holds ciphertext (NOT the number) + correct `ssnLast4`.
- [ ] Confirm an admin sees `•••••6789` and can Reveal the full value; confirm a non-admin sees nothing.
- [ ] Confirm a reveal writes a `sensitiveAccessLog` row.
- [ ] Confirm `User` and `userOnboarding` docs contain NO raw SSN/DL#.
- [ ] Confirm the `looksLikeRawSensitiveData` guardrail still rejects raw PII pasted into a normal reference field.

## Out of Scope (queued)

5 simple onboarding fields (Channel/Market/Shirt Size/Hiring Manager/Badge Photo); background-check vendor; admin edit of SSN/DL#; key rotation; the other 7 Formstack forms.
