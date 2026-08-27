# RESUME — read this and continue without being asked

This file is auto-injected at session start. Resume the "NEXT ACTION"
immediately; do not ask the user to re-explain or to point you at docs.

Updated: 2026-08-27 (update at EVERY milestone).

## NEXT ACTION

RECRUIT ALERT EMAIL FIX — CODE DONE, TWO STEPS LEFT FOR JACOB (2026-08-27):
Bug: recruit-application alert emails reached Jeremy but never Jacob. Root
cause (verified against live Firestore): Jacob's users doc stores his
address as `Email` (capital E) with no lowercase `email`; the alert senders
read only `email` and silently skipped him. Fix committed on
onboarding/completion (40a0942): shared `src/lib/email/userEmail.ts`
fallback used by notifySubmission + alertTasks + dispatch; test covers the
capital-E case. Gates: 842 tests, tsc, build all clean. Remaining:
1. `node scripts/backfill-user-email-field.mjs --apply` (classifier blocked
   the prod write; dry run shows exactly one doc — Jacob's — gets
   email <- jmyers@3cworldgroup.com; this alone fixes prod immediately).
2. Deploy the commit whenever next shipping (code-level hardening).
Note: no "onboarding role" exists — application alerts go to all
admin/operations/owner users (Jacob, Jeremy, Braeden). If Jacob wants a
dedicated onboarding role or extra recipient addresses, that is a new task.

Home redesign work is PAUSED.

REVERT DONE (2026-08-27): all of Claude's Home type-model changes are
reversed — `home-page.module.css` and `public.css` are byte-identical to
HEAD; `layout.tsx` keeps only Codex's two pre-session uncommitted imports
(@fontsource/bebas-neue + ./public.css). Home is back to the Codex round-4
state. Gates passed post-revert (tsc + build). Root-cause finding that
survives the revert: public.css `.public-site :is(h1,h2,h3)` !important
body-font rule flattens all headings sitewide; mockup headings are NOT one
face (Bebas for display, OS Condensed for mid labels, wide bold for small
labels) and sizes step down per section. Section crops for any future round:
`round7/claude-visual-handoff/home-sections/`.

PRIOR CONTEXT — CLAUDE TOOK OVER HOME (2026-08-27 ~2:30 AM): after 4 Codex rounds stalled,
Jacob stood Codex down and Claude patched Home directly. ROOT CAUSE FOUND:
`public.css` `.public-site :is(h1,h2,h3) { font-family: var(--public-body-font)
!important }` was flattening every heading; mockup headings are Open Sans
Condensed (TTFs were sitting unused in `src/app/fonts/`). Now registered via
next/font/local in `layout.tsx` (`--font-os-condensed`), exposed as
`--public-heading-font` in public.css, applied to Home headings in
`home-page.module.css` (with !important to beat the shared override) plus:
market lime strips + condensed city names, bigger path circles, reasonBody
13rem (fixes ragged wrap), heading scale 2.9rem, heroTitle 6.15rem/lh1.3,
map overlay repositioned. Gates: tsc clean, production build clean. Fresh
board: `round7/claude-visual-handoff/boards/home-claude-round-board.png`
(sent to Jacob). :3100 restarted on fresh build. WAITING: Jacob's eyeball on
the board. If approved → apply same heading-font fix pattern to remaining
pages (About, Culture, Services, Careers, Contact, Apply) — the public.css
h1-h3 override affects them all; section crops for those pages not yet cut.
Codex is STOOD DOWN on Home + shared public CSS; re-coordinate before
restarting lunas there. Section crops for luna: `round7/claude-visual-handoff/
home-sections/`.

PRIOR SESSION ROLE (2026-08-27, context): Jacob is driving the Round 7
redesign loop in the CODEX DESKTOP app (sol orchestrates, luna implements —
resume prompt at `docs/redesign/qa/visual-remediation-2026-08-26/round7/
claude-visual-handoff/CODEX-RESUME-PROMPT.md`). Claude's job is DESIGN-REVIEW
COPILOT, not implementer: (1) when Jacob pastes/sends a side-by-side board or
describes what looks wrong, translate it into a paste-ready Codex rejection
list — format: "where → what's wrong → what the mockup shows", plus rules
"match the mockup, don't reinterpret; fix nothing outside this list; fresh
1440 production-build board when done"; (2) make side-by-side boards on
request (magick: mockup resized to 1440w, +append with labeled headers;
renders via node/playwright against the preview on :3100 using executablePath
~/.cache/ms-playwright/chromium_headless_shell-1234/...); (3) keep worker
splits conflict-free — one luna per FILE SET, not per section (Home =
page.tsx + home-page.module.css; global font/kicker fixes = shared
public.css/components = separate worker); parallel lunas are fine ACROSS
pages once approved. Known systemic issues to watch on every board:
condensed/squished font on buttons+labels (global), invented green kickers
the mockups don't have, inflated headings + deflated buttons/padding,
swapped icons, flattened art direction, boards captured from dev server
(Next.js badge visible = reject the capture). Full defect list per page:
HANDOFF.md in the same dir. Page order: Home, About, Culture, Services,
Careers, Contact, Apply; Jacob's eyes are the acceptance test, metrics are
diagnostics. Home round 1 feedback already sent (16-item list, incl. hero
type scale, diagonal overrun, Clear Path icons 3/4, dividers, tall bottom
band).

JACOB PAUSED THE SESSION FOR A VISUAL HANDOFF (2026-08-27). THE
AUTHORITATIVE ROUND 7 DEFECT LIST AND SIDE-BY-SIDE BOARDS ARE IN
`docs/redesign/qa/visual-remediation-2026-08-26/round7/claude-visual-handoff/`
(HANDOFF.md + boards/<route>-side-by-side.png, mockup left / render right at
1440). START THERE — do not re-derive defects via another capture/Sol cycle
first. Summary of the same list (details in HANDOFF.md):
- HOME hero: render photo is dark/navy/low-contrast vs the mockup's bright
  golden-hour neighborhood; the hard lime-edged diagonal is barely visible;
  the faint US-map/route overlay under the headline is missing; CTA buttons
  undersized.
- HOME "A Clear Path": numerals must be small lime 1-4 inline beside the
  labels BELOW the icons (render has giant numerals beside the circles);
  dotted connectors need arrowheads; circles larger; restore vertical
  padding; icon 3 = map-pin route, icon 4 = flag on mountain.
- HOME below: heading/button hierarchy inverted — section headings are
  oversized condensed caps while buttons shrank (mockup: modest headings
  with inline icons, large buttons); "Why Sales Pros" belongs on white with
  hairline dividers (not a gray panel) with US-map icon for National
  Footprint and clipboard for Coaching; "How to Get Started" needs dotted
  leaders between steps; the closing "YOUR MARKET IS OUT THERE" band must
  be tall/commanding, not a thin strip.
- ABOUT (P1): the locked blended transition is missing — map must sit on
  the light surface, fade into white, and a lime route must continue from
  the US map down into the Connection/Community/Commitment connector
  (render has a dark map panel and no route).
- CULTURE (P1): the oversized lime "C" letters in the 3 C's row (locked
  from option 3) are missing; icons drifted (chain-link/people-group/
  shield-check).
- SERVICES: connector should read as one organic flowing curve like the
  mockup, not boxy orthogonal lanes; TV screens lost their approved generic
  category labels (Live TV/Movies/Sports/News/Kids/Recordings); Security
  callouts shrank from a prominent vertical stack to a small strip;
  recruiting CTA lost its angled lime banner shape.
- CAREERS: "What You'll Sell" rich line illustrations became small generic
  icons; final CTA band compressed.
- CONTACT: hero 3C mark lost its lime outline and italic slant.
- APPLY: closest to lock; only minor ghost-3C/type-condensation drift.
- CROSS-ROUTE: sentence-case headings from mockups went all-caps in places
  (e.g. Home "Open markets. New opportunities."); overall pattern is
  inflated headings + deflated buttons/padding and flattened art direction.

FINAL INTEGRATED GATES PASS (2026-08-26 23:50, run by the parallel Claude
portal session after the usage cutoff): `git diff --check`, focused public-site
ESLint, `npx tsc --noEmit`, 841/841 tests across 96 files, and a warning-free
123-page production build all pass on the current tree. All public source-file
mtimes predate the round7 `services-final` evidence capture, so that evidence
matches this exact tree. ONLY REMAINING STEP: fresh independent Sol xhigh
ACCEPT/BLOCKED verdict over the final code + round5 v2 + round6 focused +
round7 services-final evidence. No commit or deployment is authorized.

ROUND 5 CODE-INTEGRITY REMEDIATION INTEGRATED; FINAL SAME-BUILD GATES/EVIDENCE
ACTIVE. The 900-999px footer is now content-driven normal flow and the 320px
shared footer begins where the five-column layout fits at 1000px. Navbar/footer
logos preserve the real 550:516 source ratio and request >=2x candidates; Home
no longer falsely exposes Open Markets as the current page. Home/About/Culture
responsive `sizes` match measured slots. All six Culture value/operating/rhythm/
opportunity illustrations are now semantic Lucide components; its only remaining
raster is the 3172x1984 hero and its measured slot clears the 2x budget. The two
Services composite rasters are replaced by clean 2400x1500 map-only artwork,
with Fiber/TV/Security labels retained as semantic text and all nine connector
anchors preserved; lane checks report zero sampled text intersections and
passing DPR2 budgets at all seven widths. NEXT: finish the final integrated
gates, restart one production preview from that exact build, regenerate 1440 comparison
boards and the complete 49 DPR1 + 30 DPR2 objective evidence, rerun in-app
Browser navigation/footer/form/focus/live-resize checks, then obtain a fresh
independent Sol xhigh ACCEPT with no P1/P2. No commit or deployment is authorized.

FINAL POST-CULTURE INTEGRATED GATES PASS: `git diff --check`, focused public-site
ESLint, `npx tsc --noEmit`, 841 tests across 96 files, and a warning-free 123-page
production build all pass. A fresh preview of that exact build is running at
localhost:3100. Final evidence is being regenerated in new Round 5 v2 directories;
the stale pre-value-icon evidence is not acceptance proof.

FINAL ROUND 5 V2 EVIDENCE COMPLETE: 49 DPR1 full pages, 49 DOM records, 30 DPR2
targets, 79/79 integrity checks, zero 2x source-budget failures, zero overflow/
nav/normal-flow failures, 9 Services endpoints within 0.006px, zero glyph-aware
connector/text crossings, 1,078 footer hit-target checks and 32 local activations
with zero failures, plus passing mobile-menu, keyboard-focus, and Contact/Apply
fill checks. Home intentionally has no `aria-current` because its source-derived
nav has no Home link; restoring it would falsely mark Open Markets current. NEXT:
fresh independent Sol xhigh acceptance over the final code and v2 evidence.

ROUND 5 INDEPENDENT SOL XHIGH VERDICT: BLOCKED on five localized defects. Home
still visually marks Open Markets active across desktop/mobile; Home desktop
clips the four How to Get Started descriptions/CTA; Opportunities at 1024 lets
the hero map overlap the headline; Services at 1920 clips Security content/CTA
against Bundle; Contact at 1024 leaves form controls too narrow. Round 6 uses
three disjoint Luna lanes: shared Home/nav, Opportunities/Contact, and Services.
NEXT: integrate these five fixes, run full gates, recapture affected widths plus
full same-build acceptance evidence as needed, and rerun a fresh Sol xhigh verdict.

ROUND 6 FIXES INTEGRATED AND GATES PASS. Home active styling now follows the
actual pathname and its start section is content-driven; Opportunities reduces
the narrow-desktop hero title to clear the map; Contact stacks form rows through
1080px and releases fixed height; Services Security uses auto height with a safe
minimum. Final `git diff --check`, focused ESLint, TypeScript, 841 tests, and the
123-page warning-free build pass. A fresh production preview from that exact
build runs on localhost:3100. NEXT: focused 28-state recapture for the four
affected routes, then a fresh independent Sol xhigh ACCEPT/BLOCKED verdict.

ROUND 6 SOL VERDICT: BLOCKED on one remaining localized Services P2. The ninth
connector endpoint is attached to the center of the recruiting Apply Now CTA,
so the green path crosses its label at every required width. The prior glyph
sampler incorrectly excluded text inside service anchors and missed this. All
five prior Round 5 blockers are confirmed resolved. NEXT: move recruiting-apply
to a dedicated edge marker, include anchor-label glyphs in the sampler, rerun
Services-only evidence and gates, then obtain a fresh Sol xhigh verdict.

ROUND 4 INTEGRATED TRIAGE COMPLETE; CODE-INTEGRITY REVIEW BLOCKED ACCEPTANCE.
The fresh 1440 production captures have exact source document heights on all
seven routes and no obvious clipping/CTA/footer overlap, but the independent
review found five P1s and one P2 that must be fixed before final evidence: the
shared footer overflows from 900-999px; header/footer logos request undersized
Next image candidates and the footer logo distorts its aspect ratio; Services
uses two undersized composite rasters containing labels/UI fragments; Culture
illustrations miss the required 2x source budget; Home/About/Culture image
`sizes` descriptors understate their real slots; and Home incorrectly marks
the Open Markets link as `aria-current=page`. NEXT: run disjoint Luna lanes for
shared shell, Services assets, and Home/About/Culture image budgets; rebuild and
restart a single production preview; regenerate integrated 1440 triage and the
complete 49 DPR1 + 30 DPR2 objective evidence; rerun in-app Browser navigation,
footer, focus, and resize checks; then obtain a fresh independent Sol xhigh
ACCEPT with no P1/P2. No commit or deployment is authorized.

ROUND 4 LUNA REMEDIATION INTEGRATED; SAME-BUILD ACCEPTANCE EVIDENCE IS NEXT.
The route writers have stopped. The shared header is semantic code with measured
non-overlap at every required width; the shared semantic footer is one 320px
normal-flow component with 22 real >=44px links and distinct Story/Mission/
Leadership destinations. Home, About, Services, Opportunities, Culture,
Contact, and Apply now match their 1440 source document totals; every CTA is
visible normal flow; Services has nine DOM-anchored endpoints and its prior
ResizeObserver/scroll-height feedback loop is fixed. Direct board review rejected
and corrected several misleading metric wins: a collapsed Opportunities CTA,
Services recruiting/footer collision, Home nav/brand overlap, Culture hero crop,
and Culture CTA line collision. Latest isolated normalized RMSE evidence is Home
.323385 before its final scale pass, About .380420, Services .287856 with the
clean ending, Opportunities .251119 with the readable 128px CTA, Culture .183973,
Contact .170057, and Apply .196708. These numbers are diagnostic, not proof of
1:1; the readable/semantic corrections intentionally take priority over lower
scores produced by collapsed or overlapping content. Integrated gates are now
running. NEXT: after gates pass, rebuild and restart one production preview,
generate fresh integrated 1440 triage and reject any remaining visible P1,
then recapture 49 DPR1 + 30 DPR2 lossless images, regenerate deterministic
ImageMagick/DOM/source-budget/connector reports, rerun the chosen in-app Browser
footer/nav/form/focus/live-resize matrix, and obtain an independent Sol xhigh
ACCEPT with no P1/P2. No commit or deployment is authorized.

ROUND 3 FINAL EVIDENCE ACTIVE; FRESH SOL XHIGH ACCEPTANCE IS NEXT. All four Luna
lanes completed: semantic shell/Contact, Home/About/Culture, Services, and
Opportunities/Apply. The Round 2 P2 defects are corrected: Services no longer
uses discontinuous per-service text scaling and its connector follows compact
DOM-anchored lanes; Opportunities no longer breaks inside “opportunity”; Apply
mobile benefit labels no longer fragment into letter stacks. Shared navigation
and footer remain semantic code with 22 working footer anchors. The post-asset
combined gates pass: `git diff --check`, focused ESLint, `npx tsc --noEmit`, 841
tests across 96 files, and a warning-free 123-page production build. Fresh final
same-build evidence is `round3/final-captures-v2` (49/49 DPR1, 49/49 DOM metrics,
30/30 DPR2) and `round3/final-report-v2` (zero P0, zero source 2x budget misses,
zero shell-height spread, nine Services endpoints with max delta <=0.006px).
The in-app Browser interaction/resize record is `round3/combined-build-iab-
matrix.md`: 49 route/width cells, 26/26 unique local footer activations at 1440
and 390, visible keyboard focus, working mobile menu, and 56/56 seam checks.
NEXT: complete the final same-build precise Services path/text check, then send
all Round 3 evidence plus raw overlays to a new independent Sol xhigh validator.
If any P1/P2 remains, loop through disjoint Luna lanes and regenerate evidence;
otherwise mark the goal complete. No commit or deployment is authorized.

ROUND 3 REMEDIATION ACTIVE AFTER INDEPENDENT SOL XHIGH BLOCKED ROUND 2. Sol found
one systemic P1 fidelity failure across all seven routes plus three P2 defects:
Services' breakpoint-specific type shrinking and perimeter connector trajectory,
the Opportunities desktop heading breaking inside “opportunity,” and Apply mobile
benefit labels fragmenting into letter stacks. The full verdict is
`docs/redesign/qa/visual-remediation-2026-08-26/round2/sol-validation-final.md`.
Parallel Luna lanes now own Services; Home/About/Culture; and shared shell/Contact,
with a nested Luna lane required for Opportunities/Apply. Each lane must use the
approved Round 28 sources and original-resolution ImageMagick/DOM measurements,
not screenshot-only judgment. NEXT: integrate the disjoint lane results, rebuild,
recapture the complete 49 DPR1 plus 30 DPR2 same-build matrix, regenerate uncropped
comparisons, rerun interaction/resize/connector checks, and obtain a fresh Sol xhigh
ACCEPT with no P1/P2. No commit or deployment is authorized.

ROUND 2 SAME-BUILD EVIDENCE COMPLETE; INDEPENDENT SOL XHIGH ACCEPTANCE IS NEXT. The
post-fix in-app Browser rerun passes all 49 route/viewport cells with zero
document overflow, 22/22 visible footer anchors, 44px minimum footer hit height,
no anchor overlaps/bad hrefs, and correct active navigation. Every unique local
footer destination and fragment was activated; social semantics and visible
keyboard focus rings pass. A 56-cell 1023/1024/1080/1081 live-resize seam pass
also has zero failures. Apply internal overflow, Culture mobile text clipping,
Contact's locked-era 220px off-screen art displacement, and Services fixed-band
copy overflow are resolved. Services now has nine DOM-anchored endpoints with
max delta 0.0062px and zero path intersections against 2px-expanded DOM text
Range boxes at all required widths. The 2x Home/Services assets are integrated.
The production gates pass: focused ESLint, `npx tsc --noEmit`, 827/827 tests,
and a 122-page warning-free Next build. Fresh styled-page-gated production
evidence is in `round2/final-captures`: 49/49 DPR1 and 30/30 element-targeted
DPR2 PNGs with validated signature/MIME/dimensions/SHA-256. ImageMagick/DOM
results are in `round2/final-report`: zero P0, zero source 2x budget misses,
zero header/footer route-height spread, and Services endpoint delta <=0.006px.
NEXT: a new independent Sol xhigh validator must inspect the original boards,
all widths, overlays/heatmaps, header/footer crops, full Services DPR2 evidence,
and interaction matrix. Remediate and recapture every resulting P1/P2 until Sol
returns ACCEPT. No commit or deployment is authorized.

ROUND 1 SOL VERDICT: OVERALL BLOCKED; ROUND 2 IMPLEMENTATION ACTIVE. Round 1
objective acceptance evidence remains in `docs/redesign/qa/visual-remediation-
2026-08-26/round1/acceptance-*`: 49/49 DPR1, 30/30 DPR2, no P0/overflow/locked
raster, zero header/footer route-height spread, zero source-budget misses after
the Contact intrinsic-ratio fix, and Services endpoint deltas <=0.006 CSS px.
These metrics did not prove visible fidelity. Independent Sol found transparent
desktop/tablet header content at >=1024, blank Opportunities/Apply closing CTAs,
major 1440 composition drift on all seven routes, Services connector segments
crossing copy despite attached endpoints, Contact fast-path/form breakage at
1024/834, Culture headline clipping at 390/375, Apply benefit/process overlaps,
and a materially different footer missing approved social controls. Its report
is `round1/sol-validation-round1.md`. It also rejected the DPR2 footer crops as
mis-targeted and the 1080-CSS-px Services crops as incomplete proof. Round 2 is
split across disjoint Luna lanes: shared shell/CTA/footer, Home/About/Culture,
Services path/composition, Opportunities/Apply, and Contact. After all lanes,
capture a new full same-build matrix with corrected element-targeted DPR2 footer
and complete Services evidence, rerun ImageMagick/DOM/IAB checks, and send it to
a fresh independent Sol xhigh pass. No commit or deployment is authorized.

AUDIT 1 COMPLETE; BEGIN IMPLEMENTATION ROUND 1. Fresh read-only evidence now
covers all seven public routes at 1920, 1440, 1280, 1024, 834, 390, and 375
with 49 lossless DPR1 full-page PNGs, 49 DOM/image metric files, and 22 DPR2
header/footer/Services crops. All images passed PNG signature, `file`,
ImageMagick, dimension, and SHA-256 checks. Source, asset, route-risk, Services
geometry, and in-app Browser reports are under
`docs/redesign/qa/visual-remediation-2026-08-26/`. The live Browser additionally
proved every footer link center fails hit testing at every sampled width (19/19
on Home, 20/20 elsewhere), header heights differ by route, several semantic
desktop footers collapse to zero height, broken hash destinations remain, and
the Services overlay is a fixed 2293px raster through 1024px before vanishing
at 1023px. Keyboard focus is inconclusive because both in-app Browser Tab paths
left `body` focused; it must be rerun after the semantic shell rebuild. Start
parallel Luna implementation with disjoint ownership: shared semantic shell
and working links; Services semantic layout plus DOM-anchored responsive SVG
connector; route-specific P1/P2 remediation without whole-section images.
Recapture all 49 viewports and run deterministic diffs before independent Sol
xhigh acceptance. No commit or deployment is authorized.

JACOB APPROVED THE CODE-FIRST AND DETERMINISTIC PIXEL-VERIFICATION PLAN. The
fresh read-only audit is active again with distinct Luna lanes. No implementation
may begin until the new original-resolution evidence, ImageMagick/DOM geometry
measurements, and source/asset audits are reconciled into the defect matrix.

AUDIT 1 MILESTONE — SHARED SHELL SOURCE LANE COMPLETE: the current visible
header, route endings, CTA buttons, and footer are stretched locked-chrome
rasters while their semantic controls are transparent, zero-height, or absent.
Several footer/header hash destinations are also missing, the desktop nav model
changes between Home and inner routes, and Culture/Apply lack correct active
states. The Services desktop connector is a fixed 829x1320 raster forced into a
1440-calibrated 2293px box. Browser evidence and the remaining source lanes are
still pending; no implementation has started.

AUDIT 1 CAPTURE APPROVAL: the shared-shell, route-risk, and 67-file ImageMagick
asset audits are complete and confirm the systemic P0/P1 causes. The fresh
in-app Browser lane successfully captured Home and DOM geometry at all seven
widths, but machine inspection proved the browser backend encoded every
supposed `.png` screenshot as lossy JPEG bytes. Those files are rejected and
must not be used for pixel comparison. Jacob approved local Playwright only for
true lossless DPR-controlled PNG capture and deterministic ImageMagick
comparisons; the in-app Browser remains required for live interaction,
continuous resize, focus, and link-behavior checks. No implementation has begun.

LATEST IMPLEMENTATION CLARIFICATION: rebuild the site primarily as semantic
HTML and responsive CSS. The header, footer, navigation, text, controls,
section surfaces, cards, and layout must not be screenshots or raster chrome.
Do not use a whole-page or whole-section image. Use image assets only for
purpose-fit photographic/illustrative content; create a sharp isolated asset
when a suitable source is missing, then place it inside the code-built section.
Pixel fidelity must be verified objectively with ImageMagick (or an equivalent
pixel-analysis tool), native-resolution normalized captures, diff/heatmap and
region metrics, plus browser DOM geometry assertions. LLM visual judgment is
supplementary and cannot be the sole basis for a 1:1 claim.

ACTIVE GOAL CREATED for the reopened multi-viewport remediation. Audit evidence
must also verify that every footer link/button has a working hit target,
keyboard focus behavior, and correct destination on all seven public routes.

PUBLIC-SITE VISUAL QUALITY REMEDIATION REOPENED. Jacob inspected the real site
on a large monitor and while resizing the browser, and rejected the previous
Round 28/29 completion. Read and execute
`docs/redesign/NEXT-VISUAL-REMEDIATION-PROMPT.md`. Start with a fresh live,
read-only, original-resolution audit across all seven public routes and widths
1920, 1440, 1280, 1024, 834, 390, and 375 before editing. Create a new active
goal, orchestrate Luna implementation lanes, and require independent Sol xhigh
multi-viewport acceptance.

USER-REPORTED BLOCKERS: every footer is blurry; the shared top bar, logo, and
company name are blurry; header/nav labels, clickable targets, active states,
and Apply button do not align consistently between routes; Services imagery is
blurry; the Services map-to-section connector is misaligned; and Services
images/connector geometry break when the window size changes or the whole page
is viewed on a large monitor. Footer buttons and links also do not work. The
user says more defects exist, so perform a complete audit rather than limiting
work to this list. Do not treat the prior Sol pass as current proof. No commit
or deployment is authorized.

CURRENT LOOP STATE: Round 8.2 fresh same-build in-app-browser captures/direct
comparison boards are in `docs/redesign/qa/fidelity-1to1-2026-08-25/round8.2/`.
Independent Sol validation accepted the source-derived headers and endings but
returned `OVERALL: BLOCKED` on all seven routes because the HTML middle sections
still had actionable P1/P2 density, scaling, crop, and spacing differences.
Round 9 comparison boards are in
`docs/redesign/qa/fidelity-1to1-2026-08-25/round9/`; independent Sol validation
returned `OVERALL: BLOCKED`, but failures were localized. Round 10 boards are
in `docs/redesign/qa/fidelity-1to1-2026-08-25/round10/`; independent Sol
validation returned `OVERALL: BLOCKED` on all seven routes. Round 11 Luna
remediation is complete across Home/Contact, About/Culture, Services, and
Careers/Apply. Fresh same-build in-app-browser captures and source-left/render-
right boards are in `docs/redesign/qa/fidelity-1to1-2026-08-25/round11/`.
Independent Sol Round 11 validation returned `OVERALL: BLOCKED` on all seven
routes, including mission-line-wrap and Culture hero/satisfaction regressions.
Round 12 Luna remediation is complete in the same four ownership lanes. Fresh
same-build in-app-browser source/render boards are in
`docs/redesign/qa/fidelity-1to1-2026-08-25/round12/`; independent Sol Round 12
validation returned `OVERALL: BLOCKED` on all seven routes. Round 13 Luna
remediation and fresh same-build captures are complete; boards are in
`docs/redesign/qa/fidelity-1to1-2026-08-25/round13/` and independent Sol Round
13 validation returned `OVERALL: BLOCKED`; the four hard regressions were fixed,
but source crop, connector, icon/content scale, and section-density differences
remain. Round 14 Luna remediation is active. Culture is switching from
typographic C approximation to the existing isolated source-derived artwork;
Services is tracing the recurring TV crop to the actual clipping ancestor and
rebuilding its connector more literally. Round 14 remediation and fresh
same-build boards are complete in
`docs/redesign/qa/fidelity-1to1-2026-08-25/round14/`; independent Sol Round 14
validation returned `OVERALL: BLOCKED`; the TV crop and Culture source art were
accepted, but typography/icon scale and geometry remain. Round 15 Luna
remediation is active. Services is replacing its approximate route with an
isolated transparent connector extracted from the locked source; other routes
are scaling their semantic HTML groups to measured source bounds. Round 15
remediation and fresh boards are complete in
`docs/redesign/qa/fidelity-1to1-2026-08-25/round15/`; independent Sol Round 15
validation returned `OVERALL: BLOCKED`; the source route overlay is present but
duplicated by semantic connector circles, and CTA/content scale issues remain.
Round 16 Luna remediation is active, removing desktop connector duplicates,
cleaning the source overlay artifact, restoring locked hero-button geometry,
and correcting remaining typography/icon scale. Round 16 remediation and fresh
boards are complete in `docs/redesign/qa/fidelity-1to1-2026-08-25/round16/`;
independent Sol Round 16 validation returned `OVERALL: BLOCKED`, with regressions
in the Home diagonal/content clearance, About map/text columns, and Careers
Opportunity grid. Round 17 Luna remediation is active with those regressions as
hard blockers before remaining P2 typography/spacing work. Round 17 remediation
and fresh boards are complete in
`docs/redesign/qa/fidelity-1to1-2026-08-25/round17/`; independent Sol Round 17
validation returned `OVERALL: BLOCKED`, but the remaining list is localized:
Home diagonal/overlay, About mission/connector, Services Bundle composition,
Careers process/success distribution, Culture hero/lower scale, Contact two-
bubble icon, and Apply star/wireless icons. Round 18 Luna remediation is active
with no broad redesign changes. Round 18 remediation and fresh boards are
complete in `docs/redesign/qa/fidelity-1to1-2026-08-25/round18/`; independent
Sol Round 18 validation accepted Contact and returned `OVERALL: BLOCKED` on the
remaining six routes. Contact is now frozen. Round 19 Luna remediation is active
for only Home, About, Services, Careers, Culture, and Apply, each with a localized
geometry/typography fix. Round 19 validation kept Contact passed and localized
each remaining route to one or two measured differences. Round 20 Luna
remediation is complete for Home, About, Services, Careers, Culture, and Apply;
fresh boards are in `docs/redesign/qa/fidelity-1to1-2026-08-25/round20/` and
independent Sol Round 20 validation accepted Careers, Contact, and Apply; those
routes are frozen. Round 21 Luna remediation is active only for Home, About,
Services, and Culture, each with one localized composition fix. Round 21 is
complete; fresh boards are in
`docs/redesign/qa/fidelity-1to1-2026-08-25/round21/` and independent Sol Round 21
validation kept Careers, Contact, and Apply passed but blocked Home, About,
Services, and Culture; Culture regressed because a Values layout rule leaked
into Three C's. Round 22 remediation and fresh boards are complete in
`docs/redesign/qa/fidelity-1to1-2026-08-25/round22/`; independent Sol Round 22
validation kept three routes passed but blocked the same four on narrow geometry
and scale defects. Round 23 Luna remediation and fresh same-build in-app-browser
captures are complete for Home, About, Services, and Culture; standardized
source-left/render-right boards for all seven routes are in
`docs/redesign/qa/fidelity-1to1-2026-08-25/round23/`. Independent Sol Round 23
validation accepted Services plus the previously frozen Careers, Contact, and
Apply routes, and blocked only Home, About, and Culture. Round 24 Luna
remediation and fresh same-build 1440px captures are complete for those three;
standardized boards for all seven routes are in
`docs/redesign/qa/fidelity-1to1-2026-08-25/round24/`. Independent Sol Round 24
validation accepted About plus the four already-frozen routes, and blocked only
Home and Culture. Round 25 Luna remediation and fresh same-build 1440px
captures are complete for those two; standardized boards for all seven are in
`docs/redesign/qa/fidelity-1to1-2026-08-25/round25/`. Independent Sol Round 25
validation kept the same five routes passed and blocked only a Home overlay
offset/contrast issue plus Culture hero/heading-rail geometry. Round 26 Luna
remediation and fresh same-build 1440px captures are complete only for Home and
Culture; standardized boards for all seven are in
`docs/redesign/qa/fidelity-1to1-2026-08-25/round26/`. Independent Sol Round 26
validation kept the same five routes passed and blocked only Home photo
luminance plus Culture rail length/card-stack/headline geometry. Round 27 Luna
remediation and fresh same-build 1440px captures are complete only for Home and
Culture; standardized boards for all seven are in
`docs/redesign/qa/fidelity-1to1-2026-08-25/round27/`. Independent Sol Round 27
validation kept the same five routes passed, blocked a Home photo-edge P1
regression, and localized Culture to artwork tone plus Operate-rail anchors.
Round 28 Luna remediation and fresh same-build 1440px captures are complete only
for Home and Culture; standardized boards for all seven are in
`docs/redesign/qa/fidelity-1to1-2026-08-25/round28/`. Independent Sol Round 28
returned desktop `OVERALL PASS` for all seven routes. Final 390px in-app-browser
QA passed Home, About, Careers, Culture, and Apply, but Sol blocked a clipped
duplicate Services savings badge and compressed Contact hero phrase. Round 29
fixed those two mobile defects; fresh captures are in
`docs/redesign/qa/fidelity-1to1-2026-08-25/final-mobile-round29/`, and Sol
returned mobile `OVERALL PASS` for all seven routes. Final gates passed:
`git diff --check`, TypeScript, focused ESLint, 827 tests across 95 files, and
the production build with 122/122 static pages generated.
Round 13 corrected Home headline
clipping, Services 02/title collision, Careers collapsed earnings figures, and
Culture's two-line satisfaction heading. Round 12
explicitly matched source line counts and measured geometry rather than
applying relative scale/offset guesses. The Round 11 fix list was:
correct Home hero crop and Clear
Path icons/scale; raise and enlarge About mission content; rebuild Services TV
art, connector, and single-column service modules; correct Careers hero and
middle-section density; correct Culture C/hero/content geometry; restore
Contact typography/form spacing; and narrow/reposition Apply hero while
enlarging its badge and supporting sections. Do not declare success until the
next Sol result returns `OVERALL: PASS`; any failed route must go back to its
Luna lane for another numbered round and be recaptured. Round 8.2 uses exact
mechanical crops from the approved people-free mockups for desktop header,
route-specific closing/footer chrome, and isolated artwork/icon treatments
while retaining semantic link overlays and responsive HTML/mobile. Duplicate
desktop overlay paint, crop backgrounds, and the fragmented Apply 30 were fixed.
Do not rasterize whole pages.
Ownership is now shared shell/route-specific closings, Home/Contact,
About/Culture, Services, and Careers/Apply. The dominant
remaining failures are underscaled header/page/footer content, generic
route-agnostic closing/footer geometry, underscaled section density, a missing
Careers hero map, and collapsed Contact hero word spacing. The four ownership
lanes remain shared shell/Home/Contact, About/Culture, Services, and
Careers/Apply.
The recurring failures are underscaled desktop branding/content, incorrect
hero composition and headline wrapping, and generic/compressed diagonal CTA
and footer assemblies. Do not reuse the older `round2` directory under
`qa/fidelity-rebuild-2026-08-25/` as current evidence; the active strict-1:1
evidence root is `qa/fidelity-1to1-2026-08-25/`.

Baseline finding that opened this goal:
the seven-route implementation is functional, responsive, and passed its code
gates, but a fresh literal comparison confirmed that zero of seven desktop
routes are pixel-for-pixel matches to the locked mockups. The earlier Sol PASS
meant acceptable directional fidelity, not exact replication. Home, About, and
Services have the largest composition differences; Careers, Culture, Contact,
and Apply are closer but still differ in typography scale, section heights,
artwork proportions, diagonals, and footer geometry. The evidence is in
`docs/redesign/qa/fidelity-rebuild-2026-08-25/round2/*-desktop-comparison.jpg`.
Do not claim 1:1 fidelity until the loop finishes, and do not deploy. The
existing responsive/mobile work and passing gates remain valid baseline
behavior that must be preserved.

## Previous implementation pass (superseded)

WAITING ON JACOB: inspect the completed responsive public redesign at the local
preview. Do not deploy unless Jacob explicitly asks. All seven locked routes
are implemented: Home `/`, About `/about`, Services `/services`, Careers
`/opportunities`, Culture `/culture`, Contact `/contact`, and Apply `/apply`.
The shared Navbar, Footer, public typography, CTA/footer surface, forms, links,
responsive behavior, and people-free raster assets are integrated. Browser QA
was completed at desktop, tablet, and 390 px mobile across all seven routes;
all 21 combinations have no horizontal overflow. The Services connector now
aligns Fiber, TV, Security, and Bundle at desktop, intermediate, and mobile
breakpoints. Final gates passed: diff check, TypeScript, focused ESLint, 801
tests, and the production build with 121 static pages. The blocking Product
Design record is `design-qa.md` with `final result: passed`; screenshots and
comparison boards are in
`docs/redesign/qa/implementation-2026-08-25/`. The local preview runs on port
3100. MOBILE IMAGERY FOLLOW-UP: Contact now retains a compact 168 × 104 px 3C
raster in its mobile hero without adding document height, so both recruiting
choices remain visible in the first phone viewport; Apply uses a real compact
3C raster beside the proof points
instead of the hidden CSS outline while keeping the form above the mobile fold;
and the Home territory map is brighter on mobile. Browser checks passed at
390 px and 1440 px with no horizontal overflow. Evidence is saved as
`contact-mobile-images-before-after.png` and
`apply-mobile-images-before-after.png` in the implementation QA directory.
This status supersedes the historical design-selection narrative below.

## Historical design-selection context

ACTIVE: redesign the public 3C landing page for clearer information
funneling and stronger visual design. Product Design audit completed against
production at desktop 1440x1000 and mobile 390x844; evidence and findings are
in `docs/redesign/audits/landing-2026-08-25/`. Jacob confirmed the homepage is
recruiting-first: attract people to work for 3C as salespeople while also
welcoming independent sales contractors who want to work under 3C. Primary
conversion is starting an application; provider services support credibility
instead of competing with recruiting. Three visual directions are generated
and displayed in the Product Design thread. Jacob selected displayed option 3
but rejected generated people. A people-free revision replaces the hero team
photo with an aerial neighborhood, territory map, and connectivity routes;
the stable visual target candidate is
`docs/redesign/concepts/landing-2026-08-25/selected-option-3-people-free-revision.png`.
Jacob approved this people-free Home direction and requires the root page and
navigation label to remain `Home`. For every other public page, generate three
mockups within the locked visual direction and let Jacob pick or combine
treatments before implementation. Work one page at a time so option numbering
stays unambiguous. The fresh About-page set is complete and its authoritative
displayed order is saved at
`docs/redesign/concepts/public-pages-2026-08-25/about/displayed-option-1.png`
through `displayed-option-3.png`. Jacob chose option 2's hero, option 1's map
directly below the hero, and requested a redesign of option 2's Connection /
Community / Commitment treatment. The combined About lock candidate is saved
at
`docs/redesign/concepts/public-pages-2026-08-25/about/selected-combination-revision.png`.
Jacob liked that composition but said the map section did not blend smoothly
into the 3 C's section. A refined candidate now removes the hard seam, fades
the territory-map grid into the white surface, and continues a lime route from
the US map into the Connection / Community / Commitment connector. It is saved
at
`docs/redesign/concepts/public-pages-2026-08-25/about/selected-combination-blended-transition-revision.png`.
Jacob approved and locked this blended About revision. Three fresh Services-
page mockups are complete, grounded in the current Services content and the
locked people-free Home/About visual system. Their first displayed order is
saved at
`docs/redesign/concepts/public-pages-2026-08-25/services/displayed-option-1.png`
through `displayed-option-3.png`. Jacob rejected the house-led third direction
and the overly blue second direction, then requested three new options. The
latest authoritative Services set is saved at
`docs/redesign/concepts/public-pages-2026-08-25/services/revision-2/displayed-option-1.png`
through `displayed-option-3.png`. Jacob said revision 2 overcorrected and became
too white/flat; the real requirement is balanced color pacing and flow, not a
single dominant surface. The latest authoritative Services set is revision 3,
saved at
`docs/redesign/concepts/public-pages-2026-08-25/services/revision-3/displayed-option-1.png`
through `displayed-option-3.png`. Jacob still found all three heroes generic
and overcrowded. He requested a six-way hero-only reset: three concepts rooted
in the current live site's visual language, followed by three rooted in the
locked redesigned Home direction. The latest authoritative displayed order is
saved at
`docs/redesign/concepts/public-pages-2026-08-25/services/hero-reset-6/displayed-option-1.png`
through `displayed-option-6.png`; options 1–3 are current-site-derived and
options 4–6 are Home-derived. Each frame contains the header, one restrained
hero with a single focal idea, and only the start of the next section. All
avoid people and houses. Jacob selected displayed option 4, the Home-derived
diagonal hero with one US territory map, exactly three labeled service nodes,
and one continuous lime route. That hero has been carried into a balanced full
Services-page lock candidate at
`docs/redesign/concepts/public-pages-2026-08-25/services/selected-hero-4-full-page-candidate.png`.
Its route continues through alternating Fiber, TV, Security, bundle, and
recruiting sections. Jacob liked the style but rejected the TV and Security
imagery and established a hard content rule: never show real streaming-service,
network, studio, hardware, security-company, telecom, or manufacturer names,
logos, program art, app icons, or recognizable branded interfaces. Three new
full-page variations preserve the selected map hero and structure while using
different fully unbranded TV/Security art. Their authoritative displayed order
is saved at
`docs/redesign/concepts/public-pages-2026-08-25/services/unbranded-media-3/displayed-option-1.png`
through `displayed-option-3.png`. Jacob said those images still tried too hard
and requested three calmer versions. The latest authoritative Services set is
saved at
`docs/redesign/concepts/public-pages-2026-08-25/services/simple-media-3/displayed-option-1.png`
through `displayed-option-3.png`. These preserve the selected map hero and page
system while reducing TV/Security pictures to: (1) two plain studio objects,
(2) one catalog object per service, and (3) quiet close-up product details.
Jacob then supplied two exact references and chose a combination: use the
lighter Security section from his first reference and the warm staged TV/
receiver/tablet composition from his second reference, but remove all real
streaming-service names, logos, program art, and branded UI. The combined
Services lock candidate is saved at
`docs/redesign/concepts/public-pages-2026-08-25/services/selected-combination-tv2-security1-final-candidate.png`.
Its TV screens use only generic categories (Live TV, Movies, Sports, News,
Kids, Recordings); its Security section preserves the unbranded camera/keypad/
sensor/hub flat-lay. Jacob then flagged that the lime route disconnected
between services 01, 02, 03 and the Bundle & Save section. A precise revision
now uses one continuous lime route from the overview through Fiber, TV,
Security, the `UP TO 30%` bundle node, and the recruiting CTA, with no loose
dots or broken segments. The revised Services lock candidate is saved at
`docs/redesign/concepts/public-pages-2026-08-25/services/selected-combination-connected-route-final-candidate.png`.
Jacob approved and locked this connected-route Services revision. The next
page is Careers. Three fresh full-page Careers mockups preserve the current
Careers information, the locked navy/lime people-free visual system, generic
unbranded service imagery, and recruiting-first funnel. Their authoritative
displayed order is saved at
`docs/redesign/concepts/public-pages-2026-08-25/careers/displayed-option-1.png`
through `displayed-option-3.png`. Option numbering follows the order shown in
the Product Design thread. Jacob chose option 3's hero, option 2's immediate
`THE OPPORTUNITY, AT A GLANCE` band and dark `WHAT YOU'LL SELL` section, and
option 1's pale six-column `WHAT WE OFFER` section. He also removed the FAQ and
rejected the connector/string motif for the entire Careers page. The combined
revision keeps the selected hero map network contained inside the hero, uses
no lime routes, strings, connector nodes, or loose dots below it, and is saved
at
`docs/redesign/concepts/public-pages-2026-08-25/careers/selected-combination-no-connectors-revision.png`.
Jacob approved and locked this no-connectors Careers revision. All currently
locked visual targets (Home, About, Services, Careers) are desktop-only; no
mobile mockup has been designed or approved yet. Mobile must receive its own
page-by-page adaptation and approval pass before production implementation.
Recommended sequence: finish the remaining desktop locks for Culture, Contact,
and Apply, then mobile-lock every public page from Home through Apply so the
mobile system inherits the final page content and shared patterns. NEXT: move
to three desktop Culture mockups unless Jacob chooses to pause and begin the
mobile pass now. UPDATE: Culture is an existing `/culture` page linked from the
current footer but absent from the primary navigation; it is not a newly
invented page. One Culture mockup was generated before Jacob questioned whether
the page existed. Jacob confirmed to continue. The full three-option desktop
Culture set is now complete, people-free, recruiting-oriented, and preserves
the existing Connection / Community / Commitment, operating principles,
life-at-3C, satisfaction, and CTA content. Its
authoritative displayed order is saved at
`docs/redesign/concepts/public-pages-2026-08-25/culture/displayed-option-1.png`
through `displayed-option-3.png`. Jacob chose option 1's hero and horizontal
three-C arrangement, option 3's oversized-C visual treatment for that row, and
option 2's `HOW WE OPERATE`, `THE RHYTHM OF LIFE AT 3C`, and `98% CONTRACTOR
SATISFACTION` sections. Jacob identified the current Community Involvement
claims as untrue; remove Local Charities, Youth Programs, Environmental Impact,
giving-back, charity, nonprofit, and sustainability claims from the redesigned
site. The combined Culture revision replaces that material with `FROM VALUES TO
OPPORTUNITY`: Get Prepared, Stay Supported, and Grow Through Results, using only
training, mentorship, communication, recognition, and performance claims
already supported elsewhere on the site. It also restores Community Events to
the existing neutral copy `Regional meetups and annual conferences.` The
candidate is saved at
`docs/redesign/concepts/public-pages-2026-08-25/culture/selected-combination-truthful-replacement-revision.png`.
Jacob approved the composition but said the final CTA and footer did not blend
smoothly. A precise revision now places both on one continuous deep-navy
topographic surface, tapers the lime CTA panel back into navy before the footer
content, removes the hard full-width seam, and darkens gently toward the page
bottom. It is saved at
`docs/redesign/concepts/public-pages-2026-08-25/culture/selected-combination-footer-blend-revision.png`.
Jacob approved and locked the footer-blended Culture revision. Its seamless
ending is now the shared desktop standard for every redesigned public page:
CTA and footer sit on one continuous deep-navy topographic surface, the lime
action panel tapers back into navy before the footer columns, there is no hard
full-width seam, and the footer darkens gently toward the page bottom. This
standard has now been applied without changing the locked page compositions:
- Home: `docs/redesign/concepts/landing-2026-08-25/selected-option-3-people-free-footer-blend-revision.png`
- About: `docs/redesign/concepts/public-pages-2026-08-25/about/selected-combination-footer-blend-revision.png`
- Services: `docs/redesign/concepts/public-pages-2026-08-25/services/selected-combination-footer-blend-revision.png`
- Careers: `docs/redesign/concepts/public-pages-2026-08-25/careers/selected-combination-footer-blend-revision.png`
Three desktop Contact mockups are now complete and displayed in authoritative
order:
- `docs/redesign/concepts/public-pages-2026-08-25/contact/displayed-option-1.png`
- `docs/redesign/concepts/public-pages-2026-08-25/contact/displayed-option-2.png`
- `docs/redesign/concepts/public-pages-2026-08-25/contact/displayed-option-3.png`
All preserve the current contact form/details, prioritize recruiting and
contractor-team paths, avoid people/houses/real provider brands, and use the
shared seamless CTA/footer standard. Option 1 is triage-first (`WHAT CAN WE
HELP WITH?` before the form), option 2 is form-led (form embedded in the hero),
and option 3 is an editorial `OPEN CHANNEL` direction with recruiting shortcuts
before the form. Jacob selected a combination: option 1's hero, `SEND US A
MESSAGE` form, and `GET IN TOUCH` panel; option 3's `THE FASTEST PATH` treatment
with `JOIN AS A SALES REP` and `BRING OR BUILD A TEAM`; and option 2's `DON'T
NEED TO WAIT? APPLY TODAY.` CTA. The combined Contact lock candidate is saved at
`docs/redesign/concepts/public-pages-2026-08-25/contact/selected-combination-lock-candidate.png`.
Jacob approved and locked this combined Contact candidate. Three desktop Apply
mockups are now complete and displayed in authoritative order:
- `docs/redesign/concepts/public-pages-2026-08-25/apply/displayed-option-1.png`
- `docs/redesign/concepts/public-pages-2026-08-25/apply/displayed-option-2.png`
- `docs/redesign/concepts/public-pages-2026-08-25/apply/displayed-option-3.png`
All preserve the real five-field application, current earnings/market facts,
transparent 1099/commission framing, the no-people/no-houses/no-real-brands
rules, and the shared seamless CTA/footer. Option 1 is application-first with
the form embedded in the hero; option 2 establishes market proof before a
form/timeline split; option 3 leads with transparent terms before a wide form.
Jacob selected and locked Apply option 1. Its authoritative desktop target is
`docs/redesign/concepts/public-pages-2026-08-25/apply/displayed-option-1.png`.
The complete desktop redesign set is now locked: Home, About, Services,
Careers, Culture, Contact, and Apply. Jacob approved replacing the separate
seven-page mobile mockup/approval phase with one responsive implementation and
browser-QA pass. The locked desktop mocks are the source of truth; implement all
seven public routes responsively in the existing Next.js app, preserve working
forms/navigation/content, then verify desktop, tablet, and 390x844 mobile views
and fix overflow, hierarchy, spacing, readability, tap-target, and interaction
issues before handoff. NEXT: inventory the existing public-page architecture
and dirty worktree, then implement the shared responsive shell/design system and
all seven pages. Do not deploy unless Jacob explicitly asks.
Earlier one-off About/Services/Careers drafts are not part of the numbered
page-by-page sets. Do not change production code yet.

SHIPPED 2026-08-25: FIBER INSTALL-STATUS FEED (daily provider report
email -> portal). Full pipeline: POST /api/webhooks/inbound-report
(?token=POSTMARK_INBOUND_TOKEN, env set in .env.local + Vercel prod)
parses the xlsx attachment (exceljs, header-name-based, all 4 sheets)
-> upserts `fiberOrders` (doc id = Alt Order ID / brk_<sha1>), rep
matched by dealer-id map (config/fiberRepMap, self-learning) then
normalized displayName; import log in `fiberReportImports`; status in
config/fiberReportStatus. GET /api/portal/sales/status (own for reps,
all+unmatched for admin/owner). UI: InstallStatusSection on
/portal/sales (filter chips, status pills, admin grouped by rep,
breakage reason/notes, honest empty state). ISOLATED: never touches
sales/leaderboard/commissions. Real report verified: 929 orders
parsed, 0 missing rep names. Key files: src/lib/fiberReport/,
src/types/fiberOrder.ts, src/hooks/useFiberStatus.ts,
src/components/sales/InstallStatusSection.tsx.

FEED IS LIVE (2026-08-25 eve): Jacob installed the Gmail Apps Script
poller (Postmark has NO inbound — error 614); reports flow every 5
min. Sender: Dakota.Russell72@t-mobile.com (Jeremy also forwards
copies). Real import verified via token-gated GET
/api/webhooks/inbound-report?token=POSTMARK_INBOUND_TOKEN (health
check: status + last 10 imports + user displayNames): 929 orders,
241 matched initially.

SHIPPED 2026-08-25 (later, commit 348866a, deployed uwgaf0gtr Ready,
gates tsc/809 tests/build green): admin view = collapsed-by-default
dropdown per rep (matched AND not-yet-linked reps each get their own
named group under divider "Not linked to an account yet"); per-group
Assign control (dealer-id sticky via config/fiberRepMap + instant
backfill) + "Re-run matching" button; matching now strips
punctuation/diacritics (fixes Cooper O'Tool vs Otool), safe loose
first+last matching, ambiguity never auto-assigns. New
src/lib/fiberReport/matchReps.ts + POST
/api/portal/sales/status/assign (actions: assign|rematch,
admin/owner only).

UPDATE (2026-08-25 late): fuzzy matching shipped (same last name +
prefix first names, single-word portal names; unambiguous only) —
Cooper, Wil Teasdale, and Jeremy are ALL matched now (dealer map has
9 entries; I triggered rematch remotely via the ops route:
GET /api/webhooks/inbound-report?token=...&rematch=1; &assign=
dealerId:uid also works). 814 tests. NEXT: WAITING ON JACOB only for
"mason Tran" (128 orders, dealer 7054521 — portal candidates Brenden
Tran / Mason Steinberger, or leave if no account). Gavin McCrory,
Nolan Morrison, Colton Gordon, Daniel Ramirez, Joshua Dweh Jr, Cael
Crawford have NO portal accounts — their named groups stay admin-only
until they sign up, then Assign.
Also still waiting: (a) eyeball the three 8/24 UI fixes; (b)
pay_structure.pdf + fcra_auth.pdf still PLACEHOLDERS; (c) webhook log
grab when Mason signs direct_deposit (see STILL OPEN). NOTE: the
public-site redesign blocks above belong to a PARALLEL session — do
not touch them here.

SHIPPED 2026-08-25 (latest, commit 0e462f4, deployed nebal30q0 Ready,
gates tsc/822 tests/build green): (1) rep fiber view resectioned per
Jacob — "Sent in" tile (their own logged portal sales count,
submittedTotal on FiberStatusResponse) + collapsed status bucket
tiles (Pending install / Active / Cancelled / Needs attention),
accordion expand one at a time, nothing scrolls by default; admin
per-rep dropdowns unchanged. (2) customer names on fiber orders ONLY
from the rep's OWN logged portal Sale (sale.salesRepId ===
order.matchedUserId, conservative address prefix match >=6 chars both
directions, latest createdAt wins) — attached at read time in
src/lib/fiberReport/matchSales.ts, never stored, never from T-Mobile
or other reps. Rows show name strong, address demoted.

SUPERSEDED SAME DAY (commit 842d1e6, deployed 9o6arftsu Ready, gates
tsc/827 tests/build green): Jacob saw a rep screenshot, wanted the
status INSIDE the YOUR SALES ledger (confirmed via question UI +
"That makes sense"). Rep view now: pill chips under [All | Pay]
(Sent in / Pending install / Active / Cancelled / Needs attention)
swap the ledger list to that report bucket (cancelled = latest cancel
first, active = latest install first, pending = soonest first); every
sale card gets a live fiber-status pill next to APPROVED via
matchFiberOrdersToSales (address prefix, breakage wins, else latest).
Standalone rep tiles REMOVED; InstallStatusSection is admin-only and
prop-driven (page calls useFiberStatus once). Screenshots (dark
portal skin, sample data) sent to Jacob; awaiting his eyeball on the
live site. Known pre-existing, harness-only hydration warning from
SalesTable's toast portal — not shipped-new, not visible in prod.
2026-08-26 report ingested fine (937 orders, 669 matched; three
back-to-back imports = duplicate forwarded copies, last wins).

PORTAL SESSION (2026-08-26): MASON "COMPENSATION" ALERT DIAGNOSED —
almost certainly a STALE Aug-24 alertTask re-nagged, not a live
failure. "Compensation" = pay_structure; Mason's envelope was
Completed at SignWell and backfilled to approved 8/24, so he can't
even see Sign now for it. The alert comes from
esign-embed-error/route.ts; alertTasks dedupe by (kind,uid), never
expire, re-nag every 24h (renagStaleTasks "Still unclaimed:"), the
backfill never resolved them, and ActionQueue shows no timestamp and
has no dismiss. Real gap also found: esign-signing-url 502s for a
completed envelope (SignWell returns no embedded_signing_url) and
EsignSignAction then silently opens the STALE stored URL → embed
error → false alert; error events also have no one-shot guard.
SHIPPED (commit 6fafac4 on onboarding/completion, NOT deployed):
(1) ActionQueue age display ("· 2d ago") + Dismiss button + POST
/api/portal/alerts/dismiss + dismissAlertTask(); (2) provider
getEmbeddedSigningUrl returns {url,completed}, route returns
{completed:true} instead of 502, client skips embed + shows the
confirm-polling note on completed envelopes, one-shot reportFailure.
Diffs reviewed against spec; gates green: tsc clean, 55/55 targeted
vitest, prod build OK. DO NOT deploy from this tree — it holds the
redesign session's unauthorized WIP; deploy 6fafac4 from a clean
worktree checkout only when Jacob asks. NEXT: tell Jacob the alert
was stale (Mason signed Compensation 8/24; nothing live-broken) and
after deploy he can Dismiss it in the admin queue. Related standing item: grab the webhook log when Mason signs
direct_deposit (see STILL OPEN). Reminder rules: no solo agent runs
(parallel codex luna/sol workers, Fable reviews); pay tiers/comp
data sensitive — owner/admin only.

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
