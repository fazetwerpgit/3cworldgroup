# Careers (/opportunities) round 2 — approved design (2026-09-18)

Jacob's problems: hero map bleeds below the section at 100% zoom; sections
2-3 do not flow; "path to success" split is broken; too much navy at the
bottom; the page repeats itself.

Root cause of the blue and the bad flow: the page says everything twice.
Steps appear twice (How you get started / Your path to success), benefits
twice (At a glance / ending bullets), pay twice (Earning potential / apply
card stats), and products repeat the Services page.

## Approved page (Jacob: "that seems good")
1. Hero, navy. Map capped in height and vertically centred so it stays
   inside the section at every zoom. Diagonal into the pale surface kept.
2. Why 3C, pale, one flat surface. Eyebrow "Now hiring nationwide", title
   "The opportunity, at a glance", the four benefits 2x2 with lime icons.
   The navy left panel goes.
3. Path and pay, split panel (option 1 of 3). Left white: "Your path to
   success" + four steps. Right navy: "Earning potential" + three tiers
   (real numbers) + "Earnings vary..." note. One diagonal between halves.
4. Apply, navy topo. Left: "Your next market starts here." + one sentence,
   bullets removed. Right: white apply card, placeholder footnote removed,
   stats kept. Footer follows; no closing CTA on this page.

Cut: How you get started, Three products people already want, closing CTA.
Legacy nth-of-type(3)/(4) pixel rules in opportunities-page.module.css are
removed (they would retarget the wrong sections after the cut).
