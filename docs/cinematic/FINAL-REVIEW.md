# Final independent review — cinematic field-sales homepage

**Reviewer:** Opus 5, independent of the implementing agent. **Date:** 2026-09-18.
**Tree:** `/home/fazetwerpnerd69/dev/3cworldgroup-cinematic-20260918` (scope: `/` only).
**Preview:** production build at <http://127.0.0.1:3120> — see *Preview server* below.

Verdict: the page is sound and the four parent concerns are resolved. Five real
defects were found and fixed in this pass; everything else the parent flagged
turned out to be either already fixed by the author or an artifact of how the
evidence was captured. **User visual acceptance is still pending** — nothing here
substitutes for the user looking at it.

---

## 1. What I changed, and why

| # | Defect | Fix | File |
|---|---|---|---|
| 1 | **Invented per-city geography.** Every market carried a blurb the codebase does not support — "Alabama's largest metro… short drive of the city core", "dense residential blocks close in and newer build-out further out" (Grand Rapids), "Florida's largest city by land area", "mid-Michigan… a lot of ground in a day on foot". None of it is sourced, and none of it helps an applicant choose. | Removed all five. The explorer now carries the five names, the five existing skyline images, and one shared sourced line — *"Openings change by market based on client demand"* — plus a city-named call to action. | `_cinematic/LocationExplorer.tsx` |
| 2 | **Arrow keys stepped from the selected chip, not the focused one.** All five chips are tab stops, so a reader could tab onto Atlanta, press →, and watch the selection jump from wherever the *selection* was instead of from where they were looking. | Step is taken from the focused button. Added `role="group"` + `aria-label="Markets"` so the set is announced as one thing. | `_cinematic/LocationExplorer.tsx` |
| 3 | **The route draw scrubbed backwards.** Scrolling back up erased the drawn line and faded out all four "how you start" steps — four blocks of real copy vanishing because the reader scrolled up to re-read them. It also left the section blank in any screenshot taken at the top of the page. | The draw is now one-way: progress only ever increases. Drawing is the flourish; the words are not. | `_cinematic/MotionRoot.tsx` |
| 4 | **Without JavaScript the fixed header was unreadable over the two paper sections.** The navy backdrop is applied by a scroll listener, so with scripting off the white nav sat directly on `#f4f0e6`. Verified visually before the fix. | A `<noscript>` style gives the header its backdrop up front. The only thing lost with scripting off is the transparent opening. | `page.tsx` |
| 5 | **In-page anchors landed under the fixed header,** including the skip link — a keyboard user's first action on the page. | `scroll-margin-top: 5.5rem` on the four anchor targets. Set on the targets, not on `:global(html)`, so nothing leaks past this page. | `cinematic-home.module.css` |

Two smaller hardening changes, same pass:

- **`IntersectionObserver` guard** (`MotionRoot.tsx`). Every pre-reveal style is
  gated on `data-motion="on"`, and the thing that takes it back off is an
  IntersectionObserver. If IO were unavailable the gate would close on content
  with nothing left to open it. `data-motion` is now only set when IO exists.
- **The parked mobile apply bar is no longer focusable** (`cinematic-home.module.css`).
  It was `transform: translateY(100%)` only, so its Apply link stayed in the tab
  order while sitting off the bottom of the screen. Now `visibility: hidden`
  until `data-visible`, with the visibility flip delayed so the slide still reads.

### Files modified by me

| file | sha256 (first 16) |
|---|---|
| `src/app/page.tsx` | `b5b2caf7048e0ad8` (updated in the follow-up pass, §8) |
| `src/app/_cinematic/LocationExplorer.tsx` | `81c084808bb14fbc` (updated in the follow-up pass, §8) |
| `src/app/_cinematic/MotionRoot.tsx` | `7cd489802fe7a80b` |
| `src/app/cinematic-home.module.css` | `e480655346bd7be8` |
| `PRODUCT.md` (added the per-city prohibition) | `1e45fde4bf5d1f11` |

Added: `docs/cinematic-review/final-verify.mjs`, `verification.json`,
`final-shots/`, this file. No other route, component, config, dependency or
lockfile touched — see *Scope* below.

---

## 2. The parent's four concerns

**1 — Untriggered reveals / blank headings in the evidence.** The `clip-path`
bug the author identified was genuinely fixed before I arrived: the section-head
wipe uses `mask-size`, which is paint-only and leaves IntersectionObserver
geometry intact. I confirmed independently that all 8 `[data-reveal]` targets
fire, that no heading anywhere renders below opacity 0.95 or at zero height, and
that nothing is hidden under reduced motion or with scripting off.

The blank regions in the *original* screenshots had a second cause I traced
separately: `globals.css` (inherited, untouched) sets `scroll-behavior: smooth`,
so `window.scrollTo(0, 0)` is a ~1.1 s animation. A capture 900 ms later lands
mid-flight, which is what put a `position: fixed` header in the middle of a
full-page screenshot. The header was never broken. Every capture in
`final-shots/` now walks the entire document, returns to the top, **polls until
`scrollY` is actually 0**, and refuses to fire otherwise; each one records the
header's measured top offset (0 px in all of them).

**2 — Unsupported city and operational claims.** Fixed as above. Auditing the
rest of the copy against the inherited site:

| claim on the page | source |
|---|---|
| 1099 independent contractor | `src/app/apply/page.tsx`, `src/app/terms/page.tsx` |
| commission-only, uncapped; effort drives earnings | `src/app/apply/page.tsx` |
| trained on products, people and sales process; hands-on coaching; support in the field, not just a classroom | `src/app/opportunities/page.tsx` |
| fiber internet, TV, home security from leading providers | `src/app/services/page.tsx`, root metadata |
| apply → conversation → training → field | `pathSteps` and `startSteps`, inherited `/` and `/opportunities` |
| "the training happens before anyone sends you out" | the inherited ordering above: Training precedes "Start earning" / "step into the field" |
| "someone from the team will reach out to talk about the opportunity" | inherited startStep 3, *"We'll reach out to talk about the opportunity."* |
| the five market names | inherited homepage `markets` array |
| openings change by market with client demand | inherited homepage markets intro, verbatim |

Automated copy assertions (in `verification.json`): no dollar figures, no
counts, no "guarantee", no callback window. The inherited `/opportunities` page
does carry earnings bands and a "48h callback" stat — **none of that is repeated
on this homepage**, and I did not touch that page. The city images are the
existing skyline renders; nothing on the page implies they are photographs of
3C staff, and there are no people, testimonials or quotes anywhere.

**3 — Semantics, keyboard, CTAs, real motion.** All verified in a browser
against the production build: five `aria-pressed` native buttons in a labelled
group, click / Enter / arrow keys each move selection and focus with the panel
heading and artwork following, `aria-live="polite"` on the panel; six exclusive
native `<details>`, operable by click and by keyboard, and still operable with
no JS at all; the mobile sheet closes on Escape (returning focus to the toggle)
and on link selection; the apply bar never overlaps footer content (footer
reserves `6.6rem + safe-area`) and is unfocusable while parked. Every internal
href resolves 200 — `/about /services /opportunities /contact /apply /portal
/privacy /terms` — and the single in-page anchor has a target. Eight `/apply`
links. The page has no form and posts nothing; **no submission was made and no
backend write was performed**.

Motion is real, not stills. `--route-progress` measured across a fresh scroll:
`0.000 → 0.097 → 0.347 → 0.557 → 0.731 → 0.869 → 0.962 → 1.000`, monotonic, with
`stroke-dashoffset` tracking it and stops arriving `0 → 1 → 2 → 3 → 4` in order.
The sticky chapter stage moves `0 → 1 → 2` as you read. Under
`prefers-reduced-motion: reduce` none of it runs, `data-motion` is never set,
and nothing is hidden — but the selector and the chapter stage still work,
because those are navigation, not decoration.

**4 — Visual renders.** Captured at 390 / 768 / 1024 / 1440 / 1920 and swept
across 23 widths from 320 to 2560. No horizontal overflow at any of them
(`scrollWidth === clientWidth` throughout). No clipped or faded headlines —
I checked this against each text node's clipping ancestor rather than by
`scrollHeight`, because an `overflow: hidden` line mask on a display face always
reports a taller ink box than line box without anything being cut; the 320 px
headline was inspected by eye and is clean. Fonts resolve properly: body is
`Geist, "Geist Fallback", system-ui` at 16 px (`--font-geist-sans` is defined on
`<body>` by `next/font` and both faces report loaded), display is Bebas Neue —
no unresolved variable. Mobile hero content fills 55 % of a 844 px viewport and
ends within it, so no excessive dead space.

---

## 3. Quality gates

| gate | result |
|---|---|
| `npx tsc --noEmit` | **clean** (whole project) |
| `npm run build` (`next build`) | **clean**, exit 0, `✓ Compiled successfully`, zero warnings; `/` prerendered static |
| `npx eslint src/app/page.tsx src/app/_cinematic` | **clean**, zero errors, zero warnings |
| existing homepage tests | **none exist.** `e2e/` is empty; every `*.test.*` under `src/` is portal / sales / lib / hooks. Per the brief I did not run the unrelated suites. |
| browser verification | **49/49 pass** — `docs/cinematic-review/verification.json` |
| console errors / page errors / failed requests | **0 / 0 / 0**, across six contexts (1440, width sweep, mobile 390, reduced motion, no-JS, fresh reloads) |

LSP was unavailable, so `tsc --noEmit` plus scoped ESLint is the documented
diagnostic fallback. No inherited lint warnings surfaced in the scoped run; I
did not lint the whole repo, so I cannot speak to pre-existing warnings
elsewhere.

The build did not race a dev server: my own `:3120` was stopped before each
build and restarted afterwards. `:3000` and `:3118` were never signalled, and no
process was ever killed by pattern — only by my own recorded PID.

---

## 4. Isolation and scope

| check | result |
|---|---|
| `/home/fazetwerpnerd69/dev/3cworldgroup` vs `BASELINE-3cworldgroup.sha256` | **783/783 OK, zero mismatches** |
| `/home/fazetwerpnerd69/dev/3cworldgroup-polish-20260918` vs its baseline | **783/783 OK, zero mismatches** |
| external changes needing report | **none** — neither read-only tree changed at all, so there was nothing to repair or attribute |
| `:3000` health | 200 |
| `:3118` health | 200 |
| `package-lock.json` | byte-identical across all three trees (`f89b6ec318ba015b`) — no new dependencies |
| scope drift vs the polish tree | only `src/app/page.tsx` differs, plus the new `src/app/_cinematic/`, `src/app/cinematic-home.module.css`, `PRODUCT.md`, `DESIGN.md`. Nothing else. |

Verification output: `/tmp/3c-cinematic-orchestration-20260918/REVIEW-VERIFY-3cworldgroup.txt`
and `REVIEW-VERIFY-polish.txt`.

---

## 5. Preview server

| | |
|---|---|
| URL | <http://127.0.0.1:3120> |
| mode | **production** — `npx next start` against a fresh `next build` |
| PID | recorded in `/tmp/3c-cinematic-orchestration-20260918/review-prod.pid` |
| cwd | `/home/fazetwerpnerd69/dev/3cworldgroup-cinematic-20260918` |
| stop | `kill $(cat /tmp/3c-cinematic-orchestration-20260918/review-prod.pid)` |
| log | `/tmp/3c-cinematic-orchestration-20260918/review-prod-3120.log` |
| health | `/` 200; `/about /services /opportunities /apply /contact /privacy /terms` all 200 |

`Firebase Admin: No valid credentials found` appears in the log. That is
expected in this snapshot — no `.env` files were copied — and it does not affect
the homepage, which is static and calls nothing.

---

## 6. Evidence

`docs/cinematic-review/final-shots/` — all full-page shots taken at a verified
`scrollY === 0` with the header measured at top:

| file | what it shows |
|---|---|
| `1440-full-settled.png` | whole page, desktop, every reveal fired |
| `1920-full-settled.png`, `1024-full-settled.png`, `768-full-settled.png` | whole page at the other named widths |
| `390-full-settled.png` | whole page, mobile (Pixel 7 DPR, so 1024 px wide for a 390 px viewport) |
| `1440-route-drawn.png` | the route mid/post draw |
| `1440-markets-keyboard.png` | market selector after arrow-key navigation |
| `1440-faq-open.png` | FAQ open |
| `1440-skiplink-landing.png` | where the skip link lands, clear of the header |
| `390-menu-open.png` | mobile navigation sheet |
| `390-applybar-footer.png` | apply bar at the page bottom, not covering the footer |
| `1440-reduced-motion-full.png` | whole page under `prefers-reduced-motion: reduce` |
| `1440-nojs-full.png` | whole page with JavaScript disabled |
| `1440-nojs-header-over-paper.png` | the no-JS header fix, parked over the cream route section |

Machine-readable: `docs/cinematic-review/verification.json` (49 checks with
measured values). Reproduce: `node docs/cinematic-review/final-verify.mjs` with a
server on `127.0.0.1:3120`.

---

## 7. Known limitations — stated honestly

- **User visual acceptance is pending.** Automated checks cannot tell you whether
  this looks good. That call is the user's.
- **This is not a comprehensive accessibility audit.** I verified specific,
  named behaviours — roles, `aria-pressed`, `aria-live`, focus return, Escape,
  tab order, skip link, reduced motion, no-JS. I did not run axe, did not test a
  real screen reader, and did not audit every contrast pair. The author's
  measured contrast figures in `REVIEW-PACKET.md` are their measurements; I did
  not re-verify them.
- **No real submission was tested.** The homepage links to `/apply`; I confirmed
  the href resolves 200 and nothing more. The application form itself is out of
  scope and untouched.
- **Chromium only.** One engine, via the bundled Playwright build. No Firefox,
  no WebKit, no real mobile hardware. `backdrop-filter`, `mask-size` and
  `overflow-x: clip` all have good support but were verified in one engine.
- **`REVIEW-PACKET.md` says the explorer is "one tab stop plus arrow keys".**
  That was never true — there is no roving `tabindex`, so all five chips are tab
  stops. That is a perfectly good pattern and I kept it; the packet's sentence is
  simply inaccurate and is superseded by this document.
- **The one-way route draw is a deliberate trade.** Re-watching the draw now
  requires a reload. I judged four blocks of copy staying on screen to be worth
  more than a repeatable animation.
- **The width sweep is 23 discrete widths, not truly continuous.** Between-step
  regressions are possible, though the layout is fluid `clamp()`-based
  throughout and nothing in the sweep suggested a cliff.
- **Copy sourcing is by inspection, not by the client.** Every claim traces to
  text already live in this codebase. Whether that inherited text is itself
  accurate is a question only 3C can answer.

---

## 8. Bounded follow-up pass — 2026-09-18, after the parent's final findings

Three corrections only. No design rewrite, no exploratory work, nothing outside
this tree. 25/25 follow-up checks pass — `verification.json` → `finalize`.
Reproduce: `node docs/cinematic-review/finalize-verify.mjs` against
`127.0.0.1:3120`.

### 8.1 — The page had no `main` landmark

Bypassing `PageWrapper` also bypassed the `<main>` it renders, so this page had
none: the header, all seven content sections, the footer and the apply bar sat
as siblings with no landmark separating navigation from content. A screen
reader user got no "skip to main" and no main region to jump to.

Fixed in `src/app/page.tsx`: one `<main id="main-content">` now wraps the seven
content sections — hero through closing — sitting between `SiteHeader` and the
footer. The skip link, the `<noscript>` style, the footer and the apply bar are
deliberately outside it.

**Geometry is unchanged.** `.page` is a plain block with no `display: grid` or
`flex`, and nothing in `cinematic-home.module.css` uses a `>` combinator against
it, so a block-level wrapper changes no cascade and no layout. Measured rather
than assumed: the `main` computes `display: block`, zero margin, zero padding,
`position: static`, `transform: none`, `contain: none`, and its width equals the
document client width. No style regression was found, so no CSS change was
needed. Every `querySelector` in `MotionRoot` and `LocationExplorer` is a
descendant lookup, so all motion and interaction still bind.

The skip link keeps targeting `#the-work` ("Skip to the role" — the useful
landing spot, not the top of the hero it already occupies). That section now
carries `tabIndex={-1}` so activating the link moves **real focus**, not just
the scroll position; verified on a fresh load: `document.activeElement` is
`#the-work` and it lands 88 px down the viewport, clear of the 62 px header.

Verified: exactly one `<main>`, zero `[role="main"]`, at both 1440 and 390.

### 8.2 — The market panel explained itself instead of talking to applicants

The replacement copy leaked implementation detail at the reader ("Picking a city
here only changes what you are reading") and then promised outreach the page
cannot promise ("Someone from the team will reach out to talk about the
opportunity there").

Now, in `_cinematic/LocationExplorer.tsx`:

- **Panel note:** *"Choose your preferred market. Openings vary with client demand."*
- **Next step:** *"Interested in working in {city}? Include your preferred location when you apply."*

No promise of an opening, a callback, or a prefilled application. The internal
comment that described selection as changing "the name you are applying under"
now says what it actually does — change the selected market shown in the panel.
No other copy on the page was touched.

Asserted automatically: the business copy is present, the city-specific step
matches per selection (checked by switching to Jacksonville and back), and none
of `Picking a city here` / `only changes what you are reading` / `Someone from
the team will reach out` / `name you are applying under` / `guarantee` /
`we will call` / `pre-fill` appears anywhere in the rendered page.

### 8.3 — Evidence: real viewport shots, and an honest note about the full-page ones

The `*-full-settled.png` captures are honest about layout but misrepresent the
route: a full-page shot is stitched after a forced return to scroll 0, so
scroll-position-dependent state — the route draw, the sticky chapter stage, the
parked apply bar — is photographed at the top of the page rather than where a
reader meets it, and one earlier capture caught a focused skip link, which made
the fixed header look displaced. **They were not recaptured**; recapturing them
would not fix the format's limitation. They remain in `final-shots/` and this
paragraph is the caveat that travels with them.

The authoritative visual evidence is now these real-viewport captures — no
`fullPage`, focus cleared, the smooth scroll polled to a stop, 1200 ms settle,
and **nothing disabled**: the entrance, the reveals and the route draw all ran
live exactly as shipped.

| file | viewport | scrollY | header top | what it shows |
|---|---|---|---|---|
| `vp-1440-hero.png` | 1440×900 | 0 | 0 px | hero as it opens, header pinned, no focus artefact |
| `vp-1440-work.png` | 1440×900 | 812 | 0 px | the work section at its own scroll position |
| `vp-1440-route-drawn.png` | 1440×900 | 2328 | 0 px | the route where it is actually read, line fully drawn |
| `vp-1440-markets.png` | 1440×900 | 3363 | 0 px | the market selector with the corrected copy |
| `vp-390-hero.png` | 390×844 | 0 | 0 px | mobile hero, header pinned |

At the route's real scroll position: `--route-progress` = 1, `stroke-dashoffset`
0 px, 4/4 stops arrived, section within the viewport.

### 8.4 — Re-checks after the change

| check | result |
|---|---|
| `npx tsc --noEmit` | clean, exit 0 |
| `npx eslint src/app/page.tsx src/app/_cinematic` | clean, 0 errors, 0 warnings |
| `npm run build` | **exit 0**, `✓ Compiled successfully`, zero warnings, `/` still prerendered static (`/tmp/3c-cinematic-orchestration-20260918/finalize-build.log`) |
| exactly one `main` | yes, at 1440 and 390 |
| hero header at top in a real viewport | 0 px, focus cleared |
| market copy | corrected; banned phrases absent |
| primary hero CTA | `/apply`; 8 `/apply` links on the page |
| all reveal headings on a normal scroll | 8/8 shown, min opacity 1.000 |
| route visible at its actual scroll position | yes — progress 1, 4/4 stops |
| horizontal overflow | none at 390 or 1440 (`scrollWidth === clientWidth`) |
| console errors / page errors / failed requests | 0 / 0 / 0 |
| routes on :3120 | `/ /about /services /opportunities /apply /contact /privacy /terms /portal` all 200 |
| `/home/fazetwerpnerd69/dev/3cworldgroup` vs baseline | **783/783 OK** (`/tmp/3c-cinematic-orchestration-20260918/FINALIZE-VERIFY-3cworldgroup.txt`) |
| `/home/fazetwerpnerd69/dev/3cworldgroup-polish-20260918` vs baseline | **783/783 OK** (`FINALIZE-VERIFY-polish.txt`) |
| `:3000` / `:3118` health | 200 / 200, never signalled |

No form was submitted, no backend write was made, no commit was created, no
secret was read or written, and the only process stopped was my own recorded
:3120 PID (412158), replaced by the new one below.

### 8.5 — Preview server after this pass

| | |
|---|---|
| URL | <http://127.0.0.1:3120> |
| mode | production — `npx next start -p 3120 -H 127.0.0.1`, against the build above |
| PID | **426177** — also in `/tmp/3c-cinematic-orchestration-20260918/review-prod.pid` |
| log | `/tmp/3c-cinematic-orchestration-20260918/final-prod-3120.log` |
| stop | `kill $(cat /tmp/3c-cinematic-orchestration-20260918/review-prod.pid)` |
| state | **left running** for the user's visual acceptance |

### 8.6 — What this pass did not do

It did not re-run the full 49-check suite from §3 — those results stand as
recorded and were not invalidated by these edits; the follow-up suite re-checks
the parts that could have been. It did not recapture the full-page shots (§8.3),
re-audit copy sourcing, or touch the design. Chromium only, still.
