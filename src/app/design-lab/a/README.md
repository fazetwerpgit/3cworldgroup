# A — Night Editorial

1. The marketing site carried into the app: pure black, Bebas Neue for figures and titles, Geist for everything a rep reads. No third face; Archivo would make three.
2. No cards or filled boxes. Sections are a hairline and a 13px caps kicker, and hierarchy comes from type size: the pay figure is the largest thing on the dashboard (up to 264px on desktop, 36vw on a phone), rank comes second, then rows.
3. Lime is used once per screen, on the thing that moves money: Log sale on the dashboard, Choose screenshot or Submit sale on Log Sale, and the progress bar while it reads. Chip selection is white, and "check this" is amber (#f2b54b).
4. Three controls, defined once in night.module.css: lime primary, hairline secondary, square chip. Everything is square (radius 0) like the site's buttons, and every target is at least 44px.
5. Phone gets a masthead and a fixed bottom nav with safe-area padding. At 1024px and up the same tokens become a left rail with a 12-column page (pay figure beside payday, standing beside today, sales as a table) so wide screens read as a layout and not a stretched phone.
