# RESUME — cinematic homepage snapshot

**Snapshot:** `/home/fazetwerpnerd69/dev/3cworldgroup-cinematic-20260918`
**Copied from:** polish snapshot `/home/fazetwerpnerd69/dev/3cworldgroup-polish-20260918`
(read-only, untouched) on 2026-09-18. Source `/home/fazetwerpnerd69/dev/3cworldgroup`
also read-only. Their dev servers on :3000 and :3118 must keep running.

**My port:** 3120, bound 127.0.0.1, started by me only, stopped before handoff.

## Current state

- copyready — rsync complete, `npm ci` clean, `package-lock.json` unchanged,
  0 symlinks, 0 env files. Baseline sha256 manifests of both read-only trees in
  `/tmp/3c-cinematic-orchestration-20260918/`.
- contractwritten — `PRODUCT.md` and `DESIGN.md` at snapshot root.
- Original `src/app/page.tsx` bytes preserved in `.cinematic-baseline/src/app/page.tsx`.
- implementationdone — homepage rebuilt; `tsc --noEmit` and scoped `eslint` clean.
- renderchecked — batched Playwright pass at 1440/390/768/1024 plus reduced-motion
  and JS-disabled contexts. Zero console errors, zero overflow.
- **finalreviewed** — independent Opus 5 review complete. Five real
  defects found and fixed: invented per-city geography removed; market arrow
  keys now step from the focused chip; the route draw no longer scrubs backwards
  and erase its own copy; the no-JS header got a `<noscript>` backdrop so white
  nav never lands on the paper sections; anchor targets got `scroll-margin-top`
  so the skip link clears the fixed header. Plus an `IntersectionObserver`
  availability guard and a non-focusable parked apply bar.
  Gates: `tsc --noEmit` clean, `next build` clean (exit 0, no warnings), scoped
  `eslint` clean, 49/49 browser checks, 0 console/page errors, 0 failed requests.
  Both read-only trees re-verified 783/783 hash-identical; `package-lock.json`
  byte-identical across all three trees. Full write-up:
  `docs/cinematic-review/FINAL-REVIEW.md`.

- **finalizefollowup (current)** — bounded three-item follow-up on the parent's
  final findings. (1) The page had no `main` landmark after bypassing
  PageWrapper; one `<main id="main-content">` now wraps hero→closing between the
  header and the footer, and `#the-work` got `tabIndex={-1}` so the skip link
  moves real focus. Measured: `main` is `display:block`, zero margin/padding,
  static, full width — no CSS change was needed and no style regression was
  found. (2) The market panel's copy no longer explains its own implementation
  or promises outreach: *"Choose your preferred market. Openings vary with
  client demand."* + *"Interested in working in {city}? Include your preferred
  location when you apply."*; the misleading internal comment was corrected.
  (3) Evidence is now real-viewport captures (`final-shots/vp-*.png`) taken at
  each section's actual scroll position with focus cleared and nothing
  disabled; the older `*-full-settled.png` full-page shots were deliberately
  NOT recaptured and their limitation is recorded in FINAL-REVIEW.md §8.3.
  Gates: `tsc` clean, scoped `eslint` clean, `npm run build` exit 0 with zero
  warnings, 25/25 follow-up browser checks, 0 console/page errors, 0 failed
  requests, no overflow at 390 or 1440, exactly one `main`. Both read-only trees
  re-verified 783/783; `:3000` and `:3118` still 200 and never signalled.
  Details: `docs/cinematic-review/FINAL-REVIEW.md` §8.

## Owned files

| file | state |
|---|---|
| `src/app/page.tsx` | replaced |
| `src/app/cinematic-home.module.css` | new |
| `src/app/_cinematic/*.tsx` | new |

Everything else — `/opportunities`, `/apply`, `/about`, `/services`,
`/contact`, the portal, the API, `layout.tsx`, `public.css`, `globals.css`,
`PageWrapper`, `Navbar`, `Footer` — is untouched from the polish snapshot.
This homepage bypasses `PageWrapper` on purpose (it renders its own header and
footer) so it escapes the `.public-site` cascade in `public.css`; that cascade
is unmodified and still serves every other route.

## Owned files (updated at final review)

`src/app/page.tsx` (replaced), `src/app/cinematic-home.module.css` (new),
`src/app/_cinematic/*` (new), `PRODUCT.md`, `DESIGN.md`, `.Codex/RESUME.md`,
`docs/cinematic-review/*`. Confirmed by diff against the polish tree: nothing
else in the snapshot differs from it.

## Next action

**Awaiting user visual acceptance.** Everything mechanical is done and green;
what remains is the user looking at the page and saying whether it lands.

A production preview is running at <http://127.0.0.1:3120> — **PID 426177**,
started as `npx next start -p 3120 -H 127.0.0.1` from the snapshot root against
the build of the follow-up pass. PID also in
`/tmp/3c-cinematic-orchestration-20260918/review-prod.pid`; log in
`final-prod-3120.log` beside it; stop with
`kill $(cat /tmp/3c-cinematic-orchestration-20260918/review-prod.pid)`.
Read `docs/cinematic-review/FINAL-REVIEW.md` first — section 7 lists the known
limitations and section 8 the follow-up pass, including the full-page
screenshot limitation and what was deliberately *not* re-verified. Start with
`final-shots/vp-*.png`: those are the real-viewport shots.

Never touch the servers on :3000 or :3118; both trees must stay hash-identical
to the baselines in `/tmp/3c-cinematic-orchestration-20260918/`.
