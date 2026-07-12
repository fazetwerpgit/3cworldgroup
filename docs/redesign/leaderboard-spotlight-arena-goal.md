# Leaderboard "Spotlight Arena" Re-skin — Visual Parity Goal

**Status: ACTIVE — do not close until the exit criterion is met.**

## The contract

The live leaderboard page (`/portal/leaderboard`) must be a **1:1 visual match**
of the approved mockup. Not "close enough" — the exact same design.

- **Reference image (approved by client):** `.superpowers/sdd/shots/r5v2-spotlight-arena.png`
- **Reference HTML (the spec for exact CSS values):** `design-mockups/leaderboard-round5/spotlight-arena.html`

## What 1:1 means

Every one of these must be indistinguishable from the reference at 1440px:

1. **Masthead:** kicker `MONTH TO DATE / RANKED BY POINTS`, giant LEADERBOARD
   headline (same scale/weight/tracking, white with soft glow in dark mode),
   two-line tagline, YOUR STANDING card at right (navy, label top, `#5` unit,
   divider, name + `pts · sales` line with proper gap).
2. **Weekly challenge band:** full-width green `#8dc63f`, label + centered
   challenge text + progress/time line.
3. **TOP PERFORMERS podium:** three navy panels; metallic **gold 01 / silver 02 /
   bronze 03** numerals (gradient foils per mockup); raised gold-framed leader
   card with gold crown, glow, gold points value; avatars, names, meta lines.
4. **Ticker strip:** TOP CLOSER / CLOSEST RACE / YOUR CLIMB / TEAM PULSE cells
   with hairline dividers.
5. **THE CHASE table:** column headers, `04`-style rank numerals, movement
   arrows/NEW pill/dash, avatar + name + sales + streak chips, 7-day sparklines,
   points, gap-to-next pill chips, green highlighted You row with dark-navy
   streak chip and the progress bar, `MOVEMENT SINCE YESTERDAY` caption.
6. **Footer line** and overall dark near-black background with stage glow.
7. **Light mode** matches the mockup's light theme (the original option-3-arena
   look). Portal theme toggle drives it.

Data comes live from the existing API (movement/spark/streak already work) —
the design must be identical; names/numbers are real.

## Verify loop (mandatory)

After every implementation/fix pass:
1. Screenshot the signed-in page at 1440px (synthetic 8-rep route mock for
   display density).
2. Compare side-by-side against the reference image, region by region
   (masthead, challenge band, podium, ticker, chase table, footer).
3. Any visible difference in layout, spacing, color, typography, size, or
   component treatment = FAIL → dispatch a fix pass → re-verify.
4. Only when NO differences remain: run gates (`npx tsc --noEmit`, tests,
   `npm run build`) and declare done.

Verification is done by a Claude model against the screenshots — never by the
model that wrote the code.
