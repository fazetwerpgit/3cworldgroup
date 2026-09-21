# Photo assets — 3C World Group redesign v2

All derivatives are WebP, Lanczos-resampled from the PNG sources in `src/`, encoded with
ImageMagick `magick` at q82 unless a size cap forced a lower quality (noted per row).
Every `-1600` file is under 250 KB. Each photo also ships a 24px-wide `-lqip.webp`
for blur-up placeholders. Sizes below are bytes.

Sources are 1024–1774 px wide, so the 1600 and (for the cities and `hero-portrait`)
1200 tiers are mild Lanczos upscales. They carry no extra detail; they exist so the
`srcset` ladder is complete on high-DPR screens. Serve `-800` wherever the layout box
is 800 CSS px or narrower.

| name | subject | intended use | source px | aspect | produced files (bytes) | defect notes | verdict |
|---|---|---|---|---|---|---|---|
| hero-wide | Aerial dusk suburb, lit street grid glowing green along the roads, sunset on the horizon | services hero aerial (desktop) | 1774x887 | 2:1 | `-1600` 198798, `-1200` 129050, `-800` 62864, `-lqip` 142 | Clean. Green road glow is a stylised network motif, not a photographic artifact. No text, no warped geometry. | ACCEPT |
| hero-portrait | Same aerial dusk suburb, vertical framing, deeper sky | services hero aerial (mobile / portrait crop) | 1024x1536 | 2:3 | `-1600` 238922 (q76), `-1200` 223676, `-800` 127362, `-lqip` 242 | Clean and matches `hero-wide` in grade, so the two swap without a colour jump. Top third is near-empty sky, which is good for overlaid copy. | ACCEPT |
| fiber-wide | Fibre-optic strands bursting from a single point, blue over gold, bokeh at the right | services fiber | 1536x1024 | 3:2 | `-1600` 127026, `-1200` 85832, `-800` 47240, `-lqip` 214 | Clean. Blur is intentional bokeh, not focus failure. Large dark area at left holds text well. | ACCEPT |
| fiber-square | Fibre-optic starburst radiating from a centre point, blue top, gold bottom | services fiber (square card) | 1254x1254 | 1:1 | `-1600` 219590 (q77), `-1200` 189394, `-800` 108072, `-lqip` 310 | Clean. Dense radial detail is the reason the 1600 tier needed q77 to stay under cap. | ACCEPT |
| tv-square | Wall-mounted TV showing an eight-tile colour grid, streaming box and remote on a walnut credenza, tablet mirroring the same grid | services tv | 1254x1254 | 1:1 | `-1600` 97744, `-1200` 64728, `-800` 34280, `-lqip` 276 | Clean. Screen content is abstract colour panels, so no channel logos or legible text to date the shot. Pairs with `tv-wide` for landscape slots. | ACCEPT |
| tv-wide | Wall-mounted TV showing the same eight-tile colour grid, streaming box and remote on a walnut credenza, jute rug below | services tv (wide) | 1536x1024 | 3:2 | `-1600` 94414, `-1200` 60612, `-800` 31380, `-lqip` 214 | Clean. Generated from `tv-square` as a reference so wall tone, walnut grain, screen tiles and window light match; the two read as one shoot. Only deviation from brief: the credenza bleeds off both frame edges instead of sitting fully inside, which suits a wide banner. No text or logos. | ACCEPT |
| security-wide | Four white and black security devices laid flat on grey: dome camera, keypad, door sensor pair, hub with green LED | services security | 1536x1024 | 3:2 | `-1600` 26356, `-1200` 17664, `-800` 9900, `-lqip` 132 | Clean. Keypad digits 0-9, `*` and `#` render correctly with no garbled glyphs. Flat grey ground compresses to very small files. | ACCEPT |
| security-square | Same four devices, square framing, devices larger in frame | services security (square card) | 1254x1254 | 1:1 | `-1600` 41560, `-1200` 30008, `-800` 17730, `-lqip` 184 | Clean, keypad legible and correct. The hub LED is a slightly longer bar than in the wide version, a harmless inconsistency between the two shots. | ACCEPT |
| city-atlanta | Atlanta downtown skyline at golden hour over the Downtown Connector, Bank of America Plaza spire at right | careers city strip | 1024x1536 | 2:3 | `-1600` 246970 (q57), `-1200` 240934 (q77), `-800` 171966, `-lqip` 352 | Landmarks are recognisably Atlanta. One illegible sign glyph on the Westin tower, invisible below roughly 600 px wide. Dense foliage forced q57 at 1600. | ACCEPT |
| city-birmingham | Birmingham skyline at golden hour, ridge behind, brick warehouse district in the foreground | careers city strip | 1024x1536 | 2:3 | `-1600` 233350 (q40 + 0.5px pre-blur), `-1200` 247398 (q62), `-800` 212828, `-lqip` 330 | Correct city and topography. The heaviest file of the set: fine brick and foliage texture needed a 0.5 px pre-blur plus q40 at 1600 to fit the cap. Checked at 100 percent, no visible blocking. | ACCEPT |
| city-jacksonville | Jacksonville skyline across the St Johns River, blue Main Street Bridge at left | careers city strip | 1024x1536 | 2:3 | `-1600` 244924 (q57), `-1200` 238916 (q77), `-800` 162794, `-lqip` 302 | Clean and correct. Water reflections stay smooth after compression. Strongest of the five cities. | ACCEPT |
| city-dallas | Downtown Dallas skyline from the Trinity River levee by the Ronald Kirk bridge, Margaret Hunt Hill Bridge arch at left | home market explorer | 1536x1024 | 3:2 | `-1600` 241260, `-1200` 151644, `-800` 70362, `-lqip` 170 | Landmarks correct and correctly ordered: Reunion Tower shorter and apart, Bank of America Plaza tallest with its green corner lines, Renaissance Tower's X-braced crown and twin antennae, Comerica's crenellated top, Fountain Place's prism, Chase's notch. Flat prairie, no relief. No people, no legible text. | ACCEPT |
| city-houston | Downtown Houston from Eleanor Tinsley Park across Buffalo Bayou, cypress and live oak on both banks | home market explorer | 1536x1024 | 3:2 | `-1600` 205728 (q76), `-1200` 173076, `-800` 84194, `-lqip` 190 | Landmarks correct: Chase Tower slab, Wells Fargo's notched mirror glass, Pennzoil Place as the correct twin trapezoids, Bank of America Center's Dutch gables, Heritage Plaza's stepped crown. No Williams Tower, which is not in this field of view. Humid haze and dense green read clearly against Dallas. No people. | ACCEPT |
| city-southern-california | Inland Empire foothill residential street looking north to the San Gabriel / San Bernardino front range, late afternoon | home market explorer | 1536x1024 | 3:2 | `-1600` 227508 (q76), `-1200` 190880, `-800` 93328, `-lqip` 180 | One real setting, not a composite: stucco and clay tile, fan and queen palms, bougainvillea, citrus and olive, chaparral slopes in basin haze. No ocean, no downtown, no snow, no people. Parked vehicles only; the one plate is illegible at every shipped tier. | ACCEPT |
| city-lansing | Downtown Lansing from the east bank of the Grand River, Boji Tower and the Capitol dome | home market explorer | 1536x1024 | 3:2 | `-1600` 241778, `-1200` 152380, `-800` 73758, `-lqip` 172 | Regenerated 21 Sep to carry the same late-afternoon light as the other four markets; the previous artwork was flat midday blue and only 660 px wide. Landmarks checked against photographic references: Boji Tower's brick Art Deco setbacks, round clock face and slender antenna mast are all real, and the Capitol's cream-white ribbed dome, lantern and low columned wings sit correctly to its right and read shorter. Genuinely low-rise, flat plain, no hills, no people, no legible text. | ACCEPT |
| city-grand-rapids | Downtown Grand Rapids from the west bank of the Grand River, Blue Bridge across the frame | home market explorer | 1536x1024 | 3:2 | `-1600` 244120 (q70), `-1200` 213974, `-800` 102728, `-lqip` 214 | Regenerated 21 Sep. The previous artwork put a hemispherical dome on the Michigan Trust Building, which really carries a steep pyramidal hipped roof; every other landmark in it was correct. This version fixes the roof and keeps the rest: Blue Bridge as a flat blue Pratt truss on stone piers, Amway Grand Plaza as a mirrored slab, JW Marriott as the round tower beside it, Plaza Towers stepped at right. Flat valley, no hills. No people, no legible text. | ACCEPT |
| city-savannah | Savannah riverfront at golden hour, gold City Hall dome, Talmadge Bridge at left | careers city strip | 1024x1536 | 2:3 | `-1600` 240362 (q62), `-1200` 220302 (q77), `-800` 155172, `-lqip` 286 | Clean. Landmarks correct. Lower half is river, so crop from the top for short strip cells. | ACCEPT |
| city-tallahassee | Florida State Capitol at sunset, tower flanked by the two domed chambers, old capitol in front | careers city strip | 1024x1536 | 2:3 | `-1600` 247048 (q64 + 0.5px pre-blur), `-1200` 243336 (q77), `-800` 167194, `-lqip` 326 | Clean and architecturally correct, including the striped awnings on the historic capitol. Foreground canopy needed a light pre-blur at 1600. | ACCEPT |

No source was rejected. The original 13 shipped, plus the five home-market photos above.

The five `city-*` entries used by the home market explorer are `city-dallas`, `city-houston`,
`city-southern-california`, `city-lansing` and `city-grand-rapids`. The earlier
`city-atlanta` / `city-birmingham` / `city-jacksonville` / `city-savannah` / `city-tallahassee`
sets are retained but are no longer referenced by any page.

All five market photos are generated illustrations matched to real
photographic references. They are market art, not documentary photographs, and they do not
depict 3C offices or territories.

## Contact sheet

`contact.png` — all 13 accepted photos at their 800 px tier, labelled, 1956x2080.
