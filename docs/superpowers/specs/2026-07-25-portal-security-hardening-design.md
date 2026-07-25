# Portal Security Hardening — Close the Open Doors

Date: 2026-07-25
Branch: `security/close-open-routes`
Status: approved (Jacob, 2026-07-25) — implementation running unattended overnight

## Problem

11 route files under `src/app/api` perform no authentication. They accept an
identity claim (`userId`, `updatedBy`, `decommissionedBy`, `requestedBy`) from
the request body or query string and trust it. Anyone who can reach the domain
can call them.

Confirmed by live probe against a running server with no credentials
(`scripts/audit-open-routes.mjs`). A handler-level response — `400 "userId is
required"`, `404 "User not found"` — proves the handler ran and no gate
preceded it. A protected route returns 401 before reaching handler code.

| Route | Probe result | Exposure |
|---|---|---|
| `PUT /api/portal/profile` (`profile/route.ts:5`) | 500 | Edits any user's profile; `userId` from body, line 15 |
| `GET /api/portal/commission` (`commission/route.ts:49`) | 404 | Returns commission structure for any `userId`, line 58 |
| `PUT /api/portal/commission` (line 103) | 500 | Rewrites the commission tier table; `updatedBy` from body |
| `POST`/`DELETE /api/portal/pipeline/decommission` | 500 | Decommissions or deletes a user |
| `GET /api/portal/calls` | 400 | `userId is required` — handler reached |
| `GET /api/portal/pipeline`, `/pipeline/channels` | 400 | Same |
| `POST /api/portal/pipeline/field-train` | 500 | Identity from body |
| `GET /api/portal/email-templates` | 400 | Handler reached |
| `GET /api/portal/recruiting/invites` | 400 | Handler reached |
| `POST /api/portal/recruiting/convert` | 500 | Identity from body |

### Correction to the first pass of this audit

An earlier draft claimed 22 open routes including the six `forms/*/review`
endpoints and their payroll-dispute PII. **That was wrong.** Those six return
401; they gate via `@/lib/forms/reviewQuery`
(`src/app/api/portal/forms/payroll-dispute/review/route.ts:2`). The initial
count came from grepping route files for auth-helper *names*, which produces a
false positive for every route that gates through a shared helper — the same
reason the chat routes (`getVerifiedChatUser`) were miscounted.

Lesson carried into this work: **static grep identifies candidates, the live
probe establishes fact.** No route is claimed open or closed in the final
report without a probe result behind it.

Separately, `firestore.rules:52-75` grants any *approved* signed-in user direct
client-SDK write access to `sales`, `training`, `userProgress`, and
`leaderboard`. A rep can create a sale with arbitrary `totalPoints` or delete a
colleague's sale straight from the browser console, bypassing the server-side
point calculation in `src/app/api/portal/sales/route.ts:205-211`.

What is already correct and stays as-is: the eSign webhook verifies signatures
(`src/app/api/webhooks/esign/route.ts:11`), the cron route checks `CRON_SECRET`,
`storage.rules` is locked to Admin-SDK-only outside `/training`, and ~47 routes
already gate properly via `requireVerifiedUser` / `requireManagement` /
`getVerifiedChatUser`.

## Threat model (Jacob's call)

Primary: outside attackers and bots. Secondary: accidental data exposure between
employees. Insider point-gaming is in scope only where the Firestore rules
already invite it.

## Scope of this pass

In scope:

1. Authenticate every ungated route.
2. Derive identity from the verified token — never from the request payload.
3. Scope reads so an employee cannot list another employee's submissions.
4. Update client callers to send `Authorization: Bearer <idToken>`.
5. Tighten `firestore.rules` (written and committed, **not deployed**).

Explicitly out of scope this pass (deliberate, revisit later): rate limiting,
security headers / CSP, audit logging, dependency scanning, per-route
role-permission matrix.

## Approach

Three principles, in priority order:

**Identity comes from the token.** Adding a gate that still reads `userId` from
the body fixes nothing — an authenticated attacker could act as anyone. Every
route stamps the actor from `gate.uid`, following the pattern already
established at `src/app/api/portal/sales/route.ts:126-131`.

**Match the house pattern, do not invent one.** The helpers exist
(`src/lib/auth/requireVerifiedAdmin.ts`, `src/lib/auth/requireManagement.ts`).
These routes simply never got them. No new abstraction.

**Evidence before lockdown.** For the Firestore rules, every proposed denial is
justified by grepping actual client-SDK call sites first. A rule tightened
without checking whether client code depends on it takes the live app down.

## Delivery constraints

- Work lands on `security/close-open-routes`. Nothing is pushed to `master`, so
  Vercel deploys nothing overnight. Jacob reviews and merges.
- `firestore.rules` changes are written and committed with the exact deploy
  command documented. **Not run.** A bad rules push breaks the live app
  instantly and is not a thing to do unattended.
- Every affected page is driven in the browser on `:3005` before the work is
  called done. A gate that returns 401 to a page that never learned to send a
  token is the most likely regression, and typecheck will not catch it.
- Adversarial review is performed by Opus agents that did not write the code.

## Verification

Gates: `npx tsc --noEmit`, `npx eslint`, full test suite (384 tests at branch
point), `npm run build`. Plus per-page browser verification, plus an explicit
negative test per gated route: an unauthenticated request must return 401, and
a request bearing a valid token for user A must not be able to act as user B.

## Deliverables

- Gated routes + scoped reads, committed in reviewable slices.
- Updated client callers.
- Tightened `firestore.rules` + deploy command, uncommitted to production.
- `docs/security/2026-07-25-findings.md`: what was open, what was closed, what
  remains (rate limiting, headers, audit logging) with a recommended order.
