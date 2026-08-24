# RESUME — read this and continue without being asked

This file is auto-injected at session start. Resume the "NEXT ACTION"
immediately; do not ask the user to re-explain or to point you at docs.

Updated: 2026-08-24 (update at EVERY milestone).

## NEXT ACTION

NEXT: nothing queued — ask Jacob what's next. Waiting on him:
(a) EYEBALL the three shipped UI fixes (below) on his phone/desktop —
    no logged-in browser verify possible (temp prod admin is
    classifier-blocked); (b) pay_structure.pdf + fcra_auth.pdf still
    PLACEHOLDERS — he hasn't sent the docs; (c) webhook log grab when
    Mason signs direct_deposit (see STILL OPEN).

NEW STANDING RULE (Jacob, 2026-08-24): NO solo single-agent runs —
split independent work across MULTIPLE PARALLEL `codex exec`
background runs on gpt-5.6-luna or gpt-5.6-sol (sol = codex config
default). Fable is the orchestrator AND the reviewer — review diffs
in the main loop, do NOT spawn Opus/Sonnet reviewer agents. Only
same-file work rides in one agent. (Memory updated.)

SHIPPED 2026-08-24 (commit a295c21, deployed 3cworldgroup-79u83b9gm
Ready Production, www.3cworldgroup.com 200; gates tsc/796 tests/build
green): the THREE UI FIXES —
(1) /portal/admin/onboarding category filter pills removed (person
    filter + at-risk toggle stay);
(2) retired tiers (l1/l2_manager, ibo_level_1..4) hidden from
    GET /api/portal/commission scope 'all'; a legacy rep still gets
    their own retired tier (scope 'own' untouched). New
    RETIRED_FIELD_ROLES in src/types/auth.ts; display-only, config +
    PUT untouched; route test added
    (src/app/api/portal/commission/route.test.ts);
(3) onboarding admin rows grouped by rep in all three sections (rep
    header avatar+name+count, item rows beneath keep expand/approve/
    reject + signed-PDF links; FIFO preserved; .ops-line-rep-header
    CSS in globals.css).
Master fast-forwarded to a295c21 via payplan worktree; branch +
master pushed to GitHub (GitHub in sync with prod).

PREVIOUS (2026-08-24): E-SIGN DOC SWAP — contract + direct_deposit DONE
(real PDFs captured from Jacob's Adobe Sign widgets, installed in
assets/esign/, fields re-measured + extended with text/checkbox
fill-ins in src/lib/esign/signwell.ts, verified via SIGNWELL_TEST_MODE
embeds — placement confirmed good). All uncommitted. Remaining:
(a) pay_structure.pdf + fcra_auth.pdf are STILL PLACEHOLDERS — Jacob
    couldn't find the pay structure doc and hasn't sent an FCRA doc.
    Ask again / wait.
(b) W-9 DONE (Jacob approved): official Rev-3/2024 IRS W-9 installed
    as assets/esign/w9.pdf and wired as 5th e-sign doc ('w9' added to
    EsignDocKey, onboarding item w9 referenceKind storage→esign,
    DOCUMENTS entry with name/address/TIN/checkbox fields, verified
    in test-mode embed — placement good). Jacob's own upload
    (~/fw9--2026-1.pdf) was the IRS DRAFT DO-NOT-FILE Jun-2026 rev —
    rejected, not used. NOTE: SSN/EIN both optional (SignWell can't
    do either-or); admin review catches missing TIN.
(c) Email cleanup DONE by opus agent 'email-cleanup' (templates.ts,
    ownerNotify.ts, preview script — packet email now intro line +
    profile/checklist tables + documents + masked identity; gates
    green). I reviewed rendered output; fixed stale note "Photo and
    W-9 uploads stay in the admin page" → "Photo uploads..." after
    the w9 flip.
(d) SHIPPED 2026-08-24: all work committed (5 commits + master merge
    resolved UserForm.tsx conflict in master's favor — dropdown role
    picker), master fast-forwarded (lives in ~/dev/3cwg-payplan
    worktree), DEPLOYED to Vercel prod (verified 200), master+branch
    pushed to GitHub (clears the old "push master" carry-forward).
    Mason's packet email re-sent to Jeremy
    (jeremymcfarlandservices@gmail.com) with the new template — note
    he got 2 earlier copies with a localhost review link before I
    overrode APP_BASE_URL; final copy has the prod link. Script fix
    committed (legacy 'Email' owner resolution + dry-run recipient
    print).
(e) SHIPPED 2026-08-24 (later): "Completed" section on
    /portal/admin/onboarding (Jeremy's ask — see what reps completed)
    + GET /api/portal/onboarding/signed-pdf streams signed e-sign
    PDFs (stored copy or live SignWell fetch, cached back). Codex
    implemented from spec, diff reviewed, 794/794 tests + tsc +
    build green, deployed to prod. CAVEAT: no logged-in visual pass
    — classifier blocked creating a temp admin in prod Firebase;
    Jacob/Jeremy to eyeball the page. Jeremy's reviewer address:
    jeremymcfarlandservices@gmail.com.
Notes: SignWell coords are 96dpi px from page TOP-LEFT; capture
images were 120dpi → ×0.8. Old envelopes keep old PDFs; Mason's
outstanding direct_deposit envelope still has the placeholder unless
superseded.

STILL OPEN (carry forward):
- Webhook root cause: when Mason signs direct_deposit, run `npx vercel
  logs www.3cworldgroup.com --scope jacob-s-projects-cdd9dff8` within
  the hour. "[esign webhook] REJECTED" line → fix signature verify;
  no "[esign webhook]" line at all → delivery-side, take to SignWell
  dashboard/support. (Logging shipped in d1a3edd, deployed.)
- Commit the /apply alert + honeypot + chat attachment changes still
  uncommitted in the main tree (globals.css, chat/page.tsx,
  MobileThread.tsx, attachmentUpload.ts, applications/route.ts,
  notifySubmission.ts).
- Push master 3451834 to GitHub (production ahead of GitHub).
- docs/redesign/RESUME.md itself is modified+uncommitted — commit it.

PREVIOUS CONTEXT (2026-08-24): (1) PIVOT — Mason ALREADY SIGNED: dry run showed his
pay_structure envelope f8667ab0 is "Completed" at SignWell while the
portal still says submitted → the document_completed WEBHOOK NEVER
LANDED (possibly for everyone, not just him). Do NOT run
refresh-esign-link --apply (a "ready to sign" nudge would be wrong).
Jacob runs instead: `node scripts/esign-webhook-audit.mjs --env
<envfile>` (dry run: lists SignWell registered webhooks + every
envelope vs portal status), then `--apply` to backfill stuck items as
the webhook would (approved, reviewer 'E-sign (auto)', bell notif;
activation flag NOT replicated — check admin onboarding after).
AUDIT DRY RUN RESULTS (2026-08-24): webhook URL correctly registered
(hook 9f593de0 = SIGNWELL_WEBHOOK_ID env, verified match), payload
shape + hash keying verified correct against SignWell docs; Mason is
the FIRST real signer — contract/fcra_auth/pay_structure Completed at
SignWell but portal=submitted (webhook never landed, cause unknown);
direct_deposit only Viewed (he still must sign that one). Webhook
route now logs every delivery outcome (d1a3edd) — after deploy, when
Mason signs direct_deposit, `npx vercel logs` shows where events die.
PLAN: (a) DONE 2026-08-24 — audit --apply backfilled Mason's
contract/fcra_auth/pay_structure to approved; (b) DONE 2026-08-24 —
deployed d1a3edd to production (dpl_6LxbtMxY READY, aliased
www.3cworldgroup.com; Claude ran the deploy from the clean scratchpad
deploy-tree after Jacob directed it); (c) DONE 2026-08-24 — Mason's
direct_deposit URL refreshed + bell notif + email sent (first email
attempt 422'd: ONBOARDING_EMAIL_FROM is Sensitive in Vercel so env
pull writes literal "[SENSITIVE]" — script now skips non-@ From values
and has --email-only retry, ad4973d); (d) STILL OPEN — when Mason
signs direct_deposit, run `npx vercel logs www.3cworldgroup.com
--scope jacob-s-projects-cdd9dff8` within the hour: a "[esign webhook]
REJECTED" line → fix verification; no "[esign webhook]" line at all →
delivery never arrives, take to SignWell. Check Mason in admin
onboarding review (activation flag not auto-set by backfill). Classifier blocks Claude
from prod-credential commands, so Jacob runs them; envfile = `npx
vercel env pull --environment=production --scope
jacob-s-projects-cdd9dff8` output
(FIREBASE_ADMIN_PRIVATE_KEY is truncated everywhere, but
FIREBASE_SERVICE_ACCOUNT is VALID — its base64 has real newlines that
`vercel env pull` escapes as literal \n; scripts strip those before
decoding as of d1a8966, so the pulled env works). (2) Deploy the two fixes below
(commits 5204f2d esign + 5835536 streak on onboarding/completion; merge
to master then Jacob deploys via `npx vercel deploy --prod --yes --scope
jacob-s-projects-cdd9dff8`). (3) still open from before: push master
3451834 to GitHub; commit /apply alert + honeypot changes (still
uncommitted in main tree).

DONE 2026-08-24 evening (deployed dpl_CMNe5Hh, gated tsc/747 tests/build):
- feat(onboarding) ee8c4af+735537a: owner notifications — email to all
  role=owner users (+ config/onboardingNotifications.extraEmails) when a
  rep signs each e-sign doc (fires from the webhook, so dependent on the
  webhook fix) and a full packet on checklist completion (fires from
  maybeFlagActivationReady, works via manual admin approvals too):
  profile + checklist + MASKED-ONLY sensitive (never decrypts; last4 +
  audited-reveal pointer) + signed PDFs attached (pulled from SignWell
  on document_completed, stored esign-completed/{uid}/{itemId}.pdf,
  8MB cap). New lib src/lib/onboarding/ownerNotify.ts.
- LATER 2026-08-24: Jeremy ALREADY has role=owner (an earlier phone save
  went through silently) — packet preview script sent Mason's packet to
  him directly. fix(onboarding) fbe4ba3 (deployed): owner recipient
  lookup now also reads legacy 'Email' (capital E) so Jacob's account
  isn't dropped. scripts/preview-onboarding-packet.mjs (4c37a28) sends
  a rep's packet to owners or --send-to.
- fix(admin) 2f55beb: role/status segment buttons passed markDirty=false
  and the save bar only renders when dirty → role-only changes (e.g.
  granting Jeremy owner) had NO save button. Jacob to retry assigning
  jeremymcfarlandservices@gmail.com the owner role from his phone — once
  role=owner he gets all owner notifications automatically.

DONE 2026-08-24 (both gated: tsc clean, 738/738, build OK):
- fix(esign) 5204f2d: SignWell embedded signing URL was minted once at
  envelope creation and served forever from esignSigningUrls; links
  expire → Mason's "signing window failed" alert. "Sign now" now POSTs
  new /api/portal/onboarding/esign-signing-url which pulls a fresh URL
  via SignWell Get Document for the SAME envelope (owner-scoped,
  falls back to stored URL on failure, never clobbers stored URL on
  error). scripts/refresh-esign-link.mjs = ops one-off for stuck reps.
- fix(leaderboard) 5835536: streak badge (only rendered at >=2 days,
  LeaderboardTable.tsx:92) stayed visible Sat-Mon after a Thu+Fri pair
  (weekend-skip + today-grace). computeStreak now returns 0 unless a
  sale today or calendar yesterday; counting unchanged (Mon sale
  revives Thu,Fri,Mon = 3). Jacob chose this rule explicitly.
  scripts/diagnose-streak.mjs = read-only replay of a rep's streak.

PREVIOUS: (1) Jacob to `git push` master 3451834 from the payplan worktree
(GitHub still at 4304362; production is ahead of GitHub until then);
(2) confirm with a rep that chat messages now show exactly ONE
notification; (3) commit the /apply alert + honeypot changes sitting
uncommitted in the MAIN TREE on onboarding/completion.
PUSH FIX IS DEPLOYED TO PRODUCTION (2026-08-20, Jacob ran deploy via
`npx vercel deploy --prod --yes --scope jacob-s-projects-cdd9dff8`;
plain deploy without --scope fails "Not authorized"): dpl_9dqS4xXEhTTs
READY, target production, aliased www.3cworldgroup.com. Reps should see
exactly ONE notification per chat message immediately (old cached SWs
also drop to one — SDK auto-display is gone and the old handler already
falls back to data fields).
FIX (commit 3451834 fix/push-double-display → ff-merged to master):
src/lib/push/sendPush.ts now sends DATA-ONLY FCM messages (dropped
`notification` field + whole `webpush` block); firebase-messaging-sw.js
untouched — its onBackgroundMessage is the single display path. New
regression test src/lib/push/sendPush.test.ts (red→green: asserts no
notification/webpush props, string data, url defaults to
/portal/dashboard). Gates: tsc clean, 752/752 tests, build OK.
ROOT CAUSE (confirmed in FCM SDK source
node_modules/@firebase/messaging/dist/index.sw.cjs:839-846): payload
`notification` field → SDK auto-display + SW onBackgroundMessage
showNotification, no `tag` → exactly 2 notifications per push since chat
push shipped 217b652 (2026-08-18).
Secondary hygiene (separate, may cause future multi-device dupes):
pushTokens arrayUnion never pruned per-device + PushTokenRefresher
re-registers every portal open + token re-mint on failure never removes
old token + /sw.js and /firebase-messaging-sw.js both claim scope '/';
DELETE /api/portal/push/register has zero callers. Zero send logging on
push path (after() block logs nothing).

DONE 2026-08-20 (uncommitted in MAIN TREE, gates green: tsc clean, build OK):
- /apply submission alerts: FORM_ALERTS['application'] ("Job Application" →
  /portal/admin/recruiting) in src/lib/forms/notifySubmission.ts; public
  route src/app/api/public/applications/route.ts now awaits
  notifySubmission('application', "name (city)") after the Firestore write
  AND enforces the `website` honeypot server-side (silent success, no
  write) — was client-only before. Admin toggle card picks up the new
  entry automatically. NOT COMMITTED (main tree also holds another
  session's chat WIP — keep changes separate when committing).
- Craigslist job post: modernized rewrite delivered to Jacob (owner asked
  for updated version), links to 3cworldgroup.com/apply?ref=craigslist
  (ref param prefills referredBy for source tracking).
- Noted, not yet raised with owner: /apply FAQ says "no experience
  required" but the ad targets experienced reps — copy tension to resolve.

PREVIOUS: CHAT SCROLL FIX is DEPLOYED TO PRODUCTION (Jacob's "deploy",
2026-08-19 ~22:47 CDT): Vercel 3cworldgroup-7fc9vqa8h Ready, target
production, aliased to 3cworldgroup.com + www. Adversarial reviewer
verdict on final commit: CLEAN — ship it (2 non-blocking minors: benign
touchstart listener accumulation in the keyboard ladder; one-time ~25px
nudge when the load-older pager unmounts at end-of-history).
Master 4304362 PUSHED to GitHub (Jacob ran the push himself) — git and
production are in sync. The payplan worktree now has master checked out
(feat/roles-owner-payplan = same commit). REMAINING: Jacob to type in a
busy channel on his iPhone to confirm the keyboard fix feels right (only
path not testable headless).
Commit 4304362 on feat/roles-owner-payplan (worktree
/home/fazetwerpnerd69/dev/3cwg-payplan — done there because the MAIN TREE
has another session's uncommitted chat WIP in page.tsx / MobileThread.tsx /
attachmentUpload.ts; expect merge conflicts when that session syncs).
Files: src/hooks/chat/useMessages.ts (+ new useMessages.test.tsx),
src/components/chat/MobileThread.tsx, src/app/portal/chat/page.tsx.
Root causes fixed: (1) useMessages blanked the list on every window growth
— incl. the eviction guard firing on EVERY new message once the 75-window
is full — collapsing the scroller → scrollTop clamped to 0 = the
"scrolls to top while typing" bug; now only real channel switches blank
(renderedChannel state gates it, empty channels count as rendered);
(2) iOS keyboard un-pinned the reader (rootMargin 150px < keyboard ~330px)
→ composer-focus instant-scroll ladder (80/250/600ms, cancelled on
touchstart); (3) Safari lacks scroll anchoring → data-mid topmost-message
compensation on prepends (prepend-only, never while pinned). Also fixed
pre-existing desktop channel-open smooth-crawl + phantom-growth bugs.
Gates ALL GREEN: tsc clean, 750/750 tests, lint (only master's
pre-existing set-state-in-effect remains), build OK, read-only Playwright
probe 10/10 (mobile 430px + desktop, typing/growth/anchoring/A→B→A).
Keyboard path needs real-device confirm on Jacob's iPhone after deploy.
Reminder: ship via `vercel --prod` after merging to master — push alone
does not deploy. Dev server for probes runs on :3100 (3000 = tdi-doctor).

ALSO STILL WAITING on Jacob: (1) his live end-to-end signature test
(invite himself → paperwork → in-portal Sign now → verify item flips
approved, no esign_mismatch/review_needed alert, email From onboarding@),
and (2) fresh invite to Bryan Curtis bryan@sreiowa.com (original lost
pre-Postmark-paid). Master 3930256 = Track A + B + status-gate fix,
deployed + Ready.

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
**FULLY DEPLOYED 2026-08-18 evening** (Jacob's "deploy"). All go-live
steps DONE by the Track B session: firestore.rules deployed (salePaid
block + owner + new roles LIVE — paid checkbox works); Jacob's owner
role CONFIRMED on users/bQWKezQmd1P9Yf3GzOdXXBkDzj93
(jmyers@3cworldgroup.com — his portal account is the company email, NOT
the gmail; user docs store it as `Email`, capital E); comp plan SEEDED
(config/compPlan 12 roles/252 rates + config/compPlanMargin 21 entries,
version 2026-07-01); master at 8e97c50 (= feat/roles-owner-payplan
incl. both master-merges + seed-script FIREBASE_SERVICE_ACCOUNT/ENV_FILE
fix 48544e0), gates green post-merge (tsc clean, 714/714 tests);
Vercel production 3cworldgroup-6eitta4o8 Ready, aliased to
3cworldgroup.com/www. NOTE: pushing master does NOT auto-deploy — this
project ships via `vercel --prod` (CLI, authed).
Post-deploy fix 9ec831a (deployed): phone chat composer textarea was 11px
→ iOS force-zoomed on focus; now 16px (globals.css ~5629). NOTE for the
chat-WIP session: main tree has uncommitted globals.css edits — expect a
trivial merge at that line when syncing master.
DEPLOYED 2026-08-18 late (master 7946594, Vercel Ready): (a) mobile
dead-end fixes — sale sheet close X clears the notch (safe-area padding,
44px target), back gesture closes sheet in place (history entry; sheet
Links disown it so Open-full-page isn't bounced), Escape closes
sheet/notification panel, notification panel pinned on-screen at <=640px;
(b) FULL PUSH-NOTIFICATION SYSTEM — VAPID key live in Vercel env +
main-tree .env.local; sends wired via after(): sale approve/reject →
rep's devices (salePush.ts), chat message → channel memberIds minus
author, cap 50 (chatPush.ts); first-run PushPromptBanner (portal
layout-mounted, house-styled, 14d snooze key '3c-push-prompt-snoozed-at');
enablePushOnDevice() sole caller of /api/portal/push/register. All
E2E-verified at 59px notch inset ([[rep-device-baseline]]). 747 tests.
Worktree /home/fazetwerpnerd69/dev/3cwg-push (feat/push-notifications,
merged) can be removed.
DEPLOYED f5d2ec4 (Ready): new-sale-pending push to management devices
(sales POST route, after() + reviewerIds minus submitting rep).
PUSH-DELIVERY SAGA RESOLVED 2026-08-18 night (master 81a2a69 deployed,
Ready; all gates green, 747 tests): after the evening redeploys Jacob's
iPhone silently stopped receiving pushes — FCM said ok but APNs dropped
them (dead subscription; old token later confirmed
registration-token-not-registered). Shipped, in order: PushTokenRefresher
(b31081a, portal-layout mounted, silently re-registers FCM token on every
open when permission granted); pushTokensUpdatedAt stamp on register
(9b75620); push-health beacon (b055348, POST /api/portal/push/health →
users/{uid}.pushHealth {supported, permission, result, standalone, ua,
at}); dead-subscription recovery (534ec2c — getToken fail → unsubscribe
stale pushManager subscription → retry once) + detailed results
(requestPushTokenDetailed / enablePushOnDeviceDetailed); iOS quirk fix
(81a2a69 — requestPermission() without gesture resolves 'denied' even
when granted, so skip re-ask when Notification.permission==='granted').
End-to-end confirmed on Jacob's phone: new token minted, test banner
received; dead token pruned from his users doc (1 token remains). Whole
team announced + installed; push now self-heals on every app open.
FOLLOW-UP: who's-enabled report for Jacob in a few days (query users
where pushTokens non-empty vs active roster).
DEPLOYED c3aa668 (master, Vercel Ready, aliased www.3cworldgroup.com;
gates green: tsc, 747 tests, build): THE REAL iOS DEAD-END ROOT CAUSE. Jacob (iPhone 17 Pro Max) still got stuck on a sale sheet
after 7946594 because the July-14 app-shell scroll lock (globals.css
~14098) makes <main> the phone scroller, and iOS WebKit breaks
position:fixed INSIDE that scroller — sheet clipped to main's box,
painted UNDER fixed header/bottom nav, X unreachable. Chrome renders it
fine, which is why e2e passed while iPhones stayed broken. Fix: portal
SaleDetailSheet + sales toast + member-line onboarding sheet to <body>
via createPortal, each in a display:contents wrapper carrying its
palette class (.sales-line / .member-line) so scoped CSS vars cascade.
Verified in Chrome (body-child, X hittable at 59px inset, back/X close,
Open-full-page 3/3). Awaiting Jacob's on-device retest (close app fully,
reopen, tap a sale). RULE for future mobile
overlays: any position:fixed element rendered inside <main> must be
portaled to body (chat WIP session: check your sheets/overlays too).
Post-deploy fix 77568d2 (deployed, Ready): role/status chips passed
markDirty=false so a role-only edit never showed the Save bar ("doesn't
save"); role pickers are now dropdowns; IBO + L1/L2 no longer assignable
(retired role shows as disabled "(retired)" option on holders).
REMAINING (Jacob, in-portal): (1) grant Jeremy 'owner' in User
Management; (2) reassign 10 legacy-role users (9 entry_rep +
connorcrouse321 l1_manager) to new tiers — they get AE Tier 1 rates
until then; (3) sanity checks: owner sees comp matrix + margin on
Resources, rep sees [All|Pay] + working paid checkbox, plain admin sees
no margin. Feature spec/ledger: worktree
/home/fazetwerpnerd69/dev/3cwg-payplan .superpowers/sdd/progress.md.
Follow-ups (unscheduled): DirecTV/Brightspeed/Spectrum not in FIBER_PLANS
catalog (their spreadsheet rates not in app); retire legacy "0%"
commission strip on Resources; existing IBO users still display "IBO
Level N" (intended keep-in-data).
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
