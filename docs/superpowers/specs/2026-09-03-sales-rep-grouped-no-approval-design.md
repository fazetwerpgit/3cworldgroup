# Sales: rep-grouped book, no approval, admin pay view

Date: 2026-09-03
Approved by Jacob (visual board: https://claude.ai/code/artifact/902fd8ef-22b2-4d6e-bdf4-a147a3ede4d0)

## Why

Two problems, decided together because they touch the same page.

1. Wil Teasdale was promoted to admin. `PATCH /api/portal/auth/users/[id]`
   deletes `fieldRole` when a platform role is assigned, so his `internal_rep`
   pay scale was destroyed and he has no expected pay anywhere in the portal.
2. On a phone, an admin's Sales page is one flat chronological list of every
   rep's sales, capped at 100 rows, organised only by approval status. Jacob
   cannot see who is producing or what is stuck.

Jacob's decisions:

- Admin and owner are paid on the **Internal Rep** scale. There will never be
  more than three back-office users (Jacob, Jeremy, Will), so this is a role
  default, not a per-user field.
- Admins and owners get their **own** expected-pay view, separate from the
  company book.
- **Sale approval is removed entirely.** It is dead weight. Install status is
  the only lifecycle that matters.
- The company book is organised **by rep, by month**.

## Phase 1 — pay linkage (DONE, committed separately)

- `resolveCompRole(fieldRole, role?)` in `src/types/compPlan.ts` now falls back
  to `internal_rep` for `admin` and `owner` via `PLATFORM_ROLE_COMP_FALLBACK`.
  Operations is deliberately absent. A field role still wins over the fallback.
- `GET /api/portal/comp-plan` returns `compRole` and `ownRates` (the caller's
  own company→plan→dollars slice) alongside `scope: 'all'` for platform callers.
  `rates` there is still the full role-keyed table.
- `useCompPlan` reads `ownRates` when `scope === 'all'`, so `hasPlan` is now
  true for an admin/owner.
- Tests added in `src/types/compPlan.test.ts` and
  `src/app/api/portal/comp-plan/route.test.ts`.

No Firestore write is needed: `admin` implies `internal_rep`.

## Phase 2 — remove sale approval

### Permissions (`src/types/auth.ts`)

`sales:approve` currently doubles as the UI's "sees the whole company book"
switch. Deleting it without a replacement would silently give operations
visibility of every rep's sales, which the existing comment explicitly forbids.

- Delete `'sales:approve'` from `ADMIN_PERMISSIONS`.
- Add `'sales:read:all'` to `ADMIN_PERMISSIONS` (so admin and owner get it).
- Do **not** give `sales:read:all` to `operations`. Keep the comment in the
  operations block, reworded: operations still sees only their own sales.
- `sales:delete` is unchanged.

### Data

- `src/app/api/portal/sales/route.ts` line ~228 creates sales as
  `status: 'pending' as SaleStatus // Requires approval`. Change to
  `status: 'approved'` with a comment saying approval was removed and the field
  is retained only so legacy rows and `isPayableSale` keep working.
- Keep the `SaleStatus` type and its stored values. `rejected` and `cancelled`
  remain meaningful to `isPayableSale`; `pending` becomes legacy-only.
- Remove the notification/push fan-out that told admins a sale needs review
  (`/portal/sales?status=pending` links in the create route, ~lines 264 and 280).

### Delete outright

- `src/app/api/portal/sales/approve/route.ts` and its tests.
- `src/app/portal/approvals/page.tsx` (a redirect to the pending filter). Remove
  any nav entry pointing at `/portal/approvals`.
- `approveSale` from `src/hooks/useSales.ts`, and `pendingCount` /
  `approvedCount` / `rejectedCount` from `SalesStats` if nothing else reads them
  (check `src/app/api/portal/sales/stats/route.ts` and the dashboard first —
  leave the API field in place if removing it would break the dashboard, and say
  so in the report).
- `src/lib/push/salePush.ts` `buildSaleDecisionPush` if it has no other caller.

### Edit

- `src/components/portal/QuickActions.tsx` — drop the "Approve Sales" action.
- `src/components/portal/CommandPalette.tsx` — drop "Review pending sales".
- `src/app/portal/dashboard/page.tsx` lines 278 and 311 — swap
  `hasPermission('sales:approve')` for `hasPermission('sales:read:all')`.

## Phase 3 — the Sales page

`src/app/portal/sales/page.tsx` and `src/components/sales/SalesTable.tsx`.

`canViewAll` becomes `hasPermission('sales:read:all')`. The rep-facing side of
both files is UNCHANGED — reps keep their `[All | Pay]` tabs, their fiber chips,
their pay list, and their sale detail sheet exactly as they are today. Only the
management branch is rewritten, plus the two removals below.

### Removed from the rep side

- `InReviewSection` in `page.tsx` (the "Submitted / in review" block) — nothing
  is in review any more.
- The "Pending review" KPI tile and `oldestIdle`.

### The management view

Two tabs at the top of the page: **Company** (default) and **My pay**. "My pay"
renders only when `useCompPlan().hasPlan` is true — for an admin/owner that is
now always, and for operations only if they carry a field role.

#### Company tab

A month picker (default: current month; scope every figure and row to it).

Month summary, in this order:

1. Sale count and total monthly value, side by side, `tabular-nums`.
2. A three-segment install-pipeline bar, flex-weighted by count:
   installed (`--lime`) / scheduled (`--amber`) / no install date (`--red`).
3. A key line reading `N installed · N scheduled · N need a date`.

Then a rep list, one row per rep, sorted by total monthly value descending:

- caret, rep name, right-aligned monthly value
- a sub-line `N installed · N scheduled · N no date` (omit any zero segment)
- a right-aligned `N sales` count

Tapping a rep expands their sales inline beneath the row, sorted: no install
date first, then scheduled by soonest install, then installed by most recent.
Each sale shows customer name, right-aligned monthly value, a product summary
line, and a right-aligned install chip (`No install date` / `Installs Sep 14` /
`Installed Sep 8`) coloured to match the left border stripe. Tapping a sale
opens the existing `SaleDetailSheet` unchanged.

Bucketing rule, single source of truth, used by the bar, the key line, the rep
sub-lines and the chips:

- **attention** — no `installDate`, or a matched fiber order in `breakage`
- **installed** — `installDate` in the past, or a matched fiber order `active`
- **scheduled** — everything else with an `installDate`
- a `cancelled`/`rejected` sale is excluded from all three and from the totals

Reuse `matchFiberOrdersToSales` for the fiber side; it already exists.

#### My pay tab

The rep pay list the rep side already renders, for the signed-in admin/owner:
their own sales only (`salesRepId === user.uid`), install date required,
`isPayableSale` only, newest install first. Header shows a
`Pay scale · Internal Rep` chip (from `compRole` via `RoleDisplayNames`-style
labelling), the expected total for the month, and the note "Paid about 14 days
after each install." Rows: customer, expected dollars (`--lime`), a product +
install line, and the expected pay date. Extract the existing pay-row markup so
both sides share it rather than duplicating it.

### Fetching

`page.tsx` currently fetches `limit: 100` with no date bound. Fetch the selected
month instead (`startDate` / `endDate` are already supported by
`GET /api/portal/sales`), and raise the limit to 500 so a month is never
silently truncated.

## Styling

The portal has a design system; use it. All colour comes from the `.sales-line`
token block in `src/app/globals.css` (`--lime --amber --red --ink --muted
--panel --line --soft`). Archivo for names and figures, `ui-monospace` for
eyebrows, labels and chips, exactly as the surrounding CSS already splits them.
New rules go in `src/styles/sweep-rep-a.css` alongside the existing sales rules.
Match the approved board: no cards, no radii, hairline `--soft` dividers,
2px left border stripes carrying install state.

## Gates

`npx tsc --noEmit`, `npx vitest run`, `npx eslint` on changed files, and
`npm run build`. All four must pass.

## Out of scope

- Backfilling existing `pending` sales to `approved` (a production data write —
  Jacob decides separately).
- The public-site redesign in the working tree. Do not touch it.
