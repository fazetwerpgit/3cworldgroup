# PAGE-KIT — building an interior page in the cinematic language

Read `DESIGN.md` for why any of this looks the way it does and `PRODUCT.md` for
what may be said. This file is how to build a page.

## Where things are

| path | what |
|---|---|
| `src/app/(cinematic)/layout.tsx` | the shell: `MotionRoot`, `.page`, skip link, header, `<main>`, footer |
| `src/app/_cinematic/cinematic.module.css` | the kit — everything below |
| `src/app/_cinematic/SiteHeader.tsx` / `SiteFooter.tsx` | chrome, already rendered by the layout |
| `src/app/_cinematic/nav.ts` | `NAV_LINKS`, `APPLY_HREF` — the only place routes are named |
| `src/app/(cinematic)/<route>/page.tsx` | your page: **sections and nothing else** |
| `src/app/(cinematic)/<route>/<route>.module.css` | composition only this page has |
| `src/app/(cinematic)/_legal/` | the shared treatment behind /privacy and /terms |

Put a route in the group and it gets the chrome and the tokens; the URL is
unchanged. Do not render a header, a footer, a `<main>` or a `.page` — the
layout owns all four, and a second one will fight it.

```tsx
import kit from "../../_cinematic/cinematic.module.css";
import { APPLY_HREF } from "../../_cinematic/nav";
import styles from "./services.module.css"; // only if you need one
```

Nav highlighting is automatic: `SiteHeader` marks the link matching the current
path with `aria-current="page"` and `kit.headerLinkCurrent`. Adding a route to
`NAV_LINKS` is all it takes.

## The kit

**Shell** — `kit.shell` (`--shell`, 90rem / 1440px, on a fluid
`clamp(1.25rem, 4.5vw, 4.5rem)` gutter), `kit.shellNarrow` (62rem). Every
section is `<section class={surface}><div class={kit.shell}>…`.

**Vertical rhythm** — `--section-pad` (`clamp(4rem, 8vw, 7rem)`) is the one
number every section top/bottom padding is written from. A section head and the
content under it are never more than ~3rem apart, and no navy band exists purely
to hold space.

**Grounds** — `kit.surfaceInk` (navy), `kit.surfaceInkDeep`, `kit.surfacePaper`,
`kit.surfacePaperRaise`. Each sets background, text colour, the paper
`::selection` pair, and the anchor offset under the fixed header. Never write a
background colour on a section yourself.

**Seam** — `kit.seam`. **Every paper section carries it; no navy section ever
does.** One straight diagonal, full width, rising to the right, cut into the
section's own top *and* bottom edge by a single `clip-path: polygon()`, so every
navy/paper joint on the site is the same gesture at the same angle. The rise is
`--seam-rise` (`3.6vw`) — the same shallow angle the approved homepage seam
used. `.page`'s own background is the navy the cut reveals, so no negative
margin or padding compensation is involved. Below 900px `--seam-rise` goes to
`0px` and the cut is dropped entirely: at phone width the same angle is a wedge
of dead space, so the joint is a straight edge instead, consistently on every
page. `kit.seamTopOnly` is the same cut on the top edge only, for a paper
section that runs to the footer (the two legal routes). Compose either alongside
the ground: `composes: surfacePaper seam from "…"`. There is no stepped or
orthogonal seam anywhere in the codebase any more.

**Section head** — `kit.sectionHead` on navy, `kit.sectionHeadInk` on paper:
display heading left, lede right, on a hairline. This is the page's rhythm — use
it for every section, not just some.

**Type** — `kit.sectionTitle` / `kit.sectionTitleInk`, `kit.sectionLede` /
`kit.sectionLedeInk`. The `Ink` variant is the paper one.

**Buttons** — `kit.btn` plus one of `kit.btnLime` (primary), `kit.btnGhost`
(outlined, for use over photography); size with `kit.btnLg` / `kit.btnSm`.
`kit.quietLink` is the text-with-arrow link on navy and `kit.quietLinkInk` the
same link on paper — white on paper is invisible, so on any paper section reach
for the `Ink` variant, never for `kit.quietLink` plus a local repaint.
`kit.inlineLink` is the underlined one inside a paragraph and needs no variant:
it takes its colour from the text around it. Arrows take `kit.btnArrow` so they
slide on hover.

**Reveals** — `kit.reveal` wipes down, `kit.revealRise` rises 18px. Add the
class *and* `data-reveal`; MotionRoot fires each once. `kit.sectionHead` already
carries `kit.reveal`, so a head only needs `data-reveal`. Composing a class that
composes a reveal does **not** inherit it — name the reveal again.

**Also** — `kit.srOnly`.

**The compact apply bar is the homepage's, not the kit's.** MotionRoot reveals
it once `[data-hero]` has left the viewport, and the photographic hero is the
homepage's alone — so the class lives in `cinematic-home.module.css` and there
is no `kit.applyBar` to reach for. An interior page opens on the flat
`kit.pageHead` and closes on its own apply CTA; a persistent bar would add
nothing there and would cost 4.5rem of a 390-wide viewport on every route. The
kit keeps one half of it: `.page:has([data-apply-bar]) .footer` reserves matching
bottom padding, so if a page ever does render a bar the footer already gets out
of its way.

Tokens (`--ink`, `--lime`, `--paper`, `--on-ink-dim`, `--rule`, `--gutter`,
`--ease-out-expo`, …) are declared on `.page` and are in scope everywhere. Use
them; do not restate a hex value.

## Opening a page

**Every page opens on a photograph.** `kit.pageHead` is a full-bleed
photographic hero `clamp(560px, 76svh, 820px)` tall, built from:

- `kit.pageHeadArt` + `kit.pageHeadImage` — the photograph, `fill`, `priority`,
  `sizes="100vw"`. Crop it with `--head-focus` on a page-local class on the
  `<header>`; the kit default is `62% 48%`.
- `kit.pageHeadScrim` — a two-layer authored scrim, never a flat tint: a 100deg
  wash that is dark under the copy column and lets the far side of the frame
  stay lit, over a vertical fall that lands the bottom edge on `--ink` so the
  hero sits down into the seam below it.
- `kit.pageHeadInner` / `kit.pageHeadCol` — **one** left column, bottom-aligned.
  Eyebrow, then a two-line `kit.pageHeadTitle` (white line, then a
  `kit.pageHeadLime` line), then `kit.pageHeadLede` directly under the headline
  on the same left edge, then `kit.pageHeadActions` with a primary and a ghost
  CTA. The lede never moves to a second column.

Below 900px the height relaxes to `clamp(30rem, 74svh, 40rem)`, the scrim drops
to its vertical layer only and the column runs full width.

`kit.pageHeadFlat` / `kit.pageHeadRow` / `kit.pageHeadLedeFlat` are the old flat
navy band, kept for the two legal routes where a photograph would be pretence.

The header reads the page: with no `[data-hero]` element it is condensed from
first paint.

**One page, one frame.** Never run the same photograph twice in a page at the
same scale. Where the v2 set leaves no alternative (Services: the head and band
01 are the only fiber frame with a street in it), the two crops must differ
hard — the head establishes, the band pushes in on the detail.

## Standing prohibitions (from PRODUCT.md)

No invented people, photos of staff, testimonials, names or quotes. No counts of
reps, doors or markets, and no tickers or counters. No earnings figures, ranges
or averages. No guaranteed schedules, leads, territory or callback windows, and
no promise of availability in a given city. No per-city descriptive copy —
nothing in this codebase establishes anything about any market beyond its name.
No scroll-jacking, custom cursors, audio, particle fields or sections that
animate continuously. State only what `PRODUCT.md` lists as sourced.

## Skeleton

```tsx
import type { Metadata } from "next";
import kit from "../../_cinematic/cinematic.module.css";

export const metadata: Metadata = { title: "…", description: "…" };

export default function ServicesPage() {
  return (
    <>
      <header className={kit.pageHead}>
        <div className={kit.pageHeadArt}>
          <Image
            src="/redesign/v2/photos/…-1600.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className={kit.pageHeadImage}
          />
        </div>
        <div className={kit.pageHeadScrim} aria-hidden="true" />

        <div className={kit.pageHeadInner}>
          <div className={kit.pageHeadCol}>
            <p className={kit.pageHeadEyebrow}>What we sell</p>
            <h1 className={kit.pageHeadTitle}>
              Three products,
              <span className={kit.pageHeadLime}>one conversation.</span>
            </h1>
            <p className={kit.pageHeadLede}>One sentence that earns the page.</p>
            <div className={kit.pageHeadActions}>
              <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
                Apply now
              </Link>
              <a href="#how" className={`${kit.btn} ${kit.btnGhost} ${kit.btnLg}`}>
                See how
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* navy: ground only, never the seam */}
      <section id="what" className={kit.surfaceInk} aria-labelledby="what-title">
        <div className={kit.shell}>
          <header className={kit.sectionHead} data-reveal>
            <h2 id="what-title" className={kit.sectionTitle}>Section heading.</h2>
            <p className={kit.sectionLede}>The lede that sits opposite it.</p>
          </header>
          {/* section content */}
        </div>
      </section>

      {/* paper: ground + seam, and the Ink type variants */}
      <section id="how" className={`${kit.surfacePaper} ${kit.seam}`} aria-labelledby="how-title">
        <div className={kit.shell}>
          <header className={kit.sectionHeadInk} data-reveal>
            <h2 id="how-title" className={kit.sectionTitleInk}>How it works.</h2>
            <p className={kit.sectionLedeInk}>The lede on paper.</p>
          </header>
        </div>
      </section>
    </>
  );
}
```

Sections need their own vertical padding; the kit sets none. The homepage uses
`clamp(4.5rem, 9vw, 8.5rem)` on a full chapter and `clamp(4rem, 8vw, 7rem)` on a
lighter one — match those unless you have a reason.
