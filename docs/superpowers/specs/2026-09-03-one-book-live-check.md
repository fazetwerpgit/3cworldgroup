# Live merge check — buildMergedBook vs production

Run: 2026-09-03T20:18:45.817Z — READ ONLY, nothing written to Firestore.
Source: `sales` (124 docs) + `fiberOrders` (947 docs), whole collections.

Cutoff in force: PORTAL_LOGGING_START = 2026-04-01; VALUE_GAP_MIN = $25.

## Totals

- rows: **957**
- agreed: **114**
- waiting: **10**
- never_logged: **213**
- unassigned: **27**
- dismissed: **0**
- historic: **593**
- cancelled: **0**
- counted rows: 124
- totalValue: $8020.00
- counts (buckets): attention 4, scheduled 9, installed 111
- reps in rollup: 10

## Not logged

- notLoggedCount: **240** = never_logged 213 + unassigned 27
- run history: 833 no cutoff, 442 at 2026-02-01, 36 at 2026-07-01, now at 2026-04-01
- historic (order-only rows dated before 2026-04-01, removed from the figure): **593**
- dismissed (also excluded by design): 0

### historic rows by month

2025-11 108, 2025-12 164, 2026-01 119, 2026-02 85, 2026-03 117

### What the figure means at this cutoff

- never_logged dated before the cutoff (should be 0): **0**
- of the remaining rows, **177** predate the first portal sale (2026-07)
  and **36** fall inside the months reps were logging.

The Apr-Jun rows are the deliberate part: the portal was not in use then, so
the carrier report is the only surviving record of that work. They are a
recovery queue to chase, not a claim that anyone is owed money today. Only
the 36 rows from 2026-07 on carry that stronger meaning.

### logged sales by month, for scale

2026-07 57, 2026-08 61, 2026-09 6

## Join

- rows with BOTH a sale and an order: 114
- joined by explicit saleLink (linkedManually): **0**
- joined by the address guess: **114**
- linkBroken rows: **0**

## Value gaps

- rows with a valueGap (threshold $25): **1** of 114 joined rows
- previous run, with no threshold: 108 of 114

| address | sale value | carrier MRC | delta |
| --- | --- | --- | --- |
| 12150 PARKSIDE CIR WASHINGTON, MI 48094 | $130.00 | $70.00 | $60.00 |

## September 2026 view (bookForMonth)

- rows in view: **599** — of which 593 are off-axis (historic/dismissed, present in every month for their drawer) and **6** are genuine September rows
- olderCount: **358** (was 951 before historic/dismissed left the axis)
- newerCount: **0**
- accounting check: 599 + 358 + 0 = 957 of 957 rows
- of the September view: never_logged 0, unassigned 0, notLoggedCount 0
- rows with NO month (always visible): 0

## never_logged rows — is the join missing a real sale?

Checked all 213 never_logged rows against all 124 sale rows,
normalising both sides with `normalizeAddress` and looking for near-misses the
6-char prefix-pair rule rejects.

A pair only counts as a suspected miss when the house number matches AND the
street core (cut at the street type, so the city/state tail on the sale side is
ignored) is the same or within a 2-character typo. A shared house number alone
is not evidence — this data has
9 pair(s) sharing a house number on a genuinely different street, all screened out.

**Suspected join misses: 2**

| order address (rep) | candidate sale address (rep) | why it looks like a miss |
| --- | --- | --- |
| 58030 JEWELL RD (Noah St John) | 58030 Jewwel Rd., Washington, MI (Noah st john) | same house number, street name differs by 2 char(s) — likely typo |
| 7204 SW 14TH ST (Noah St John) | 7204 dw 14th st Des Moines ia (Noah st john) | same house number, street name differs by 1 char(s) — likely typo |

### never_logged by month and rep

By month: 2026-04 110, 2026-05 43, 2026-06 24, 2026-07 12, 2026-08 24

By carrier status: active 151, cancelled 26, pending_install 18, churned 11, breakage 7

By rep:
- Jeremy McFarland: 81
- Connor Crouse: 49
- Brenden Tran: 28
- Cooper Otool: 27
- Noah St John: 11
- Will Teasdale: 8
- Braeden Crouse: 6
- Keaton Roseland: 2
- Jacob Myers: 1

First 40 never_logged rows (newest month first, as the board orders them):

| rep | address | order status | month |
| --- | --- | --- | --- |
| Connor Crouse | 57617 CIDER DR | cancelled | 2026-08 |
| Connor Crouse | 5780 HALL ST SE | breakage | 2026-08 |
| Connor Crouse | 5780 HALL ST SE | pending_install | 2026-08 |
| Noah St John | 7002 SW 14TH ST | cancelled | 2026-08 |
| Cooper Otool | 362 GRAYFIELD CT SE | cancelled | 2026-08 |
| Connor Crouse | 1128 FOXCHASE LN SE | pending_install | 2026-08 |
| Connor Crouse | 6910 ADARIDGE DR SE | active | 2026-08 |
| Braeden Crouse | 57716 RUBY LN | active | 2026-08 |
| Will Teasdale | 58363 PLEASANT VIEW CT | active | 2026-08 |
| Connor Crouse | 6674 ADARIDGE DR SE | active | 2026-08 |
| Noah St John | 58030 JEWELL RD | active | 2026-08 |
| Connor Crouse | 6905 ADARIDGE DR SE | active | 2026-08 |
| Connor Crouse | 6730 ADARIDGE DR SE | active | 2026-08 |
| Connor Crouse | 6719 ADARIDGE DR SE | active | 2026-08 |
| Connor Crouse | 6885 ADARIDGE DR SE | active | 2026-08 |
| Will Teasdale | 12181 PARKSIDE CIR | active | 2026-08 |
| Connor Crouse | 11700 SARA LN | active | 2026-08 |
| Connor Crouse | 11936 SARA LN | active | 2026-08 |
| Will Teasdale | 58398 PLEASANT VIEW CT | active | 2026-08 |
| Connor Crouse | 1119 FOXCHASE LN SE | active | 2026-08 |
| Noah St John | 7204 SW 14TH ST | active | 2026-08 |
| Connor Crouse | 5900 HALL ST SE | active | 2026-08 |
| Connor Crouse | 1064 PARADISE LAKE DR SE | active | 2026-08 |
| Connor Crouse | 1022 PARADISE LAKE DR SE | active | 2026-08 |
| Cooper Otool | 54806 ASHLEY LAUREN DR | pending_install | 2026-07 |
| Cooper Otool | 54806 ASHLEY LAUREN DR | cancelled | 2026-07 |
| Will Teasdale | 53816 PAUL WOOD DR | cancelled | 2026-07 |
| Cooper Otool | 16690 25 MILE RD | pending_install | 2026-07 |
| Connor Crouse | 925 W HILLSDALE ST | cancelled | 2026-07 |
| Jeremy McFarland | 455 LAURELWOOD CT | breakage | 2026-07 |
| Connor Crouse | 16638 RENEE DR | cancelled | 2026-07 |
| Cooper Otool | 54575 AMBER DR | cancelled | 2026-07 |
| Cooper Otool | 54398 AMBER DR | cancelled | 2026-07 |
| Connor Crouse | 9046 OLD ORCHARD DR | breakage | 2026-07 |
| Cooper Otool | 310 N BERKSHIRE RD | breakage | 2026-07 |
| Will Teasdale | 53560 JOE WOOD DR | active | 2026-07 |
| Braeden Crouse | 1282 TRAILSIDE BLVD | churned | 2026-06 |
| Connor Crouse | 610 JACKSON ST | churned | 2026-06 |
| Jeremy McFarland | 3355 BARLYN LN | pending_install | 2026-06 |
| Jeremy McFarland | 165 W HICKORY GROVE RD | breakage | 2026-06 |

### unassigned rows (no rep matched)

27 order(s) with matchedUserId === null — these need a dealer
assigned before anyone can chase them, so they are a different kind of work.

By month: 2026-04 21, 2026-05 4, 2026-06 2

By carrier repName:
- Nolan Morrison: 9
- Colton Gordon: 8
- mason Tran: 7
- Gavin McCrory: 3
