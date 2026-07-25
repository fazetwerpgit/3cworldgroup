# RESUME — read this and continue without being asked

This file is auto-injected at session start. Resume the "NEXT ACTION"
immediately; do not ask the user to re-explain or to point you at docs.

Updated: 2026-07-25 (update at EVERY milestone).

## NEXT ACTION

NOTHING IN FLIGHT. The security hardening SHIPPED to production on
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
