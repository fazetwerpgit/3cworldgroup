# RESUME — read this and continue without being asked

This file is auto-injected at session start. Resume the "NEXT ACTION"
immediately; do not ask the user to re-explain or to point you at docs.

Updated: 2026-07-15 (update at EVERY milestone).

## NEXT ACTION

NOTHING IN FLIGHT — next work comes from Jacob. Two things are
awaiting HIS verification on his iPhone (do not chase, he'll report):
1. Bottom bar: open portal, background the app 1-2 min, return,
   scroll — bar must stay pinned. If it STILL drifts, get exact
   repro steps; the app-shell lock (see below) should have killed the
   whole failure class, so a recurrence means something else.
2. Sales visibility: managers/IBOs now see only their own sales —
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
