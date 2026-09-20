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

**Shell** — `kit.shell` (78rem, gutter), `kit.shellNarrow` (52rem). Every
section is `<section class={surface}><div class={kit.shell}>…`.

**Grounds** — `kit.surfaceInk` (navy), `kit.surfaceInkDeep`, `kit.surfacePaper`,
`kit.surfacePaperRaise`. Each sets background, text colour, the paper
`::selection` pair, and the anchor offset under the fixed header. Never write a
background colour on a section yourself.

**Seam** — `kit.seam`. **Every paper section carries it; no navy section ever
does.** It cuts the orthogonal step into the section's own top and bottom edges,
so navy/paper joints are never a bare horizontal line. Compose it alongside the
ground: `composes: surfacePaper seam from "…"`.

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

Only the homepage has the photographic hero. Everything else opens on
`kit.pageHead` — a navy band deep enough to clear the fixed header, with
`kit.pageHeadRow` (eyebrow + title left, lede right), `kit.pageHeadEyebrow`,
`kit.pageHeadTitle`, `kit.pageHeadLede`. It is not a reveal: it is the first
thing read, so it is simply there.

The header reads the page: with no `[data-hero]` element it is condensed from
the first paint, which is why the flat navy band matters — there is nothing for
a transparent header to be transparent over.

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
        <div className={kit.shell}>
          <div className={kit.pageHeadRow}>
            <div>
              <p className={kit.pageHeadEyebrow}>What we sell</p>
              <h1 className={kit.pageHeadTitle}>
                Three products,
                <br />
                one conversation.
              </h1>
            </div>
            <p className={kit.pageHeadLede}>One sentence that earns the page.</p>
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
