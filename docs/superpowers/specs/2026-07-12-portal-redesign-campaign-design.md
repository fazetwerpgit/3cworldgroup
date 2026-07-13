# Portal Redesign Campaign — Design (2026-07-12)

User-approved plan for extending the Spotlight Arena redesign to every
remaining portal page. Companion to `docs/redesign/ANCHOR.md` (which holds the
design language and hard constraints — this doc holds the campaign process).

## Decisions (user, 2026-07-12)

1. **Dark-first everywhere.** Every portal page leads with the Spotlight Arena
   treatment (near-black stage, navy #0A1F44 panels, lime #8dc63f accents,
   metallic display numerals). Light mode stays working as a toggle. This
   SUPERSEDES the 2026-07-02 "light default" client decision in ANCHOR §9.
2. **Compression = merging overlapping pages**, but NO merge or structural
   change happens without Claude flagging it to the user first with a plain
   recommendation. Old links keep working (redirect/alias, no removed routes
   without explicit approval).
3. **1:1 verify rule (mandatory, every page):** after the user picks a mockup,
   screenshot it → goal contract doc → Codex implements → independent Opus
   reviewers diff implementation screenshots vs the reference until it is the
   EXACT same — not close enough. Only after PASS may deploy be offered.
4. **Deploy gate:** push = production deploy. Nothing is pushed until the user
   says "deploy". No page starts until the previous one is deployed or parked.

## Picks so far (user-approved mockups)

- Dashboard: option-3 "The Line" — IMPLEMENTED locally (commit 05cb166,
  parity-verified PASS), deploy PARKED by user 2026-07-13. Not pushed.
- Sales: option-3 "The Line: Sales" (2026-07-13) — picked, NOT implemented
  yet. Approvals page folds into the Sales pending view (user-approved
  merge, old route must keep working). Goal contract still to be written
  at implementation time.
- User direction: run ALL pages' mockup rounds first; implement when
  ready to deploy.

## Page order (most-used first)

1. Dashboard (`/portal/dashboard`) — IN PROGRESS
2. Sales (list + slide-over detail)
3. Team Chat (mobile is first-class here)
4. Calls Schedule
5. Forms (whole folder, one consistent treatment)
6. Resources (University + Links — merge candidate, propose with mockups)
7. Operations
8. Admin (users, settings, review queues — last, patterns proven by then)

Leaderboard is DONE (Spotlight Arena, deployed 2026-07-11). Do not touch.

## Per-page loop

1. Claude studies the current page + purpose; writes a short brief including
   any merge/compress proposal with recommendation (user decides).
2. Codex (gpt-5.6-luna) builds 3 self-contained HTML mockups in
   `design-mockups/<page>-round<N>/`, all dark-first Spotlight Arena language.
   Serve via `python -m http.server 8899` from design-mockups; screenshot at
   1440px + 390px; Claude self-critiques before presenting.
3. Present numbered options + double-click file paths. User picks or mixes.
4. Goal contract doc (`docs/redesign/<page>-goal.md`) from the winning
   screenshot → Codex implements → 1:1 verify loop (rule 3) until PASS.
5. Report PASS; user says "deploy"; push; confirm production 200.

## Guardrails (unchanged from ANCHOR)

- No route/data/API/role/auth changes. Reskin + IA only.
- All role gates preserved; no ad-hoc role checks.
- Both themes must work; portal ThemeContext drives the dark class.
- Verification gate per slice: `npx tsc --noEmit`, targeted eslint,
  `npm run build`, `git diff --check`, route smoke, light+dark,
  mobile+desktop.
- Verification recipe: dev on :3000, user signs into the automation browser,
  dark via `localStorage['3c-theme']='dark'`, page.route mocks with REAL API
  field names.
