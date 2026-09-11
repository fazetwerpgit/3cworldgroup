# RESUME — read this and continue without being asked

## PORTAL BUG (2026-09-10) — carrier cancellations now take the money. UNCOMMITTED.

Jacob: "on Will's it was showing that he had 15 installs but he had 3 cancels."
Diagnosed against production Firestore. Will Teasdale (uid Qo7SIygz..., dealer
5910989, note the display name is "Wil" with one L — a /will/ search finds
nothing) has 68 linked carrier orders: 52 active, 10 pending, 5 cancelled, 1
churned. Nothing was wrong with the link or the API; `installBucketForSale`
only knew 'breakage' and 'active', so a carrier-cancelled order whose sale
carried a past install date came back 'installed' — on the rep's page AND on
the board.

Jacob's call, asked explicitly: a carrier cancel DROPS THE MONEY TOO. That
amends CALL 2 ("the sale keeps the MONEY") and the spec is updated to match —
see the AMENDED block in docs/superpowers/specs/2026-09-03-one-book-merge.md.
A carrier status still never un-cancels what a human cancelled.

Changed: src/lib/sales/installBucket.ts (new `isCarrierCancelled`; countedSales
and cancelledSales take an optional fiberBySale map), mergeBook.ts (applies it
after the join, where the order is finally known), SalesTable.tsx, portal/sales/
page.tsx (all three rep KPIs), AdminSalesBoard.tsx (My pay). Plus tests in
installBucket.test.ts and mergeBook.test.ts.

Effect on Will, measured against live data: July 13 sales $845 -> 12 $785
(Richard Maierle), August 15 $970 -> 14 $910 (Alaina Armstrong), September
unchanged. His third August cancel, 217 Orleans Ave, he never logged, so it was
never in a figure — it already shows in his Cancelled chip as a bare address
with a Cancelled pill and date, because no name for it exists anywhere.

Gates: tsc clean, 1048 tests / 115 files, npm run build exit 0.
NEXT: commit these 6 files by explicit path. Jacob's public-site redesign and
the onboarding/e-sign changes are in the same tree — never `git add -A`.

## CURRENT (2026-09-08) — first public-site board rejected; production code locked

Scope is `/`, `/about`, `/services`, `/opportunities`, `/contact`, and `/apply`; e-sign,
onboarding, portal, and `/culture` are excluded. Jacob approved the design contract and authorized
artifact work only. No production `src/` or `public/` change is authorized. Jacob rejected nearly
all of the first board after reviewing it.

The master comparison and decision board is served at
`http://localhost:3010/master-board.html` from
`/tmp/3c-public-review-2026-09-08/master-board.html`. It contains current desktop/mobile evidence,
Services tablet schematics, page-specific Keep/Change/Cut guidance, a Shared Shell proposal, fresh
Careers choices, Contact scope choices, and copyable selections. It is rejected reference material,
not an approved implementation direction. The earlier `gpt-image-2-codex` candidates are rejected.

Locked decisions: Home keeps its structure with defect fixes only; About keeps structure and
initials-only leadership; Services remains recruit-facing and keeps a rebuilt responsive connector;
Careers is a fresh direction at `/opportunities` with duplicate process content consolidated;
Contact keeps the oversized 3C as vector and leaves form position/phone treatment for Jacob to
choose; Apply keeps structure and adds 1099 commission-only context beside the first earnings
claim. Apply Now remains primary, geography becomes “selected markets across the United States,”
and no people imagery is used before authentic team photos exist.

Mechanical and Opus review of the first board passed, but that did not constitute Jacob's visual
acceptance. Production UI remains untouched by the artifact pass. The next image round must use the
new OpenAI Image Gen 2.5 access; verify its exact available model identifier before generation.

Jacob clarified that he likes the current heroes' style and direction. Their creative direction is
now the baseline; “revamp” means use OpenAI Image Gen 2.5 to explore better-executed versions without
turning them into unrelated concepts. For every approved image-remake candidate, show three columns:
current control, one faithful polished remake, and one more adventurous rearrangement that preserves
the same style and message. Jacob delegated candidate selection to Codex. Only images with a
specific visible sharpness, distortion, responsiveness, or composition defect qualify. Home needs
no image work and is excluded from image generation.

Image workflow is isolated from the project UI: keep the existing hero copy unchanged and separate
from generated imagery; generate, compare, and edit candidate files outside production paths until
Jacob approves one specific result. Approval of an image makes it eligible for implementation but
does not itself authorize implementation. Only an explicitly approved final asset may later enter
the project.

NEXT ACTION: continue interviewing Jacob one question at a time to define copy and geometry
constraints and review cadence. Jacob approved page-by-page review and approval before moving on.
Start with About because it has the clearest documented non-Home image defects, audit it against the
visible-defect rule, then produce
a hero-only comparison artifact using OpenAI Image Gen 2.5 where raster regeneration is justified.
Do not implement production changes until Jacob explicitly approves the replacement artifact.

ABOUT APPROVED AND LOCKED: the current About hero is already a procedural SVG (`ThreeCGlyph.tsx`), not the
older blurry raster, and the mission map is also SVG (`USMap.tsx` plus deterministic route geometry).
Current 1440 evidence shows no image-generation defect in the hero. Jacob approved keeping the About
hero exactly as it currently looks. Handle any later spacing/route issues as code geometry after
visual approval. NEXT: audit Services imagery and separate image candidates from code geometry.

SERVICES IMAGE AUDIT: the three current service photos (`fiber-wide-1600.webp`, `tv-wide-1600.webp`,
`security-wide-1600.webp`) are strong and adequately sized; recommend locking them. The hero map and
bundle map are under-resolved/cropped at some viewport/DPR combinations and bake labels/topology into
rasters. This is deterministic map work, not an Image Gen 2.5 use case: preserve the current visual
direction and propose faithful responsive SVG rebuilds in an artifact. Keep connector repairs separate.
WAITING: Jacob approves locking Services photos and limiting Services visual work to faithful map/geometry
rebuilds before moving to Careers. Jacob approved this Services boundary. NEXT: audit Careers hero
and product imagery separately under the visible-defect rule.

CAREERS AUDIT: the hero uses procedural `USMap.tsx` and is sharp, but Jacob wants two OpenAI Images
2.5 alternatives to test the new generator and reduce the site's dependence on map visuals. Keep
the current hero untouched as the control. Generate one faithful refined map-based option and one
non-map interpretation, both preserving the navy/lime visual language and keeping all copy outside
the bitmap. The other qualifying lane is What You'll Sell: Fiber, TV, and Security have inconsistent
transparent bounds and subject scale. After the hero test, compare current Fiber with one faithful
remaster and one reimagined option; use the winner as the reference for TV and Security.

CAREERS HERO IMAGE LAB ROUND 1 REJECTED: `http://localhost:3011/` serves
`/tmp/3c-image-lab-2026-09-08/index.html`. It compares the current hero with A, a faithful refined
map, and B, a non-map three-door career-path metaphor. Both were created through the Codex OpenAI
Images 2.5 tool; the tool does not expose whether its backend API variant is Flare or Sunburst, so the
artifact says that explicitly. B received one 2.5 edit pass for safer responsive margins. Candidate
copy is identical live HTML, no text is baked into the images. Opus verdict PASS; browser checks pass
at 390, 768, and 1440 with no broken images, page errors, or overflow. Production remains untouched.
Jacob rejected both A Map and B Doors because neither captures the vibe of the rest of the current
site. Diagnosis: they drift into generic glowing tech art and lose the site's grounded editorial
shapes, service imagery, oversized typography, route-line language, and navy/off-white rhythm.
NEXT: extract a concrete cross-site hero visual grammar from the current Home, About, Services,
Contact, and Apply pages; have Opus challenge it; show that compact reference diagnosis before a
second Images 2.5 generation. Do not generate again from the Careers page alone and do not move to
Fiber or another page until the Careers hero direction is complete.

ROUND 2 DIRECTION APPROVED: A is a restrained five-node market-map evolution. B is documentary
aerial photography of a recognizable American neighborhood or sales territory with subtle
navy/lime technical overlays and no people. Build both from a cross-site current-hero reference
sheet, keep the Careers copy as separate HTML, and replace Round 1 in the isolated lab only.

ROUND 2 READY AT `http://localhost:3011/`: A is the restrained five-node map; B is the blue-hour
documentary American territory aerial. Both were generated from clean visual-only current-site
references through OpenAI Images 2.5, with no people or baked copy. The lab now renders candidates
full-bleed with live Careers copy, uses the actual local Barlow Condensed display font, and links both
full-resolution PNGs. Opus verdict PASS after the unfair letterboxing/shrinking presentation was
fixed. Browser checks pass at 390/768/1440 with no errors, broken images, or overflow. WAITING: Jacob
chooses Current, A Map, B Territory, or Needs Edits. Production remains locked.

VISUAL DNA AUDIT: site-native art is matte and editorial, not futuristic: navy dominates 70-80%,
lime is a sparse accent, blue technical lines are thin and crisp, halos are small, texture is subtle
topography/grid or believable environmental detail, and each hero has one broad right-side subject
with 35-40% quiet copy space. Subjects tie directly to markets, territories, services, products, or
the 3C glyph. Avoid chrome, portals, fog, neon tubes, route tangles, skylines, generated typography,
and generic tech metaphors. Earlier standing rule still forbids generated people until authentic team
photos exist. Proposed round 2 concepts: (A) restrained five-node matte market map close to current;
(B) documentary aerial/suburban American territory image with a sparse lime route overlay and no
people. WAITING: Jacob confirms whether concept B matches the vibe before any second-round generation.

## CURRENT (2026-09-08) — visual-fidelity pass, orchestrated

Jacob reviewed the site on :3000 (dev, working tree; 3105 preview is dead) and gave
a visual defect list. Decisions this session:
- 1px comp-match rule is RETIRED. Goal = sharp, responsive, well-spaced site.
- /culture is NOT a real page (image-gen hallucination). Remove from scope; delete later.
- Codex 1:1 pass is finished; tree is free to edit. Never commit/reset/stash without Jacob.
- Photos may differ slightly from comps if subject+framing match. Any raster that can't be
  responsive across viewports must be remade as SVG.
- Sections deviating from comps (Careers rhythm, What We Offer + CTA merge) get an artifact
  mock for Jacob to pick from BEFORE code.

Running lanes (Opus, background):
- `diag` read-only: services page zoom-out bug, About mission map line disconnect, Services
  connector path structure, image inventory -> scratchpad/diag/REPORT.md
- `vectors`: src/components/art/{USMap,ThreeCGlyph,SellIllustrations}.tsx + public/redesign/v2/
- `photos`: public/redesign/v2/photos/ (hero aerial, fiber, TV, security, 5 cities; webp 2x/1x + MANIFEST)

Jacob's defect list (visual only):
HOME: Why Sales Pros + How To Get Started too small/compact/close together.
ABOUT: 3C glyph has darker navy box (make transparent/match band); mission map blurry and
  line to 3 C's only connects at one zoom (must be responsive); leadership + customers/
  contractors sections crunched, need room.
SERVICES: page+nav zoom out on entry; assets blurry; connector line enters 01 circle, sliver
  inside 02 circle, ends in own dot overlapping 30% ring (should meet it), 03 numeral on the
  line (move left), gap before Apply Now (connect straight, no gap).
CAREERS: hero map too high/not centered/blurry; four grid sections feel identical (need
  differentiation); What You'll Sell icons blurry/deformed (remake as SVG, softer section
  transition than hard rectangle); merge What We Offer + closing CTA into one stronger ending.

Careers mock status (2026-09-08): board3 verdict — At a Glance rejected (no cards, no ledger);
black blob top-left = contour symbol paths unfilled (fix fill:none); What You'll Sell P3 kept but
01/02/03 need new treatment, images must be alpha cutouts; C2 ending APPROVED as is.
Lanes running: `sellcut` (alpha cutouts s3-{fiber,tv,security}-alpha*.{png,webp} in
public/redesign/v2/sell/), `board4` (scratchpad/careers-board4.tpl.html: 3 new At a Glance
directions A route / B statement stack / C split figure; P3 numerals N1/N2/N3; C2).

## ONBOARDING BUGS (2026-09-08, separate from redesign) — Jacob's text screenshot
Recruit stuck: Finish -> "A portal account already exists for this email"; and "no drop menu
for direct deposit / W9". Root causes + fixes (uncommitted in working tree):
- Bug 1: submit route (src/app/api/public/onboarding/[token]/route.ts) always createUser; any
  pre-existing Auth user bricks every invite for that email. FIX: getUserByEmail -> reuse uid when
  users doc missing / status pending / has onboardingInviteId (updateUser pw+name); 409 for active
  accounts; rollback only deletes Auth user this request created; notifications.add isolated.
- Bug 2: direct_deposit + w9 are esign items with no controls; checking/savings + individual/LLC
  were 14-16px optional PDF checkboxes. FIX: required NativeSelects on src/app/onboard/[token]/
  page.tsx -> body accountType/taxClassification -> userOnboarding/{uid}_{item}.prefill ->
  autoSend passes prefill -> signwell.ts sets checkbox value:true + 22px boxes.
- SHIPPED: commit 398f180 on onboarding/completion, cherry-picked to master as b353f174, pushed
  2026-09-08; Vercel prod build bbmo6sh3h (verify Ready).
- Recruit = Mason Steinberger (littlehero2000@yahoo.com, uid 8D5zj5kf74Z2WHz58dtYBk1zUNy1): NOT the
  bug. Fully onboarded 8/22, active, signed in 8/26. Left: sign direct_deposit envelope in portal;
  w9 'upload' was his DL photo (same file x3). 2026-09-08 12:19 Jacob ran one-off script: W-9
  envelope e1338d41 created + esignSigningUrls stored. direct_deposit env a9242c35 still Viewed,
  unsigned. Mason must log in and sign both. DL photos need re-upload (reject in admin).
- SIGNWELL: account plan_tier=free, can_create_completion_document=false (monthly cap hit).
  Mason's W-9 envelope e1338d41 was created TEST MODE (local .env SIGNWELL_TEST_MODE=true) ->
  must be voided + re-sent live AFTER Jacob upgrades plan: he runs `! npx -y tsx ./.mason-w9-redo.mts`
  (script at repo root; refuses until plan allows live docs; then `rm` it).
- PRODUCT FIX SHIPPED 2026-09-08: master 42f58ce2 (esign-send route, autoSend pending+active,
  reject-resends, admin Send for signature, already-have-account screens on invite/signup/apply).
  Working tree on onboarding/completion still holds the same edits uncommitted (plus redesign
  edits from the other session) — do NOT reset; they match master except apply/page.tsx which
  on master got only the account_exists hunks. Was: autoSend gated to status==='pending' (active reps
  never get docs); no admin 'Send for signature'; reject of esign item should clear+resend;
  'already have an account' screens on onboard link load / signup / apply.

## IN-HOUSE E-SIGN — SHIPPED 2026-09-08 (master b9bea5e5, on top of f0ae5220 deps commit)
Plan: docs/superpowers/plans/2026-09-08-inhouse-esign.md. Spec: docs/superpowers/specs/2026-09-08-inhouse-esign-design.md.
Built by four Opus subagents in worktree ~/dev/3cwg-esign (Codex luna attempt rejected: minified junk);
Fable reviewed every diff. Gates on the shipped tree: vitest 1142/1142, tsc clean, next build OK.
PROD CUTOVER DONE 2026-09-08 ~20:50: ESIGN_PROVIDER=inhouse on Production AND Preview; prod deployed from
master e0fd18a1 via `vercel deploy --prod` from ~/dev/3cwg-esign (www 200). Preview round 4b passed (dispatch via
preview, 5 in-house envelopes, contract signed on emulated iPhone, admin download OK). Resend script dry-run OK
RESEND APPLIED ~20:55 (Jacob picked Mason + Bryan): Mason w9 -> in-house f1b7b43c; Bryan x5 -> in-house
(0f88633f w9, 863e2d38 fcra, ccf53ac2 contract, ab17a6c5 dd, 15cc6ed5 pay). Signing URLs verified as
/portal/onboarding/sign/{id}. Each rep got one email + push. One-off script deleted; worktree clean.
ONLY SignWell envelope left: Mason direct_deposit a9242c35 (Jacob: cancel SignWell after it is signed, or reject it in
admin to move it in-house too). Worktree ~/dev/3cwg-esign can be removed. Preview bypass secret in scratchpad only.
E2E DONE 19:15 (Opus esign-e2e, artifacts scratchpad/esign-e2e/shots + pdfs): all 5 docs signed on emulated iPhone,
PDFs verified (page counts, hashes, audit page), negative paths 401/403/409/400 OK, cleanup verified.
FIXES SHIPPED (commit after b9bea5e5, see git log master): vector check marks, signature left-aligned in box
(Jacob asked), autoSend per-item claim transaction (no duplicate envelopes), Type input contrast, preview
on white plate, 44px targets, PdfPages zoom toggle, label dedupe, Chicago timestamp, push/health allowed.
Gates: vitest 1159, tsc clean, build OK. E2E round 2 (14:35): all PASS except Type-tab contrast (global
.portal-scope input rule beat the utility class), two ready-to-sign emails on racing dispatch, contract email
shrunk to ~5pt. ROUND-3 FIX SHIPPED master e0fd18a1: inline colour on the typed-name input; one email per rep per
10 min via users/{uid}.esignReadyEmailAt transaction; text floor 7pt + ellipsis truncation. Gates: vitest 1167,
tsc clean, build OK. E2E round 3 (19:54) PASS on all three (contrast rgb(10,31,68); 5 envelopes + 1 email under race,
reject-resend inside window = envelope but no email; 40-char email whole at 7pt, 60-char truncated with ...).
Cleanup verified to zero. E-sign code is DONE pending Jacob's iPhone preview test. Artifacts: scratchpad/esign-e2e/round3/. Jacob saw the left-aligned signature render (round2/pdfs/contract-page3.png) - it
sits on the line now.
BLOCKER FOR PROD (Jacob): assets/esign/pay_structure.pdf and fcra_auth.pdf are PLACEHOLDERS ("Final copy to
be provided by 3C World Group"). Real documents needed before cutover; coordinates for their signature/date
boxes in documents.ts must then be re-verified.
CUTOVER IN PROGRESS (2026-09-08 ~20:10): ESIGN_PROVIDER=inhouse ADDED to Vercel PREVIEW (prod still signwell).
Preview deployed from master e0fd18a1 (worktree now linked to project 3cworldgroup; a stray project 3cwg-esign was
created by mistake and removed): https://3cworldgroup-5xggqccq2-jacob-s-projects-cdd9dff8.vercel.app
Jacob supplied the Protection Bypass secret (scratchpad/esign/.preview-bypass, never commit/log). Round 4 (20:37) on
preview: signing/render/download/audit ALL PASS on Vercel runtime (sign POST <= 1.3s), BUT envelope creation was
seeded because ESIGN_PROVIDER was missing on Preview (first env add hit the stray project). Re-added + verified,
redeployed: https://3cworldgroup-6xvkreyxd-jacob-s-projects-cdd9dff8.vercel.app. Round 4b (dispatch via preview +
one signed doc) dispatched ~20:45 -> scratchpad/esign-e2e/round4b/. Post-cutover script ready (dry-run default):
~/dev/3cwg-esign/.esign-cutover-resend.mts (Mason w9 + Bryan x5 -> in-house; `--yes` to apply). On 4b PASS:
set ESIGN_PROVIDER=inhouse on Production, redeploy, then reject+resend Mason w9 and Bryan's five.
Jacob 2026-09-08: real Pay Structure / FCRA PDFs NOT available yet, "leave em be" -> placeholders ship for now.
(older note) Preview sits behind Vercel SSO deployment protection. WAS WAITING ON JACOB:
either share the "Protection Bypass for Automation" secret (Vercel > Project > Settings > Deployment Protection),
or test on his iPhone himself, or approve setting prod now (three local E2E rounds already passed).
Open SignWell envelopes (7): Mason 8D5zj5kf74Z2WHz58dtYBk1zUNy1 direct_deposit a9242c35 + w9 e1338d41 (test mode);
Bryan o2AQi5Ka0Caa3ZUmY1YClZxzV583 bryan@sreiowa.com ALL FIVE unsigned since 8/24. After prod cutover: reject+resend
Mason's w9 and Bryan's five in admin so they go in-house; then SignWell can be cancelled (Jacob's account, not Fable).
NEXT (Jacob): 1) done; 2) with a test rep on iPhone: invite -> onboard -> sign all five docs at
/portal/onboarding/sign/{id} (draw + type, prefill/Edit, consent, Back to checklist shows approved), admin
signed-PDF download shows fields + audit page; 3) on pass: set ESIGN_PROVIDER=inhouse on production, redeploy;
existing SignWell envelopes still open via SignWell until signed; cancel SignWell after the last one completes.
Notes: esignEnvelopes collection (Admin SDK only, no rules). Sensitive values only in the stamped PDF.
Worktree ~/dev/3cwg-esign can be removed after cutover (`git worktree remove ~/dev/3cwg-esign`).
Mason: still needs live W-9 (reject his W-9 in admin after cutover so the in-house envelope is sent).
Interim: Jacob may pay SignWell $12 for one month so hires aren't blocked; cancel after cutover.

## NEXT ACTION (2026-09-08 ~20:30)
Careers decision board sent: https://claude.ai/code/artifact/b8db2963-ece0-4662-ae09-05be7b6fc18f
(3 picks: seams A/B/C, top A/B, bottom A/B). WAIT for Jacob's letters, then implement those.
Codex handoff written: docs/redesign/CODEX-HANDOFF.md (self-contained; safe-to-start list inside).

## Round-two list (2026-09-08 ~15:00)
Jacob's round-two list, DISCUSS FIRST (he wants to conversate, then mocks, then code):
1. Services bundle map: green line runs off the raster map -> vector USMap w/ nodes in-SVG (like About)
2. Hard band seams everywhere -> blended transitions site-wide (offered A diagonal / B fade / C bleed; no pick yet)
3. Contact hero wrong + blurry (cropped raster glyph) + rest of Contact page needs a pass
4. Careers hero + At a Glance flow he doesn't love (offered A flip panel / B map bridges seam; no pick yet)
5. Careers bottom: sell + C2 + footer all navy, hard cut (offered A ending off-white / B sell off-white; no pick yet)
6. Careers hero at browser zoom-out: map spills into white band below (fixed hero height) -> content-driven
7. Pre-existing: services tablet 768-1281 layout, mobile connector through rings
DIRECTION CHANGE: Jacob wants ART VIA OPENAI IMAGE GEN matched to the site's vibe (openai-image-gen skill,
gpt-5.6-sol, --ref for matched sets, magenta-key for transparency), NOT the hand-drawn/vector "slop"
(USMap/ThreeCGlyph/SellIllustrations, isometric cutouts). Plan: generate hero/section art sets with refs
to existing site captures, present contact sheets for his pick, then swap in. Photos lane already proved
the pipeline (public/redesign/v2/photos/MANIFEST.md, 13 accepted).
Round-one state: all 5 lanes done + verified + photos swapped into Services; UNCOMMITTED; board
https://claude.ai/code/artifact/4e80bc47-8d64-49d7-9abf-9c40b9ae020f (Jacob has not accepted pages yet).

Motion/micro demos (reference only, not in repo):
https://claude.ai/code/artifact/e748d927-cc8f-40e3-874e-356d48919c68
https://claude.ai/code/artifact/6a79226a-c318-472b-99ba-13e14f1f88b4

Standing: Fable orchestrates only; Opus workers; never Sonnet. Jacob is the acceptance gate.
Dev :3000 (running, log in scratchpad/dev3000.log). Prod :3100.
