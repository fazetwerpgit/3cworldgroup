# RESUME — read this and continue without being asked

This file is auto-injected at session start. Resume the "NEXT ACTION"
immediately; do not ask the user to re-explain or to point you at docs.

Updated: 2026-07-14 (update at EVERY milestone).

## NEXT ACTION

1. LOG-A-SALE FORM CLEANUP (in flight, plan approved at
   ~/.claude/plans/frolicking-frolicking-hammock.md): Jacob wants the
   plan picker faster for reps ("seems like a lot"). Decisions: remove
   the Product-sold text box (auto-fill from picked plans), 3 mockups
   first. PICK = MOCKUP 3 (company chips + dense rows, Internet vs
   Extras groups) AND he added: REMOVE the Sale date field (server
   already defaults saleDate to now; productSold stays required
   server-side, client computes it from picked plans — no API change).
   BUILD DONE + VERIFIED + OPUS PASS 2026-07-15: PlanPicker.tsx shared
   component (chips + dense rows, Internet/Extras split for Xfinity),
   SaleForm.tsx (productSold input + saleDate field removed; productSold
   computed at submit from products; slim summary bar), edit page same
   picker (saleDate kept there for corrections), category:'extra' on 5
   xfinity plans, additive sales-line CSS at EOF. All 4 gates green
   (tsc/eslint/346 tests/build). Playwright-verified on :3000 desktop
   1440 + mobile 390 (Xfinity $160/2 plans/+15pts math correct; edit
   page loads existing sale fine). Opus PASS (3 MINORs accepted:
   edit-save recomputes productSold by design; dupe-guard double-click
   is pre-existing; getPlanById now unconsumed but kept).
   COMMITTED LOCAL — WAITING ON JACOB'S "deploy" TO PUSH.
   NOTE: catalog is 21 plans (not 22 as the plan doc says).
2. EVERYTHING ELSE DEPLOYED 2026-07-14: chat scroll fix + All Company tape
   + weekly challenge admin + rep in-review section (9b5e1df batch),
   then T-Mobile price fix (430a335). TFiber catalog now 300/$45,
   1Gig/$60, 2Gig/$70 (AutoPay prices per t-mobile.com). Firestore
   sales data CORRECTED via one-time admin script (deleted after):
   19 sales updated (7x 1gig 75->60, 12x 2gig 90->70), totalValue
   recomputed, priceCorrectionAt/Note stamped; tape verified
   $1,805 -> $1,460 (exact -345 match).
   RESOLVED: TFiber 500 restored to the catalog at $50/5pts (5ccb186,
   pushed) — team still sells it intermittently; the one historical
   500 sale stays at its recorded $60. TFiber lineup now:
   300/$45/3pts, 500/$50/5pts, 1Gig/$60/8pts, 2Gig/$70/10pts.
   NOTHING IN FLIGHT — next work comes from the user. Still open from
   before: user's iPhone bottom-bar retest after a fresh Safari open.
3. iPhone bottom bar: prod CSS verified correct; awaiting user retest
   after a genuinely fresh Safari open. If STILL drifting: rebuild
   pinning as non-scrolling app shell with inner scroll container.

## STATE

- Redesign campaign CLOSED, live in prod since 2026-07-14. Anchor:
  docs/redesign/ANCHOR.md.
- Committed LOCAL, NOT pushed (deploy ONLY on user's word "deploy"):
  a82bab8 (challenge target 7), a98ed84 (docs), 42ab000 (admin
  weekly-challenge control + rep submitted/in-review section — Opus
  PASS), a8cbf18 (chat scroll fix + company sales tape — Opus PASS
  after 4 rounds).
- Weekly challenge: settings/weeklyChallenge Firestore doc, GET/PUT
  /api/portal/settings/weekly-challenge; verified live round-trip.
- Chat member counts fixed (server filters non-active users) — deployed.

## STANDING RULES

- User non-technical: plain language, business decisions his, technical
  calls mine. No emojis. Send mockups as Artifacts (attachments fail).
- Subagents NEVER on Fable — always explicit model: sonnet builds,
  opus reviews. Codex dead until Aug 12 2026.
- Pipeline per change: sonnet build from binding spec → gates → my
  browser verify (Playwright MCP, Jacob admin session on :3000 — never
  log that session out) → fresh Opus adversarial review → commit LOCAL.
  Push ONLY on the user's explicit word "deploy".
- Leaderboard Spotlight Arena visuals frozen (prop threading OK).
- Honest empty states; never fabricate data in the portal.
- Jacob's OS reports reduce-motion; dev server CSS can go stale —
  cold-restart :3000 + delete .next if computed styles look wrong.
