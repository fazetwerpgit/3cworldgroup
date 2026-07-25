# RESUME — read this and continue without being asked

This file is auto-injected at session start. Resume the "NEXT ACTION"
immediately; do not ask the user to re-explain or to point you at docs.

Updated: 2026-07-25 (update at EVERY milestone).

## NEXT ACTION

IN FLIGHT — SECURITY HARDENING, branch `security/close-open-routes`,
running unattended overnight 2026-07-25. Jacob approved scope option 1
("close the open doors") + explicitly authorized spawning many Opus
agents. Threats he named: outside attackers/bots + accidental data
exposure between employees.

Spec: docs/superpowers/specs/2026-07-25-portal-security-hardening-design.md

STANDING RULES FOR THIS WORK (Jacob's explicit choices — do not deviate):
- NEVER push to master and NEVER let Vercel deploy. Branch only.
  Jacob reviews and merges in the morning.
- firestore.rules: WRITE and commit the tightened rules, DO NOT run
  `firebase deploy --only firestore:rules`. Document the command for him.
- Every affected page must be browser-verified on :3005. A 401 to a page
  that never learned to send a token is the likely regression and
  typecheck will not catch it.
- Adversarial review by Opus agents that did NOT write the code.

WHAT IS BEING FIXED: 22 API routes under src/app/api have zero auth and
trust a client-supplied userId (worst: PUT /api/portal/profile,
GET+PUT /api/portal/commission, pipeline/decommission, 6x
forms/*/review incl. payroll-dispute PII). Plus firestore.rules:52-75
lets any approved user create/update/delete any sale from the browser
console with forged totalPoints.

Task list (TaskList tool) tracks the 7 steps. Recon agents recon-core /
recon-forms / recon-rules produce the implementation specs first.

---

PREVIOUS (done, deployed): Jacob said "deploy" 2026-07-24; b961f22 +
c2e2c43 PUSHED (Vercel auto-deploy):
1. b961f22 fix(leaderboard): weekly challenge counts SUBMITTED sales
   (pending+approved) — root cause: challenge read leaderboard API
   which counted approved-only; reps' fresh sales are pending so the
   bar never moved. API gains scope=submitted param; ONLY the
   weekly-challenge fetch uses it (rankings/points stay approved-only,
   all other callers verified untouched). Opus review PASS (note:
   pre-existing .limit(5000) no-orderBy truncation risk, accepted).
2. c2e2c43 bot-signup detection (Jacob 2026-07-24: "random bot
   accounts" sign up; rejected invite codes — "you can tell what bot
   emails are"). NEW src/lib/auth/botDetection.ts
   looksLikeBotSignup(email,displayName) score>=2 heuristic +
   botDetection.test.ts battery; SignupForm blocks flagged signups
   pre-signUp with friendly error (browser-verified on :3005, no
   Firebase call); signup-notify marks suspectedBot:true + skips
   admin alert; admin pending queue filters !suspectedBot (User type
   + users GET pass the field). First Opus review FAILed on
   Hirschsprung-surname false positive → fixed: consonant-run +
   vowel-ratio signals capped at 1 combined for digit-free local
   parts (run>=9 keeps +2). Opus re-review PASS; its one new MINOR
   (usePendingSignupsCount hook — sidebar badge / dashboard banner —
   still counted bots) fixed in the same commit. Gates green:
   tsc / eslint / 384 tests / build.

Dev server running on :3005 (background, this session).

Previously deployed 2026-07-24: e17873b fix(sales): ledger date cell
now reads "Install {date}" (bold line prefixed — Jacob 2026-07-23:
bare dates didn't say what they were; column header is hidden on
mobile so rows needed inline labels). One-word JSX change in
SalesTable.tsx:265; legacy sales show "Install —". Gates: tsc / 346
tests / build pass; compiled-CSS harness verified 1440 + 390 (no
overflow, single line). Opus review SKIPPED (one-word label,
disclosed).

Previously: Jacob said "deploy" 2026-07-23; ad5c944
feat(sales): install date surfaced across rep sales views PUSHED
(Vercel auto-deploy). His ask: reps must see install dates at a
glance in the list — no clicking in — to line installs up with pay.
Change: SalesTable ledger date cell stacks bold install date
over "Sold {date}" (header "Install / Sold", legacy sales show "—");
in-review cards show "Install {date}" instead of submitted date (the
"Xd waiting" chip keeps submission recency); SaleDetailSheet gains a
Dates block (Sold / Install, sheet's own dark palette #9caabd/#f4f7fa
— page vars are illegible on the navy sheet). installDate already
existed end-to-end (form required, API returns it) — display only.
Row child count/order unchanged (mobile nth-child CSS depends on it).
Gates: tsc / eslint / 346 tests / build pass; harness-verified 1440 +
390; Opus adversarial review PASS (one cosmetic note: chip shows year,
table doesn't — accepted).

Also still awaiting his iPhone retest of the top bar from the earlier
push (relaunch installed app fresh, tap profile top-right — do not
chase). Origin remote is SSH (HTTPS had no credentials).

Shipped in that push:
- 1f1022a fix(shell): top safe-area inset on portal header — Jacob
  reported (2026-07-23) top bar sits too high on iPhone, profile
  button top-right untappable. Root cause: standalone PWA +
  viewport-fit=cover extends page under the iOS status bar; fixed
  .portal-shell-header had no top inset. Fix: :root --portal-safe-top:
  env(safe-area-inset-top,0px); header height/padding grow by it, and
  every below-header offset follows (main margin/height incl. app-shell
  lock block, rail sidebar top, chat-line mobile heights).
  MobileThread.tsx already subtracted the inset — untouched. Verified
  via compiled-CSS harness at 390x844: zero-inset geometry identical to
  before; 59px-inset sim → header 121px, button at y≈69, tappable, main
  offsets match. Gates: tsc / 346 tests / build all pass. Opus review
  SKIPPED (CSS-only, disclosed). After deploy Jacob must retest on the
  installed app (relaunch it fresh).
- bdef582 chore: package-lock re-sync (node_modules was missing;
  npm ci failed out-of-sync, npm install regenerated).

Bottom-bar iOS fix: Jacob CONFIRMED good 2026-07-23.
Sales visibility: managers/IBOs see only their own sales —
INTENTIONAL; if reported as a bug, explain, don't revert.

## SHIPPED 2026-07-15 (all Vercel Ready in Production)

- cdbe1f7 Log-a-sale form cleanup (Jacob picked mockup 3 "Dense Rows,
  Grouped" + asked to drop Sale date):
  - NEW src/components/sales/PlanPicker.tsx — shared picker: company
    chips + one-line plan rows; Xfinity splits Internet vs Extras via
    new optional FiberPlan.category ('extra' on its 5 non-internet
    plans, src/types/sales.ts).
  - SaleForm.tsx: Product-sold input REMOVED (computed at submit as
    products.map(p=>p.productName).join(', ') — server still requires
    non-empty, always satisfied since products>=1 is validated);
    Sale-date field REMOVED (not sent; server defaults to now).
    Slim summary bar (value/plans/points + auto product line).
  - Edit page ([id]/edit): same PlanPicker; productSold recomputed on
    save; Sale date KEPT there for corrections.
- ead505a Sales visibility: GET /api/portal/sales + approve route now
  gate on requester.isManagement (admin/operations) instead of
  isManagerOrAbove; 'sales:approve' removed from
  FIELD_MANAGER_PERMISSIONS (types/auth.ts) — flips all client UI;
  canViewAll on sales page = hasPermission('sales:approve');
  new-sale notifications go to all admin/ops users, not managerId.
  Opus leak-hunt PASS on every route. Accepted MINOR: pre-existing
  sale_pending notifications deep-link field managers to their own
  pending list (cosmetic dead end).
- 1b68da2 Leaderboard weekly-challenge band re-skinned from lime slab
  to Arena panel idiom (navy gradient, white frame, gold label, slim
  progress bar) in leaderboard/page.tsx WeeklyChallenge. Spotlight
  Arena core visuals untouched (still frozen).
- 094603a iPhone bottom-bar fix: mobile app-shell scroll lock, CSS
  block at globals.css EOF — under 1023px + body[data-portal-bottom-nav],
  body/canvas locked to 100dvh overflow:hidden, <main> is the sole
  scroller (calc(100dvh - 62px), overscroll contain). Verified at 390:
  all sections scroll in main, bottom content clears the bar, chat
  thread (own scroller) fine, MORE sheet fine; desktop untouched.
  Body-overflow toggles in CommandPalette/MobileBottomNav/ChatLightbox
  are now no-ops on mobile (left in place — still needed on desktop).
  translateZ(0)/no-backdrop-filter on both bars remain LOAD-BEARING.

## OPEN / BACKLOG

- Jacob's iPhone retests above (bar + a rep's-eye sales check).
- Sales carrier proof: client still owes carrier→field mapping
  (order#/BTN combined field is interim).
- Leaderboard bonus points still excluded pending client decision.
- Optional: admin-settings persistence leftover from redesign.
- types/sales.ts still carries TODO "rework as per-channel products"
  (admin-managed catalog) — explicitly out of scope so far.

## FACTS THAT SAVE TIME (2026-07-23 session)

- Working tree had been blasted to CRLF + exec bits + a Windows-era
  git index (config: filemode=false, ignorecase=true, symlinks=false;
  index had zeroed dev/ino/uid) — every tracked file showed modified
  forever. FIXED: stripped CRs on all EOL-only files, chmod 644,
  rebuilt index (rm .git/index && git reset). If mass-modified status
  ever reappears, check `git diff --ignore-cr-at-eol --stat` first.
- :3000 AND :3001 are mascot-intake-crm dev servers — do NOT kill.
  Run this portal with PORT=3005 npm run dev.
- Playwright MCP broken on this box (wants /opt/google/chrome).
  Workaround: node script with project-local playwright package +
  cached chromium-1228 (see harness pattern: static page linking the
  dev server's compiled CSS chunk, override --portal-safe-top to
  simulate the notch).
- node_modules had been deleted; reinstalled via npm install
  (npm ci fails: lock was out of sync).

## FACTS THAT SAVE TIME

- Catalog is 21 plans (4 TFiber / 5 AT&T / 4 Frontier / 8 Xfinity).
  TFiber: 300/$45/3, 500/$50/5, 1Gig/$60/8, 2Gig/$70/10.
- Sales SNAPSHOT product name/price/points at submission — catalog
  edits never touch existing sale docs.
- getPlanById in types/sales.ts currently has zero consumers (kept).
- Mockup sources (opt3 won) in this session's scratchpad
  sale-opt1/2/3.html; Artifacts published for all three.
- Dev server on :3000 was stopped at session end — restart with
  `npm run dev` (background). Stale-CSS playbook: if computed styles
  look wrong, kill :3000, rm -rf .next, cold restart (fired again
  this session — 8th time).
- Root repo has ~200 untracked verification PNGs — harmless, ignore.

## STANDING RULES

- User non-technical: plain language, business decisions his,
  technical calls mine. No emojis. Mockups as Artifacts (attachment
  batches fail for him), strip doctype/html/head/body wrappers.
- Subagents NEVER on Fable — always explicit model: sonnet builds,
  opus reviews. Codex dead until Aug 12 2026.
- Pipeline per change: sonnet build from binding spec → gates
  (npx tsc --noEmit / eslint / npm test 346 / npm run build) → my
  browser verify (Playwright MCP, Jacob's admin session on :3000 —
  NEVER log it out, irreplaceable Google SSO) → fresh Opus adversarial
  review → commit LOCAL → push ONLY on Jacob's explicit "deploy"
  (push = Vercel auto-deploy). Class-only re-skins may skip Opus if
  disclosed.
- Leaderboard Spotlight Arena visuals frozen (prop threading OK).
- Honest empty states; never fabricate portal data.
- Jacob's OS reports reduce-motion — designs must look complete with
  zero animation.
