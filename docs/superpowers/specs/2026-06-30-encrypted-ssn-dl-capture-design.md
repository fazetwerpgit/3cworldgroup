# Phase 4 (Slice 1) — Encrypted SSN / DL# Capture

**Date:** 2026-06-30
**Status:** Design — approved in brainstorm (plain-language), pending spec review
**Scope:** Capture the new hire's Social Security Number and Driver's License Number during onboarding, store them **encrypted at rest** (AES-256-GCM), and allow **only the admin role** to reveal the decrypted values (masked for everyone else).
**Nature:** Additive + security-sensitive. Deliberately introduces the FIRST raw-PII storage in the system, on a tightly-controlled, isolated, encrypted path — without weakening the existing `looksLikeRawSensitiveData` guardrail on the normal onboarding fields.

---

## 1. Problem & Goal

The live Formstack onboarding form (`forms/3c_onboarding_form`) collects **Social (SSN)** and **Drivers License #** as raw plain text. To replace Formstack and cancel the subscription, the portal must capture these too. The portal was originally designed to **never** store raw SSN/DL# (the `looksLikeRawSensitiveData` guardrail actively rejects them). This slice introduces a controlled, encrypted exception.

**Goal:** the new hire enters SSN + DL# during onboarding; the values are encrypted before they touch the database; only an admin can reveal the full value (others see a last-4 mask or nothing). The existing guardrail on all *other* onboarding fields stays intact.

**Decision context (locked):** capture in-portal + encrypted at rest was chosen over a background-check vendor (faster path to cancelling Formstack); plain-text storage was explicitly rejected in favor of encryption + admin-only access. See `docs/superpowers/formstack-inventory.md` and project memory.

**Non-goals:** background-check vendor integration; the 5 simple onboarding fields (Channel/Market/Shirt Size/Hiring Manager/Badge Photo — next slice); changing the guardrail on non-sensitive fields; key rotation tooling (documented as a future concern).

---

## 2. Locked Decisions (from brainstorm)

1. **New hire enters SSN + DL# during onboarding** (the public token flow), matching Formstack.
2. **Encrypted at rest with AES-256-GCM** (authenticated encryption — detects tampering). Plain text is not stored anywhere.
3. **Only the `admin` role** can reveal the full decrypted value. Operations/managers/reps cannot.
4. **Masked display** for the admin list view: `•••••6789` (last 4 of SSN). A "Reveal" action fetches the full value on demand.
5. **Isolated storage:** SSN/DL# live in their own server-only Firestore location, NOT on the `User` doc and NOT in the normal `userOnboarding` `reference` field. The `looksLikeRawSensitiveData` guardrail stays on the normal fields.
6. **One new secret:** an encryption key in an env var. If lost, stored values are unrecoverable — documented prominently.

---

## 3. Data Model

**New collection `userSensitive/{uid}`** (server-only; Firestore rules deny ALL client access — only the Admin SDK reads/writes it):

```
userSensitive/{uid}:
  ssnEncrypted?: string      // AES-256-GCM payload (iv:authTag:ciphertext, base64)
  ssnLast4?: string          // last 4 digits, plaintext — for masked display without decrypting
  dlNumberEncrypted?: string // AES-256-GCM payload
  dlLast4?: string           // last 4 chars, for masked display
  backgroundCheckAuth?: boolean // the Yes/No authorization from the form
  updatedAt: Date
  updatedBy: string          // uid of who last wrote (the new hire's uid on self-capture)
```

- **No `User` change**, no `userOnboarding` change. The comment in `auth.ts` ("DL#/SSN are NEVER stored here") stays true — they're in `userSensitive`, encrypted.
- `ssnLast4`/`dlLast4` are stored in clear so the masked view (`•••••6789`) never needs to decrypt — decryption only happens on an explicit admin reveal.

---

## 4. Components & Changes

### 4.1 `src/lib/security/fieldEncryption.ts` (NEW)

Pure, server-only encryption helper (Node `crypto`, no new dependency):

- `encryptField(plaintext: string): string` — AES-256-GCM; returns `base64(iv).base64(authTag).base64(ciphertext)`. Random 12-byte IV per call.
- `decryptField(payload: string): string` — reverses it; throws on auth-tag mismatch (tamper/wrong key).
- `last4(value: string): string` — last 4 chars of the digit-stripped value.
- Reads the key from `process.env.ONBOARDING_FIELD_ENCRYPTION_KEY` (32 bytes, base64 or hex). Throws a clear error if missing/wrong length so misconfig fails loudly, never silently storing plaintext.
- Unit-testable: round-trip (encrypt→decrypt === original), tamper detection (modified payload throws), distinct ciphertext per call (random IV), `last4`.

### 4.2 `src/lib/onboarding/sensitiveFields.ts` (NEW)

Small server helper that ties encryption to the data model:

- `buildSensitiveDoc(input: { ssn?; dlNumber?; backgroundCheckAuth? }): Partial<SensitiveDoc>` — validates (SSN = 9 digits after stripping separators; DL# non-empty, ≤40 chars), encrypts, computes last4, returns the doc fields to write. Returns `{ ok:false, error }` on invalid SSN shape.
- `revealSensitive(doc: SensitiveDoc): { ssn?; dlNumber? }` — decrypts for an authorized reveal.

### 4.3 Capture — public onboarding (`src/app/api/public/onboarding/[token]/route.ts`, CHANGED)

The POST already creates the user + writes onboarding docs in a batch. Add: read `ssn`, `dlNumber`, `backgroundCheckAuth` from the body; if present, `buildSensitiveDoc(...)`; on invalid → 400; else write `userSensitive/{uid}` in the same batch. These fields are **never** placed in the `references` map, so the `looksLikeRawSensitiveData` guardrail (which still runs on references) is not triggered and not weakened.

### 4.4 Capture UI — onboarding page (`src/app/onboard/[token]/page.tsx`, CHANGED)

Add two fields to the profile section: **Social Security Number** and **Driver's License Number**, plus the **background-check authorization** Yes/No. Helper copy: "Encrypted and only visible to authorized administrators." Client-side: SSN formats/validates as 9 digits. These post in the existing body (new keys `ssn`/`dlNumber`/`backgroundCheckAuth`), separate from `references`.

### 4.5 Admin reveal API (`src/app/api/portal/admin/sensitive/[uid]/route.ts`, NEW)

- `GET` — gated by `requireAdmin` (the existing helper; admin role ONLY). Reads `userSensitive/{uid}`, decrypts via `revealSensitive`, returns `{ ssn, dlNumber }`. Logs the access (who revealed whose data, when) to a `sensitiveAccessLog` collection for an audit trail.
- No PUT/edit in this slice (capture-at-onboarding only, per scope).

### 4.6 Admin display (`src/app/portal/admin/users/[id]/page.tsx` or the onboarding review surface, CHANGED)

For admins only: show an "Sensitive on file" row with the masked value (`SSN •••••6789` from `ssnLast4`, no decryption) and a **Reveal** button that calls 4.5 and shows the full value transiently. Non-admins: the row is not rendered at all. The masked view requires only `ssnLast4`/`dlLast4` (already in clear), so the page can show "on file" without ever calling the decrypt endpoint.

### 4.7 `storage.rules` / `firestore.rules` (CHANGED)

Add a `userSensitive` rule: **deny all client access** (read + write `if false`) — only the Admin SDK touches it, exactly like the deny-all pattern P1 used for Storage. Same for `sensitiveAccessLog`.

### 4.8 Config (`.env.local` + Vercel + `.env.example`/docs)

New env var `ONBOARDING_FIELD_ENCRYPTION_KEY` (32-byte key, base64). Generated once (`openssl rand -base64 32`), added to `.env.local` and Vercel. **Documented prominently:** losing this key makes stored SSN/DL# permanently unreadable; it must be backed up securely and never committed.

---

## 5. Data Flow

New hire types SSN/DL# during onboarding → submit POST carries `ssn`/`dlNumber`/`backgroundCheckAuth` (separate from `references`) → server validates SSN shape → `buildSensitiveDoc` encrypts (AES-256-GCM) + computes last4 → writes `userSensitive/{uid}` in the create batch. Later, an admin opens the user → sees `SSN •••••6789` (from `ssnLast4`, no decryption) → clicks Reveal → `GET /api/portal/admin/sensitive/{uid}` (admin-gated) decrypts and returns the full value + writes an access-log entry.

---

## 6. Security & Error Handling

- **AES-256-GCM** with a random per-value IV and an auth tag (tamper detection). Key from env; helper throws loudly if the key is missing/malformed (never silently stores plaintext).
- **Isolation:** raw values exist only transiently in server memory during encrypt/decrypt; at rest they are ciphertext in a deny-all collection. `User` and `userOnboarding` never hold them.
- **Access:** reveal endpoint is `admin`-only (`requireAdmin`); every reveal is logged (`sensitiveAccessLog`).
- **Guardrail intact:** `looksLikeRawSensitiveData` still runs on the `references` map; SSN/DL# travel a separate field path, so the guardrail is neither bypassed for normal fields nor weakened.
- **Validation:** invalid SSN shape → 400, nothing written. Decrypt failure (bad key/tamper) → 500 with a safe message, logged.
- **Key-loss caveat:** documented; out-of-scope to build rotation tooling now.

---

## 7. Testing

- **`src/lib/security/fieldEncryption.ts` → Vitest:** round-trip equality; ciphertext differs across calls (random IV); tampered payload throws; missing/short key throws; `last4` correctness. (Tests set a fixed test key via env.)
- **`src/lib/onboarding/sensitiveFields.ts` → Vitest:** valid SSN builds encrypted doc with correct `ssnLast4`; invalid SSN shape returns error; `revealSensitive` round-trips.
- **Routes/UI:** `npx tsc --noEmit` + `npm run build` green; manual — onboard a test hire with SSN/DL#, confirm `userSensitive` holds ciphertext (not the number) + correct last4; confirm an admin can reveal and a non-admin cannot; confirm a reveal writes an access-log row.

---

## 8. Out of Scope (queued)

The 5 simple onboarding fields (Channel/Market/Shirt Size/Hiring Manager/Badge Photo); background-check vendor; admin edit/correction of SSN/DL#; encryption-key rotation tooling; the other 7 Formstack forms.
