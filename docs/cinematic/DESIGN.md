# DESIGN — cinematic field-sales homepage

One dark-dominant, image-led page built as a **route you walk**: the opening
street, the three moments of the job, the line that draws your first week, the
map of where you can do it, and the door at the end. The old white-header /
navy-left / image-right diagonal is gone; so are the icon-step grids and the
four-identical-card stacks.

## Tokens

Declared on `.page` in `src/app/_cinematic/cinematic.module.css`, the shared
kit every route in the `(cinematic)` group imports. Names and values are
unchanged from when they lived in the homepage's own module; `PAGE-KIT.md`
lists what else the kit carries.

| token | value | use |
|---|---|---|
| `--ink` | `#061735` | brand navy, primary dark surface |
| `--ink-deep` | `#030d1f` | closing + footer, one step below navy |
| `--ink-raise` | `#0c2049` | raised panels on navy, hairline fills |
| `--lime` | `#8dc63f` | the only accent. Apply, route line, active state |
| `--lime-bright` | `#a6e052` | hover/active lift only |
| `--lime-ink` | `#47700f` | the same green at ink weight, for lime on paper |
| `--paper` | `#eef3f8` | cool pale, the light chapters |
| `--paper-raise` | `#f7f9fc` | raised cells on paper |
| `--on-ink` | `#ffffff` | text on navy |
| `--on-ink-dim` | `#b5c4da` | secondary on navy — hue-tinted, 9.1:1, never gray |
| `--on-paper` | `#101f38` | text on paper |
| `--on-paper-dim` | `#4a5a71` | secondary on paper, 6.3:1 |
| `--rule` | `rgba(255,255,255,.14)` | hairline on navy, 1px only |
| `--rule-ink` | `rgba(16,31,56,.16)` | hairline on paper, 1px only |

**Round 3 — the gutter.** `--gutter` was `clamp(1.25rem, 4vw, 3.5rem)`, which
put the 768–1024 range on a 30–41px gutter and ran every section nearly edge to
edge on a tablet. It is now `clamp(1.25rem, 5vw, 3.5rem)`: 390 still sits on the
1.25rem floor and 1440 and up still sit on the 3.5rem cap, so only the middle
moves — 768 goes from 31px to 38px, 1024 from 41px to 51px.

**Round 2 — paper moved to the cool family.** `--paper` was the warm cream
`#f4f0e6` and `--paper-raise` `#fbf8f1`, which sat apart from the cool pale
`#eef3f8` / `#f7f9fc` the rest of the site uses. Both are now the site values.
Re-measured against the new grounds, no token needed adjusting:

| pair | ratio | floor |
|---|---|---|
| `--on-paper` on `--paper` | 14.8:1 | 4.5 |
| `--on-paper` on `--paper-raise` | 15.6:1 | 4.5 |
| `--on-paper-dim` on `--paper` | 6.3:1 | 4.5 |
| `--on-paper-dim` on `--paper-raise` | 6.7:1 | 4.5 |
| `--lime-ink` on `--paper` | 5.2:1 | 4.5 |
| `--lime-ink` on `--paper-raise` | 5.5:1 | 3 (marker) |

`--on-paper-dim` fell from 7.4:1 to 6.3:1 with the cooler ground and still
clears the floor comfortably, so it was left alone.

`--lime-ink` is new. `--lime` on near-white is 1.9:1, which is fine for the
route's 4 px stroke — a large graphic, and the signature of the page — but not
for the two small things that carry meaning on paper: the FAQ `+` marker, which
is a row's only affordance, and the inline link underline. Both now use
`--lime-ink`. The route line, the route stop dots and every lime button keep
`--lime`.

Contrast checks on navy are unchanged: lime on navy 8.85:1 · navy on lime
8.85:1 · `--on-ink-dim` on navy 9.1:1. Large display type clears 3:1 everywhere
it sits on photography because every photo carries an authored scrim (see
below), not a blanket opacity.

## Type

- Display: **Bebas Neue** (already self-hosted via `@fontsource/bebas-neue`,
  imported in the root layout). Condensed, single weight, uppercase.
  Tracking `-0.005em` to `0.01em` — Bebas is already tight, so the floor's
  `-0.04em` guard does not apply to it; body type never goes looser than `-0.01em`.
- Body: **Geist** (`--font-geist-sans`), 400/500/600.
- Scale: hero `clamp(2.9rem, 7.4vw, 6.9rem)` / `0.86` leading · section display
  `clamp(2.2rem, 4.6vw, 4.2rem)` · chapter display `clamp(1.9rem, 3vw, 2.9rem)`
  · lede `clamp(1.05rem, 1.35vw, 1.28rem)` at `1.55` · body `1rem/1.65`,
  measure capped at `62ch`–`68ch`.
- Numerals in the route stops and chapter numbers use `font-variant-numeric:
  tabular-nums`.

## Composition — top to bottom

1. **Opening (100svh, full bleed).** `hero-wide-1600.webp` on desktop,
   `hero-portrait-1600.webp` at ≤900px — an aerial dusk suburb with lit street
   grid, from the existing v2 photo set. Art direction is two stacked layers,
   not a flat tint: a bottom-anchored navy scrim
   (`linear-gradient(180deg, rgba(3,13,31,.35) 0%, rgba(3,13,31,.62) 46%, #061735 100%)`)
   plus a left-weighted horizontal scrim on desktop so the copy column sits on
   its own darkness while the right side of the photo stays legible.
   Header is transparent, tight (68px), pinned; real logo, four slim links, one
   solid lime **Apply**. On scroll past 24px it condenses and picks up a blurred
   navy backdrop.
   Headline, three lines, real selectable text:
   **"YOUR NEXT CHAPTER / STARTS AT / THE NEXT DOOR."** — line three in lime.
   Beneath it: a plain-language role sentence, then **Apply** + **See the work**.
   **Round 3** cut that sentence from four dense lines at 1440 to three without
   losing a fact: door-to-door in your own neighborhood, fiber internet / TV /
   home security, training provided, 1099 independent contractor,
   commission-only and uncapped are all still in it.
   A hairline rail at the bottom of the hero carries the three chapter names, so
   the page's own structure is visible before you scroll.

2. **The work (`#the-work`, navy).** Desktop is a two-column sticky: the left
   column holds one framed visual that crossfades between three real photos; the
   right column scrolls three numbered chapters. The numbers are earned — this
   is a sequence a rep walks through in order, and the order is the point.
   1 · **The conversation** → aerial neighborhood, the street you actually work.
   2 · **The right fit** → a three-up of the real fiber, TV and security product
   photography, because chapter two is choosing between them.
   3 · **The follow-through** → the installed-service interior shot.
   Below 900px the sticky column dissolves into a plain stacked flow, image then
   chapter, no sticky, no scroll coupling.

   **Round 3 — the two columns now share a frame.** The stage was `4 / 5`, which
   at 1440 made a 612px image that began 352px into the section and so ran past
   the fold, while the chapter beside it ended around 620px and left the bottom
   quarter of the right column empty navy. Two changes, both halves of the same
   fix: the stage is a just-past-square `1 / 1.06` capped at
   `clamp(24rem, 100svh - 22rem, 33rem)`, so the whole image is inside the fold
   at 1024, 1280, 1440 and 1920; and above 900px each chapter is one beat of
   `clamp(21rem, 33vw, 31rem)` with its copy centred in it, so the image and the
   chapter start and finish together. The chapter's own copy also carries more
   weight — the lede runs to `1.4rem` on a 30ch measure and the body to a 52ch
   one — but no fact was added; every line is the sourced copy it was.

3. **The route (`#start`, paper).** The signature moment. A bespoke SVG route —
   an orthogonal street path with rounded 90° corners, i.e. walking a block, not
   a decorative squiggle — draws left-to-right across the section as it enters
   and progresses, with four labelled stops that arrive as the line reaches them:
   Apply → Talk it through → Train → Work your first route. Desktop draws
   horizontally with stops alternating above and below the line; ≤900px draws a
   separate vertical path down the left with stops to its right. Both paths are
   driven from a single scroll-progress number via `stroke-dashoffset`.

   **Round 2.** Both paths used to overrun their own sequence — the wide one
   started 80px before stop 01 and ran ~220px past stop 04 into empty canvas,
   the stacked one had a 74px stub at each end. Both now begin on stop 01 and
   end on stop 04. Stop 01 is a filled lime node so the line starts on
   something; stop 04 is a larger filled node inside its own ring, so the draw
   arrives rather than stopping. The `at` / `atSm` fractions are measured
   against these exact coordinates and have to be recomputed if a corner moves.

   **Round 3 — the canvas shrinks faster than the things hanging off it.** The
   SVG is 470/1200 of its own width, so its height falls with the viewport, but
   the stop cards and the *Step one* panel are a fixed number of pixels tall.
   Below about 1100px that broke twice: the panel, anchored `bottom: 0`, rose
   until the route was drawn straight through it at 1024, and the stop cards and
   the panel spilled into `.routeFoot` at 940. The panel is now anchored to the
   line itself (`top: calc(63.83% + 1.6rem)`), and `.routeFoot` carries the
   overhang as `max(0px, 10.5rem - 14.2%)` on top of its own margin — the figure
   is the overhang stated, and it goes to zero once the canvas is wide enough to
   contain everything. Measured clearance is 34–57px from 905 to 1920.

   A centred stop card also hung outside the gutter at narrow desktop widths,
   because stop 01 sits only 9.8% into the canvas; `margin-left` is now
   `max(-7rem, calc(-1 * var(--stop-x)))`, so the pull stops at the canvas edge
   and the dot simply sits off-centre in that one card.

   The stops were also respread (9.8% / 32.5% / 58.3% / 86.7% of the canvas)
   and the bottom right — the quadrant the line now finishes over, and
   previously blank at 1440 — carries `.routeEnd`: a lime-ruled *Step one*
   panel with the page's Apply. That restores the Apply PRODUCT.md lists for
   the route sequence. At ≤900px it leaves the absolute layer and rejoins the
   flow under the last stop.

4. **Where (`#markets`, navy).** Five native `<button>`s — Birmingham, Atlanta,
   Jacksonville, Lansing, Grand Rapids — all visible at once, `aria-pressed`,
   arrow-key and tab operable, with a lime fill on the selected one. Selecting
   swaps a large city plate (existing market art) and an honest next step: what
   to do about that city, stated as "tell us where you want to work when you
   apply", plus the standing caveat that opportunities vary by market. Two
   links out: Apply, and the career path.

5. **Questions (paper).** Native `<details>`/`<summary>` rows on hairlines, no
   cards. Six questions covering the role, products, pay model, contractor
   status, training, and where 3C operates. Answers are drawn only from the
   facts listed in PRODUCT.md.

   **Round 3 — back on the page's own grid.** Round 2 gave this section a 52rem
   shell of its own, so at 1440 the whole chapter sat in a narrow left-of-centre
   column with the right quarter empty — the one section on the page that did
   not use the grid every other section uses. It now runs on `.shell` like the
   rest: a `.faqHead` of display heading left and a short lede right (a
   description of the six questions below it, nothing new claimed), then the
   rows across the full content width. The question keeps a 44ch measure and
   the marker keeps the right edge, so the hairline carries the width rather
   than the words. Native `<details>`, the hairlines and the 45° marker
   rotation are unchanged.

6. **Two doors (navy).** Deliberately asymmetric on both axes. Left column: a
   Bebas display heading (*Two ways / through the door.*), then a dominant
   lime-edged apply panel for a solo rep — filled, 3px lime left edge — pushed
   to the foot of the column, with a quieter outlined *Bring a team* panel
   beneath it. Right column: `fiber-dusk-1600.webp`, a dusk street of lit
   houses with a lime fibre run through it, under the same two-layer authored
   scrim the hero uses — a horizontal wash that dissolves its left edge toward
   the copy, plus a vertical fall top and bottom. Not two equal cards, and no
   empty half. At ≤900px the copy column becomes `display: contents` so the
   heading leads, the photograph sits under it, then the two paths.

7. **Closing (ink-deep, full bleed).** Generous display type over a darkened
   crop of the same aerial photograph that opened the page — the route closes
   where it started. One lime Apply.

   **Round 3 — the photograph is actually there now.** Round 2 ran the image at
   `opacity: .3` under a flat 0.88/0.6 vertical fall, and the section rendered
   as plain navy: the outer eighths measured 0.016 relative luminance, so the
   return of the opening image never happened. The image now runs at full
   strength and the darkening is authored where the type is instead — an
   ellipse (`58% 54% at 50% 45%`) heaviest through the centre the display type
   occupies, falling to nothing at the left and right edges where the lit
   street grid reads, over a much lighter vertical fall that still opens on
   `--ink` for the hue step out of two doors.

   The lift is bounded by measurement, not by eye. `docs/cinematic/r3-shots.mjs`
   hides the copy, screenshots the backdrop, decodes it, and computes the
   contrast of each display line against the brightest pixel that line actually
   covers, at 1440 and at 390. It fails the run below 4.5:1, or if the outer
   eighths fall back under 0.08. Shipped: at 1440, lime 6.51:1, white 12.81:1,
   edges 0.18; at 390, lime 6.37:1, white 6.35:1, edges 0.68.

8. **Footer.** One slim band: logo + wordmark, a single row of real links
   (About, Services, Careers, Contact, Apply, Portal), three social icons,
   legal line, copyright. No column directory.

9. **Mobile apply bar.** ≤900px (the same breakpoint as the stacked route and
   the dissolved sticky stage; earlier drafts of this doc said 820px, the CSS
   has always said 900). Appears after the hero leaves the
   viewport, sits on `env(safe-area-inset-bottom)`, and the page adds matching
   bottom padding so it never covers the last line of content.

## Seams

Every navy/paper joint on this page is authored. A navy-to-paper gradient was
built first and thrown out for the reason `home-page.module.css` gives for
throwing out its own: alpha-blending navy over near-white is a hundred pixels
of desaturated grey, and it reads as fog rather than as a decision. The answer
is a cut.

An earlier draft cut an orthogonal step — two offset horizontals joined by a
vertical, on the left 38% of the top and the right 38% of the bottom. It was
thrown out at review: as a notch it read as a rendering fault rather than as a
gesture, and it was the one joint on the site that did not match the others.

There is now exactly **one** seam, `kit.seam` in
`src/app/_cinematic/cinematic.module.css`, and every paper chapter on every page
carries it — here, `.routeSection` and `.faq`. It is a single
`clip-path: polygon()` cutting one straight full-width diagonal, rising to the
right, into the section's own top and bottom edge at the same angle: the paper
starts `--seam-rise` (`3.6vw`) lower on the left of the top edge and finishes
`--seam-rise` higher on the right of the bottom edge. `.page`'s own background
is the navy that shows through the cut, so no negative margin or padding
compensation is involved, and `--seam-rise` is far smaller than any section's
top padding so nothing is ever clipped.

Below 900px `--seam-rise` drops to `0px` and the `clip-path` is removed on every
page at once: at phone width the same angle is a wedge of dead space rather than
a line, so the joint is a straight edge there, consistently.

A note on the angle. The review brief asked for a `125deg` hard-edged gradient
matching the Contact hero's lime line. Taken literally that edge is ~55° off
horizontal, which across a 1740px page drops the seam more than 1200px — a
column divider, not a section joint. The gesture was kept (one straight
diagonal, one angle, every joint) and the angle set to the shallow `3.6vw` rise
the approved homepage seam already used.

The one navy/navy joint — two doors into the closing — is not a cut but a hue
step, so `.closing::after` now opens on `--ink` and falls to `--ink-deep`
instead of starting flat at `--ink-deep` against a lighter neighbour.

## Motion

Native CSS, Web Animations and IntersectionObserver only — no new packages.
All markup renders visible from the server. A single client `MotionRoot` sets
`data-motion="on"` on the page **only** when `prefers-reduced-motion` is not
`reduce`; every pre-reveal state (`opacity: 0`, offsets, clip) is written
under `[data-motion="on"]`, so with JS off or reduced motion on, the page is
simply the finished state.

- **Hero entrance (the composed moment, settles at 900ms).** Photo scale
  `1.055 → 1` with a `blur(10px) → 0` under a `cubic-bezier(.16,1,.3,1)`
  exponential ease-out; scrim fades; header drops 12px; the three headline
  lines wipe up under `clip-path: inset(100% 0 0 0)` on an 85ms stagger; lede
  and buttons follow; the chapter rail draws its hairline left-to-right last.
- **Hero drift.** Desktop, fine pointer, non-reduced only: the photo translates
  up to 14px against the cursor, rAF-coalesced, `transform` only.
- **Route draw.** The authored second moment. `stroke-dashoffset` mapped to the
  section's scroll progress (clamped, eased), with stops flipping to their
  arrived state as the line passes each one. Under reduced motion the line is
  drawn complete and the stops are on from the start.
- **Section reveals.** Two different reveals, not one repeated entrance:
  chapters rise 18px with a 400ms opacity ramp; the paper sections wipe their
  top hairline and bring content in on a 60ms stagger. Each fires once.
- **Microinteractions.** Apply arrow slides 4px and the button lifts 1px with a
  real offset shadow; nav links wipe a 2px lime underline from the left; city
  buttons fill from the bottom; `<summary>` markers rotate 45° into an ×;
  everything has a `:active` transform so touch gets feedback.
- Never: scroll-jacking, scroll trapping, custom cursors, audio, particle
  fields, glowing canvases, continuously animating sections, counters, tickers.

## Widths this page is answerable for

390, 768, 1024, 1280, 1440 and 1920. `docs/cinematic/r3-shots.mjs` loads every
one of them, asserts zero console errors and `scrollWidth == clientWidth`, and
saves a full-page shot per width plus a viewport shot per section at 1440 and
390 into `docs/cinematic/r3-shots/`. Round 2 had only ever looked at 1440 and
390; the tablet range and the 1024–1280 desktop range are where round 3's
route, gutter and work-section fixes came from.

## Browser surfaces

Themed inside the page scope: `::selection` (lime on navy / navy on lime per
surface), `caret-color`, `scrollbar-color` on the page root, `:focus-visible`
ring in lime with a 2px offset and a navy inner line so it reads on both
surfaces, `text-underline-offset: 0.22em` with a lime decoration on inline
links, and tabular numerals wherever a sequence number appears.
