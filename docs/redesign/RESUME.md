# RESUME — read this and continue without being asked

## SIDE TASK (2026-09-21, outside the redesign) — chat photo upload fix
Jeremy (owner, Android PWA) got "Failed to fetch" posting a photo in All Company. Root cause:
Android Chrome reads the picker File lazily at request time; a stale content-URI file aborts the
fetch. Fix committed as bfcb85d4 on branch fix/chat-android-picker-upload in worktree
~/dev/3cwg-fix-chat-upload, pushed to master by Jacob, Vercel production Ready 2026-09-21. DONE.
Also answered: Braeden Crouse's 9/18 sale is approved; leaderboard defaults to Week, he shows under
Month. Jacob: leave the default as is. No open items outside the redesign.

## NEXT ACTION (2026-09-22 ~04:00) — ALL COMMITTED (61ed8412). Waiting on Jacob's release call
cinematic-home HEAD = 61ed8412 "QA fix batch (18) + iPhone fixes (2)" on top of 2fd3abad. Tree clean.
Jacob confirmed on his iPhone: "Phone is good" (Contact header pinned, Apply hero full height).
Gates passed before commit: tsc, eslint, vitest (incl. new applicationsSheet tests), next build,
audit-motion, docs/cinematic/review/checks.mjs (only known pre-existing portal failures), axe clean.
Accepted noise: contact trail 0.03-0.06px over 0.5px tolerance at 1280/1800/960; careers/apply head
art 1.25x stretch at 1920 (no larger masters); dev-only CSS preload advisory.
Standing rules still in force: NO push, NO deploy until Jacob says so. :3122 stays as backup.
When Jacob says go: `cd ~/dev/3cwg-cinematic && git push origin cinematic-home`, then Vercel deploy
(his call: merge to master or deploy the branch). Then restore the portal dev server:
`pkill socat; cd ~/dev/3cworldgroup && npx next dev -p 3000` (classifier may block the kill; Jacob
can run it with `!`). next.config.ts allowedDevOrigins (192.168.4.88, 127.0.0.1) is committed,
dev-only, harmless; drop it later if wanted. Tell Jacob: good point to /clear now.
ENV NOTE: ufw allows LAN->3000; socat forwards 0.0.0.0:3000 -> 127.0.0.1:3120 so Jacob's phone
reaches :3120 at http://192.168.4.88:3000. Playwright WebKit cannot launch on this host.

## PREVIOUS (2026-09-22 ~03:00) — ALL COMMITTED. Yours: iPhone test, then release decision
Commits on cinematic-home in ~/dev/3cwg-cinematic (:3120): 381f51a3 (motion pass + Careers R16
+ dash sweep) and 87d1995b (replay on re-entry, five markets, chapters refine).
Gates clean, three adversarial Opus reviews passed with fixes applied. NOT pushed, NOT deployed.
Jacob ACCEPTED: Careers R16, markets (incl. regenerated Lansing/Grand Rapids). OPEN: his verdict
on the chapters refine (board .tmpshots/motion/chapters/board-1440-before-after.png + webm sent)
and on the motion pass as a whole (clips in .tmpshots/motion/clips/).
DONE + committed 835b8359: hero fetches one image per breakpoint (Jacob-approved); zero pixel diff.
DONE + committed 2fd3abad (option 2): route replays on re-entry, other entrances once per visit. Codex overall verdict on motion direction: yes.
Still his: real iPhone test; release (keep :3122 as backup, no merge, no push/deploy yet).
Decisions: route replays, other entrances once per visit; header once
per document; comp thresholds/titles off site; /#markets link from Careers; Southern California
labelled Region; apply City stays free text (no stored-data renames).
ENV NOTE (2026-09-22): for Jacob's iPhone test the main-repo dev server on :3000 was stopped and
socat forwards 0.0.0.0:3000 -> 127.0.0.1:3120 (ufw only allows LAN -> 3000). Phone URL
http://192.168.4.88:3000. Undo: pkill socat; cd ~/dev/3cworldgroup && npx next dev -p 3000.
3cwg-cinematic next.config.ts gained allowedDevOrigins ['192.168.4.88'] (dev-only, uncommitted).
Rollback tags: r15-backup, motion-wip-checkpoint, markets-checkpoint, chapters-checkpoint.
Idle workers own their files (motion-home, motion-kit, motion-pages, motion-explorer,
motion-forms, careers-refine, markets-update, contact-trail-fix, hero-glow-wire, motion-record,
motion-review, dash-sweep). ADHD output mode in force (/i-have-adhd).

## PREVIOUS (2026-09-22 ~00:30) — MOTION PASS COMMITTED, WAITING ON JACOB
Commit 381f51a3 on cinematic-home in ~/dev/3cwg-cinematic (:3120): full motion pass + Careers
R16 (ACCEPTED by Jacob) + dash sweep. Gates all clean (tsc/eslint/vitest/build/audit-motion/
checks; only known pre-existing portal failures). Two adversarial Opus reviews: PASS WITH FIXES,
all fixes applied and re-verified. NOT pushed, NOT deployed, :3122 untouched.
Backups: tag r15-backup (6ed2a0df, pre-motion), tag motion-wip-checkpoint (mid-pass).
Clips sent to Jacob (hero, route, nav-heads, market-faq, mobile + contact sheet); all 12 at
~/dev/3cwg-cinematic/.tmpshots/motion/clips/. Jacob's verdict on the MOTION PASS is still open
(he only accepted Careers so far). If he asks for changes: same worker names are idle and own
their files (motion-home MotionRoot/home css, motion-kit kit css, motion-pages services/about,
motion-explorer LocationExplorer/Faq, motion-forms apply/contact forms, careers-refine careers,
contact-trail-fix contact hero, hero-glow-wire glow, motion-record clips, motion-review review).
Decisions: entrances replay per page visit; header enters once per document (data-booted);
comp thresholds + manager titles stay off the site; /#markets link from Careers stays.
Known limitations: Chromium only, no real iOS Safari, mobile menu not reviewed.
ADHD output mode in force for the session (/i-have-adhd).

## PREVIOUS NEXT ACTION (2026-09-21 ~23:30, superseded)
Round 15 (50svh beats) ACCEPTED by Jacob, committed 6ed2a0df, tag r15-backup (= recoverable
checkpoint before the motion pass). Jacob's brief: cohesive animation/microinteraction pass,
NOT a redesign; preserve hero/headline/light work section/straight edges/Contact 3C; no deps;
no push/deploy. Full brief is in the session; key numbers: feedback 150–220ms, entrances
350–500ms, stagger 70–100ms, travel 8–16px, no bounce/blur/zoom/spin. Code map (7k words):
/tmp/claude-1000/-home-fazetwerpnerd69-dev-3cworldgroup/a1360a2f-1e42-41eb-b8f9-11f3322ff49d/scratchpad/motion-map.md
Wave 1 Opus workers (disjoint files, uncommitted): motion-kit (cinematic.module.css buttons/
links/focus/reveal retune), motion-forms (Apply/Contact forms states + Contact 3C restrained
entrance; 3C is raster so no line trace), motion-pages (Services hero + grouped reveals, About
three C's rows), motion-explorer (market indicator/crossfade + FAQ height animation, extracts
_home/Faq.tsx), hero-glow-asset (public/redesign/v2/photos/hero-wide-glow.webp for the
optional cursor-brightens-roads hero idea Jacob asked about; judge sheet in .tmpshots/glow/).
Wave 2 after motion-explorer finishes: motion-home (MotionRoot + cinematic-home.module.css +
page.tsx + WorkChapters + RouteSequence): hero sequence ≤700ms and REMOVE the current
blur(10px)/scale entrance on .heroArt (brief: background still and sharp), chapter crossfade
+ ticks refinement, route line = time-based draw 1–1.3s triggered on entry with stops revealing
as the line reaches them (replace scroll-scrub), then optional hero glow wiring.
Then: Fable reviews every diff vs spec, gates (tsc/eslint/vitest/build), audit-motion.mjs +
checks.mjs + capture.mjs, adversarial Opus anti-slop review, recordings for Jacob, board,
commit on cinematic-home with trailers. Jacob is the acceptance gate.

## PREVIOUS NEXT ACTION (2026-09-21 ~20:30, superseded by round 14)
Cinematic (:3120, ~/dev/3cwg-cinematic, branch cinematic-home). ROUND 13 committed fa08e3fe
(tag r13-backup): why-join moved above the route, desktop hero capped+centred, hero-foot seam
fixed, market dusk grade lifted a step, Home joints <=138, axe 0, heroscrim pass. Opus review of
r13 was dispatched (verdict may still be pending — if it flagged anything on why-join/markets/
seam, act on it; its hero notes are moot). IN FLIGHT: Opus agent "port-3122-hero" is porting
the OWNER-APPROVED :3122 Home hero (image hero-wide.png aerial + portrait, layout, spacing,
mobile treatment; KEEP :3120's two-line headline) and :3122's LIGHT treatment for "Three things
happen at every door" (paper bg, navy headings, gray body, dark-green numerals; keep chapter
imagery), and tightening the hero-buttons → work-title gap (120–180px at 1740, 80–140 at 390).
When it reports: read back page.tsx, cinematic-home.module.css, WorkChapters.tsx diff; view
docs/cinematic/shots-r14/*; get an adversarial Opus review; commit with trailers; show Jacob
on :3120 desktop + phone. :3122 (~/dev/3cworldgroup-editorial-20260920) must stay untouched.
Jacob's decisions tonight: Contact phone 3C mark STAYS big ("i like the 3c"); market grade
lifted not darkened; hero = :3122's per the owner.
NOT done on purpose: no real Contact/Apply submission was sent (Jacob's rule).

## PREVIOUS NEXT ACTION (2026-09-21 ~19:00, superseded by round 13)
Cinematic (:3120, ~/dev/3cwg-cinematic, branch cinematic-home): round 12 committed (6a8f5247 +
01490ef6), Opus PASS. Jacob checked it on his PHONE 2026-09-21 evening: "from what i can tell on
the phone looks good" — phone ACCEPTED for round 12. Desktop (1740) not yet checked by him.
Nothing is queued. Candidates for the next round, only if Jacob asks: Opus's non-blocking
leftovers (market skyline foliage reads sunlit under the dusk grade; Apply "What happens next"
rows leave ~330px of paper right of the body at 1740; Home route vs Apply steps use two list
grammars), or a desktop pass on :3120. Any fix goes on :3120 only, then rerun the harness
(docs/cinematic/review/*.mjs), get an Opus review, commit with the trailers.
NOT done on purpose: no real Contact/Apply submission was sent (Jacob's rule). The "all dusk
photos look alike" review note stays DECLINED (approved direction, no file used twice).

## PREVIOUS NEXT ACTION (2026-09-21 ~18:30, superseded — phone verdict landed)
Cinematic (:3120, ~/dev/3cwg-cinematic, branch cinematic-home): round 12 is built, harness-clean
(tsc 0, eslint clean, axe 0, joints ≤138, heroscrim all pass), Opus final verdict PASS, committed
on cinematic-home as 6a8f5247 + 01490ef6 (joint fix). Show Jacob the round-12 checklist (below) on :3120, phone
first. WAITING on his verdict; nothing else queued. If he flags something, fix it on :3120 only,
rerun the harness (docs/cinematic/review/*.mjs), get an Opus review, commit with the trailers.
NOT done on purpose: no real Contact/Apply submission was sent (Jacob's rule); the Contact
desktop rail is sticky, so in a full-page screenshot it still shows blank paper beside the
textarea — in a real viewport it rides alongside the form. The "all dusk photos look alike"
review note was DECLINED: dusk suburban is the approved direction, no file is used twice, and
every hero is a different picture (see the photo map).

## ROUND 12 (2026-09-21 afternoon → evening) — Jacob's answers landed + two Opus reviews
Jacob's answers (2026-09-21): Contact → portal pipeline YES (done, b1254c6c); "why join" facts:
everything on the site is true; Q3 "ok do those. yes." = drop the Apply from the lime card so the
closer carries the one Apply; PLUS "The roof/eaves image beside 'The conversation' still feels
mismatched" and "The repeated closing invitations and long navy stretches still need tightening";
from his phone: Contact "line is fucked up & 3c is pretty small".
What changed on :3120 (shots in ~/dev/3cwg-cinematic/docs/cinematic/shots-r12/):
- HOME. Chapter 01 = front door open a hand-width, lit doormat (home-threshold-dusk); chapter 02 =
  living room seen from the open door, lamp + lit street through the window (home-room-dusk, new
  render); chapter 03 unchanged (lit door + keypad). "Two ways through the door" is gone; in its
  place "Why people sell with 3C": title left, four lime-term/plain-fact pairs in two columns, no
  hairlines, no icons, one Contact link; the crew-lead aside sits under the title (last on
  phones). Hero headline re-broken: "Your next chapter / starts next door." Route steps lost their
  01–04 numerals (chapters keep the page's one numbered set); route foot and markets Apply are
  quiet links now, so Home's body has two lime buttons (hero, closer) like every other page.
  Closer on phones: even scrim across the copy, crop shifted so the door jamb sits off the edge.
  Market skylines keep their real daylight photos but wear a CSS dusk grade (navy multiply,
  warm floor, desaturated) so they sit in the page's key.
- ABOUT. Leadership moved to paper with the seam; ink text tokens; closing rule under the row.
- SERVICES. Bundle chapter is navy now (the page ran 2700px of paper into one navy closer); its
  CTA is a quiet link; closer button sits under the lede in one column, not 1100px right of it.
- CAREERS. Closer ranged left like the other four; 01/02/03 numerals are ink (lime-ink read as
  olive on paper); glance frame = rooftops render.
- APPLY. "What happens next" is three numeral | title | body rows on hairlines (was a three-up
  column row, the last one on the site). Phone head is content-sized with NO buttons (the form is the next thing; the head's
  lime button duplicated the form heading 160px below). First field at 632px on a 390 phone.
  Closer section deleted (it cut the tail into 725 navy / 342 paper / 191 navy slivers);
  "Good to know" ends on a quiet "Back to the form" link.
- CONTACT. Phone mark at 110vw bled 24vw off the right edge, full strength, in flow below the
  copy; `.headArt` is position:relative (static broke the line-to-slash join — Opus caught it);
  headline "Start the right / conversation." so the lime line is no longer than the white one;
  desktop rail (email, hours) is sticky beside the form.
- KIT. Phones keep the diagonal seam at a fixed 14px rise (was flattened to 0). Review tools:
  ground.mjs counts page heads as ink runs; stage.mjs = viewport capture with a selector centred
  (for sticky stages). Gotcha saved to memory: Next dev caches optimized images in
  .next/dev/cache/images — rm it after swapping a photo under the same name, or captures lie.
Opus reviews: r12 full review (16 findings, all acted on or superseded) then a fresh re-check on
final shots (10 findings: 1,2,4–9 fixed; 3 "same dusk look" declined; 10 About phone hero "mud"
declined — heroscrim frameMaxL 0.647 passes and the treeline reads), then a last pass (6 items:
market grade + Apply rows fixed; "About phone seam flat" declined with a 3x crop showing the
diagonal; chapter-03 empty column and why-order were stale captures; "two list grammars on two
pages" declined). FINAL VERDICT: PASS (commit 6a8f5247; joint fix 01490ef6).
Opus's non-blocking leftovers, for a later round if Jacob agrees: market skyline foliage still
reads sunlit green under the dusk grade; Apply "What happens next" rows leave ~330px of paper
right of the body at 1740; Home route (unnumbered, drawn line) and Apply steps (numbered rows)
tell the same journey in two grammars.
Photo map (one file per placement, none repeated): Home hero street → chapters threshold /
room / keypad door → route apply-talk-train-walk → closer doorway-from-inside; About hero aerial
→ values street → closer; Services hero keypad door → three product plates → bundle porch →
closer aerial-2; Careers hero front door → glance rooftops → closer cul-de-sac; Apply hero
canopy (apply-doors) ; Contact 3C mark.

## PREVIOUS NEXT ACTION (2026-09-21 ~17:10, superseded by round 12)
Cinematic (:3120, ~/dev/3cwg-cinematic, branch cinematic-home): round 11 committed b1fe3408 (Opus
PASS), forms committed b1254c6c (Contact delivers for real via POST /api/public/contact →
`contactMessages` + owner email; Apply's <3s fast-path removed, honeypot kept). Jacob answered
2026-09-21: Contact → portal pipeline YES; Home "why join" facts: everything currently on the site
is true; Q3 (Home "Two ways through the door" navy stretch) he asked what it meant — a phone
screenshot was sent, recommendation = keep the section, drop the Apply button from the "Selling
for yourself" card so the closer carries the one Apply, tighten the gap. WAITING on his word for
Q3. Remaining agent-list items, in order: Apply form higher on mobile; Contact 3C mark on phones;
Home "why join" section built from facts already on the site; Q3 if approved. Every visual item
still gets rshots/checks/heroscrim/measure + an Opus review before commit.
NOT done on purpose: no real Contact submission was sent (Jacob's rule: no outgoing messages
without authorization); verified with the API mocked (docs/cinematic/review/forms.mjs). There is
no admin inbox for contactMessages yet, so no portal push alert was wired.

## ROUND 11 (2026-09-21 morning → afternoon) — Jacob's three findings, all landed
What he asked: (1) a picture for every step of Home's "From application to your first route";
(2) About "too much text not enough design past we sell at the door"; (3) the fiber pedestal
photo used too often ("where it makes sense is ok, the fact we used it so much is a problem").
What changed (all on :3120, shots in ~/dev/3cwg-cinematic/docs/cinematic/shots-r11/):
- Home route: four new frames (route-apply/talk/train/walk-dusk). Desktop: even stops, line
  corners at the quarter points, each photo in its own stop column on the far side of the line.
  Phone: straight rail, copy first, photo under each stop. Foot = timing note + one Apply.
- About: story band and "Who we serve" gone; hero → mission (door-hanger figure + For customers /
  For contractors rows + Apply link) → values photo band (about-corner-dusk) → leadership → closer.
- Pedestal appears once (Services fiber row). New frames elsewhere: home-doorway (Home closer,
  looking out through an open door), careers-rooftops (Careers glance, horizon from a rise),
  services-door (Services hero), apply-doors (Apply done state). careers-threshold, home-entrance,
  careers-townhomes, services-porch, about-truck deleted.
- Fixes from the Opus rounds: stacked route rail lost vector-effect (the draw never completed on
  phones before this — pre-existing); route foot button beside the note; Careers glance plate
  keeps a left edge (horizontal wash removed); About repeats "fiber, TV and home security" once;
  header menu open state keyed to the route (SiteHeader.tsx) instead of reset in an effect.
- Harness at commit: axe 0, joints ≤140, heroscrim no DIM, tsc/eslint clean, menu.mjs sequence ok.
- New review tools: docs/cinematic/review/bbox.mjs (element top/height), menu.mjs (phone sheet).

## OPEN QUESTIONS FOR JACOB (agent-list items, asked 2026-09-21, unanswered)
1. Contact form: route real submissions to the portal (same pipeline as Apply) or email only?
2. Home "why join": what training and first-week facts are true today (length, who runs it,
   pay timing) — nothing goes on the page that he has not confirmed.
3. Home closer: fold "Two ways through the door" into the closer to cut a navy stretch, or keep it?

## PREVIOUS NEXT ACTION (2026-09-21 ~04:50, superseded by round 11)
Cinematic (:3120, ~/dev/3cwg-cinematic, branch cinematic-home) overnight anti-slop work is DONE
through round 10, committed as 9423bb32 (on top of a41a7b41). Jacob is the acceptance gate:
WAIT FOR HIS MORNING VERDICT on :3120. If he calls anything slop, fix it in the worktree only
(never :3000/:3118/:3122 trees). cine-design teammate was hard-stopped; do not let it resume editing.
Standing rules for this branch: docs/cinematic/ANTI-SLOP.md is the bar; verify at 1740 + 390 with
`node docs/cinematic/review/rshots.mjs <outdir> route1,route2` (routes COMMA-separated), then
`checks.mjs` (axe/no-js/reduced), `heroscrim.mjs` (text-on-photo contrast), `measure.mjs` (joint
gaps); every visual round gets an adversarial Opus review before commit. tsc: the one error is a
pre-existing portal test file.

## JACOB'S MORNING CHECKLIST (2026-09-21 ~04:50)
Open :3120 (new) next to :3000 (current) and :3122 (Codex). Restart any with `npm run dev -- -p <port>`
from its directory (:3120 = ~/dev/3cwg-cinematic). Look at 1740 wide and on your phone.
Screens of every route at both widths: ~/dev/3cwg-cinematic/docs/cinematic/shots-r10/.
WHAT CHANGED OVERNIGHT (commits 953ab681, def12e66, 6978fa20, 2ad9883f, a41a7b41, 9423bb32):
- NO NEON ANYWHERE. Opus review caught that the old aerial had glowing green light-trail roads
  with node dots, the fiber pedestal had a glowing strand, the TV showed a blue gradient. All
  regenerated (docs/cinematic/ad-explore/r2/*.txt are the prompts; gpt-5.6-sol image gen).
- Every hero is one photo used once: Home = lit street, Services = pedestal, About = aerial with
  plain roads, Careers = front door, Apply = wet street after rain. Closers are each their own
  frame (Home pedestal, Services aerial, About street, Careers cul-de-sac). Figures: Home doors =
  mailboxes, Home stages = eave/window/garage, About mission = door hanger, Services plate =
  porch, Services rows = keypad/pedestal/TV room, Apply = street corner.
- Closers no longer all the same block: Apply ends on paper, ranged left, no photo; Contact ends
  on a flat navy band with the line and the button on one hairline; About is ranged left over
  its photo; Home/Services/Careers stay centred over a photo.
- Button kit: lime hover glow removed; ghost button is a plain navy fill, no frosted glass.
- Careers: duplicate 4-step "Your path" row deleted; weekly $ bands deleted (PRODUCT.md forbids
  unverified pay claims). Replaced with a three-row ledger "Three stages of the same job".
  Hero lede is now plain ("Door-to-door sales of fiber, TV and home security in a market that
  is hiring. Training first, then a route with a leader who checks in.").
- About: unverified stat banner deleted; monogram cards replaced with Bebas names + roles;
  values are three lime names on one hairline, no 01/02/03; product strip cut to one line;
  "10+ years" and "protected territories" claims removed; leadership zigzag fixed on phone.
- Services: bundle plate is a real porch photo; every row has its own lit photo; hero lede and
  bullets rewritten concretely; closer copy is plain.
- Apply: "Apply in five fields."; steps are a two-column ruled list (no numerals); asterisks
  consistent; closer is a paper band that points back to the form at the top.
- Contact: closer eyebrow gone; the "Phone: coming soon" block REMOVED (a placeholder that
  says nothing is a slop tell); hero lede now says what the form does.
- Home: hero rail microtype removed; mobile scrim lightened so the street photo reads on a phone.
- Forms: "John Doe"-style placeholders replaced. Footer hairline aligned to the shell.
- Headlines no longer mad-lib "Your next ___ starts ___" (Home H1 kept as you wrote it).
- Phone heroes run to 90svh so the photo shows above the copy on every interior page.
- Round-10 re-check fixes: Careers earnings ledger now sits on a paper band with the seam, rung
  ordinals only (no "Stage" label), copy in full-contrast ink; Apply form panel flattened to one
  hairline (lime top edge + shadow gone); every lime left-border rule replaced with a hairline;
  backdrop blur removed from the header and the mobile apply bar; route-dot halo deleted; Services
  closer aerial regenerated (plain roads, no light trails) with a split "Want to sell these
  services? / Start here." layout; Services phone hero no longer scaled (was blurring); Apply
  closer tightened; About H1 no longer breaks mid-word at 430.
- cine-design (Sonnet teammate) was sent shutdown_request; its last edits were reviewed and kept
  (Apply phone hero framing). All src writes in the final commit are Claude Fable's.
DECISIONS TAKEN FOR YOU (say the word to reverse any): Careers $ bands pulled; About stats pulled;
About product strip pulled; Contact phone placeholder pulled; leadership names KEPT.
VERIFIED (round 10): axe 0 violations x12 route/viewport pairs; every hero white/lime/lede above
contrast floors at 390 and 430; no-JS + reduced-motion clean; tsc clean (one pre-existing portal
test error). Safari/iOS still unverified from this machine. Opus adversarial review r10: two Opus passes; 12 findings fixed; kept the thin 04 route ring, Home/About
closer shapes, and your H1 breaks by decision.

## OLD CHECKLIST (2026-09-18 ~21:30)
Servers (restart if down after reboot):
- :3000 main tree  -> cd ~/dev/3cworldgroup && npm run dev -- -p 3000
- :3120 cinematic  -> cd ~/dev/3cwg-cinematic && npm run dev -- -p 3120
- :3118 Codex's frozen polish preview (optional, ~/dev/3cworldgroup-polish-20260918, `npx next start -p 3118`)
1. :3120 cinematic Home round 2 -> hits per section (hero, work, route, markets, questions, doors, closing).
2. :3000/contact -> hero line connects to the split diagonal? accept or hits.
3. :3000/opportunities bottom (white closer, continuous navy) and :3000 Home (white closer, moved seam,
   brief band) -> accept or hits. These are Codex polish + mine, COMMITTED d77c2f4a.
4. Decide: does cinematic Home replace the current Home? If yes -> merge plan (own header/footer fork).
Later backlog: dead .public-contact rules in public.css; products trio repeated About+Services;
196 untracked src/public files in the main tree (public.css, fonts, art) should be committed.

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
COMMITTED as d77c2f4a (Jacob: "we'd have your previous work still saved").
Jacob 9/18 ~20:30: LOVES the cinematic Home direction ("started off with a bang", "blow someone's head
off"); wants to keep building it SEPARATELY from this tree. Setup: branch `cinematic-home`, worktree
~/dev/3cwg-cinematic (Codex's 3 owned paths + its PRODUCT/DESIGN/FINAL-REVIEW in docs/cinematic/, plus
the 196 untracked src/public assets committed there because public.css etc. are untracked here).
Dev server :3120 now serves the WORKTREE (Codex's prod server was killed). Round 2 (Opus agent cine-r2):
finish two-doors, terminate route line, markets lede, seams, cool paper tokens, closing promise line.
2026-09-20: Jacob back, wants cinematic finished before comparing the two homepages. Note the
worktree branches off d77c2f4a, so EVERY non-home route on :3120 is identical to :3000 --
the comparison is homepage vs homepage, apples to apples. Round 3 (Opus agent cine-r3) in flight:
questions section on the page grid, closing photo lifted so it reads, work section vertical balance,
hero lede tightened, responsive sweep at 768/1024/1280/1920 (never checked before).
Planned round 4: axe accessibility audit + perf (LCP/image bytes) + reduced-motion/no-JS re-verify,
all of which Codex listed as never run.
CINEMATIC IS NOW A WHOLE SITE. Commits on branch cinematic-home (worktree ~/dev/3cwg-cinematic, :3120):
10863627 shared shell (src/app/(cinematic)/layout.tsx + _cinematic/{SiteHeader,SiteFooter,MotionRoot,
cinematic.module.css,nav.ts} + docs/cinematic/PAGE-KIT.md; home pixel-identical, 22/22 shots byte-equal),
e9ea9db8 Careers+Apply+Services+About+Contact rebuilt in the language (old route dirs deleted, forms
preserved + proven by intercepted POST, nothing invented, imagery only from public/). Crawl: all 9 routes
200, 0 console errors, no overflow; npm run build passes.
IN FLIGHT: cine-legal (privacy/terms into the group + kit gaps: quietLink paper variant, applyBar on
interior pages, dead code incl. src/components/public/services, ThreeCGlyph, USMap, #apply-route-root
rules in public.css) and cine-audit (axe + contrast re-measure + perf + Firefox/WebKit -> docs/cinematic/AUDIT.md).
UNVERIFIED CLAIMS to put to Jacob: Careers weekly $ bands; About's 50+ states, 1,000+ contractors,
$5K+ weekly, 98% satisfaction, 10+ years, "Protected Territories", and the four leadership names.
Round 3 COMMITTED (7c49d5a4): FAQ on the section grid, closing photo lifted (measured contrast,
lime 6.5:1), work section rebalanced, hero lede 3 lines, sweep 768/1024/1280/1920 fixed.
Jacob 9/20: clicking nav on :3120 kicks back to the old site -> BUILD THE WHOLE CINEMATIC SITE.
Order: (1) cine-shell agent extracts SiteHeader/SiteFooter + shared kit into a (cinematic) route group
+ docs/cinematic/PAGE-KIT.md, homepage must stay pixel-identical; (2) then 5 parallel Opus agents build
/opportunities, /apply, /services, /about, /contact in the language, content SOURCED from the existing
page on this branch (no invented facts), Apply/Contact keep working forms + API wiring.
Privacy/Terms stay plain; /culture excluded (not real).
Round 2 COMMITTED on cinematic-home (53cbc403): two-doors finished w/ photo, route line terminates at stops, cool paper, offset seams, lede/closing copy fixed. Shots: ~/dev/3cwg-cinematic/docs/cinematic/r2-shots/.
NEXT ACTION: Jacob judges :3120 (cinematic Home r2); iterate on branch cinematic-home in ~/dev/3cwg-cinematic.
Rule: take Codex output as whole files, never partial hunks.
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
