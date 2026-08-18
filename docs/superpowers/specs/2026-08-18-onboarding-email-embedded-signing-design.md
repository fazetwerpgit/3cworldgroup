# Onboarding Sender Email + Embedded SignWell Signing — Design

Date: 2026-08-18. Approved by Jacob (conversation, 2026-08-18).
Builds on branch `onboarding/completion` (unmerged, local). Standing rule:
local commits only; push = production deploy and happens only on Jacob's
explicit "deploy".

## Goals

1. All candidate-facing onboarding emails send from
   `onboarding@3cworldgroup.com` instead of the global portal sender.
2. Candidates sign documents inside the portal (SignWell embedded
   signing). SignWell sends them no emails and they never visit
   signwell.com; the only SignWell surface left is the small brand mark
   inside the signing widget (removable only on SignWell Enterprise —
   accepted).
3. Restyle the candidate-facing onboarding pages to match the portal's
   existing design language (added by Jacob 2026-08-18). Reuse the
   portal's established idioms/components — no new design system, no new
   design decisions required from Jacob. Verified visually (Playwright
   screenshots at 1440 and 390) before review. Executor note: Codex/GPT
   sub is currently unavailable; implementation runs on Claude subagents
   (sonnet build, opus review) — no dependency on GPT.

## Non-goals

- No change to manager alerts (`managerAlertEmail`) or form-submission
  notices (`formSubmissionEmail`) — they keep the global `EMAIL_FROM`.
- No Adobe Sign adapter. Jacob's "Adobe for Teams" plan has no API
  access (requires Acrobat Sign Solutions). Provider slot
  (`ESIGN_PROVIDER`) stays for a possible future swap.
- No SignWell plan change; no white-label purchase.

## Part 1 — Onboarding sender address

- `sendEmail()` (`src/lib/email/sendEmail.ts`) gains an optional
  `from` field; default remains `process.env.EMAIL_FROM`.
- New env var `ONBOARDING_EMAIL_FROM`. A helper
  `onboardingFrom(): string | undefined` returns
  `process.env.ONBOARDING_EMAIL_FROM || undefined` so every call site
  falls back to the global sender when unset — misconfiguration can
  never block email delivery.
- Call sites switched to the onboarding sender (the six onboarding
  templates): `inviteEmail`, `nudgeEmail`, `checklistReadyEmail`,
  `itemRejectedEmail`, `esignSentEmail`, `activationEmail`. Callers live
  in: recruiting invites route, onboarding review route, stallDetection,
  esign autoSend, activation.
- Ops prerequisite (Jacob): `onboarding@3cworldgroup.com` must be a
  verified Postmark sender (domain-level verification of
  3cworldgroup.com suffices; otherwise add a Sender Signature and click
  the confirmation link).

## Part 2 — Embedded signing

### Envelope creation (`src/lib/esign/signwell.ts`)

- `POST /api/v1/documents/` changes: `embedded_signing: true`.
  Per SignWell docs, recipient invite emails are then suppressed by
  default (`send_email` stays false); owner/CC completion emails stay
  off (`embedded_signing_notifications` not set).
- The create response returns `recipients[].embedded_signing_url`.
  Store the single recipient's URL on the onboarding signature item
  document as `embeddedSigningUrl` alongside the existing envelope id.

### Serving the URL (security)

- `embeddedSigningUrl` is a bearer capability. It is never exposed
  through Firestore rules; the candidate obtains it only through an
  authenticated portal API route that verifies the requesting user IS
  the item's owner (same token-verified pattern as the other onboarding
  routes). No admin/preview access in v1.

### Candidate UI

- On the onboarding checklist page, the signature item's action becomes
  "Sign document": load SignWell's official embed script
  (`https://static.signwell.com/assets/embedded.js`), then
  `new SignWellEmbed({ url, events })` and `.open()` (modal).
- `completed` event → UI enters "confirming…" state and polls/refreshes
  item status. THE WRITER GUARANTEE IS UNCHANGED: only the
  `document_completed` webhook (already built, already the sole writer
  of `approved`) advances the item. The embed event is display-only.
- `declined` event → same UX as today's webhook-driven declined state;
  webhook remains the source of truth.
- `error` event or script-load failure → candidate sees a "something
  went wrong — contact us" message AND an ops alert task is raised
  (existing alertTasks mechanism), so a stale/expired URL cannot fail
  silently. (SignWell docs do not document URL expiry; the live test
  observes it. If expiry shows up in practice, fast-follow: regenerate
  by re-creating the envelope through the existing admin resend path.)

### Email

- `esignSentEmail` (sent by us, now from the onboarding address) becomes
  the sole invitation: copy updated to say the document is signed inside
  the portal, with a link to the onboarding page.

### Webhook / provider contract

- `parseWebhook`, envelope-id matching, and the `esign_mismatch` alert
  are untouched. `EsignProvider` interface gains the embedded URL in
  `EnvelopeResult` (`{ envelopeId, embeddedSigningUrl? }`) — optional so
  a future adobe_sign adapter is not forced to provide one.

## Testing

- Unit: sendEmail `from` default + override; signwell createEnvelope
  request body (`embedded_signing: true`) and response parsing of
  `embedded_signing_url`; URL-serving route rejects non-owners (401/403)
  and mismatched users; UI state transitions (completed → confirming,
  not approved).
- Every new test must be broken once (mutate the code, watch it fail)
  before it counts — standing lesson from Task 8.
- Gates: `npx tsc --noEmit`, eslint, full test suite, `npm run build`.
- Live verification (post-deploy, with Jacob): one real envelope with
  his own email — invite email arrives from onboarding@, signing happens
  in-portal, status advances via webhook, no `esign_mismatch` alert.
  Optionally first on a preview deploy with `test_mode: true` (no
  documented incompatibility with embedded signing; verify empirically).

## Ops checklist deltas (Jacob)

- Postmark: verify `onboarding@3cworldgroup.com` (see Part 1).
- Vercel adds `ONBOARDING_EMAIL_FROM=onboarding@3cworldgroup.com` to the
  existing five-variable list (SIGNWELL_API_KEY, SIGNWELL_WEBHOOK_ID,
  CRON_SECRET, ONBOARDING_FIELD_ENCRYPTION_KEY, SIGNWELL_TEST_MODE
  unset in Production).
- Everything else from the go-live walkthrough (Firebase rules paste,
  alertTasks composite index, webhook at
  `https://<domain>/api/webhooks/esign`) is unchanged.

## Open questions / accepted risks

- Embedded signing URL expiry: undocumented. Mitigated by loud error +
  ops alert; regeneration is a known fast-follow if observed.
- SignWell brand mark inside the widget remains (Enterprise-only
  removal) — accepted by Jacob.
- SignWell API document allowance: 3–25/month depending on plan, then
  ~$0.85/document overage — Jacob aware.
