# Portal Security Hardening — Close the Open Doors

Date: 2026-07-25
Branch: `security/close-open-routes`
Status: approved (Jacob, 2026-07-25) — implementation running unattended overnight

## Problem

An audit of `src/app/api` found 22 route files with no authentication of any
kind. They accept an identity claim (`userId`, `updatedBy`, `decommissionedBy`,
`requestedBy`) from the request body or query string and trust it. Anyone who
can reach the domain can call them.

Verified examples:

| Route | Exposure |
|---|---|
| `PUT /api/portal/profile` (`src/app/api/portal/profile/route.ts:5`) | Edits any user's profile; `userId` read from body at line 15 |
| `GET /api/portal/commission` (`src/app/api/portal/commission/route.ts:49`) | Returns commission structure for any `userId` passed at line 58 |
| `PUT /api/portal/commission` (line 103) | Rewrites the commission tier table; `updatedBy` from body |
| `POST/DELETE /api/portal/pipeline/decommission` | Decommissions or deletes a user |
| 6 × `forms/*/review` | Lists and approves/denies submissions, incl. payroll disputes (PII) |
| `portal/calls`, `portal/pipeline`, `portal/email-templates`, `recruiting/*` | Read/write recruiting and pipeline data |

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
