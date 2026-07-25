# RESUME — read this and continue without being asked

This file is auto-injected at session start. Resume the "NEXT ACTION"
immediately; do not ask the user to re-explain or to point you at docs.

Updated: 2026-07-25 (update at EVERY milestone).

## NEXT ACTION

**JACOB: review and merge `security/close-open-routes`, then deploy the
Firestore rules yourself.** The overnight security work is COMPLETE — 42
commits, all gates green, adversarially reviewed. Nothing was pushed and
nothing was deployed, per your instructions.

Read first: `docs/security/2026-07-25-findings.md` (what was wrong and what
changed). Then `docs/security/2026-07-25-verification-checklist.md` — the
click-through only you can do, because no agent had a login and creating one
against the live Firebase project was refused as an unattended production
change.

Then, and only after you have read the rules diff:
`docs/security/firestore-rules-deploy.md` → `firebase deploy --only
firestore:rules --project cworldgroup-cca68`. The rules are written and
committed but NOT deployed.

THE HEADLINE: any employee could become a full admin in two requests. The
management auth helper never verified a token — it took a client-supplied
uid and looked up that user's role. The chat members endpoint handed out a
labelled uid→role directory, so picking an admin took one request and being
them took the second. Separately, decommissioned employees kept full API
access indefinitely: their Firebase account was never disabled, so a fired
admin was still an admin.

MOST IMPORTANT THING TO CHECK IN THE BROWSER: a **pending** rep (hired,
mid-onboarding, not yet activated). That account state is where every
regression risk in this diff lives, and the failures are SILENT — an empty
notification bell, a progress ring stuck at 0%, a Mark Complete button that
reports success and does nothing. Two such regressions were caught and fixed
by the adversarial review after the implementation work "finished"; they are
the reason the checklist exists.

KNOWN-GOOD BASELINE IF SOMETHING LOOKS BROKEN: a hard-refresh 401 on the
leaderboard, or empty dropdowns on a form, are **pre-existing on master** and
not from this branch. See finding #8 in the findings doc before blaming the
security work.

STANDING RULES THAT WERE IN FORCE (kept, in case work resumes):
- NEVER push to master, NEVER let Vercel deploy. Branch only.
- firestore.rules: written and committed, NEVER deployed by an agent.
- NEVER authenticate against production Firebase — no disposable admin
  accounts, no minting custom tokens for real employees. This was requested
  by a subagent to finish browser verification and refused: impersonating a
  real person's production account, or leaving a live privileged account
  behind if cleanup silently fails, costs far more than the ten minutes of
  manual clicking it would have saved.
- Adversarial review by Opus agents that wrote none of the code.

METHOD NOTE WORTH KEEPING: grepping route files for auth-helper names was
wrong in BOTH directions — it flagged six properly-gated routes as open, and
counted eighteen unauthenticated ones as safe. Only following the call chain
and probing a running server produced correct answers. Related: a green
`scripts/audit-open-routes.mjs` proves the *listed* routes are gated and
nothing more — `/api/portal/training` was open to the internet while the
script reported "0 of 17 clean", and both statements were true.

WHAT IS STILL OPEN (deliberately, none blocking the merge): no rate limiting
anywhere, no security headers or CSP, no Firestore rules tests or emulator,
and the items listed under "Still open" in the findings doc. Suggested order
if you want a next session: rate limiting, then headers/CSP.

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
