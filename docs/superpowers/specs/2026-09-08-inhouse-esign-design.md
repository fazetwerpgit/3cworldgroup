# In-house e-signature (replace SignWell) — design

Date: 2026-09-08. Approved by Jacob (option 1: in-house provider behind the existing interface).

## Goal

Reps sign the five onboarding documents inside the portal with no vendor. Zero per-document cost.
Admin, auto-send, reject-resend, and signed-PDF download keep working unchanged. SignWell stays in
the code as a fallback provider.

## Decisions (locked)

- Only the rep signs. No countersigning.
- Signature: draw (finger/mouse) or type name in a script font; rep chooses. Saved once per
  session and reused for the remaining documents.
- Provider selected by env `ESIGN_PROVIDER=inhouse` (default stays `signwell` until switched).
- Documents and field coordinates: reuse the existing `DOCUMENTS` map from
  `src/lib/esign/signwell.ts` (moved to a shared `src/lib/esign/documents.ts`). Coordinates are
  96-DPI pixels, origin top-left. PDF points: `pt = px * 0.75`, `y_pt = pageHeight - (y + h) * 0.75`.
- Sensitive values (SSN, EIN, routing, account number) are stamped into the PDF only. Never
  written to Firestore, envelope records, logs, or notifications.

## Architecture

### `inhouse` provider — `src/lib/esign/inhouse.ts`

Implements `EsignProvider` (`src/lib/esign/provider.ts`):

- `createEnvelope(req)`: creates `esignEnvelopes/{id}` (see Records) with status `sent`. Returns
  `{ envelopeId, embeddedSigningUrl: '/portal/onboarding/sign/{id}' }`. Nothing is rendered up front.
- `getEmbeddedSigningUrl(envelopeId)`: reads the envelope; returns `{ url, completed }`.
- `getCompletedPdf(envelopeId)`: reads `signedPdfPath` from the envelope and returns the bytes from
  Storage.
- `parseWebhook`: returns null (unused for in-house).

`getEsignProvider()` gains the `inhouse` id.

### Shared completion — `src/lib/esign/complete.ts`

Extract the completion body of `src/app/api/webhooks/esign/route.ts` (status approved, clear
rejection, system reviewer fields, `completedPdfPath`, `esign_completed` notification, owner
notification, activation-readiness flag) into
`completeEsignItem({ userId, itemId, envelopeId, pdf: Buffer })`. The webhook route and the in-house
sign route both call it. Storage path stays `esign-completed/{userId}/{itemId}.pdf`.

### PDF stamping — `src/lib/esign/stamp.ts` (server only, pdf-lib)

`stampDocument({ docKey, fields, signaturePng, signedAt, audit }) => Buffer`

- Loads `assets/esign/{file}`, writes each field from `DOCUMENTS[docKey]` (text: Helvetica, sized to
  the box; checkbox: draws a check when the value is true), embeds the signature PNG scaled into the
  signature box, prints the date in the date box (`MM/DD/YYYY`).
- Appends one audit page: document name, envelope id, signer name, email, user id, signed-at (UTC and
  America/Chicago), consent statement text and consent time, IP address, user agent, signature
  method (`draw` | `type`), SHA-256 of the source PDF and of the stamped PDF (the stamped hash is
  computed over the document without the audit page, then printed; the final file hash is stored in
  the envelope record).

### Sign API — `POST /api/portal/onboarding/esign/sign`

Body: `{ envelopeId, fields: Record<string,string|boolean>, signaturePng: dataUrl, signatureMethod,
consent: true }`. Auth: the signed-in rep (existing portal auth helper). Checks: envelope exists,
`userId` matches, status `sent`, `consent === true`, signature PNG under 200 KB and a real PNG,
required fields for that docKey present. Then: stamp, upload, `completeEsignItem`, update envelope to
`completed` with audit data, respond `{ completed: true }`. Second call on a completed envelope
returns 409. Any failure after upload is logged and still returns the error; the rep can retry
(idempotent on storage path).

Field readiness API — `GET /api/portal/onboarding/esign/envelope/{id}`: returns docKey, document
name, the field list with prefilled values (from `users/{uid}`, `prefill` on the item, and the
envelope), which fields the rep must type, and the page count. Same auth and ownership check.

### Sign page — `src/app/portal/onboarding/sign/[envelopeId]/page.tsx`

Client page, mobile-first (all reps on iPhone; respect safe-area insets). Sections, top to bottom:

1. **Read**: pages rendered with `pdfjs-dist` (bundled worker, no CDN) to canvases at device pixel
   ratio, source PDF fetched from `GET /api/portal/onboarding/esign/envelope/{id}/pdf` (blank, unstamped).
2. **Fill**: native inputs for the fields the rep must type; prefilled ones shown read-only with an
   Edit toggle. Sensitive inputs use `autocomplete="off"`, `inputMode` set appropriately.
3. **Sign**: tab Draw (canvas, touch + pointer, Clear) / Type (name input rendered in an embedded
   script font, e.g. Dancing Script OFL, committed under `public/fonts/`). Both produce a PNG
   (typed is rendered to canvas client-side so the server always receives a PNG). Consent checkbox:
   "I agree that my electronic signature is the legal equivalent of my handwritten signature, and I
   consent to sign and receive this document electronically." Sign button disabled until consent,
   signature, and required fields are set.
4. **Done**: success state with a Back to checklist link; on return the checklist already shows the
   item approved (no polling).

Signature PNG is kept in `sessionStorage` for reuse on the next document; cleared on sign-out.

### Rep entry point — `src/components/onboarding/EsignSignAction.tsx`

If the signing URL starts with `/`, navigate to it (in-app). Otherwise keep the SignWell embed path.

### Auto-send and admin

No changes. `sendOne` calls `createEnvelope`; admin Send for signature and reject-resend already use
`sendPendingEsignDocs`. `signed-pdf` route already falls back to `provider.getCompletedPdf`.

## Records — `esignEnvelopes/{id}`

```
docKey, userId, itemId, signerName, signerEmail, status: 'sent' | 'completed',
createdAt, completedAt?, consentAt?, ip?, userAgent?, signatureMethod?,
sourcePdfSha256, signedPdfSha256?, signedPdfPath?, prefill (non-sensitive only)
```

No firestore.rules match (Admin SDK only), same as `esignSigningUrls`.

## Testing

- `stamp.test.ts`: every docKey stamps without throwing; page count = source + 1; coordinate
  conversion unit cases; checkbox true/false; signature scaled inside its box.
- `inhouse.test.ts`: createEnvelope shape, getEmbeddedSigningUrl completed flag, getCompletedPdf.
- `sign/route.test.ts`: wrong user 403, completed 409, missing consent 400, happy path calls
  `completeEsignItem` and returns completed.
- `complete.test.ts`: webhook route and sign route produce identical Firestore writes.
- Manual: Jacob signs a full five-document set on iPhone from a test rep before switching
  `ESIGN_PROVIDER` in Vercel and cancelling SignWell.

## Rollout

1. Ship with `ESIGN_PROVIDER` unset (SignWell still active). 2. Set `ESIGN_PROVIDER=inhouse` on a
Vercel preview, test on iPhone. 3. Flip production. 4. Existing SignWell envelopes still open via
SignWell until signed; new sends go in-house. 5. Cancel SignWell after the last SignWell envelope
completes.

## Out of scope

Countersigning, reminder emails, template editing, signing documents outside the five onboarding
items, admin re-mapping of field coordinates.
