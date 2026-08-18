# RESUME — read this and continue without being asked

This file is auto-injected at session start. Resume the "NEXT ACTION"
immediately; do not ask the user to re-explain or to point you at docs.

Updated: 2026-08-18 (update at EVERY milestone).

## NEXT ACTION

NEXT: wait on Jacob for (1) his live end-to-end signature test (invite
himself → paperwork → in-portal Sign now → verify item flips approved, no
esign_mismatch/review_needed alert, email From onboarding@), and (2) fresh
invite to Bryan Curtis bryan@sreiowa.com (original lost pre-Postmark-paid).
Master HEAD 3930256 = Track A + Track B + status-gate fix, deployed + Ready.

STATUS-GATE FIX SHIPPED 2026-08-18 (commit 53a2941, merged 3930256):
onboarding is pending-status-only everywhere — GET /api/portal/onboarding
only auto-sends esign docs for status==='pending' (self non-pending gets
empty items; management still reads records for review), submit/upload 403
non-pending targets, sendPendingEsignDocs itself bails unless pending +
roleRequiresOnboarding (covers public token route), nav/dashboard dropped
the entry_level_rep escape hatch (isOnboardingUser only). Full gates green
post-merge (tsc clean, 721 tests, build). CONTEXT: Wil Teasdale
(active rep) got 4 auto-created SignWell envelopes at 19:06Z — created by
a STALE LOCAL DEV process running pre-guard code with old .env.local
(envelopes were test_mode:true; prod guard would have thrown). Cleaned via
scratchpad clean-will.mjs (Jacob ran it): 4 envelopes voided at SignWell,
4 userOnboarding rows deleted, account untouched. userOnboarding is now 0
docs. coldsaint (real rep) strays cleaned earlier the same way. LESSON:
local dev talks to PROD Firebase; current .env.local (Development pull)
lacks SignWell/Postmark keys so autoSend can't fire locally anymore.

TWO PARALLEL TRACKS as of 2026-08-18 — do not mix them.

TRACK B (2026-08-18): roles overhaul + owner tier + rep pay tracking —
**NOW ON MASTER/DEPLOYED**: its session merged feat/roles-owner-payplan
into master (merge 8a3bb11, incl. c8bdae2 MTD-tile fix) and pushed;
deployed together with the status-gate merge 3930256. Track B's go-live
checklist below (rules deploy, owner bootstrap, seeding, role reassign)
is managed BY THAT SESSION — check with Jacob/that session before touching.
Original state for reference:
Worktree /home/fazetwerpnerd69/dev/3cwg-payplan, branch
feat/roles-owner-payplan at c8bdae2 (8 commits off onboarding/completion
827b789; full ledger in that worktree's .superpowers/sdd/progress.md).
Delivered: IBO hidden from all public/rep surfaces (kept in data/admin;
call templates renamed too), new comp roles (AE T1/T2, GMIT, GM, OM,
Regional, Director, Internal Rep) from ~/"3C World Group 7.1 .26
Comp.xlsx", 'owner' platform tier (owner-only margins/comp editing;
admins/reps can NEVER receive margin), comp plan in
src/data/compPlan.generated.json + /api/portal/comp-plan (own-slice
scoping) + owner CompPlanMatrix, rep sales tab [All|Pay] with expected
pay (install+14d, rejected/cancelled excluded) + private paid checkbox
(users/{uid}/salePaid). Gates green (tsc/test 690/build; lint 40
pre-existing). R1 CLEAR: zero IBO invites/users/calls in prod.
GO-LIVE ON JACOB'S WORD (order matters): (1) deploy firestore.rules
(salePaid rules NOT live — checkbox blocked until then); (2) FIRST OWNER
BOOTSTRAP: zero owners exist and only owners grant owner → set Jacob's
user doc role:'owner' in Firebase console, then he grants Jeremy in
User Management; (3) optional seed scripts/seed-comp-plan.mjs --apply
(API serves committed fallback meanwhile; .env.local
FIREBASE_ADMIN_PRIVATE_KEY is TRUNCATED — only FIREBASE_SERVICE_ACCOUNT
path works); (4) reassign 10 legacy-role users (9 entry_rep +
connorcrouse321 l1_manager) to new roles. ENTANGLED: branch includes
Track A's unmerged SignWell commits — deploying B deploys A.
Jacob's standing rule: NO Sonnet agents — Fable orchestrates/reviews,
Opus subagents. NO PUSH without explicit go-ahead.

TRACK A — **DEPLOYED TO PRODUCTION 2026-08-18 evening** (Jacob's "deploy"):
master fast-forwarded to the branch + fix commits, pushed, Vercel Ready,
aliased to www.3cworldgroup.com. Post-deploy fixes shipped same evening:
(1) invite route `void sendEmail` → `await` (serverless freeze killed every
invite email in prod — they NEVER worked live before); (2) removed stale
SIGNWELL_TEST_MODE from Vercel Production env (would throw on real
envelope creation) + redeployed. ROOT CAUSE of remaining vanishing email:
Postmark FREE/TRIAL account was accepting API sends (200 + MessageID)
then silently discarding them — Jacob bought a PAID Postmark plan
2026-08-18 and delivery verified ("Delivered" event). Cleanup done: 4
orphaned pending_assignment alertTasks deleted; leftover QA account
qa-e2e-1@3cworldgroup.test (auth + users doc) fully deleted by Jacob via
script. Vercel CLI is authenticated on this box (~/.vercel) and repo is
linked — `npx vercel env ls/pull/rm`, `vercel logs`, `vercel redeploy`
all work. NOTE: `vercel link` OVERWROTE .env.local with Development env
(old local values lost; production values pullable except Sensitive).
Real candidates invited 2026-08-18: Mason Steinberger (in_progress),
Bryan Curtis (invite email lost pre-upgrade — needs fresh invite).
Jacob's test addresses: jacobcmyers692@gmail.com and jacobcmyers@gmail.com
are BOTH his real inboxes. STILL PENDING: live end-to-end signature test
(invite → paperwork → in-portal Sign now → webhook flips to approved, no
esign_mismatch alert).

TRACK A ORIGINAL SCOPE (built + reviewed, all shipped above, 2026-08-18): Onboarding sender email + EMBEDDED
in-portal SignWell signing + candidate-page portal restyle all SHIPPED
locally on `onboarding/completion`, HEAD df4416a (spec 5124181+22f8f0f,
plan dff3537, build ace1d6f..827b789 in swarm waves, fix wave df4416a).
Gates: 603/603 tests, tsc clean, build clean. Final review dual-lens
(security + correctness) + fix wave + re-review = CLEAN. Critical finding
FIXED: signing URL now lives in server-only `esignSigningUrls/{uid}_{item}`
collection (covered by default-deny — firestore.rules UNTOUCHED, Jacob
need not re-paste). Restyle visually verified 1440/390 (screenshots in
scratchpad; shoot script scratchpad/shoot-onboard.mjs, chromium-1234
executablePath workaround). Ledger: .superpowers/sdd/progress.md.
ADOBE: rejected — "Adobe for Team" has no API access; embedded SignWell
hides SignWell branding-in-email instead.

JACOB'S OPS: ALL CONFIRMED DONE 2026-08-18 in-chat — Firebase rules
pasted + alertTasks index created, Postmark verified
onboarding@3cworldgroup.com, all six Vercel Production vars set
(SIGNWELL_API_KEY, SIGNWELL_WEBHOOK_ID=9f593de0-44af-4a6e-98e4-88ce59907901
→ https://www.3cworldgroup.com/api/webhooks/esign, CRON_SECRET,
ONBOARDING_FIELD_ENCRYPTION_KEY — both regenerated in-chat, key in his
password manager — ONBOARDING_EMAIL_FROM=onboarding@3cworldgroup.com;
no SIGNWELL_TEST_MODE row).

TRACK A NEXT: nothing until Jacob says "deploy" → then merge
onboarding/completion into master locally, push (= Vercel deploy), and
run the live test: invite himself, sign in-portal, confirm item flips to
approved and no esign_mismatch/review_needed alert. CANNOT be verified
locally (say so honestly): real embedded envelope e2e, signing-URL
expiry behavior (undocumented), production Postmark sender.
FAST-FOLLOWS: GET /api/portal/onboarding esignSigningUrls read has no
degrade-on-error wrap; signing-URL regeneration; plus the older 14-item
list in .superpowers/sdd/progress.md. NOTE: Opus was 529-overloaded all
session — reviews ran on sonnet pairs (pre-dates the no-Sonnet rule);
optionally rerun one Opus whole-branch review before deploy.

---

ONBOARDING COMPLETION — **BRANCH COMPLETE, WAITING ON JACOB'S MERGE
DECISION.** Branch `onboarding/completion`, HEAD 3a76f3a (e1b2173..3a76f3a,
33 commits), 565/565 tests, tsc/build clean (re-verified by controller).

Final whole-branch review (Opus): "With fixes" — 0 Critical, 12 Important
(4 code seams + 8 argument-blind test suites). ONE fix round (ac78623 code,
3a76f3a tests) closed all 12; Opus re-review: READY TO MERGE — YES.
Deferred-findings triage: 0 must-fix, 14 fast-follow, 25 accept (full list
+ verdicts in .superpowers/sdd/progress.md and final-review-deferred.md).

DECISION (2026-07-29): Jacob chose **KEEP BRANCH AS-IS**. The branch stays
local and unmerged; master untouched. THE PROJECT IS DONE pending his
go-ahead to merge + deploy. Nothing to resume — next session should ask
Jacob what he wants to work on, unless he says "deploy the onboarding
work", in which case: (1) merge onboarding/completion into master locally,
(2) walk him through the ops checklist BEFORE any push: paste
firestore.rules into the Firebase console Rules editor (never
machine-validated), set SignWell env vars incl. SIGNWELL_WEBHOOK_ID +
CRON_SECRET in Vercel, create the composite indexes, then push. One live
SignWell envelope end-to-end test is strongly advised before real
candidates (POST /documents id vs webhook payload id correspondence is
UNKNOWN; the esign_mismatch alert is the production instrument for it).
14 FAST-FOLLOW items are triaged in .superpowers/sdd/progress.md +
final-review-deferred.md — good candidates for a next work session.

The durable ledger is `.superpowers/sdd/progress.md` (git-ignored). It is
the recovery map — trust it and `git log` over recollection. It carries
the per-task commit ranges and a DEFERRED list the final review must
triage.

HARD CONSTRAINT FROM JACOB: **DO NOT DEPLOY.** Local commits only. No
git push (push = Vercel production deploy). No firebase deploy — the
firestore.rules chat change is written and committed but NOT deployed.
He is building this ahead of actually needing it.

MODEL ROUTING CHANGED 2026-07-28: the main loop is now **Fable 5**
(was Opus 5). This makes one existing rule critical rather than merely
important — **every Agent/Workflow call MUST pass `model` explicitly.**
An omitted model inherits the main loop, and a subagent must NEVER run on
Fable 5, under any main-loop model, no exceptions. Use `model: "sonnet"`
by default and `"opus"` for review/verify/judge stages. All Task 1-8
reviews ran on Opus; keep the final whole-branch review on Opus too.

TWO THINGS THAT ARE JACOB'S, NOT MINE:
1. `firestore.rules` has NEVER been machine-validated — no firebase-tools
   in this environment. Before ANY deploy it must be pasted into the
   Firebase console Rules editor (validates on paste, pre-Publish) or run
   against the emulator. A parse failure is a deploy-time outage.
2. There is still no Adobe/e-sign API key, so no signature flow has ever
   been exercised end-to-end. Everything about the provider is reasoned
   from source, not observed. The specific unknown: whether SignWell's
   `POST /documents` id matches the id in its `document_completed`
   payload. If those diverge, EVERY signature drops silently — the
   `esign_mismatch` ops alert added in Task 8 is the production
   instrument that would surface it.

TASK 8 SUMMARY (5 fix rounds, 4 independent Opus reviews, b7b1cc5..19daf11).
The guarantee — a contract cannot be marked signed by typing into a box —
is UPHELD. The e-sign webhook is the only writer of `approved` on a
signature item, and only for the envelope currently recorded on the doc.
Each round's fix exposed the next problem, so read the ledger before
assuming any part of it is untouched. Recurring lesson worth carrying
into Task 9: three separate rounds shipped a test stub that ignored its
own arguments, so the code it "covered" could be broken arbitrarily and
the whole suite stayed green. Break every new test before trusting it.

The spec supersedes docs/superpowers/specs/2026-07-09-entry-level-rep-
onboarding-gate-design.md on two points that were themselves client-
approved (all 8 invitable roles now require onboarding; assigning a role
to a pending user no longer auto-activates). Jacob was shown the conflict
and chose the new behaviour. The Accept button on the users page SURVIVES
as an explicit confirm-guarded override.

Three problems it fixes: (1) nothing confines a pending hire — they see
nearly the whole portal; (2) 7 of the 8 roles the recruiting invite form
offers strand the candidate permanently, because roleRequiresOnboarding()
is true only for entry_level_rep and five systems quit early on it;
(3) a failed e-sign send degrades silently into a free-text box.

CANNOT BE VERIFIED in this environment, must be reported as such: no
SignWell API key (so no real envelope end-to-end), and firestore.rules
are not deployed (so chat access for a pending hire is untested).

CORRECTION TO A NOTE BELOW: Codex is NOT dead. codex-cli 0.145.0 runs
fine with -m gpt-5.6-luna (verified 2026-07-25). Ignore the "Codex dead
until Aug 12 2026" line in STANDING RULES.

PREVIOUSLY SHIPPED — security hardening went to production on
2026-07-25 (46 commits, merged to master, pushed, Vercel deployed).
Firestore rules were deployed separately by Jacob and smoke-tested via
chat. Ask Jacob what he wants next.

WHAT SHIPPED — two critical holes, both closed:
1. The management auth helper never verified a token; it trusted a
   client-supplied uid and looked up THAT user's role. 18 routes gated on
   it. Combined with the chat members endpoint handing out a labelled
   uid->role directory, any employee could become a full admin in two
   requests. Module deleted, all 18 migrated to token-verified helpers.
2. Decommissioning only set a Firestore flag — the Firebase auth account
   still worked forever, and a fired ADMIN kept admin. Both paths now
   disable the account and revoke refresh tokens.
Plus: 11 fully ungated routes closed, account-status enforced at the API
layer, and firestore.rules locked down for sales/training/userProgress/
leaderboard.

VERIFIED AGAINST PRODUCTION with four disposable accounts (created, tested,
destroyed, swept clean — zero residue):
- uid-as-authority (?requestedBy=, ?userId=) -> 403 everywhere
- inactive account with a VALID token -> 403 everywhere
- unapproved self-signup (pending, no field role) -> 403 everywhere
- pending-with-field-role new hire -> 200 on bell/training/dashboard, and
  Mark Complete writes AND persists
- pending->active boundary flips forms/options, company-stats and
  weekly-challenge from 403 to 200 exactly as designed
Jacob then confirmed in-browser: user management, dashboard and chat all
load.

STILL NOT VERIFIED (low risk, would fail LOUDLY not silently):
- approving a sale end to end; the form review queues (payroll disputes
  etc.). Same gate as user management, which works.
- the leaderboard 100-row cap for non-management never engaged — only 6
  ranked reps exist, so 1000 and 100 return the same thing.
- production Firestore has ZERO training resources, so the training list
  legitimately renders empty for everyone.

KNOWN PRE-EXISTING, NOT FROM THIS WORK — do not misattribute:
- useLeaderboard.ts:44 and useFormOptions.ts:13 read auth.currentUser
  directly with no user guard, so a hard refresh can race auth. The
  race-safe helper is src/lib/firebase/getIdToken.ts (added 7f72e65).
  useLeaderboard fails LOUD (console 401); useFormOptions fails SILENT
  (early return, empty dropdowns, no request at all).
- admin/page.tsx:25 declares authedFetch(url) with NO init param, so
  using it for a POST silently drops the method and body. 3 call sites
  depend on it being GET-only.
- 26 eslint errors in marketing pages + two chat hooks.

SUGGESTED NEXT SECURITY WORK (nothing started): rate limiting (login,
signup and /api/public/applications accept unlimited requests and the
public form has no captcha/honeypot — "x" passes as an email), then
security headers/CSP (no middleware.ts exists at all). Full list under
"Still open" in docs/security/2026-07-25-findings.md.

KEY DOCS: docs/security/2026-07-25-findings.md (what was wrong, what
changed, what is still open), docs/security/firestore-rules-deploy.md,
scripts/audit-open-routes.mjs (derives its probe list from the real route
table — run it after adding any route).

METHOD NOTE WORTH KEEPING: grepping route files for auth-helper names was
wrong in BOTH directions — it flagged six properly-gated routes as open and
counted eighteen unauthenticated ones as safe. Only following the call
chain and probing a running server produced correct answers. Likewise a
green audit script proves the LISTED routes are gated and nothing more:
/api/portal/training was open to the internet while the old script
reported "0 of 17 clean", and both statements were true.

ONE OPEN ITEM DELIBERATELY DEFERRED: onboarding/upload parses the
multipart body before its auth gate (the target userId lives in the form
data). Pre-existing, low severity, free DoS amplifier for an
unauthenticated caller.

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
- Subagents NEVER on Fable — always explicit model. JACOB'S RULE
  (2026-08-18): NO Sonnet agents — Fable orchestrates/reviews in the
  main loop, subagents run on Opus. Codex is alive (see correction
  above); use it when the GPT sub is active.
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
