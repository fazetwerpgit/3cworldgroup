# RESUME — read this and continue without being asked

This file is auto-injected at session start. Resume the "NEXT ACTION"
immediately; do not ask the user to re-explain or to point you at docs.

Updated: 2026-07-14 (update at EVERY milestone).

## NEXT ACTION

1. ALL CHAT WORK COMMITTED (a8cbf18, 2026-07-14) after 4 review rounds
   ending in Opus PASS: chat scroll fix (dynamic window 75-600,
   eviction guard, loadOlder paging, anchoring, tail-advancement pill,
   channel-switch ref resets) + All Company sales tape (user picked
   option 1 The Tape, only in all-company channel; live-verified with
   real data: 22 sales / $1,805/mo / last Cooper O'Tool; new GET
   /api/portal/sales/company-stats; flex-column container fix).
   Gates green (tsc/eslint/346 tests/build). AWAITING user's word
   "deploy" to push: a82bab8 + a98ed84 + 42ab000 + a8cbf18 (+ this
   docs commit).
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
