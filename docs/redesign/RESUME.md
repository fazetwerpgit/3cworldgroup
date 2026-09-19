# RESUME — read this and continue without being asked

## CURRENT (2026-09-18 ~20:00) — Codex snapshots reviewed; partial merge on :3000
Jacob ran Codex ("Astra") in two isolated copies (no .git, never touched this tree):
- ~/dev/3cworldgroup-polish-20260918 (preview :3118, .codex/RESUME.md, final.patch = 7 files):
  mobile hero fixes, navy-on-lime buttons, Apply claims removed, footer anchors, PLUS overreach
  (white Home closer, moved Home seam, Careers eyebrow "Ready when you are", brief-row rules).
- ~/dev/3cworldgroup-cinematic-20260918 (preview :3120, .Codex/RESUME.md): full Home rewrite that
  bypasses PageWrapper (own header/footer, 1814-line module). Opus review: show with caveats, not mergeable.
Jacob 9/18 ~20:10: "build off what codex did, keep what you have going" -> Codex's FULL polish pass
(all 7 files) copied WHOLESALE from the polish snapshot into this tree on top of my Contact/Careers/Home
work. :3000 now = Codex polish + my Contact rebuild + connected hero line. (Home has Codex's white closer
and the seam moved to markets->path; Careers eyebrow now "Ready when you are".) Partial hunk-picking
was tried first and broke Apply; don't repeat, take whole files.
Cinematic Home (:3120) NOT taken; Jacob hasn't said.
NEXT ACTION: Jacob checks :3000 (/, /opportunities, /apply, /contact) and says commit or what to change;
ask him about the cinematic Home separately.
Gates after merge: tsc 0, eslint 0 errors, 0 console errors, no overflow 390/1440.

## Previous (2026-09-18) — Contact round 1 in progress; Careers closer + Home A UNCOMMITTED

NEXT ACTION: Jacob checks localhost:3000/contact (Contact round 1 built,
UNCOMMITTED, spec docs/redesign/contact-r1-spec.md). Done: pixel-lock CSS
gone (module 771 -> ~300 lines, rewritten). Hero art: Jacob wants the ORIGINAL italic lime-outline street-map 3C
(contact-three-c-source.png, 380px) "exactly the same but not blurry".
Image-gen recreations (2 rounds) drifted and were rejected. Final: Real-ESRGAN
x4 of the source (portable build in .playwright/tools/re, realesrgan-x4plus,
RTX 4080) -> public/redesign/contact-three-c-hd-x4f.png (1860x1520, opaque navy).
Post-process (magick, one command): green-dominant mask -> modulate
150,135,108 (olive -> site lime), RGB floor level 7% so it vanishes under
mix-blend lighten, canvas extended 400px right and ONE continuous diagonal drawn over the
original (stroke #8dc63f 7px + dim 12px blurred glow, from 920,1520 to
1918,101; the piecewise extension showed a seam, Jacob caught it), 60px trimmed
off the left (stray tick). Jacob 9/18: "damn close" after placement; then
asked for the line extended + right green -> this file. Placement measured from Jacob's
old screenshot: desktop >=1024 absolute left 52.7% of the grid, top 18px,
width 828px (letters same size as before the 400px extension), hero min-height 647px, overflow hidden; blend on the wrapper
(NOT the img: a z-indexed wrapper made its own stacking context and the
blend showed a dark square). Below 1024 in-flow, max-height 260px on phone.
Jacob 9/18: the hero line must CONNECT to the split's diagonal. Done:
.route defines --line-x (where the line crosses the hero bottom: grid left +
--art-left 46% of grid width + 416.4px inside the 828px art); the split's
navy column is var(--line-x) wide and a .contact-fast-path-pale overlay
(span, absolute, left = line-x - 400px) paints the pale panel with a hard-stop
linear-gradient at 125.11deg (= the line's 35.11deg) so the edge continues
the line exactly. Verified 1280/1440/1920. 900-1199px: --line-x falls back
to 67.5% (panel would be too narrow). Transforms are neutralised by the
public sheet, hence gradient not skew. Barlow Condensed via @font-face (same files as
Careers) on all display text, fast-path split at normal scale (402px),
closer = About-style white step-in ClosingCta. The global `public-contact`
class was removed from the route root so ~240 lines of dead
`.public-contact` locks in public.css no longer match (sweep later).
Verified 1440/390, 0 console errors, tsc + eslint clean.
Commit on accept:
  git add src/app/contact public/redesign/contact-three-c-hd-x4f.png docs/redesign/contact-r1-spec.md docs/redesign/RESUME.md
  git commit -m "feat(contact): drop the pixel-locked comp; crisp hero mark, normal scale, white step-in closer"

Uncommitted, NOT yet accepted by Jacob (he moved on to Contact without a
verdict; ask when Contact lands):
1. Careers closer: apply section gone; About-style white step-in ClosingCta
   panel; .path transparent so topo navy runs pay column -> footer (block
   "04d"). Old .ending* CSS unused, delete on accept. id="why" on why section.
2. Home option A: reasons + start sections replaced by one pale band, two
   rows, one line each + link (page.tsx .brief, home-page.module.css block
   "Home option A").
Commit on accept:
  git add src/app/opportunities/ src/app/page.tsx src/app/home-page.module.css docs/redesign/RESUME.md
  git commit -m "feat(public): Careers white step-in closer; Home hands benefits and steps to Careers"
Still open: products trio repeated on About + Services.
Branch codex/services-home-alignment-20260916. Dev server `npm run dev -- -p 3000`.
Screenshot scripts: .playwright/shots/{careers-apply,home-brief,contact}.mjs.
Careers committed 6398c307.

Careers round 2 (spec: docs/redesign/careers-r2-spec.md, Jacob approved the
design in conversation):
- Page is now hero / why (pale, 2x2 benefits) / path+pay split (white steps,
  navy tiers, one diagonal) / apply (navy topo, bullets + placeholder line
  removed). Cut: "How you get started", "Three products", closing CTA.
- opportunities-page.module.css: 1364 -> ~830 lines. All nth-of-type(3..6),
  .glance, .sell rules removed (backup in session scratchpad opps.css.bak).
  New styles appended under "Careers round 2". Hero map: heroMap max-height
  min(58vh,500px), cell centred, container min-height capped (it used to be
  47.22vw and outgrew the 677px section past ~1500px -> map slid down).
- Verified 1440/1920/2560/390, 0 console errors, tsc + eslint clean.

Standing facts (still true):
- public.css ~4652 forces .public-closing-cta-panel with !important; page
  overrides need !important. About has the white step-in CTA panel.
- Market cards must be accurate to the real city; generate with
  ~/.claude/skills/openai-image-gen script (gpt-5.6-terra) from Wikimedia
  refs + the Atlanta card for grade. CLIProxyAPI image lane broken
  (auth_not_found). Next image optimizer caches by filename: rename after
  regenerating.
- Unused old assets still in repo: home-r5-market-{savannah,tallahassee,
  birmingham}-hd.png, home-r4-market-*, market-*.png.

Previous CURRENT: Services new Bundle map art

Bundle map replaced: flat vector map -> generated night-satellite US with amber
city lights + lime arcs (public/redesign/services-r3/bundle-map.png + bundle-map-q2-1600/-800
webp; source prompt in session scratchpad prompts/map-night.txt; background
level-matched to #061735 with magick level-colors). Wired as object-fit contain
with padding so it clears the diagonal; navy fades on the panel edges.
services-bundle-map-source.png is now unused (drop from the commit list).
Everything else from the 33-43 round stands (bigger row type, section-level
zigzag lines, textured TV section, tighter CTA).

Previous CURRENT: round after images 33-43

Claude changed directly (services.module.css): row type bumped (title
clamp(3rem,5vw,5rem), number, accent, body, bullets; copy width 40rem);
lime lines now drawn on the section (::before, centered on 50% +/- art-shift)
instead of the photo panels, so the zigzag joints are exact; map panel
carries the footer's topo texture + lime glow (Jacob: "bland asf") so the
Bundle -> CTA edge is texture-continuous; map image inset clear of the
diagonal (via padding on .bundleImage: next/image fill inline styles beat
inset/width). Map panel: grid + lime glow only, rings dropped (fought the
map). Verified 1920 + 390, tsc/eslint clean, 0 console errors.

Previous CURRENT: round after images 26-32

Claude changed directly (services.module.css): hero lime line removed
(.mapPanel::before display:none); rows now split at 50vw +/- --art-shift so
every row's lime line is one continuous zigzag (right rows lean left going
down, left rows lean right, meeting at each boundary); TV section got the
footer's topo texture + lime glow (was flat navy); CTA padding-top cut to
slant + 1.25rem. Hero: shelf + full-navy fades + eyebrow/lead from the
previous round stay. Verified 1920 + 390, tsc/eslint clean, 0 console errors.

Previous CURRENT: hero polish round on art H

Jacob rejected the first H wiring ("still doesn't look right"). Claude fixed
three things directly in services.module.css + page.tsx: navy shelf under the
art (--hero-shelf = slant + 2.5rem, so row 01's slant only ever cuts navy),
art fades to full section navy at the diagonal and at the shelf, Home-scale
eyebrow + bold heroLead line. Verified 1920/1440/390. If Jacob accepts ->
the commit below. If not -> ask him to point at the exact thing.

Previous CURRENT: Services DONE (Claude-verified, Jacob picked hero H); awaiting Jacob's commit

Final state on localhost:3000/services, verified 1920/1440/390, tsc + eslint
clean, zero console errors (npm run build not run: dev server holds .next):
- Hero = composite art H (public/redesign/services-r3/hero-h-*.webp), Home's
  "hero is art, sections are photos" rule; lime line chains into row 01;
  headline crosses the diagonal at >=1600; two buttons.
- Rows 01/02/03 alternate with mirrored diagonals; one clean slanted edge
  at every boundary; Bundle row owns the diagonal into the CTA (CTA has no
  bg of its own, shares the footer surface) — Claude fixed this, not Sol.
- Phone stacks straight with navy gaps.
Unused candidates (hero-a..g) moved to the session scratchpad, not in repo.

NEXT ACTION: Jacob commits:
git add src/app/services/page.tsx src/components/public/services/ docs/redesign/RESUME.md docs/redesign/DESIGN-SYSTEM.md docs/redesign/SERVICES-COPY-R1.md docs/redesign/SERVICES-ART-BRIEF.md public/redesign/services-r3/ public/redesign/v2/photos/
git commit -m "feat(services): premium Services page"
Then Services is the reference page; next page (About or Careers, Jacob
picks) via the same process: handoff + no-people art brief + rep-facing
copy written here, executed by Sol, verified by Claude on 3000.

Previous state:

Services page is finished and verified by Claude on localhost:3000 at 1440 and
390: hero "THREE SERVICES./ONE CONNECTION.", intro band removed, three rows with
dusk photography (no people), rep-facing copy with no numbers/carriers, one
"Start selling" button per row to /apply, whole-row slanted boundaries on one
angle from hero through CTA, Bundle styled like the rows, CTA+footer one navy
surface. Sol did the last three fixes. Uncommitted; Jacob was given the commit
command. Minor non-blocker: phone hero map renders small inside its box.

NEXT ACTION: once Jacob commits, Services is the reference page. Next page
rounds (About, Careers) follow the same process: DESIGN-SYSTEM.md + a page
handoff + art brief (no people) + copy draft, executed by Sol, verified here.

Key files: docs/redesign/DESIGN-SYSTEM.md, SERVICES-ART-BRIEF.md,
SERVICES-COPY-R1.md, SOL-SERVICES-HANDOFF.md, public/redesign/services-r2/.
Rules: no generated people; no numbers or carrier names; Home locked; Jacob is
the acceptance gate; Jacob commits.

docs/redesign/DESIGN-SYSTEM.md now holds the Home-extracted system (tokens, type,
layout, components, responsive, 8-point premium checklist, per-page process).
Every future public-page prompt cites it. Handoff and launch message reference it
and the design-taste-frontend skill.

Note: localhost:3000 is the 3C dev server. localhost:3001 is a different project
(My WiFi Wizard); never screenshot it as 3C.

## CURRENT (2026-09-16) — Services preview close; awaiting annotations before lock

Jacob is not satisfied with Services layout B and asked to use frontend-design guidance.
He approved making one Fiber section comparison against the original, using the existing
professional photograph, before considering any further live-page changes. This approval
is for a mockup only, not for adopting the proposal or reverting the current page.

Jacob found the isolated Fiber comparison hard to judge. He approved a separate browser
preview showing Fiber, TV, and Security together at normal size, with Original/Proposal
switching. This remains mockup-only; no visual direction has final approval.

Latest feedback: the three-section flow feels better, but there is too much white space.
Jacob approved a preview-only density/palette pass: desktop rows 580→500px, gaps 48→16px,
smaller intro and copy padding, and navy behind the TV section with white text/lime accents.
This pass is implemented in flow.css and desktop/mobile captures refreshed. Existing
photography, wording, and live Services files remain unchanged. The previous density CSS
is preserved as flow-before-density.css. Await feedback on this tighter version; do not
interpret agreement to try it as approval to modify the live page.

Latest response: Jacob says "yeah it looks better." Treat compact spacing plus navy TV
as the preferred visual direction, not authorization to port to the live Services page.
Jacob then approved extending this same preview through the bottom of Services: clean
bundle/map without stray lines, natural recruiting typography, and a continuous patterned
navy surface shared by recruiting CTA and footer. Preserve existing assets and copy.
Contrast triage: declared the TV navy background directly (in addition to its full-width
pseudo-element), clearing three analyzer false positives. Intentional pale-blue body text
has 14.38:1 contrast on navy; a gray-on-color exception is scoped to flow.html only.

Latest feedback: "its close, i think once i am able anotate it we will have it locked."
Hold the current preview unchanged while Jacob annotates. It is not locked yet. Make only
the agreed annotation-driven corrections next; do not start animation or live integration.

NEXT ACTION: receive and review Jacob's annotations on the completed preview at
http://127.0.0.1:3012/flow.html#bundle. Bundle uses the clean existing source map with no
connector overlay; recruiting headline is naturally proportioned; recruiting and footer
share one uninterrupted existing topographic background. Existing wording/assets retained.
The preferred top three sections are unchanged. Bottom desktop/mobile captures:
docs/redesign/concepts/services-section-review-2026-09-16/bottom-{desktop,mobile}.png.
Checked 390/768/1080/1440/1920 for overflow, loaded assets/fonts, preview-only CTA notices,
and browser errors. Contrast and leading corrections are scoped to new bottom content;
Impeccable now returns no findings. Live Services and Footer source hashes unchanged.
No live implementation, commit, push, or deployment authorized. Preview base address:
http://127.0.0.1:3012/flow.html (separate static preview, NOT the live Services route).
Files: docs/redesign/concepts/services-section-review-2026-09-16/flow.{html,css,js}.
Original/Proposal switches work; proposal is open in the in-app browser. Existing photos
and brand fonts are retained. Desktop rail stays in its own margin and ends at Security;
tablet/mobile stack through 1200px. No animation yet. At 390/768/1080/1440/1920 no
horizontal overflow was detected; desktop/mobile captures inspected and controls checked
over HTTP. Live Services source hashes match before/after. Keep preview server on 3012
available for review. No implementation or reversal of live layout B has been approved.
Preserve the previous single-section comparison unchanged for reference:
docs/redesign/concepts/services-section-review-2026-09-16/comparison.png. Top is the
original before layout B; bottom is the new static proposal. It preserves the existing
fiber photo and diagonal frame, with simpler type spacing and a contained left rail.
index.html is the separate review artifact; proposed-mobile.png shows the 390px version.
Both desktop (1440px) and mobile were rendered and visually inspected. No live Services
file changed during this comparison; the three source hashes matched before/after.
Keep src/ and public/ unchanged; preserve all dirty work. Home remains locked except its
separately identified pending issues. Do not revive the rejected generated image boards.

## Previous implementation (2026-09-16) — Services layout B; not visually accepted

Jacob approved the preference for Services layout B: consistent copy-left/photo-right
alignment, a continuous offwhite canvas, clean numbered connector stops, and restrained
scroll progression/reveals. Keep existing professional photographs; preserve the hero,
shared header/footer, copy, and link destinations. Fix connector/photo collisions, contain
the bundle map, and remove squeezed closing-CTA typography. Mobile stays simple and
reduced-motion/no-JS content remains immediately readable. No pinning or scroll hijacking.

NEXT ACTION: Jacob reviews http://localhost:3000/services#fiber in the in-app browser.
Collect his visual feedback before making further layout changes. The local implementation
is verified, but automated checks are not Jacob's final visual acceptance.
Tablet/mobile use stacked layout and no continuous connector through 1080px.
Desktop keeps the scroll-drawn rail ending at Apply; reduced motion draws immediately.
Existing clean services-bundle-map-source.png replaces the old baked diagonal map.
No commit, push, or deployment.
Files: src/app/services/page.tsx and src/components/public/services/{services.module.css,
ServicesConnector.tsx}. Preserve all unrelated dirty work.

Baseline copies: /tmp/services-layout-b.bdvGXo. Independent QA captures and reports:
/tmp/services-qa-20260916/. Final desktop/mobile evidence: final-stable-r4/; final tablet
correction: tablet-correction/. Checked 390, 768, 1080, 1282, 1440, 1920 plus continuous
resize; reduced-motion/no-JS visibility; section anchors clear fixed header. Desktop rail
has zero sampled text/artwork collisions and ends at Apply without a dangling tail.
1057 tests pass. Scoped ESLint, typecheck, and production build passed, including the final
tablet adjustment. Build isolated at /tmp/services-build-20260916-IOAVmn; live .next/dev
untouched. Only the three Services files and this resume document changed in this task.

Home remains unchanged. Pending separately: unify Home closing CTA background with the
patterned footer; replacement city for duplicate Georgia market cards still needs a choice.

## Previous decision (2026-09-16) — generated image sprint rejected

Jacob rejected every Careers, Fiber, TV, and Security option from the September 11/16
visual package. The exercise was only a test of the new image generator. None of those
cartoon-like options match the professional assets and visual standard of the current
site, none may be refined or implemented, and no winner will be selected. Treat the
current working-tree site and its existing professional assets as the design baseline.

The generated package remains archived outside production for now; rejection does not
authorize destructive file deletion. Production `src/` and `public/` remain untouched by
this decision. Preserve the dirty repository: no reset, clean, stash, broad staging,
commit, push, deployment, or overwrite.

DEV SERVER VERIFIED: `http://localhost:3000/` is the current repository working tree,
served by Next 16.1.1 from `/home/fazetwerpnerd69/dev/3cworldgroup`; `/` returns HTTP 200
with title `3C World Group | Fiber Internet, TV & Security Solutions`. Home is open in the
in-app browser for live inspection.

NEXT ACTION: discuss and inspect the current public site route by route, agree on the
remaining professional design work and priorities, then make new mockups or source edits
only for directions Jacob explicitly approves. Do not return to the rejected image set.

HOME ANNOTATION (2026-09-16): browser comments now work. Home remains locked except
for one identified market-strip content issue: Atlanta and Savannah create two Georgia
cards. Recommend preserving Atlanta and replacing Savannah with a real active market and
an equally professional, non-generated city photograph. The Home list is hardcoded and
the repository has no authoritative current-market feed or unused sixth-city asset.
WAITING: Jacob names the replacement city/state (or says to replace Atlanta instead).
No Home source or production asset has been changed.

## 2026-09-11 — both portal fixes LIVE on master. Redesign still uncommitted.

master 7b58855b = carrier cancellation takes the money (cb973b40 on this branch).
master 03c8eeb8 = a deleted account stops nagging (8665b590 on this branch):
deleting a user resolves their alerts; the daily reminder closes any task whose
subject account no longer exists. The gHnyob zombie alert was resolved by hand
first. Henry Daniel Fandey's alert is real and still open on purpose — Jacob
has not assigned him a position yet.

Deploys go through the /home/fazetwerpnerd69/dev/3cwg-deploy worktree:
detach on origin/master, cherry-pick, gate there, push HEAD:master. Never
check out master in the main tree — Jacob's redesign is dirty there.
NEXT: redesign track (see CURRENT below).

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

## CURRENT (2026-09-11) — Careers hero four-variation mockup round; no code

Jacob does not want to discard the prior Careers hero exploration, but asked for four additional,
extremely different variations and a strict senior art-director/frontend review at 390, 1282, 1440,
and 1920. He clarified: mockups only, no production code. Production `src/` and `public/` are locked.
Use Product Design ideation plus frontend-design and frontend-design-imagegen skills.

Fresh current-run captures are in `/tmp/3c-careers-mockups-2026-09-11/audit/live-{390,1282,1440,1920}.png`.
Initial evidence: mobile hero is 759px below a 71px header and consumes almost the whole first 844px
viewport; desktop hero is fixed at 677px; at wide sizes the capped content and large right-shifted map
create awkward balance/cropping. Preserve exact current Careers copy and existing 3C brand DNA.
Generate four independent high-fidelity raster mockup directions outside the project, grounded in
fresh captures and current-site references. No generated people. Review the set with Opus, revise
only concrete failures, and ask Jacob to choose or refine. Do not implement anything.

Milestone: the evidence-based audit and first four Careers hero variants are complete. Opus reviewed
the first generation and the two weaker axes were replaced. The current decision set is stored outside
production at `/tmp/3c-full-image-sprint-2026-09-11/options/careers/`: three-market editorial triptych,
revised documentary aerial, tactile territory blueprint, and type-as-territory.

The site-wide image inventory is complete at
`/tmp/3c-full-image-sprint-2026-09-11/inventory/site-image-inventory.{md,json}`. Locked Home, About,
Services photography, Contact vector direction, and Services artifact-only maps are excluded.

The Careers Fiber, TV, and Security illustration queue is complete: four deliberately different options
per product were generated, Opus-reviewed, and revised where the first outputs were misleading, fragile
at card size, or visibly broken. Final review boards are
`/tmp/3c-full-image-sprint-2026-09-11/boards/{careers,fiber,tv,security}-2x2.png`.

Persistent GPT App handoff package:
`/home/fazetwerpnerd69/Documents/3cworldgroup-visual-handoff-2026-09-16/HANDOFF.md`.
It contains stable copies of the four boards, all 16 final option images, inventory, captures, review
evidence, user boundaries, dirty-worktree warnings, and the exact next prompt.

No production UI or image asset was changed.

NEXT ACTION: wait for Jacob to choose Option 1-4 independently for Careers, Fiber, TV, and Security, or
request a targeted refinement. Keep everything outside production until he explicitly approves a winner.

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

## LEADERBOARD RESTYLE — LIVE: master f4e198f8, Vercel prod gzssxd41v Ready (2026-09-15 17:27 CDT)
Jacob approved: phones (<1024px) get the new podium page (round 9: 330x100 charcoal 3D blocks, metallic
numerals, muted laurel, solid crown, 52px rows, sticky "You" bar, week default). Desktop (>=1024) keeps the OLD
board, restored pixel-identical under src/components/leaderboard/legacy/ (he rejected both desktop attempts).
One fetch in LeaderboardRoute feeds both; useWideViewport + routeSplit.module.css do the switch.
periods.ts gives Sunday-start Chicago weeks to API and countdown. Gates at push: tsc, 30 leaderboard tests,
build OK. Board artifact: https://claude.ai/code/artifact/ad421a6c-73d6-4956-a6ad-85d8cd4fc845.
Shipped from worktree ~/dev/3cwg-esign (rebased on 59a6d396). Main tree redesign untouched.
NEXT: nothing pending on leaderboard; Jacob to eyeball www on his phone. Optional later: rotate the
Vercel bypass secret (it was pasted in chat).

## INSTALL DATE FEATURE (2026-09-14, rep request) — SHIPPED master 1a0b836f (gates: vitest 1199, tsc, build OK)
Vercel prod build aw39vfv2p started from the push; verify Ready. Rep-facing: Sales tab > tap a sale > Install row
"Change" (owning rep or admin, not cancelled). Report-driven: inbound-report webhook now calls
syncInstallDatesFromOrders; counts appear in the webhook JSON/log. Known looseness: address-prefix match
("12 Oak" vs "12 Oakwood") is guarded only by two-way uniqueness. Not yet verified live with a real report.
Ask: rep changes install date on own sale from Sales tab; carrier report date change updates the sale.
Findings: PUT /api/portal/sales/[id] already lets owning rep set installDate (UI hid it); inbound report
(Postmark -> fiberOrders) never touches sales; match is read-time address-prefix (matchSales.ts) + admin saleLink.
Lanes (Opus): `install-ui` SaleDetailSheet Change/Save control; `install-sync` src/lib/sales/installDateSync.ts
called from inbound-report webhook (unambiguous match only, noon local, installDateSource/PreviousDate/ChangedAt,
notification type install_date_changed). Commit msg: scratchpad/esign/commitmsg-installdate.txt. Ship: gates in
worktree, commit -F, push HEAD:master, Vercel auto-deploys. Redesign untouched (Jacob's rule).

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
