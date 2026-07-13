# RESUME — read this and continue without being asked

This file is auto-injected at session start. It is the live state of the
portal redesign campaign. Resume the "NEXT ACTION" immediately; do not ask
the user to re-explain or to point you at docs.

Updated: 2026-07-13 (update this file at EVERY milestone: pick made, page
started, implementation done, deploy — not just at session end).

## NEXT ACTION

Calls Schedule mockup round: Codex inventory → brief → 3 mockups (dark
"The Line" family) → screenshot/self-critique → send mockups to the user as
FILES via SendUserFile display:render (localhost links don't work for them)
→ user picks. Then continue page order below.

## Campaign state (mockups-first, implement later)

User direction: run ALL pages' mockup rounds first, one page at a time,
3 mockups each; implement + 1:1 verify + deploy later, per page, when the
user says so. The user is non-technical — plain language, business
decisions only, one question at a time.

Picks so far (all "The Line" family — dark Spotlight Arena):
- Dashboard: option-3 The Line — IMPLEMENTED locally (commit 05cb166,
  parity PASS), deploy PARKED. Not pushed.
- Sales: option-3 The Line: Sales — picked 2026-07-13, not implemented.
  Approvals page folds into Sales pending view (user-approved merge).
- Team Chat: option-3 The Line: Chat — picked 2026-07-13, not implemented.
  Includes mobile fix: visible ⋯ on own bubbles → action sheet (replaces
  buggy long-press).
- Calls Schedule: IN PROGRESS (mockup round).
- Remaining after that: Forms → Resources (University+Links merge candidate)
  → Operations → Admin. Leaderboard is DONE/deployed — never touch.

## Key files

- Campaign plan + picks: docs/superpowers/specs/2026-07-12-portal-redesign-campaign-design.md
- Design constraints + locked client decisions: docs/redesign/ANCHOR.md (§9)
- Family design language sources: design-mockups/dashboard-round1/option-3-the-line.html,
  design-mockups/sales-round1/option-3-the-line-sales.html,
  design-mockups/chat-round1/option-3-the-line-chat.html,
  design-mockups/leaderboard-round5/spotlight-arena.html
- Dashboard goal contract (pattern to copy per page at implementation time):
  docs/redesign/dashboard-the-line-goal.md

## Standing rules (do not re-ask)

- Dark-first everywhere; light mode stays working as a toggle.
- Merges/structure changes: flag plainly + get user approval BEFORE mocking.
- Implementation gate per page: goal contract → Codex implements → fresh
  Opus 1:1 screenshot-verify until EXACT (not close enough) → gates
  (tsc/eslint/build/diff-check) → user says "deploy" → push (push = prod).
- Mockup process: Codex (gpt-5.6-luna) builds from a self-contained brief;
  screenshot 1440 + 390 (390 first-class); self-critique; send numbered
  options as files; user picks or mixes.
- Orchestration: main loop judges; Codex executes; Opus verifies; subagents
  never on Fable; keep main-loop context lean (delegate reads).
- Verification recipe: dev server usually already on :3000 (check before
  starting another); automation browser stays signed in as the user; dark
  via localStorage 3c-theme; API mocks via page.route with REAL field names
  (leaderboard: {leaderboard, currentUser, totalRanked}; stats: {stats:{...}}).
