# DESIGN — cinematic field-sales homepage

One dark-dominant, image-led page built as a **route you walk**: the opening
street, the three moments of the job, the line that draws your first week, the
map of where you can do it, and the door at the end. The old white-header /
navy-left / image-right diagonal is gone; so are the icon-step grids and the
four-identical-card stacks.

## Tokens

Declared on `.page` in `src/app/cinematic-home.module.css`.

| token | value | use |
|---|---|---|
| `--ink` | `#061735` | brand navy, primary dark surface |
| `--ink-deep` | `#030d1f` | closing + footer, one step below navy |
| `--ink-raise` | `#0c2049` | raised panels on navy, hairline fills |
| `--lime` | `#8dc63f` | the only accent. Apply, route line, active state |
| `--lime-bright` | `#a6e052` | hover/active lift only |
| `--paper` | `#f4f0e6` | warm off-white, the light chapters |
| `--paper-raise` | `#fbf8f1` | raised cells on paper |
| `--on-ink` | `#ffffff` | text on navy |
| `--on-ink-dim` | `#b5c4da` | secondary on navy — hue-tinted, 9.1:1, never gray |
| `--on-paper` | `#101f38` | text on paper |
| `--on-paper-dim` | `#4a5a71` | secondary on paper, 7.4:1 |
| `--rule` | `rgba(255,255,255,.14)` | hairline on navy, 1px only |
| `--rule-ink` | `rgba(16,31,56,.16)` | hairline on paper, 1px only |

Contrast checks: lime on navy 8.85:1 · navy on lime 8.85:1 · `--on-ink-dim` on
navy 9.1:1 · `--on-paper-dim` on paper 7.4:1. Large display type clears 3:1
everywhere it sits on photography because every photo carries an authored scrim
(see below), not a blanket opacity.

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
   `hero-portrait-1600.webp` at ≤820px — an aerial dusk suburb with lit street
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

3. **The route (`#start`, paper).** The signature moment. A bespoke SVG route —
   an orthogonal street path with rounded 90° corners, i.e. walking a block, not
   a decorative squiggle — draws left-to-right across the section as it enters
   and progresses, with four labelled stops that arrive as the line reaches them:
   Apply → Talk it through → Train → Work your first route. Desktop draws
   horizontally with stops alternating above and below the line; ≤900px draws a
   separate vertical path down the left with stops to its right. Both paths are
   driven from a single scroll-progress number via `stroke-dashoffset`.

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

6. **Two doors (navy).** Deliberately asymmetric: a dominant lime-edged apply
   panel for a solo rep, and a quieter outlined line for someone bringing a
   crew. Not two equal cards.

7. **Closing (ink-deep, full bleed).** Generous display type over a darkened
   crop of the same aerial photograph that opened the page — the route closes
   where it started. One lime Apply.

8. **Footer.** One slim band: logo + wordmark, a single row of real links
   (About, Services, Careers, Contact, Apply, Portal), three social icons,
   legal line, copyright. No column directory.

9. **Mobile apply bar.** ≤820px only. Appears after the hero leaves the
   viewport, sits on `env(safe-area-inset-bottom)`, and the page adds matching
   bottom padding so it never covers the last line of content.

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

## Browser surfaces

Themed inside the page scope: `::selection` (lime on navy / navy on lime per
surface), `caret-color`, `scrollbar-color` on the page root, `:focus-visible`
ring in lime with a 2px offset and a navy inner line so it reads on both
surfaces, `text-underline-offset: 0.22em` with a lime decoration on inline
links, and tabular numerals wherever a sequence number appears.
