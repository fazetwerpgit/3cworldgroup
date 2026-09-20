# AUDIT — accessibility, performance and resilience

Independent audit of the cinematic build, 2026-09-20, against `http://127.0.0.1:3120`.
Routes: `/`, `/about`, `/services`, `/opportunities`, `/contact`, `/apply`.
`/privacy` and `/terms` excluded by instruction. Read-only: no page, component or
stylesheet was edited.

## Executive summary

1. **axe-core, 12 runs (6 routes × 1440/390): zero violations.** All 96 unresolved
   results were `color-contrast` on photography, which axe declines to judge.
2. **I measured those by pixel instead — 110 text blocks over photographs. None
   failed.** Worst body text 6.29:1, worst large display 7.56:1 at the 5th percentile;
   the worst single glyph pixel anywhere is 4.28:1. DESIGN.md's contrast claims hold.
3. **1 blocking finding:** `/contact` loads a **2.17 MB PNG** as its LCP element →
   **17.3 s LCP** on a fast-3G throttle.
4. **`sharp` is not installed**, so Next's image optimizer passes originals through
   unresized and unconverted. A 42×39 logo costs **349 KB on every route**.
5. **Form focus indicator is suppressed:** inputs set `outline-style: none` despite
   `:focus-visible` matching, leaving a 1px border at 2.82:1 against its own
   unfocused state. This contradicts DESIGN.md's documented 2px lime ring.
6. No-JS and `prefers-reduced-motion` are **clean on all six routes**; Firefox matches
   Chromium within 0.2%. **WebKit could not be run** (missing system libraries).
7. Counts: **1 blocking, 5 major, 5 minor.**

## What I could not test

- **WebKit.** The installed build needs 25+ shared libraries this Arch host does not
  have (`libicudata.so.74`, `libjxl.so.0.8`, `libavif.so.16`, `libflite*`, …). `ldd`
  confirms they are genuinely absent; installing them needs root. **WebKit is
  untested**, so Safari and every iOS browser remain unverified — and per the team's
  own device note, every rep is on an iPhone. This is the largest remaining gap.
- **A production build.** The server was restarted by another agent mid-audit and is
  now `next dev` (`Cache-Control: no-store`, dev overlay present), not the production
  build FINAL-REVIEW.md §8.5 describes. Byte totals, LCP timings and cache behaviour
  below are therefore **dev-mode figures and pessimistic**. Findings that rest on
  source assets or CSS (P1, P2, A1, R1) are unaffected.
- A real screen reader, and real mobile hardware.
- Keyboard traversal was done at 1440 only; 390 was checked for layout and tap
  targets, not tabbed end to end.

---

# Blocking

## P1 — `/contact` ships a 2.17 MB PNG as its LCP element

**Route:** `/contact`
**Evidence:** `/redesign/contact-three-c-hd-x4f.png` — 2,217,470 bytes on disk and on
the wire. Requested at `w=640`, natural 1841×1504, rendered **634×518**. It is the
LCP element (`img.contact-module__4OR70q__headArtImage`). Route total 3.47 MB against
a 0.74–2.33 MB range for every other route.
**LCP on a 1.6 Mbps / 150 ms throttle: 17,312 ms.** Next worst route is 6.35 s.
**Fix:** re-encode as WebP at roughly 1300px wide (the 2× of its rendered box). The
sibling photographs in `/redesign/v2/photos/` are already WebP at 194–236 KB for
comparable dimensions, so ~120–180 KB is the realistic target — a **90%+ reduction**
on the single asset that defines this route's LCP.

---

# Major

## P2 — `sharp` is missing, so the image optimizer is a pass-through

**Routes:** all six.
**Evidence:** `node_modules/sharp` does not exist (`require` → `MODULE_NOT_FOUND`).
Requesting the optimizer directly:

```
GET /_next/image?url=%2Flogo.png&w=48&q=75
→ 200, Content-Type: image/png, Content-Length: 356626
```

A 48-pixel-wide request returns the unmodified 504×472 source PNG. `next.config.mjs`
does **not** set `images.unoptimized`, so this is a missing-dependency failure, not a
configuration choice. Next 16 requires `sharp` for local optimization.
**Caveat, stated plainly:** if this deploys to Vercel, the platform optimizes images
and this will not reproduce there. For any self-hosted `next start`, it will.
**Fix:** `npm i sharp`, then re-measure. Confirm `Content-Type: image/webp` and a
resized response before trusting any byte figure in this document.

## P3 — `logo.png` costs 349 KB on every route for a 42×39 box

**Routes:** all six (header and footer).
**Evidence:** `public/logo.png` is 349 KB, 504×472, rendered at **42×39** in the
header and 34×32 in the footer — **12× oversized** in each dimension. It is the
largest single asset on five of the six routes.
**This is a source-asset problem independent of P2:** even with a working optimizer
the repository is carrying a 349 KB PNG for a 42px mark.
**Fix:** ship the logo as SVG, or as a 96×90 WebP (~3 KB). Either removes ~349 KB
from the cold load of every page on the site.

## A1 — form fields suppress the site's focus ring

**Routes:** `/contact`, `/apply`
**Evidence:** on a keyboard-focused first input, `:focus-visible` matches (`true`),
but computed style is `outline-style: none`, `box-shadow: none`. The only indicator is
the border changing to `--lime-ink` `#47700f`:

| | `/contact` | `/apply` |
|---|---|---|
| unfocused border | `rgba(16,31,56,.16)` 1px | `rgb(226,232,240)` **0px** |
| focused border | `#47700f` 1px | `#47700f` 1px |
| indicator vs unfocused state | **2.82:1** | 4.74:1 |

Links and buttons on the same pages get `outline: solid 2px #8dc63f` at a 3px offset,
so this is an override on form controls only. DESIGN.md ("Browser surfaces") states
the lime ring applies site-wide; it does not reach the two forms on the site.
2.82:1 is below the 3:1 that WCAG 2.2 SC 2.4.13 asks of a focus indicator. On
`/apply` the border also grows 0px→1px on focus, a 1px reflow per field.
**Screenshots:** `audit-shots/contact-input-FOCUSED.png` vs `contact-input-BLURRED.png`.
**Fix:** stop suppressing `outline` on `input`/`select`/`textarea:focus-visible`; let
them inherit the same 2px lime ring. Keep the border change as reinforcement, and give
`/apply` fields a 1px transparent border at rest so focus does not reflow.

## R1 — both forms fail silently with JavaScript disabled

**Routes:** `/contact`, `/apply`
**Evidence:** every other aspect of no-JS is clean (see R3), but `<form>` carries
**no `action` and no `method`** on both routes. With JS off, pressing the submit
button issues a GET to the same URL and the submission is lost with no message. The
single `<noscript>` block on each page contains only header CSS — no warning.
**Fix:** either a `<noscript>` notice inside each form pointing at
`info@3cworldgroup.com`, or a real `action` to a POST endpoint that progressively
enhances. Given `/apply` is the site's one conversion, the notice is the minimum.

## P4 — LCP exceeds 2.5 s on every route under throttling; CLS is close to the limit

**Routes:** all six. Measured at 1440×900, 1.6 Mbps / 150 ms via CDP.

| route | total | largest asset | LCP (unthrottled) | LCP (throttled) | CLS | imgs eager/lazy |
|---|---|---|---|---|---|---|
| `/` | 2.19 MB | logo.png 349 KB | 112 ms | **2,612 ms** | 0.000 | 2 / 18 |
| `/about` | 1.80 MB | logo.png 349 KB | 88 ms | **6,352 ms** | 0.066 | 2 / 6 |
| `/services` | 2.33 MB | logo.png 349 KB | 80 ms | **2,628 ms** | 0.063 | 1 / 6 |
| `/opportunities` | 1.71 MB | logo.png 349 KB | 72 ms | **2,644 ms** | **0.095** | 2 / 2 |
| `/contact` | 3.47 MB | contact PNG 2.17 MB | 84 ms | **17,312 ms** | 0.018 | 2 / 1 |
| `/apply` | 1.73 MB | logo.png 349 KB | 76 ms | **5,896 ms** | 0.091 | 2 / 2 |

CLS is one section-level shift per route (identical value across `section#glance`,
`div`, `p`, and `nav` on `/about`), consistent with a webfont swap reflowing a
section rather than an unsized image. `/` is clean at 0.000. Nothing exceeds the 0.1
"good" threshold, but 0.095 on `/opportunities` leaves no margin.
`/services` lazy-loads one image that is above the fold at 1440.
**Fix:** land P1 and P3 first — they account for most of the throttled LCP. Then
re-measure against a production build before tuning anything else; these numbers are
dev-mode. Set `fetchpriority="high"` on each route's hero image, drop `loading="lazy"`
from the above-fold `/services` image, and isolate the single shift with a prod trace.

**Shared photographs across routes.** `hero-wide-1600.webp`, `fiber-dusk-1600.webp`
and `security-dusk-1600.webp` are reused across `/`, `/about`, `/opportunities`,
`/services` and `/apply`. On a same-context walk they return as **304s of ~0.3 KB**
after the first route rather than re-downloading — `/apply` visited last cost 0.9 KB
in images total. That is correct behaviour, but it is dev's `must-revalidate`; in
production Next serves these `immutable` and they should not revalidate at all.

---

# Minor

## A2 — `/` marks no nav item as current

Every other route sets `aria-current="page"` on its header and footer link. On `/`,
no element carries `aria-current` at all, because the nav has no "Home" text link —
only the logo links to `/`. A screen-reader user tabbing the header on the homepage
gets no current-page cue, unlike on all five other routes.
**Fix:** `aria-current="page"` on the logo link when the route is `/`.

## A3 — the honeypot field is hidden visually but not from assistive tech

`/apply`, `input[name="website"]`, label "Website (leave blank)". It has
`tabindex="-1"` and its wrapper is at `left: -10000px`, so it is out of the tab order
— but it is not `aria-hidden="true"`, `display: none`, or `visibility: hidden`, so a
screen-reader user in browse mode still reaches it. The "leave blank" label mitigates
the risk; a user who fills it anyway has their application silently discarded.
**Fix:** add `aria-hidden="true"` to the wrapper.

## A4 — no error announcement mechanism on either form

`/contact` and `/apply` contain **zero** `aria-live`, `role="status"` or `role="alert"`
regions, and `aria-invalid` is never set on any field. Submitting both forms empty
relies entirely on native constraint validation: the browser focuses the first invalid
field (verified — `document.activeElement` became `input[name=name]`) and shows its own
bubble. That is functional and announced by most screen readers, but there is no
in-page error text, no error summary, and nothing that survives a server-side
rejection.
**Fix:** add a `role="alert"` container above each form for submit-time errors, and set
`aria-invalid="true"` plus `aria-describedby` on fields as they fail.

## A5 — market selector ignores Home and End

`/`, `#markets`. The pattern is otherwise good: `role="group"`, five native
`<button>`s with `aria-pressed`, all tab stops, an `aria-live="polite"` panel, and
Arrow Left/Right both move focus and change selection. `Home` and `End` do nothing.
**Fix:** map `Home`/`End` to the first and last chip, matching the arrow handler.

## A6 — small targets at 390

Footer links render **22px tall**; the header Apply button is 65×36 and the menu
toggle 40×40. WCAG 2.2 SC 2.5.8 (AA) asks 24×24 with a spacing exception that the
footer row may satisfy, so this is not a clear failure — but 22px and 36px are both
under the 44px iOS guidance, and every rep using this site is on an iPhone.
**Fix:** raise footer link line-height to give a 24px minimum box, and take the header
Apply to 44px tall.

---

# Verified clean

These were tested and found correct; recording them so the next pass need not redo them.

**axe-core.** 12 runs, WCAG 2.0/2.1/2.2 A+AA plus best-practice, after scrolling each
page to trigger every reveal. **Zero violations on all six routes at both viewports.**
The only tab stop without a focus ring outside A1 is `nextjs-portal`, the dev overlay —
a dev-mode artifact, excluded.

**Contrast, measured not assumed.** For each of 110 text blocks sitting over a
photograph I screenshotted the block, re-screenshotted it with glyphs forced
transparent, diffed the two to isolate the pixels the glyphs actually cover, and
computed the ratio of the text colour against each covered pixel's real backdrop.
Scroll position was asserted identical between the two captures. Reported at the 5th
percentile of covered pixels:

| route | worst large display | worst body |
|---|---|---|
| `/` | 5.81:1 ("the next door.", 390) | 8.68:1 |
| `/about` | 8.77:1 ("3C team.") | 6.29:1 |
| `/services` | 9.23:1 ("these services?") | 7.33:1 |
| `/opportunities` | 7.56:1 ("starts here.") | 8.56:1 |
| `/apply` | 8.97:1 ("first step.") | 6.29:1 |
| `/contact` | 17.77:1 | 10.05:1 |

Nothing fell below its floor (4.5 body / 3 large); nothing was even within 35% of it.
The single darkest glyph pixel found anywhere was 4.28:1, on `/apply` body text — still
clear. DESIGN.md's authored-scrim approach is doing what it claims.

**Keyboard and structure.** Skip link is the first tab stop on all six routes, becomes
visible on focus (it animates from `top: -64px` to `top: 16px` — an earlier reading of
mine that called it invisible was taken mid-transition), and moves **real focus** to
`#main-content`. Exactly one `<main>`, one `<h1>`, `lang="en"` per route. **No heading
level is skipped on any route** (sequences run 1,2,3,3,3,2,2 and similar). Focus order
follows DOM order throughout; the one apparent jump on `/contact` is the normal
left-column-then-right-column traversal of a two-column layout, not a defect. 21–40 tab
stops per route, no keyboard traps, no zero-size focusable elements other than the dev
overlay. FAQ rows are native `<details>`/`<summary>`, Enter toggles both ways, and the
summary carries the lime ring.

**Form labelling.** Every field on both forms has a real `<label for>`, most also
wrapping. `/apply` sets correct `autocomplete` on name, tel, email and
address-level2. Required fields are marked with `*` in the visible label text, so
requiredness is never colour-only.

**Nothing is conveyed by colour alone.** Prose links carry underlines (0 undecorated
across all six routes), selected market chips carry `aria-pressed` alongside the lime
fill, and required fields carry `*`.

**R2 — `prefers-reduced-motion: reduce`.** All six routes render complete: full text,
**zero** elements left at `opacity < 0.08`, no horizontal overflow, no broken images.
`data-motion` is correctly absent, so every pre-reveal state stays unarmed. Shots:
`audit-shots/reducedmotion-*.png`.

**R3 — JavaScript disabled.** All six routes render complete and readable: 1,242–3,768
characters of body text, **zero** invisible blocks, all images present, no horizontal
overflow. Navigation and every link work. The only no-JS defect is R1 above. Shots:
`audit-shots/nojs-*.png`.

**R4 — Firefox.** All six routes match Chromium within 0.2% document height, identical
visible text, zero hidden blocks, no overflow, no console or page errors.
`backdrop-filter`, `overflow-x: clip`, `clip-path`, `mask-size`, `100svh`, `:has()` and
`text-wrap: balance` all report supported. The one flagged delta — `/contact` 95
characters shorter — is Firefox excluding `<select>` option text from `innerText`, not a
rendering difference. Shots: `audit-shots/firefox-*.png` against
`audit-shots/chromium-*.png`.

**Mobile apply bar.** Present on `/` only (correct per PRODUCT.md's homepage scope),
parked off-screen at `top: 844` on load, rising to `top: 785` (59px tall) once
scrolled. It occludes no content at the bottom of the page. Shots:
`audit-shots/mobile-bottom-*.png`.

---

## Reproducing

Harness scripts are in the session scratchpad, not committed (this audit was read-only
apart from this file and `audit-shots/`). Each is a standalone Playwright script
against `127.0.0.1:3120`: axe injection from `node_modules/axe-core/axe.min.js`, the
glyph-diff contrast measurement, the CDP-throttled performance pass, and the
no-JS / reduced-motion / cross-browser pass. The three numbers most worth re-checking
after any fix are `/contact` throttled LCP, the `/_next/image` response
`Content-Type`, and the computed `outline-style` of a focused form input.

---

# Remediation

Worked in the `cinematic-home` worktree, 2026-09-20, after the audit above. All
numbers below are measured against a **production build** (`npm run build`, then
`next start` on 127.0.0.1:3121) at 1440×900 on the same 1.6 Mbps / 150 ms CDP
throttle the audit used — including the "before" column, which was re-measured on
a production build with the original assets restored, so this table does not
compare prod against the audit's dev-mode figures.

| route | total before | total after | LCP before | LCP after | CLS |
|---|---|---|---|---|---|
| `/` | 2,659 KB | **2,326 KB** | 1,984 ms | **1,904 ms** | 0.020 |
| `/about` | 2,083 KB | **1,750 KB** | 5,272 ms | **4,208 ms** | 0.066 |
| `/services` | 2,339 KB | **2,006 KB** | 1,964 ms | **1,836 ms** | 0.063 |
| `/opportunities` | 1,948 KB | **1,615 KB** | 1,944 ms | **1,840 ms** | 0.095 |
| `/contact` | 3,898 KB | **1,526 KB** | 15,264 ms | **2,860 ms** | 0.018 |
| `/apply` | 1,924 KB | **1,591 KB** | 4,380 ms | **3,268 ms** | 0.091 |

## P1 — `/contact` 2.17 MB PNG · fixed

`public/redesign/contact-three-c-hd-x4f.png` (2,217,470 B, 1860×1520) re-encoded
with ImageMagick to `contact-three-c-hd-x4f.webp` — **129,390 B, 1395×1140**, a
**94.2% reduction** on the asset and **2,372 KB off the route**. Throttled LCP
**15,264 ms → 2,860 ms (−81%)**. `/contact` is no longer the site's heaviest
route; it is now the lightest.

1395×1140 is exactly ¾ of the master, so the aspect ratio is bit-exact and every
fraction the composition is built on (the 0.4643 exit point, the 0.7018 run)
still resolves against the same geometry — the note at the top of
`contact.module.css` was updated to say so. 1395px is 2.2× the 634px box the mark
renders into at 1440 and 2.6× the 34rem box below 1024, so the existing `sizes`
is still describing the right thing. No `<picture>` fallback: the markup is a
single `next/image` and WebP needs none.

**Edge check, because the outline is the whole point.** The plate is opaque
`#000723`, darker than `--ink` `#061735` in every channel, and the mark composites
with `mix-blend-mode: lighten` — so the navy plate resolves to flat ink and any
banding in it is not merely acceptable, it is unobservable. What survives the
blend is only the lime outline and the street hairlines, which is where the
quality budget went (q80, method 6, sharp-YUV, Lanczos downscale). Composited
against `--ink` at the true 634px render box, the re-encode is **42.1 dB PSNR**
against the master through the identical pipeline; at 3× and 4× zoom on the
street-dense interior of the "3" and on the diagonal's exit at the bottom edge,
the hairlines and the outline are indistinguishable from the master. Checked at
1440 and 390: the diagonal leaves the mark at the same point and lands on the
same lime node on the hairline below it.

The 2.2 MB master is not deleted — it moved to
`assets/redesign-masters/contact-three-c-hd-x4f.png`, out of `public/` so it is no
longer part of the deploy's static route, and kept so the mark can be re-encoded
without regenerating art.

## P3 — `logo.png` 349 KB on every route · fixed

`public/logo.png` (356,626 B, 550×516) re-encoded to **`public/logo.webp`,
15,518 B, 275×258 — a 95.6% reduction**, and all eight `src="/logo.png"`
references repointed (`SiteHeader`, `SiteFooter`, `Navbar`, `Footer`,
`PortalHeader`, `AuthShell`, `LoginForm`, `SignupForm`). **333 KB comes off the
cold load of all six public routes** — the table above is that saving on the five
routes that are not `/contact`. The portal and auth screens get it too.

275×258 is exactly half the master and the largest box the mark renders into is
76px (`Navbar` above 1000px), so this is still **3.6× at the biggest usage** and
2.7–7× everywhere else. Compared against the master at 228px (3× of 76px) over
navy the two are indistinguishable; the globe's gradients are why this is WebP
and not an indexed PNG, which bands them at any size worth shipping.

`public/logo.png` itself is left in place at full resolution. It is the source
`scripts/generate-pwa-icons.mjs` reads to build the 192/512 icon set, and it is a
plausible external hotlink; it is no longer requested by any route, which is what
the finding was about.

## A1 — suppressed focus ring on form controls · fixed

`outline: none` removed from `.input:focus` in both
`contact.module.css` and `apply.module.css`, replaced by an explicit
`:focus-visible` rule carrying the kit's ring unchanged — `outline: 2px solid
var(--lime)` at `outline-offset: 3px` — plus a 1px `var(--ink)` `box-shadow`
hairline on the field's own edge.

The hairline is there because the documented ring alone does not pass on these
two pages: lime `#8dc63f` measures **1.83:1** against the contact plate
(`#eef3f8`) and **1.94:1** against the apply plate (`#f7f9fc`), both under the
3:1 SC 1.4.11 asks of a focus indicator. Ink against those plates is
**15.92:1** and **16.85:1**, and lime against ink is **8.70:1**, so the compound
indicator clears 3:1 on every edge. The hairline sits *inside* the ring rather
than filling the 3px offset (which was the first attempt) so the lime still
reads as the ring rather than as an edge on a navy band. On a navy surface the
hairline vanishes and what is left is exactly the kit ring; no form control on
either route sits on navy today, and links and buttons that do were already
correct at 8.70:1.

Verified on the production build, **every field on both routes keyboard-focused
one at a time** — 5 controls on `/contact` (including the `<select>` and the
`<textarea>`) and 5 on `/apply`: `:focus-visible` matches, computed outline is
`solid 2px rgb(141,198,63)` at `3px`, shadow is `rgb(6,23,53) 0 0 0 1px`.

**The 0px→1px reflow the audit reports on `/apply` does not exist.** Every
`.input` on that page computes a 1px `rgba(16,31,56,.16)` border both unfocused
and focused — `reflow=false` on all five. The 0px/`rgb(226,232,240)` pair the
audit measured is Tailwind preflight on `input[name="website"]`, the honeypot,
which is the literal first `<input>` in the form but carries no `.input` class
and is not a tab stop. No change was needed and none was made.

## R1 — forms fail silently with JavaScript off · fixed

A `<noscript>` notice now sits inside both forms, above the submit:
`/contact` points at `info@3cworldgroup.com`, `/apply` at
`careers@3cworldgroup.com` with the three fields to include. Verified by loading
both routes on the production build with `javaScriptEnabled: false` — the notice
renders, is visible, and is inside the `<form>`. No `action` was invented: there
is no endpoint behind `/contact` yet (the simulated submit is deliberate and
documented in `ContactForm.tsx`), and the audit names the notice as the minimum.

## P4 — LCP over 2.5 s under throttling · improved, not closed

See the table. Every route improved; `/contact` closed. **`/about` (4,208 ms) and
`/apply` (3,268 ms) are still over 2.5 s**, and the cause is now singular and
identified: on both, the LCP element is a shared photograph — `security-dusk-1600.webp`
(218 KB) and `hero-wide-1600.webp` (199 KB) — **requested at `w=1920` and returned
unresized and unconverted, because `sharp` is absent (P2)**. These are correctly
sized source files; what is missing is the optimizer that would cut them to the
box they render into. That is P2's fix, not an asset fix.

`fetchpriority="high"` was already correct everywhere: `next/image`'s `priority`
sets it, and every hero on every route already had `priority`. The one real
finding here — `/services` lazy-loading an above-fold image — is fixed: the first
of the three `.band` photographs now takes `priority={i === 0}`, the two below it
stay lazy. CLS is unchanged on all six routes (`/opportunities` still 0.095); the
shift is a font swap, not an asset, and closing it is a separate piece of work.

The 402 KB CSS chunk is now the largest single asset on five of six routes. Out of
scope here, but it is the next thing worth measuring.

## A2 — `/` marks no nav item as current · fixed

`aria-current="page"` on the header's logo link when `pathname === "/"`, in
`SiteHeader.tsx`. It is the only link to `/` in the chrome, which is why the
homepage was the one route with no current-page cue. Verified: `/` now exposes
exactly one `aria-current` element, the "3C World Group home" link.

## A3 — honeypot not hidden from assistive tech · already correct

No change. `ApplyFlow.tsx` already wraps the honeypot in
`<div aria-hidden="true" className={styles.honeypot}>`, and the production DOM
confirms `aria-hidden="true"` with `tabIndex -1` on the input. The finding does
not reproduce against the committed code.

## A4 — no error announcement on either form · fixed

Both forms now carry a `role="alert" aria-live="assertive"` region that is **in
the DOM from first paint and empty**, rather than being mounted at the moment it
has something to say — a live region that appears with its text is not reliably
announced. `.formError:empty { display: none }` keeps an empty region from
drawing a bar or taking a row of the form's grid gap.

`aria-invalid` is now set per field, driven by the control's own `invalid` event
(which the browser fires on submit) and cleared as that field is edited — so the
native bubble and the accessibility tree say the same thing. Five fields on
`/contact`, four on `/apply` (the optional referral field is excluded).

One real bug fell out of this: `/apply` only ever rendered `submitError` when its
code was `account_exists`. **Every other server rejection rendered nothing at
all** and left the reader with a submit button that had silently stopped working.
The region now carries every rejection; the "Sign in" link stays conditional.

## A5 — market selector ignores Home and End · fixed

`Home` and `End` map to the first and last chip in `LocationExplorer.tsx`,
matching the existing arrow handler: focus moves and selection follows. Verified
on the production build — `End` lands on Grand Rapids with `aria-pressed="true"`,
`Home` returns to Birmingham with `aria-pressed="true"`.

## A6 — small targets at 390 · fixed

Footer links were a 22px box; `.footerNav a` is now `inline-flex` with
`min-height: 24px`, clearing SC 2.5.8 without relying on the spacing exception.
Measured at 390: **24px**, and nothing moved — the existing row gap already
exceeds the 1px added either side.

Below 900px, where the nav collapses and the header becomes a phone header, the
two controls left in the row go to Apple's 44px minimum: the Apply button is
**65×44** (was 65×36) and the menu toggle **44×44** (was 40×40).

## P2 — `sharp` missing · NOT actionable here

Unchanged, deliberately. The fix is `npm i sharp`, which adds a dependency, and
the brief for this pass excludes that. Recording what is now true so the decision
can be made on facts:

- It still reproduces. `GET /_next/image?url=%2Flogo.webp&w=48&q=75` against the
  production build returns `Content-Type: image/webp`, `Content-Length: 15518` —
  the whole 275px file for a 48px request. Still a pass-through.
- **It costs far less than it did.** The two assets that made the pass-through
  expensive were the 2.17 MB PNG and the 349 KB logo; a 48px request that used to
  return 349 KB now returns 15 KB.
- **It is now the only thing standing between `/about` and `/apply` and a passing
  LCP.** Both LCP elements are correctly-sized source photographs asked for at
  `w=1920` and handed back whole.
- On Vercel the platform optimizes images and none of this reproduces. It only
  bites a self-hosted `next start`. That is the decision: if this deploys to
  Vercel, P2 is a non-issue; if it is self-hosted, `npm i sharp` is worth roughly
  a second of LCP on two routes.

## Also not actionable here

**WebKit** remains untested, for the reason the audit gives: the missing shared
libraries need root to install. Safari and every iOS browser are still unverified,
and per the team's device note every rep is on an iPhone — this is still the
largest open gap and nothing in this pass changed it.

## Gates

`npx tsc --noEmit` — clean but for the one pre-existing unrelated error in
`src/app/api/portal/auth/signup/route.test.ts`.
`npx eslint src/app src/components` — clean but for the one pre-existing error in
`EsignSignAction.tsx`.
`npm run build` — passes.
`docs/cinematic/crawl.mjs` — all nine routes 200, **0 console errors** (the two
`<noscript>` blocks hydrate clean), no overflow, cinematic chrome on every route.
All eight shot scripts (`r2-shots`, `r3-shots`, `shots-about`, `shots-apply`,
`shots-careers`, `shots-contact`, `shots-legal`, `shots-services`) pass, including
contact's no-JS and reduced-motion assertions and apply's live POST check.
