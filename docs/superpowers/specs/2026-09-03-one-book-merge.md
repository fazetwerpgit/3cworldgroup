# One Book — merged sales + carrier view

Status: APPROVED to build (Jacob, 2026-09-03: "both as recommended").
Design board: https://claude.ai/code/artifact/b6b596aa-2c76-48ae-bad1-ab4ed637d44d
Scope: owner/admin Sales page. The rep view (SalesTable) is NOT changed.

## The two decided calls

CALL 1 — a carrier order nobody logged does NOT count as a sale or toward pay.
  It renders in red inside the matched rep's list, marked "Never logged", and
  feeds a "Not logged" figure at the top. It never enters count, value, or pay.

CALL 2 — the carrier wins the STATUS; the sale keeps the MONEY.
  Row status/bucket comes from the FiberOrder. Row dollars always come from
  Sale.totalValue. A carrier status NEVER un-cancels a sale cancelled by us.

## Row model (the whole feature in one type)

One row per customer. Precedence is evaluated top-down; first match wins.

| # | Sale | Order | state | notes |
|---|---|---|---|---|
| 1 | cancelled by us | any | `cancelled` | Settled. Cancelled drawer. Carrier cannot override. |
| 2 | yes | yes | `agreed` | Name/plan/value from sale, status from carrier. `valueGap` set when sale value and carrier MRC differ. |
| 3 | yes | no | `waiting` | "Not in the report yet". Keeps the sale's own install date. |
| 4 | no | yes, `matchedUserId != null` | `never_logged` | Red, in that rep's list, under the address. Counts to "Not logged" only. |
| 5 | no | yes, `matchedUserId == null` | `unassigned` | Cannot sit in a rep list. Own drawer + existing dealer assign. |

```ts
// src/lib/sales/mergeBook.ts  — FROZEN CONTRACT, code against this
export type MergedRowState =
  | 'cancelled' | 'agreed' | 'waiting' | 'never_logged' | 'unassigned' | 'dismissed';
// 'dismissed' = an admin pressed "Not a sale" on an order (saleLink.saleId === null).
// It is NOT never_logged: it must leave notLoggedCount, or the one number that means
// "somebody is owed money" can never be cleared and stops being believed.

export interface MergedRow {
  /** Stable key: sale id when there is a sale, else `order:${order.id}`. */
  key: string;
  state: MergedRowState;
  sale: Sale | null;
  order: FiberOrder | null;
  /** Owning rep uid. sale.salesRepId, else order.matchedUserId. null only for 'unassigned'. */
  repId: string | null;
  repName: string;
  /** Display name. sale.customerName, else order.customerName, else null -> render the address. */
  customerName: string | null;
  /** sale.customerAddress, else order.address. Always present. */
  address: string;
  /** Money of record. Sale.totalValue, or 0 when there is no sale (CALL 1). */
  value: number;
  /** Set only when both sides have a number and they differ. Drives the "Check" third line. */
  valueGap: { saleValue: number; carrierMrc: number } | null;
  /** Reuses installBucketForSale for rows with a sale; order-only rows bucket off order.status. */
  bucket: InstallBucket;
  /** Month this row belongs to. Sale rows: saleDate. Order-only rows: orderDate ?? estInstallDate. */
  month: MonthKey | null;
  /** True when this row is joined by an explicit admin link, not the address guess. */
  linkedManually: boolean;
  /** True when saleLink names a sale that is not in the book — deleted, or lost to the
   *  fetch cap. The row must SAY so; a silent fall-back to red accuses a rep wrongly. */
  linkBroken: boolean;
  /** CALL 1: false for 'never_logged' and 'unassigned'; true otherwise (and false for 'cancelled'). */
  counted: boolean;
}

export interface MergedBook {
  rows: MergedRow[];              // every row, all months, already sorted
  reps: MergedRepRollup[];        // counted rows grouped by rep, value desc then count desc
  neverLogged: MergedRow[];       // state 'never_logged'   — drawer 1
  unassigned: MergedRow[];        // state 'unassigned'     — drawer 2
  cancelled: MergedRow[];         // state 'cancelled'      — drawer 3
  dismissed: MergedRow[];         // state 'dismissed'      — quiet, inside drawer 1
  counts: InstallCounts;          // counted rows only
  totalValue: number;             // Σ value over counted rows
  notLoggedCount: number;         // neverLogged.length + unassigned.length — NOT dismissed
}

export interface MergedRepRollup {
  repId: string; repName: string;
  rows: MergedRow[];              // counted + never_logged (red rows sit in the rep's list)
  count: number;                  // counted rows only
  value: number;                  // counted rows only
  counts: InstallCounts;
  notLogged: number;              // never_logged rows in this rep's list
}

export function buildMergedBook(
  sales: Sale[],
  orders: FiberOrder[],
  opts?: { now?: Date }
): MergedBook;

/** Filters a built book to one month WITHOUT dropping anything. Returns the month's
 *  rows plus BOTH out-of-view counts. Newer rows are real: the picker can sit on
 *  August while September rows exist, and a single "+N older" would hide them with
 *  no affordance at all — which is exactly the "all the sales still there" rule.
 *  A row with month: null is in every month and is counted in neither. */
export function bookForMonth(
  book: MergedBook, month: MonthKey | null
): { book: MergedBook; olderCount: number; newerCount: number };
```

### Join precedence (this is the part that rots if done loosely)
1. If `order.saleLink` is present, honour it exactly — `saleLink.saleId` names the
   sale, or `null` means "explicitly not any sale" (suppresses the address guess).
2. Otherwise use `matchFiberOrdersToSales` (address prefix pair, >= 6 chars) as today.
3. A sale matched by (1) may not also be claimed by (2). Manual links are applied
   first and their orders + sales are removed from the address-matching pool.
4. At most one order per sale, as today.

### Month rule
- Rows with a sale take the month from `saleDate` (a sale sold in Aug that installs
  in Sep is Aug's record and Sep's money — unchanged from today).
- Order-only rows take `orderDate ?? estInstallDate`; null means no month, and a
  row with no month is always visible in every month view (never hidden).
- Month is a DEFAULT VIEW, never a filter that hides. Every drawer prints "+N older"
  and the board keeps an all-time switch. (Jacob's standing constraint.)

## Work items

### W1 — pure logic (no UI, no network)
- NEW `src/lib/sales/mergeBook.ts` implementing the contract above verbatim.
- NEW `src/lib/sales/mergeBook.test.ts` — one test per matrix row, plus: cancelled
  beats an active carrier status; manual link beats a conflicting address match;
  `saleLink.saleId === null` suppresses the address match; value gap detection;
  month attribution for both row kinds; `counted` excludes never_logged/unassigned;
  `bookForMonth` never loses a row and reports olderCount.
- Reuse `installBucketForSale`, `countedSales`, `cancelledSales`, `emptyInstallCounts`
  from `src/lib/sales/installBucket.ts`. Reuse `matchFiberOrdersToSales` and
  `normalizeAddress` from `src/lib/fiberReport/matchSales.ts`. Do NOT reimplement them.
- Reuse `MonthKey`, `monthBounds`, `isInMonth` from `src/lib/sales/monthWindow.ts`.

### W2 — data + API
- `src/types/fiberOrder.ts`: add
  `saleLink?: { saleId: string | null; by: string; byName: string; at: string } | null;`
  Persisted. Document that its presence overrides the address join.
- NEW `POST /api/portal/sales/status/link` — admin/owner only, mirroring the gate in
  `src/app/api/portal/sales/status/assign/route.ts`.
  Body `{ orderId: string, saleId: string | null }` -> `{ ok: true }`.
  Writes ONLY `saleLink` + `updatedAt` on `fiberOrders/{orderId}`. Validates the sale
  exists when saleId is non-null. 404 unknown order/sale, 400 bad body.
  NOTE: this is per-ORDER and is NOT the existing dealer-scoped assign action, which
  stays exactly as it is.
- PERF, `src/app/api/portal/sales/status/route.ts` scope 'all': today it runs
  `.collection('fiberOrders').get()` AND `.collection('sales').get()` with no where,
  no orderBy and no limit, on every admin load. Fix with a module-level cache of the
  fiberOrders snapshot keyed on `config/fiberReportStatus.lastReportAt` (the workbook
  changes once each morning), TTL 5 minutes, invalidated on any assign/link/rematch
  write. State plainly in the PR that on serverless this warms per-instance, so it
  reduces but does not eliminate the reads. Do NOT add a month range on orderDate —
  null orderDates would silently vanish and that breaks "all the sales still there".
- BUG, `src/app/api/portal/sales/route.ts`: `salesRepId` and a date range are
  mutually exclusive (`if (salesRepId) ... else if (useDateQuery)`), so filtering by
  rep drops the month bounds from the query and re-applies them in memory against a
  `limit(min(limit*2,500))` window — a long-booked rep silently loses older months.
  Add the composite index `sales: salesRepId ASC + saleDate ASC` to
  `firestore.indexes.json` (which today has NO sales or fiberOrders index at all) and
  let both predicates run in the query.

### W3 — the admin board
- `src/components/sales/AdminSalesBoard.tsx` renders from `buildMergedBook` instead of
  `rollupSalesByRep`. One row per customer. Keep the existing Company | My pay tabs,
  the pipeline strip, the pay tab, cancel/delete dialogs and `SaleDetailSheet` wiring
  exactly as they are — this is a change to WHAT is listed, not a rewrite of the shell.
- Top figures gain "Not logged" beside Value, from `notLoggedCount`. It is the one
  number on the page meaning somebody is owed money and does not know it.
- `never_logged` rows render inside the owning rep's list, in red, under the address,
  marked "Never logged", and are excluded from that rep's count and value.
- Three drawers at the bottom, each collapsible and each printing "+N older":
  "In the report, nobody logged it" (never_logged), "Orders with no rep matched"
  (unassigned, carrying the EXISTING dealer assign dropdown), "Cancelled this month".
- Link-to-sale: on a `never_logged` row, an action that opens a picker of that rep's
  sales in view and POSTs to `/api/portal/sales/status/link`, then refetches.
- Styling: extend `src/styles/sweep-rep-a.css` in the existing `.sales-board-*` block
  (lines 465-867), reusing the tokens already in use — `--red` for never_logged,
  `--amber` scheduled, `--lime` installed, `--soft` hairlines, `--muted` secondary.
  No cards; hairline dividers and 2px left stripes carry structure, per the file's
  own comment at line 460.

### W4 — back-dated sales land on today's leaderboard (Jacob 2026-09-03)

ROOT CAUSE — not what it looked like. The leaderboard is correct: it already
buckets every period on `saleDate`. The defect is upstream at creation.
`src/components/sales/SaleForm.tsx` has an `installDate` input but NO `saleDate`
input, and never sends the key. `POST /api/portal/sales` then does:
```ts
let resolvedSaleDate = new Date();          // route.ts:218-228
if (saleDate !== undefined && ...) { ...parse... }
```
so every sale created through the portal UI is stamped `saleDate = upload time`
(identical to its `createdAt`). A rep back-entering August work is therefore
genuinely dated today in Firestore, and every period surface counts it today.
`PATCH /api/portal/sales/[id]` and the edit page ALREADY have a working
`saleDate` input with `max={todaySaleDateInput()}` — only the create path lacks it.

Totals are recomputed from `sales` on read (zero `FieldValue.increment` in the
repo, no stats/leaderboard counter collection), so this needs NO counter backfill.
Existing mis-stamped rows can be corrected through the existing edit page.

Fix:
1. Add a `saleDate` date input to SaleForm, defaulting to today, `max` = today,
   mirroring the edit page's field and using the same `parseSaleDateInput` /
   `todaySaleDateInput` helpers from `src/lib/sales/saleDate.ts`. Send it in the
   create payload. Keep the server fallback for older clients.
2. `src/app/api/portal/sales/company-stats/route.ts:44-58` buckets the All-Company
   tape's MTD count/value on `approvedAt ?? createdAt`. That is the same defect by
   a different route and stays wrong even after (1). Bucket it on `saleDate`.
3. Tests: a sale created with an explicit past `saleDate` keeps it; one created
   without still falls back to now; company-stats MTD counts by `saleDate`.

NOT in scope (raise with Jacob): repairing the sale dates already stamped wrong.
The true dates are unknowable from the data — only the rep knows them — so this is
a human correction through the edit page, not a migration.

Also observed, NOT being changed: the leaderboard query has no upper date bound
(`>= startDate` only) and a bare `.limit(5000)` with no ordering; and the period
cutoffs are server-local while `history.ts` day keys are America/New_York. None of
these produce Jacob's reported symptom. Flagged for a later pass.

### W5 — repair the already-mis-stamped sale dates (Jacob 2026-09-03)

Jacob: "the sales he entered today we should be able to automatically tell what
it is because the install date is august 14th. it shouldn't matter that it was
submitted today."

THE RULE. An install can never precede the sale. So any sale where
`installDate < saleDate` is provably mis-stamped by the W4 creation bug, and no
guessing is required to detect it. Repair is `saleDate = installDate` — it puts
the row in the correct month and week without inventing a date nobody knows.

Deliberately NOT detectable, and left alone:
- A back-entered sale with no `installDate` — nothing to compare against.
- A sale genuinely sold AND installed in the same past month — already consistent.
- Anything back-dated correctly through the edit page — its dates already agree.
Sold-in-August / installs-in-September is the NORMAL case and must stay untouched:
the rule only fires when the install is strictly EARLIER than the recorded sale date.

Deliverable: a script under scripts/ that DEFAULTS TO DRY RUN, prints one line per
affected sale (id, rep name, customer, current saleDate, installDate, proposed
saleDate) plus a total, and writes nothing without an explicit `--apply` flag.
Admin SDK env per the house pattern: load via @next/env + FIREBASE_SERVICE_ACCOUNT
(FIREBASE_ADMIN_PRIVATE_KEY is truncated everywhere and must not be used).
Writes, when applied, touch ONLY `saleDate` and `updatedAt`, in batches, and log
every id changed so the run is auditable and reversible from the log.

Jacob reviews the dry-run output before anything is applied to production.

## ROUND 2 — defects found in adversarial review (2026-09-03, Fable)

Ranked. 1-5 are defects; all must be fixed before Jacob sees the board.

**R1. The admin fetch became an unordered all-time `limit(500)`.**
Dropping `monthBounds` fixed phantom rows but moved the truncation cliff from
"one month exceeds 500" to "the company ever has 500 sales". `/api/portal/sales`
has NO `orderBy`, so Firestore returns 500 docs in document-id order and the
`createdAt` sort runs after the cut. Rows lost this way vanish from every month
with no affordance (older/newer are computed over fetched rows only) AND their
carrier orders resurface as red "Never logged" — the exact bug R1's own change
was meant to fix. 123 sales today, so it does not bite yet; it is a silent cliff.
Fix: order the query deterministically and surface truncation instead of hiding it.

**R2. The link dialog cannot reach the case the feature exists for.**
The picker offers only the rep's sales in the MONTH-FILTERED book, and the button
only exists on a `never_logged` row, itself month-filtered on the ORDER's date.
Sale logged Aug 30, carrier order dated Sep 2: on September the sale is absent
from the picker; on August the red row is out of view. The link can never be made,
so the row stays red forever. Fix: the picker offers the rep's sales from the FULL
book, not the month view.

**R3. "Not a sale" is a visible no-op.**
`saleLink.saleId === null` suppresses the address guess, but the button only
appears on rows the guess already failed to match — so the write changes nothing
the admin can see, and `Not logged` never drops. Fix: the new `dismissed` state
above, excluded from `notLoggedCount`, shown quietly with an undo.

**R4. A saleLink naming a missing sale silently becomes a red row.**
Delete a linked sale and its order returns as "Never logged" with no trace of the
link, while the stale link still blocks the address guess from ever re-joining it.
Fix: `linkBroken` on the row plus copy that says so, AND clear `saleLink` when the
sale it names is deleted.

**R5. Cross-instance cache staleness makes Link and Assign look broken.**
`invalidateFiberOrdersCache()` clears only the serverless instance that served the
write. A refetch landing on another warm instance returns the pre-write snapshot
for up to 5 minutes: the row stays red, no error, so the admin clicks again.
Fix: make the post-write refetch bypass the cache.

Accepted, NOT fixed (recorded so nobody re-finds them): a `rejected` sale is
invisible in every list (pre-existing); the cancelled drawer buckets on `saleDate`
not `cancelledAt` (pre-existing); `/status` still reads the whole `sales`
collection uncached, so the perf win is half of what it sounds like.

## ROUND 3 — decided by Jacob after the live-data check (2026-09-03)

The live run over the real 124 sales + 947 orders exposed two figures that are
technically correct and practically useless. Jacob decided both.

**R6. Carrier history before the portal must not accuse anyone.**
`fiberOrders` carries carrier rows back to 2025-11; 429 are already `active`.
Raw, that is `notLoggedCount` 833 and a "+951 older" line on the drawers — a
number nobody will believe, and disbelief in that figure is disbelief in the
whole board. Jeremy McFarland alone is 265 of them.
DECISION (Jacob): count only from **February 2026**.
Implement as a single exported constant, `PORTAL_LOGGING_START = 2026-02-01`,
in `src/lib/sales/mergeBook.ts`. An ORDER-ONLY row whose month resolves before
that date takes the new state `'historic'`: `counted: false`, OUT of
`notLoggedCount`, out of every rep rollup, present in `rows` and in a new
`MergedBook.historic` list. It is never lost — it is simply not an accusation.
A row with a sale is unaffected; so is an order-only row dated on or after the
cutoff. An order-only row with NO resolvable month is NOT historic (unknown is
not old) and stays never_logged/unassigned.

**R7. The value-gap marker fires on 108 of 114 joined rows.**
Sale value and carrier MRC essentially never agree — largest gap $60, most $10-20
— so the "Check" third line renders on ~95% of rows and means nothing.
DECISION: only flag a MATERIAL gap. `VALUE_GAP_MIN = 25` (dollars), exported
alongside the constant above; `valueGap` is set only when the cent-rounded
absolute difference is >= that. Below it the row is clean.

Live-data facts worth keeping (from scratchpad/merge-live-check.md):
- The address join is NOT silently failing: 114 joined, 2 near-misses, both
  single-character typos in one rep's own typed addresses
  (`58030 JEWELL RD` vs `58030 Jewwel Rd.`, `7204 SW 14TH ST` vs `7204 dw 14th st`).
  These are exactly what the manual link-to-sale action exists to fix.
- 0 rows carried a manual link, 0 linkBroken, 0 undated rows.

## Gates (every worker runs these before reporting done)
- `npx tsc --noEmit`   (no typecheck script exists in package.json)
- `npm test`           (vitest run)
- `npm run build`      (only W2/W3, which touch routes and components)

## Hard constraints
- Do NOT touch payout maths. `countedSales`/`isPayableSale` keep deciding money.
- Do NOT commit the uncommitted public-site redesign in the working tree
  (about/apply/contact/culture/opportunities/services/page/Navbar/PageWrapper,
  .gitignore, src/app/public.css, src/components/public/, public/redesign/).
- Do NOT change the rep view (SalesTable) or the rep's Pay tab behaviour.
- Branch is onboarding/completion. Nothing ships to master without Jacob.
