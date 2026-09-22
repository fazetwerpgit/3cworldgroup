# In-house E-sign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reps sign the five onboarding PDFs inside the portal with no vendor, behind the existing `EsignProvider` interface, selected by `ESIGN_PROVIDER=inhouse`.

**Architecture:** A new `inhouse` provider creates an `esignEnvelopes/{id}` record and returns an in-app signing path. The rep's browser renders the blank PDF (pdfjs-dist), collects fields + a signature PNG, and POSTs to a sign route that stamps the PDF server-side (pdf-lib), uploads it, and runs the same completion code the SignWell webhook runs (extracted into `complete.ts`). SignWell stays intact as the default provider.

**Tech Stack:** Next.js 16 app router, TypeScript, Firebase Admin (Firestore + Storage), pdf-lib 1.17.1 (server stamping), pdfjs-dist 5.x (client render), vitest 4, React 19.

Spec: `docs/superpowers/specs/2026-09-08-inhouse-esign-design.md`.

## Global Constraints

- Provider default stays `signwell`. `ESIGN_PROVIDER=inhouse` selects the new provider. Never change SignWell behavior.
- Only the rep signs. No countersigning.
- Field coordinates in `DOCUMENTS` are 96-DPI pixels, origin top-left. PDF points: `pt = px * 0.75`, `y_pt = pageHeight - (y + h) * 0.75`. All source pages are US Letter (612x792 pt; W-9 is 611.976x791.968, so always read the page's own height).
- Sensitive keys `ssn`, `ein`, `routing_number`, `account_number` are stamped into the PDF only. Never written to Firestore (`esignEnvelopes`, `userOnboarding`), logs, or notifications. Envelope `prefill` holds only `accountType` / `taxClassification`.
- Completed PDF storage path: `esign-completed/{userId}/{itemId}.pdf` (unchanged).
- `esignEnvelopes` has no firestore.rules match; Admin SDK only.
- Signing path: `/portal/onboarding/sign/{envelopeId}` (already allowed for pending reps by the `/portal/onboarding` prefix in `src/lib/auth/onboardingAccess.ts`; the API prefix `/api/portal/onboarding` covers the new routes).
- Consent text (verbatim): `I agree that my electronic signature is the legal equivalent of my handwritten signature, and I consent to sign and receive this document electronically.`
- Signature PNG: max 200 KB, must start with PNG magic bytes `89 50 4E 47 0D 0A 1A 0A`.
- Mobile-first, iPhone safe-area insets respected (`env(safe-area-inset-*)`).
- Gates before done: `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
- Work happens in a detached worktree of `origin/master` (`~/dev/3cwg-esign`). The main working tree (`~/dev/3cworldgroup`) holds unrelated redesign edits and must not be touched.

## File Structure

| File | Owner | Responsibility |
|---|---|---|
| `src/lib/esign/documents.ts` (new) | W1 | `DOCUMENTS` map + field types moved out of `signwell.ts`; labels, sensitive keys, coordinate conversion, `selectedCheckboxKey`, `validateFields` |
| `src/lib/esign/documents.test.ts` (new) | W1 | conversion + validation unit tests |
| `src/lib/esign/signwell.ts` | W1 | import `DOCUMENTS`/types from documents.ts; no behavior change |
| `src/lib/esign/stamp.ts` (new) | W1 | `stampDocument` with pdf-lib; audit page; hashes |
| `src/lib/esign/stamp.test.ts` (new) | W1 | stamps every docKey; page count; checkbox; signature fit |
| `src/lib/esign/complete.ts` (new) | W2 | `completeEsignItem` extracted from webhook route |
| `src/lib/esign/complete.test.ts` (new) | W2 | Firestore writes, upload, notifications |
| `src/app/api/webhooks/esign/route.ts` | W2 | call `completeEsignItem`; existing route.test.ts must still pass unchanged |
| `src/lib/esign/inhouse.ts` (new) | W3 | `inhouseProvider` |
| `src/lib/esign/inhouse.test.ts` (new) | W3 | provider tests |
| `src/lib/esign/provider.ts` | W3 | add `inhouse` id + switch |
| `src/app/api/portal/onboarding/esign/sign/route.ts` (+ test) | W3 | POST sign |
| `src/app/api/portal/onboarding/esign/envelope/[id]/route.ts` (+ test) | W3 | GET field readiness |
| `src/app/api/portal/onboarding/esign/envelope/[id]/pdf/route.ts` | W3 | GET blank source PDF |
| `src/app/portal/onboarding/sign/[envelopeId]/page.tsx` (new) | W4 | sign page |
| `src/app/portal/onboarding/sign/[envelopeId]/sign-page.module.css` (new) | W4 | page styles, safe-area, script font face |
| `src/components/esign/PdfPages.tsx` (new) | W4 | pdfjs render to canvases |
| `src/components/esign/SignaturePad.tsx` (new) | W4 | draw/type -> PNG data URL |
| `src/components/esign/signatureStore.ts` (+ test) | W4 | sessionStorage helper |
| `src/components/onboarding/EsignSignAction.tsx` (+ test) | W4 | in-app nav when url starts with `/` |
| `src/contexts/AuthContext.tsx` | W4 | clear stored signature on signOut |
| `public/fonts/DancingScript.ttf`, `public/fonts/OFL-DancingScript.txt` | W4 | script font |
| `package.json` / `package-lock.json` | orchestrator (before dispatch) | `pdf-lib` -> dependencies, add `pdfjs-dist` |

---

### Task 0: Worktree + dependencies (orchestrator, before workers)

- [ ] `git fetch origin && git worktree add --detach ~/dev/3cwg-esign origin/master`
- [ ] In `~/dev/3cwg-esign`: `npm install` then `npm install pdf-lib@1.17.1 pdfjs-dist@5 && npm uninstall -D pdf-lib` so `pdf-lib` is in `dependencies` (server runtime) and `pdfjs-dist` is in `dependencies`.
- [ ] Verify: `node -e "const p=require('./package.json');console.log(p.dependencies['pdf-lib'],p.dependencies['pdfjs-dist'],p.devDependencies['pdf-lib'])"` prints two versions and `undefined`.
- [ ] Copy this plan and the spec into the worktree (`docs/superpowers/...`) so workers can read them.

---

### Task 1 (W1): `documents.ts` extraction

**Files:**
- Create: `src/lib/esign/documents.ts`, `src/lib/esign/documents.test.ts`
- Modify: `src/lib/esign/signwell.ts` (replace the local `DOCUMENTS`, `SignWellFieldSpec`, `SignWellDocumentConfig` declarations with imports; keep `SignWellField`, `fieldsFor`, everything else byte-identical in behavior)

**Interfaces (Produces):**

```ts
// src/lib/esign/documents.ts
import type { EsignDocKey } from './provider';

export type EsignFieldType = 'text' | 'checkbox';

export interface EsignBox {
  x: number; y: number; width: number; height: number; page: number; // 96dpi px, top-left origin, page is 1-based
  required: boolean;
  date_format?: 'MM/DD/YYYY';
  lock_sign_date?: boolean;
}

export interface EsignExtraField extends EsignBox { key: string; type: EsignFieldType }

export interface EsignDocumentConfig {
  file: string;            // under assets/esign/
  name: string;
  pages: number;           // contract 3, direct_deposit 2, pay_structure 1, w9 6, fcra_auth 1
  signature: EsignBox;
  date: EsignBox;
  extra?: EsignExtraField[];
}

export const DOCUMENTS: Record<EsignDocKey, EsignDocumentConfig>; // moved verbatim from signwell.ts, plus `pages`

export const SENSITIVE_FIELD_KEYS = ['ssn', 'ein', 'routing_number', 'account_number'] as const;
export function isSensitiveFieldKey(key: string): boolean;

export const FIELD_LABELS: Record<string, string> = {
  agent_name: 'Agent name', business_name: 'Business name (optional)', ein: 'EIN', street_address: 'Street address',
  city_state_zip: 'City, State ZIP', office_phone: 'Office phone (optional)', cell_phone: 'Cell phone', email: 'Email',
  website: 'Website (optional)', legal_name: 'Legal name', bank_name: 'Bank name', routing_number: 'Routing number',
  account_number: 'Account number', checking: 'Checking', savings: 'Savings', deposit_amount: 'Deposit amount (optional)',
  full_net_amount: 'Deposit full net amount', name: 'Name (as shown on your tax return)',
  individual_sole_prop: 'Individual / sole proprietor', llc: 'LLC', llc_classification: 'LLC tax classification (C, S, or P)',
  address: 'Address', ssn: 'Social Security number', // one of ssn/ein
};

// Coordinate conversion (spec): pt = px * 0.75; y_pt = pageHeight - (y + h) * 0.75
export interface PdfRect { x: number; y: number; width: number; height: number }
export function boxToPdfRect(box: Pick<EsignBox, 'x' | 'y' | 'width' | 'height'>, pageHeightPt: number): PdfRect;

// Which checkbox the stored prefill selects (moved from signwell.ts fieldsFor):
export function selectedCheckboxKey(docKey: EsignDocKey, prefill?: Record<string, string>): string | undefined;

// Server-side validation of rep-submitted fields for a document.
export type EsignFieldValues = Record<string, string | boolean>;
export type FieldValidation = { ok: true; fields: EsignFieldValues } | { ok: false; error: string };
export function validateFields(docKey: EsignDocKey, input: unknown): FieldValidation;
```

`validateFields` rules: input must be a plain object; drop unknown keys; text -> `String(v).trim()` capped at 200 chars, checkbox -> `v === true`; every `required: true` text field must be non-empty (error `Missing required field: {label}`); `w9`: exactly one of `ssn`/`ein` non-empty (error `Provide either an SSN or an EIN`) and exactly one of `individual_sole_prop`/`llc` true (error `Choose a tax classification`); `direct_deposit`: exactly one of `checking`/`savings` true (error `Choose checking or savings`). Documents with no `extra` return `{ ok: true, fields: {} }`.

- [ ] **Step 1: failing tests** `src/lib/esign/documents.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { DOCUMENTS, boxToPdfRect, selectedCheckboxKey, validateFields, isSensitiveFieldKey } from './documents';

describe('boxToPdfRect', () => {
  it('converts 96dpi top-left px to pt bottom-left', () => {
    expect(boxToPdfRect({ x: 184, y: 584, width: 312, height: 34 }, 792)).toEqual({ x: 138, y: 792 - (584 + 34) * 0.75, width: 234, height: 25.5 });
  });
});
describe('DOCUMENTS', () => {
  it('has page counts for all five docs', () => {
    expect(Object.fromEntries(Object.entries(DOCUMENTS).map(([k, v]) => [k, v.pages]))).toEqual({ contract: 3, direct_deposit: 2, pay_structure: 1, w9: 6, fcra_auth: 1 });
  });
  it('never places a field beyond the page count', () => {
    for (const cfg of Object.values(DOCUMENTS)) for (const f of [cfg.signature, cfg.date, ...(cfg.extra ?? [])]) expect(f.page).toBeLessThanOrEqual(cfg.pages);
  });
});
describe('selectedCheckboxKey', () => {
  it('maps prefill to checkbox keys', () => {
    expect(selectedCheckboxKey('direct_deposit', { accountType: 'savings' })).toBe('savings');
    expect(selectedCheckboxKey('w9', { taxClassification: 'llc' })).toBe('llc');
    expect(selectedCheckboxKey('contract', { accountType: 'checking' })).toBeUndefined();
  });
});
describe('validateFields', () => {
  it('rejects missing required text', () => {
    expect(validateFields('contract', { agent_name: '' })).toMatchObject({ ok: false });
  });
  it('drops unknown keys and coerces types', () => {
    const r = validateFields('direct_deposit', { legal_name: ' A ', bank_name: 'B', routing_number: '1', account_number: '2', checking: true, bogus: 'x' });
    expect(r).toEqual({ ok: true, fields: { legal_name: 'A', bank_name: 'B', routing_number: '1', account_number: '2', checking: true } });
  });
  it('requires one TIN and one classification on w9', () => {
    const base = { name: 'N', address: 'A', city_state_zip: 'C', individual_sole_prop: true };
    expect(validateFields('w9', base)).toMatchObject({ ok: false, error: 'Provide either an SSN or an EIN' });
    expect(validateFields('w9', { ...base, ssn: '1', ein: '2' })).toMatchObject({ ok: false });
    expect(validateFields('w9', { ...base, ssn: '1' })).toMatchObject({ ok: true });
  });
  it('returns empty fields for docs without extras', () => {
    expect(validateFields('fcra_auth', {})).toEqual({ ok: true, fields: {} });
  });
});
it('knows sensitive keys', () => { expect(isSensitiveFieldKey('ssn')).toBe(true); expect(isSensitiveFieldKey('name')).toBe(false); });
```

- [ ] **Step 2:** `npx vitest run src/lib/esign/documents.test.ts` -> FAIL (module not found)
- [ ] **Step 3:** create `documents.ts` per the interface; move `DOCUMENTS` verbatim (add `pages`); update `signwell.ts` to `import { DOCUMENTS, selectedCheckboxKey, type EsignBox, type EsignDocumentConfig } from './documents'` and make `fieldsFor` use `selectedCheckboxKey`.
- [ ] **Step 4:** `npx vitest run src/lib/esign` -> documents + signwell tests PASS.
- [ ] **Step 5:** commit `refactor(esign): move DOCUMENTS into documents.ts with validation helpers`

---

### Task 2 (W1): `stamp.ts`

**Files:** Create `src/lib/esign/stamp.ts`, `src/lib/esign/stamp.test.ts`

**Interfaces (Produces):**

```ts
import type { EsignDocKey } from './provider';
import type { EsignFieldValues } from './documents';

export interface StampAudit {
  envelopeId: string; signerName: string; signerEmail: string; userId: string;
  consentText: string; consentAt: Date; ip: string; userAgent: string; signatureMethod: 'draw' | 'type';
}
export interface StampInput {
  docKey: EsignDocKey; fields: EsignFieldValues; signaturePng: Buffer; signedAt: Date; audit: StampAudit;
}
export interface StampResult { pdf: Buffer; sourceSha256: string; stampedSha256: string; pageCount: number }
export function sha256Hex(bytes: Uint8Array | Buffer): string;
export function formatSignDate(d: Date): string; // MM/DD/YYYY in America/Chicago
export async function stampDocument(input: StampInput): Promise<StampResult>;
```

Behavior:
1. Read `assets/esign/{DOCUMENTS[docKey].file}` via `path.join(process.cwd(), 'assets', 'esign', file)`; `sourceSha256 = sha256Hex(bytes)`.
2. `PDFDocument.load(bytes)`; embed `StandardFonts.Helvetica` and `StandardFonts.ZapfDingbats`.
3. For each `extra` field with a value: page = `doc.getPage(f.page - 1)`; `rect = boxToPdfRect(f, page.getHeight())`. Text: font size = `min(11, rect.height * 0.7)`, shrink until `font.widthOfTextAtSize(text, size) <= rect.width - 4` (floor 6); draw at `x + 2`, `y + (rect.height - size) / 2`, black. Checkbox with `true`: draw ZapfDingbats `'4'` (check mark) sized `rect.height * 0.8`, centered.
4. Signature: `doc.embedPng(signaturePng)`; scale = `min(rect.width / img.width, rect.height / img.height)`; draw centered in the signature box. Date: `formatSignDate(signedAt)` in the date box, same text rule.
5. `stampedBytes = await doc.save()`; `stampedSha256 = sha256Hex(stampedBytes)`.
6. Reload `stampedBytes`, `addPage([612, 792])`, print the audit block with Helvetica 10pt, 14pt leading, starting at y=740 x=48: title `Signature audit`, then lines: `Document: {name}`, `Envelope: {envelopeId}`, `Signer: {signerName} <{signerEmail}>`, `User id: {userId}`, `Signed at (UTC): {iso}`, `Signed at (America/Chicago): {Intl formatted}`, `Consent: {consentText}` (wrap at ~90 chars), `Consent at (UTC): {iso}`, `IP address: {ip}`, `User agent: {userAgent}` (wrap), `Signature method: {draw|type}`, `Source PDF SHA-256: {sourceSha256}`, `Stamped PDF SHA-256 (before this page): {stampedSha256}`.
7. Return `{ pdf: Buffer.from(await doc.save()), sourceSha256, stampedSha256, pageCount }`.

- [ ] **Step 1: failing tests** `src/lib/esign/stamp.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { stampDocument, formatSignDate, sha256Hex } from './stamp';
import { DOCUMENTS } from './documents';
import type { EsignDocKey } from './provider';

// 2x2 opaque PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAD0lEQVR4nGNgYGD4z8DAAAAFAQH/8kZ0mwAAAABJRU5ErkJggg==', 'base64');
const audit = { envelopeId: 'env-1', signerName: 'Test Rep', signerEmail: 't@example.com', userId: 'u1', consentText: 'I agree.', consentAt: new Date('2026-09-08T15:00:00Z'), ip: '203.0.113.5', userAgent: 'Mozilla/5.0 (iPhone)', signatureMethod: 'draw' as const };
const fieldsFor = (k: EsignDocKey) => Object.fromEntries((DOCUMENTS[k].extra ?? []).map((f) => [f.key, f.type === 'checkbox' ? true : `v-${f.key}`]));

describe('stampDocument', () => {
  it.each(Object.keys(DOCUMENTS) as EsignDocKey[])('stamps %s and appends one audit page', async (docKey) => {
    const r = await stampDocument({ docKey, fields: fieldsFor(docKey), signaturePng: PNG, signedAt: new Date('2026-09-08T15:00:00Z'), audit });
    const out = await PDFDocument.load(r.pdf);
    expect(out.getPageCount()).toBe(DOCUMENTS[docKey].pages + 1);
    expect(r.pageCount).toBe(DOCUMENTS[docKey].pages + 1);
    expect(r.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.stampedSha256).not.toBe(r.sourceSha256);
    expect(r.stampedSha256).not.toBe(sha256Hex(r.pdf));
  });
  it('produces a different file when a checkbox flips', async () => {
    const a = await stampDocument({ docKey: 'direct_deposit', fields: { checking: true }, signaturePng: PNG, signedAt: new Date(0), audit });
    const b = await stampDocument({ docKey: 'direct_deposit', fields: { checking: false }, signaturePng: PNG, signedAt: new Date(0), audit });
    expect(a.stampedSha256).not.toBe(b.stampedSha256);
  });
  it('rejects a non-PNG signature', async () => {
    await expect(stampDocument({ docKey: 'fcra_auth', fields: {}, signaturePng: Buffer.from('nope'), signedAt: new Date(), audit })).rejects.toThrow();
  });
});
it('formats the sign date in Chicago time', () => {
  expect(formatSignDate(new Date('2026-09-09T03:30:00Z'))).toBe('09/08/2026');
});
```

- [ ] **Step 2:** run -> FAIL. **Step 3:** implement. **Step 4:** PASS (note: pdf-lib's `save()` is deterministic only with `{ useObjectStreams: false }`; the checkbox test just needs the two outputs to differ).
- [ ] **Step 5:** commit `feat(esign): pdf-lib stamping with audit page`

---

### Task 3 (W2): `complete.ts` extraction

**Files:** Create `src/lib/esign/complete.ts`, `src/lib/esign/complete.test.ts`; Modify `src/app/api/webhooks/esign/route.ts` (lines from `const now = new Date();` through the activation flag). `src/app/api/webhooks/esign/route.test.ts` must pass **unchanged**; its `vi.mock` targets (`@/lib/firebase/admin`, `@/lib/notifications/createNotification`, `@/types/onboarding`, `@/lib/onboarding/activation`, `@/lib/onboarding/ownerNotify`) are the same modules `complete.ts` must import from, by those exact specifiers.

**Interfaces (Produces):**

```ts
export interface CompleteEsignItemInput {
  userId: string; itemId: string; envelopeId: string;
  /** Signed PDF bytes, or null when the provider fetch failed (approval is still recorded, upload skipped). */
  pdf: Buffer | null;
}
export interface CompleteEsignItemResult { completedPdfPath: string | null }
export async function completeEsignItem(input: CompleteEsignItemInput): Promise<CompleteEsignItemResult>;
```

Behavior (exactly the webhook's current order): (1) `adminDb.doc('userOnboarding/{userId}_{itemId}').set({ userId, itemId, status:'approved', rejectionReason:null, reviewedBy:'system', reviewerName:'E-sign (auto)', reviewedAt: now, updatedAt: now }, { merge: true })`; (2) if `pdf`, save to `esign-completed/{userId}/{itemId}.pdf` via `adminStorage.bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET).file(path).save(pdf, { contentType:'application/pdf', resumable:false })`, then `set({ completedPdfPath }, { merge:true })`; on error log `[esign complete] completed pdf failed` and continue with `completedPdfPath = null`; (3) `createNotification({ userId, type:'esign_completed', title:'Document signed', message:'{item.label} is complete.', link:'/portal/onboarding' })`; (4) resolve rep name from `users/{userId}` (displayName || email || uid), `notifyDocSigned({ userId, repName, itemLabel })` in try/catch; (5) `maybeFlagActivationReady(userId)` in try/catch. Throws if `adminDb` is null or the item is not in `ONBOARDING_ITEMS`.

Webhook route: replace the tail with
```ts
let pdf: Buffer | null = null;
try { pdf = await getEsignProvider().getCompletedPdf(event.envelopeId); }
catch (error) { console.error('[esign webhook] completed pdf failed', { userId, itemId, envelopeId: event.envelopeId, error }); }
await completeEsignItem({ userId, itemId, envelopeId: event.envelopeId, pdf });
return NextResponse.json({ ok: true });
```
Check the existing webhook test for the ordering assertion where the approval `set` happens before `getCompletedPdf` is called; if it asserts that order, keep the approval write before the fetch by giving `completeEsignItem` an optional `fetchPdf?: () => Promise<Buffer>` instead of `pdf`, called after step (1). Pick whichever keeps `route.test.ts` green without edits, and document the choice in the commit body.

- [ ] **Step 1:** write `complete.test.ts` mirroring the webhook test's mocks; cases: approval write shape; upload path + `completedPdfPath` write; `pdf: null` skips upload but still notifies; upload error logged and result `completedPdfPath: null`; owner notification receives displayName; activation flag failure does not throw.
- [ ] **Step 2:** FAIL. **Step 3:** implement + rewire webhook. **Step 4:** `npx vitest run src/lib/esign/complete.test.ts src/app/api/webhooks/esign` PASS.
- [ ] **Step 5:** commit `refactor(esign): extract completeEsignItem from the webhook route`

---

### Task 4 (W3): `inhouse.ts` provider + `provider.ts`

**Files:** Create `src/lib/esign/inhouse.ts`, `src/lib/esign/inhouse.test.ts`; Modify `src/lib/esign/provider.ts`.

**Interfaces:**

```ts
// provider.ts
id: 'signwell' | 'adobe_sign' | 'inhouse';
// getEsignProvider(): if (id === 'inhouse') return inhouseProvider;

// inhouse.ts
export const ENVELOPES_COLLECTION = 'esignEnvelopes';
export function inhouseSignPath(envelopeId: string): string; // `/portal/onboarding/sign/${envelopeId}`
export interface InhouseEnvelope {
  docKey: EsignDocKey; userId: string; itemId: string; signerName: string; signerEmail: string;
  status: 'sent' | 'completed'; createdAt: Date; completedAt?: Date; consentAt?: Date; ip?: string; userAgent?: string;
  signatureMethod?: 'draw' | 'type'; sourcePdfSha256: string; signedPdfSha256?: string; signedPdfPath?: string;
  prefill: Record<string, string>; // only accountType / taxClassification
}
export const inhouseProvider: EsignProvider;
```

`createEnvelope`: `id = randomUUID()`; `sourcePdfSha256` = sha256 of `assets/esign/{file}` (use `sha256Hex` from `./stamp`, read file with `node:fs/promises`); `prefill` = pick `accountType`, `taxClassification` from `req.prefill`; `adminDb.collection(ENVELOPES_COLLECTION).doc(id).set({...})`; return `{ envelopeId: id, embeddedSigningUrl: inhouseSignPath(id) }`. Throws `Database not configured` when `adminDb` null.
`getEmbeddedSigningUrl`: doc missing -> throw `Envelope not found`; return `{ url: inhouseSignPath(id), completed: status === 'completed' }`.
`getCompletedPdf`: doc missing or no `signedPdfPath` -> throw; `const [bytes] = await getOnboardingBucket().file(signedPdfPath).download(); return bytes`.
`parseWebhook`: `return null`.

- [ ] **Step 1: tests** (mock `@/lib/firebase/admin` with `adminDb.collection().doc().{get,set}` and `getOnboardingBucket`): createEnvelope writes status `sent`, filtered prefill (a `ssn` key in prefill is dropped), returns the sign path; getEmbeddedSigningUrl completed flag both ways and throws on missing; getCompletedPdf downloads `signedPdfPath`; parseWebhook null; `getEsignProvider()` returns inhouse when `ESIGN_PROVIDER=inhouse` and signwell when unset (use `vi.stubEnv`).
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5:** commit `feat(esign): in-house provider behind ESIGN_PROVIDER=inhouse`

---

### Task 5 (W3): envelope GET + blank PDF routes

**Files:** Create `src/app/api/portal/onboarding/esign/envelope/[id]/route.ts`, `route.test.ts`, `src/app/api/portal/onboarding/esign/envelope/[id]/pdf/route.ts`.

Auth: `requireVerifiedUser` from `@/lib/auth/requireVerifiedAdmin`. Load envelope; 404 if missing; 403 if `userId !== gate.uid`. Route signature: `GET(request: NextRequest, ctx: { params: Promise<{ id: string }> })`.

**Response shape (Produces, consumed by W4):**

```ts
export interface EnvelopeFieldView {
  key: string; type: 'text' | 'checkbox'; label: string; required: boolean; sensitive: boolean;
  value: string | boolean; prefilled: boolean; page: number;
}
export interface EnvelopeView {
  envelopeId: string; docKey: EsignDocKey; name: string; status: 'sent' | 'completed'; pageCount: number;
  signerName: string; signerEmail: string; fields: EnvelopeFieldView[];
}
```

Prefill: read `users/{uid}` (`displayName`, `email`, `phone`, `address`, `city`, `state`, `zip`). Mapping: `agent_name`, `legal_name`, `name` <- displayName; `email` <- email; `cell_phone` <- phone; `street_address`, `address` <- address; `city_state_zip` <- `${city}, ${state} ${zip}` when all three exist; checkbox `selectedCheckboxKey(docKey, envelope.prefill)` -> true. `prefilled = value !== ''` for text. Sensitive fields always `value: ''`, `prefilled: false`. Never log field values.

`pdf/route.ts`: same auth/ownership; `readFile(path.join(process.cwd(), 'assets', 'esign', DOCUMENTS[docKey].file))`; respond `application/pdf`, `Cache-Control: private, no-store`, `Content-Disposition: inline; filename="{file}"`.

- [ ] Tests: 403 wrong user, 404 missing, field list includes displayName prefill and the checkbox from `prefill.accountType`, sensitive field value empty.
- [ ] commit `feat(esign): envelope field readiness + blank pdf routes`

---

### Task 6 (W3): sign route

**Files:** Create `src/app/api/portal/onboarding/esign/sign/route.ts`, `route.test.ts`.

Body: `{ envelopeId: string; fields: Record<string, string|boolean>; signaturePng: string; signatureMethod: 'draw'|'type'; consent: true }`.

Order: auth (401/403 via gate) -> parse body (400) -> `consent !== true` 400 `consent required` -> `signatureMethod` invalid 400 -> decode `signaturePng` (must start `data:image/png;base64,`; decoded length <= 204800; first 8 bytes equal PNG magic) else 400 `invalid signature image` -> load envelope (404) -> `userId !== gate.uid` 403 -> `status === 'completed'` 409 -> `validateFields(docKey, { ...defaultsFromPrefill, ...body.fields })` where `defaultsFromPrefill` sets `selectedCheckboxKey(...)` to true; 400 with its error -> `stampDocument({ docKey, fields, signaturePng, signedAt: now, audit: { envelopeId, signerName, signerEmail, userId, consentText: ESIGN_CONSENT_TEXT, consentAt: now, ip, userAgent, signatureMethod } })` -> `completeEsignItem({ userId, itemId, envelopeId, pdf })` (500 `sign failed` on throw; log without field values) -> if `completedPdfPath` null respond 502 `upload failed` (envelope stays `sent`, retry allowed) -> envelope `set({ status:'completed', completedAt: now, consentAt: now, ip, userAgent, signatureMethod, signedPdfSha256: sha256Hex(pdf), signedPdfPath: completedPdfPath }, { merge:true })` -> `{ completed: true }`.

`ip` = first entry of `x-forwarded-for` or `x-real-ip` or `''`; `userAgent` = `user-agent` header or `''`. Export `ESIGN_CONSENT_TEXT` from `src/lib/esign/documents.ts` (W1 adds it; W3 imports it. Exact text is in Global Constraints).

- [ ] Tests (mock admin, stamp, complete, gate): wrong user 403; completed 409; missing consent 400; oversized PNG 400; non-PNG 400; happy path calls `stampDocument` with the merged fields, calls `completeEsignItem` with `{ userId, itemId, envelopeId, pdf }`, writes envelope `status: 'completed'` without any `ssn`/`routing_number` key, returns `{ completed: true }`; upload failure returns 502 and leaves the envelope untouched.
- [ ] commit `feat(esign): in-house sign route`

---

### Task 7 (W4): sign page + components

**Files:** Create `src/app/portal/onboarding/sign/[envelopeId]/page.tsx`, `sign-page.module.css`, `src/components/esign/PdfPages.tsx`, `src/components/esign/SignaturePad.tsx`, `src/components/esign/signatureStore.ts` (+ `.test.ts`), `public/fonts/DancingScript.ttf`, `public/fonts/OFL-DancingScript.txt`. Modify `src/components/onboarding/EsignSignAction.tsx` (+ its test), `src/contexts/AuthContext.tsx` (signOut).

**Consumes:** `GET /api/portal/onboarding/esign/envelope/{id}` -> `EnvelopeView` (Task 5), `GET .../envelope/{id}/pdf` (blank PDF bytes), `POST /api/portal/onboarding/esign/sign` (Task 6). Auth header: `Authorization: Bearer ${await getIdToken()}` from `@/lib/firebase/getIdToken`.

Page (`'use client'`), wrapped in `<ProtectedRoute>` and `MemberLineShell` (import `@/styles/sweep-rep-b.css` like `src/app/portal/onboarding/page.tsx`). `const { envelopeId } = useParams<{ envelopeId: string }>()`. Sections in order:
1. **Read** — `<PdfPages src={pdfUrl} authHeaders={...}>`: fetches the PDF as ArrayBuffer with the auth header, `const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();` renders each page to a `<canvas>` at `devicePixelRatio` scale fit to container width. If `npm run build` cannot bundle the worker URL, fall back to copying `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` into `public/pdf.worker.min.mjs` with a `prebuild` script `node scripts/copy-pdf-worker.mjs` and `workerSrc = '/pdf.worker.min.mjs'`; report which was used.
2. **Fill** — for each field: text -> `<input>` (`autoComplete="off"`; `inputMode="numeric"` for `ssn`, `ein`, `routing_number`, `account_number`, `cell_phone`, `office_phone`; `inputMode="email"` for `email`); prefilled fields render read-only with an `Edit` toggle; checkbox -> native `<input type="checkbox">`. Sensitive inputs additionally `autoCapitalize="off"`, `spellCheck={false}`.
3. **Sign** — `<SignaturePad onChange={(png, method) => ...} initial={stored}>`: tabs Draw / Type. Draw: `<canvas>` with pointer events (`touch-action: none`), 2.5px black stroke, Clear button, exports via `toDataURL('image/png')` (trim to ink bounds + 8px padding). Type: `<input>` for the name rendered in `'Dancing Script', cursive` 48px preview; on change, draw the text onto an offscreen canvas after `await document.fonts.load('48px "Dancing Script"')` and export PNG. Consent `<label><input type="checkbox">` with the exact consent text. `Sign` button disabled until consent && png && every required field non-empty (and one-of rules for w9 / direct_deposit, mirrored client-side for UX only).
4. **Done** — on `{ completed: true }`: success card `Signed. This document is complete.` + `<Link href="/portal/onboarding">Back to checklist</Link>`. On 409: show the same done state. Other errors: inline message + retry.

`signatureStore.ts`: `const KEY = 'esign.signature'; export function loadSignature(): { png: string; method: 'draw'|'type' } | null; export function saveSignature(v): void; export function clearSignature(): void;` all try/catch around `sessionStorage`. `AuthContext.signOut` calls `clearSignature()` before `firebaseSignOut`.

`sign-page.module.css`: `@font-face { font-family: 'Dancing Script'; src: url('/fonts/DancingScript.ttf') format('truetype'); font-display: swap; }`; page padding `max(16px, env(safe-area-inset-left/right))`, bottom padding `calc(24px + env(safe-area-inset-bottom))`; sticky sign bar at bottom with the same inset. Font file: download `https://github.com/google/fonts/raw/main/ofl/dancingscript/DancingScript%5Bwght%5D.ttf` to `public/fonts/DancingScript.ttf` and `https://github.com/google/fonts/raw/main/ofl/dancingscript/OFL.txt` to `public/fonts/OFL-DancingScript.txt`.

`EsignSignAction.tsx`: at the top of `open`, `if (signingUrl.startsWith('/')) { router.push(signingUrl); return; }` (`useRouter` from `next/navigation`). Add a test: with `signingUrl="/portal/onboarding/sign/abc"` clicking Sign now calls `router.push` with that path and never fetches `esign-signing-url` (mock `next/navigation`). Existing tests unchanged.

- [ ] Tests: `signatureStore.test.ts` (jsdom env comment `// @vitest-environment jsdom`): save/load/clear roundtrip, load returns null on garbage. `EsignSignAction.test.tsx` new case as above.
- [ ] `npx tsc --noEmit` clean; `npm run build` succeeds (this verifies the pdfjs worker bundling).
- [ ] commit `feat(esign): in-portal sign page with draw/type signature`

---

### Task 8: integration gates (cleanup worker)

- [ ] `npx tsc --noEmit` -> 0 errors. `npx vitest run` -> all green. `npm run build` -> success.
- [ ] `git diff origin/master --stat` reviewed by the orchestrator against this plan.

### Task 9: ship (orchestrator)

- [ ] In `~/dev/3cwg-esign`: single commit (or the workers' commits squashed) with message file; `git push origin HEAD:master`. Do not set `ESIGN_PROVIDER` in Vercel prod. Update `docs/redesign/RESUME.md` in the main tree with: shipped SHA, preview-test instructions (`ESIGN_PROVIDER=inhouse` on a Vercel preview env), Mason follow-up.

## Self-review

- Spec coverage: provider (T4), complete (T3), stamp (T2), sign API + envelope API + pdf (T5/T6), sign page + entry point (T7), records (T4), rollout (T9), testing list (T1-T7). `getCompletedPdf` in `signed-pdf` route works unchanged because `completedPdfPath` is set by `completeEsignItem`.
- Type consistency: `EsignFieldValues`, `validateFields`, `selectedCheckboxKey`, `boxToPdfRect`, `ESIGN_CONSENT_TEXT` (documents.ts); `stampDocument`/`StampResult`/`sha256Hex` (stamp.ts); `completeEsignItem` (complete.ts); `inhouseSignPath`, `ENVELOPES_COLLECTION` (inhouse.ts); `EnvelopeView` (envelope route). Same names used everywhere above.
