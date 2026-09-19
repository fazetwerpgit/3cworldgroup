# Contact round 1 (2026-09-18) — un-lock the comp, normal scale, clean closer

Jacob's complaints (100% zoom, 1440-1920 wide):
1. Hero is "all sorts of fucked up and blurry": 380px `contact-three-c-source.png`
   is forced to 1266px wide, absolutely positioned, cut off at the bottom, a stray
   lime line crosses into the next section. Headline locked at 128px nowrap.
2. Sections below the hero look very large: "eyebrows" at clamp(2rem,3vw,3rem),
   link titles text-4xl, min-h 500px, py-24.
3. Bottom CTA "the blue looks weird": green diagonal panel with a dark fade at its
   foot, 258px locked band, scaled title.

Root cause: contact-page.module.css is the old 1px-comp era: `body .public-site
.public-contact ... !important` pixel locks (hero 647px, h1 128px, closing 258px,
button 453x92, transforms scaleX/scaleY on text). The 1px rule is retired.

## Do
- Hero: keep the copy. Drop every hero pixel-lock block. Grid copy | art,
  min-height ~560px desktop, padding-block 72px. h1 clamp(3rem, 6.4vw, 6rem),
  line-height .9, no nowrap, no <br className="contact-desktop-break"> hacks.
  Body 1.125rem / 1.6, max-width 46ch. Art = /redesign/three-c-map-mark-transparent-2x.png
  (3172x1984, transparent, crisp), object-contain, max-height ~440px, inside the
  right column, nothing absolute, nothing leaving the section. Keep topo surface.
- Fast-path split: keep the diagonal + navy/pale halves. Real eyebrows
  (0.75-0.8rem, tracking .2em) and h2 titles clamp(1.8rem, 2.6vw, 2.4rem).
  Link titles 1.35-1.6rem, icons 36-40px, rows min-height 72px, section
  padding 56-72px, no md:min-h-[500px]. Target ~360-400px tall at 1440.
- Form section: leave the layout; only remove pixel locks if any.
- Closer: replace the green diagonal band with the About/Careers white step-in
  ClosingCta panel: eyebrow "Your next move", title "Don't need to wait? Apply
  today.", body hidden, lime button "Start your application" -> /apply.
  Copy the Careers "04d" block in src/app/opportunities/opportunities-page.module.css
  (white panel, box-shadow, grid 1fr auto, title needs the 3-class selector
  `.public-closing-cta-panel .public-closing-cta-title` because public.css ~4676
  forces it white !important). Remove public-closing-cta-contact locks, ::before /
  ::after green polygons, the title-text transform span.
- Delete dead CSS rather than overriding it. Aim: contact-page.module.css well
  under 400 lines.
- Gates: npx tsc --noEmit, npx eslint src/app/contact, 0 console errors at
  1440 and 390, screenshots via node .playwright/shots/contact.mjs.
