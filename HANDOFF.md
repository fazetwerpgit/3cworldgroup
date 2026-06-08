# 3C World Group Portal — Agent Handoff

> For the next coding agent (Codex) picking up this repo. Read this top-to-bottom
> before touching code. It encodes the rules that aren't obvious from the source.

Last updated: 2026-06-07 · Branch: `master` · Latest commit: `1701fe5`

---

## 1. What this project is

A full **rep-lifecycle platform** for 3C World Group that replaces Connecteam.
It carries a field sales rep through every stage:

```
recruit → onboard → train → sell → (decommission)
```

It is an internal back-office + field portal, not a marketing site. The public
apply form feeds recruiting; everything behind `/portal` is the authenticated app.

---

## 2. Run it

```bash
npm install          # if node_modules is cold
npm run dev          # Next.js dev server on http://localhost:3000
npm run build        # production build — must stay green before any commit
npm run lint         # eslint
```

- **Login page is `/portal`** (`src/app/portal/page.tsx`). There is **no**
  `/portal/login` — that path 404s. Don't link to it.
- Requires `.env.local` (present locally, gitignored). It holds the Firebase
  **client** config (`NEXT_PUBLIC_FIREBASE_*`) and the Firebase **admin** SDK
  service-account creds (`FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`,
  `FIREBASE_ADMIN_PRIVATE_KEY`). The private key may be raw PEM or base64 — the
  loader in `scripts/backfill-roles.mjs` shows the decode pattern.
- Git remote: `origin → https://github.com/fazetwerpgit/3cworldgroup.git`.

### Stack
| Concern | Choice |
|---|---|
| Framework | Next.js **16.1.1** (App Router, Turbopack), React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind **v4** (`@tailwindcss/postcss`) |
| Auth | Firebase Auth (client) + Firebase Admin SDK (server routes) |
| Data | Cloud Firestore |
| Brand colors | green `#8dc63f`, navy `#0A1F44` |

---

## 3. The role model (most important invariant)

A user has **either** a platform role **or** a field role — never both meaningfully.
They are two separate Firestore columns and two separate TypeScript unions.
Defined in `src/types/auth.ts`:

```ts
type PlatformRole = 'admin' | 'operations';          // back-office
type FieldRole    = 'entry_rep' | 'l1_manager' | 'l2_manager';  // field sales
```

Rules you must preserve:

- **Never read `data.role` / `data.fieldRole` raw.** Always pass them through
  `resolveRoles(rawRole, rawFieldRole)`. It validates against the unions and
  tolerates legacy field values that landed in the `role` column. Unknown values
  resolve to *no role* (deny by default).
- `getEffectiveRole(user)` = `user.role ?? user.fieldRole`. Platform role wins
  when both exist, matching `AuthContext.hasPermission`.
- In components, gate with the `AuthContext` helpers: `isRole(...roles)` and
  `hasPermission(permission)`. For whole pages use
  `<ProtectedRoute roles={[...]}>`.
- Permission → role mapping is centralized in `RolePermissions` in `auth.ts`.
  Add new capabilities there, not ad-hoc in components.
- `RoleDisplayNames` is the single source for human-readable role labels.

Hierarchy for commission/override purposes: **L2 manager > L1 manager > entry rep.**
A manager's report relationship is `reportsToId` (legacy docs used `managerId`,
backfilled — prefer `reportsToId ?? managerId` when reading old data).

---

## 4. Security & data-handling stance (non-negotiable)

These came directly from the project owner. Treat them as hard constraints:

1. **Sensitive data is vendor-first.** The app stores *status + a reference*,
   never raw card numbers or SSNs. If a feature needs PII, store a vendor token /
   status flag and let the vendor hold the secret.
2. **No video hosting in-app.** Calls use Google Meet links only (validated
   against `meet.google.com`). The app organizes/links, it does not stream.
3. **Email is copy-paste, not send.** The email-template feature is a management
   library; the app does **not** send mail. Templates are copied to the clipboard
   for the user's own email client.
4. When referencing Connecteam for parity, use screenshots as reference — never
   share or hardcode login credentials.

---

## 5. Architecture map

### API routes — `src/app/api/portal/**/route.ts`
Server routes use the **Firebase Admin SDK** (`src/lib/firebase/admin.ts`,
exported as `adminDb`). Every route guards on `adminDb` being configured and
returns JSON `{ error }` with proper status codes. Auth/role checks are done
server-side by loading the caller's user doc and running `resolveRoles`.

| Route | Purpose |
|---|---|
| `auth/*` | signup, create-user, user CRUD |
| `onboarding/*` | submit + ops review loop |
| `sales/*` | sales CRUD, approve, stats |
| `training/*` | modules + progress |
| `leaderboard` | rankings |
| `notifications` | in-app notifications |
| `pipeline` | recruiting command-center aggregate (derived stages) |
| `pipeline/channels` | per-channel clearance status |
| `pipeline/field-train` | "message manager to field train" |
| `pipeline/decommission` | decommission + reinstate |
| `commission` | role-scoped pay-structure visibility |
| `calls` | recurring call schedule (Meet links) |
| `email-templates` | management template library |

### Pages — `src/app/portal/**/page.tsx`
- **Rep-facing pages** use a **light theme** (`bg-gray-50`, white cards) and wrap
  their own `<PortalHeader />` + `<PortalSidebar />`. Examples:
  `pay-structure`, `calls`, `onboarding`, `sales`.
- **Admin/ops pages** render inside the admin layout (which already supplies the
  chrome) and use a **dark theme** (gradient `from-gray-800 to-gray-900` cards).
  Examples: `admin/pipeline`, `admin/email-templates`, `admin/onboarding`.
- Match the theme of the directory you're editing — don't mix.

### Navigation — `src/components/portal/PortalSidebar.tsx`
Three arrays: `navigationItems` (everyone, permission/role-gated),
`operationsItems` (Operations section), `adminItems` (Admin section).
Each `NavItem` can carry `permissions?` and/or `roles?`. `canAccessItem`
enforces both. Add new pages to the right array with the right gate.

### Types — `src/types/*.ts`, re-exported through `src/types/index.ts`
Always import from `@/types`. When you add a type file, add its
`export * from './x'` line to `index.ts`.

---

## 6. Build status — what's DONE

All five planned pieces are implemented, verified on the dev server, and committed.

| Piece | Scope | Commit |
|---|---|---|
| 1 / 1b | Split platform/field roles, signup defaults, legacy backfill | `31cef5b`, `a138b3e` |
| 2–3 | Channels + onboarding type layer, onboarding checklist UI + ops review | `8f56f61` |
| 4 | Recruiting pipeline command center + decommission flow | `1cd6a21` |
| 5 | Pay-structure visibility, calls schedule, email templates | `1701fe5` |

### Piece 4 behavior (pipeline) — `src/app/portal/admin/pipeline/page.tsx`
Pipeline **stage is derived, never stored**. Resolution order (first match wins):
```
decommissioned  (status 'inactive' OR a decommission audit record)
→ processing     (onboarding incomplete)
→ need_logins    (0 channels cleared)
→ cleared_to_sell(0 approved sales)
→ active
```
Decommission reasons: `non_activity | wrongdoing | manager_fire`
(`src/types/pipeline.ts`). Decommission sets `status: 'inactive'` + an audit
record; reinstate deletes the audit field via `FieldValue.delete()`.
DSI note: Xfinity is credentialed **direct**; the other 8 channels go **via DSI**,
and the "cleared" notification text reflects that.

### Piece 5 behavior
- **Commission** (`api/portal/commission`): `GET ?userId=` returns **only the
  caller's own tier** for field users and **all tiers** for platform users.
  `PUT` is **admin-only** (operations gets 403). Rates live in Firestore
  `config/commission`; when that doc is absent the API falls back to
  `DEFAULT_COMMISSION` **zero placeholders** — that's intentional so "not set yet"
  stays distinct from "set to 0". The page shows a yellow "rates pending" banner
  while placeholders are active (`ratesArePending` in `src/types/commission.ts`).
- **Calls** (`api/portal/calls`): `scheduledCalls` collection. Meet-link regex
  `^https:\/\/meet\.google\.com\/[a-z0-9-]+$/i`, time `HH:mm` 24h. Audience
  `all` (everyone) vs `managers` (L1/L2 + platform only). Create/delete restricted
  to admin/operations (`canManage`).
- **Email templates** (`api/portal/email-templates`): **all** operations
  (including GET) are management-only (`admin`/`operations`). Body capped 10k chars.

---

## 7. What's OPEN (for the project owner / boss — do NOT block on these)

The app works today with placeholders; these need real inputs from leadership:

- **Real commission rates + override percentages** (currently 0 placeholders).
- **Ripple** product category — undefined, needs classification.
- **Background-check** vendor + flow.
- **Payment / SSN vendor** choices (drives the vendor-first storage above).

Locked product decisions already baked in:
- **IBO** is a separate opt-in flag (`User.isIBO`), not a role.
- **DSI is the distributor** for 8 of 9 channels; Xfinity is direct.
- Commission config is **editable in-app** (admin), rates TBD.

---

## 8. Conventions & gotchas (save yourself an hour)

- **There is no project `CLAUDE.md`.** Only the user's global one. If you add
  project conventions, a root `CLAUDE.md` is the place.
- **Verify on the dev server before committing.** This is the owner's explicit
  workflow. Round-trip APIs with `Invoke-RestMethod`, drive the UI with the
  Playwright MCP, *then* commit. Don't commit unverified code.
- **Clean up test data before committing.** Disposable users/docs created during
  verification must be deleted. Pattern: a temp `scripts/*.mjs` using
  `firebase-admin`, loading `.env.local` exactly like `scripts/backfill-roles.mjs`
  (regex-parse the file, base64-or-PEM the private key). Delete the temp script
  after. Reset `config/commission` by deleting the doc (back to placeholders).
- **Shell is PowerShell 5.1 on Windows.** Quirks that bit us:
  - `git commit -m "..."` with embedded double quotes mangles args → write the
    message to a temp file and use `git commit -F file`, then remove the file in a
    *separate* command (compound `Remove-Item` can misparse).
  - API error bodies: `$_.ErrorDetails.Message` is null. Read them via
    `$_.Exception.Response.GetResponseStream()` + a `StreamReader`.
  - Use `$null`, `$env:VAR`, backtick line-continuation — not bash syntax.
- **LF→CRLF warnings on commit are expected** and harmless on this repo.
- **Behavior preferences:** new commits over amending; no emojis in code/commits
  unless asked; keep edits idiomatic to surrounding code.

---

## 9. Suggested first moves for Codex

1. `npm run dev`, log in at `/portal`, click through the three Piece-5 pages
   (Pay Structure, Calls Schedule, Email Templates) as a field rep and as an
   ops/admin user to see the role-scoping live.
2. Read `src/types/auth.ts` and `src/components/portal/PortalSidebar.tsx` — they
   define how access control flows end to end.
3. When the boss returns real commission rates, an admin sets them at
   `/portal/pay-structure` → "Edit Rates" (writes `config/commission`). No code
   change needed.
4. Likely next features if asked: territory assignment UI, background-check
   integration, vendor-token storage for payment/SSN (status + reference only).
