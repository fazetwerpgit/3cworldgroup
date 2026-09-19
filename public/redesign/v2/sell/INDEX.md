# "What you'll sell" illustration assets

Generated with the `openai-image-gen` skill (Codex OAuth wrapper, model `gpt-5.6-sol`, 1024x1024 requested, 1254x1254 delivered).
Background: flat navy #0B1F3A. Accent: #8DC63F. Line/product color: off-white #F2F4F7.
WebPs are 800px wide, quality 85, all well under the 120 KB budget.

## S1 — glow line-art (hairline outline, green glow nodes, no fills)

| PNG | WebP | WebP size | Notes |
|---|---|---|---|
| s1-fiber.png (1254px, 1180 KB) | s1-fiber-800.webp | 31 KB | Clean. 10 strands, even fan, each ferrule tip glows green. No defects. |
| s1-tv.png (1254px, 1042 KB) | s1-tv-800.webp | 18 KB | Clean. Wall-mount arm included. Remote buttons are round and evenly spaced, no glyphs. Regenerated once: first pass came back on a white background. |
| s1-security.png (1254px, 1070 KB) | s1-security-800.webp | 21 KB | Clean. Keypad is a correct 3x4 grid reading 1 2 3 / 4 5 6 / 7 8 9 / * 0 #. Regenerated once: first pass was white background and filled shapes instead of line art. |

## S2 — product render (3D studio render, green rim light)

| PNG | WebP | WebP size | Notes |
|---|---|---|---|
| s2-fiber.png (1254px, 1423 KB) | s2-fiber-800.webp | 43 KB | Strongest of the set. Note the jackets render bright lime green rather than neutral, which reads as more accent color than the brand ratio implies. Connector bodies are each a slightly different type, not a matched set. |
| s2-tv.png (1254px, 1094 KB) | s2-tv-800.webp | 12 KB | Clean. Opaque dark screen, green rim on the left bezel, remote has a tidy button cluster with no glyphs. No wall mount shown. |
| s2-security.png (1254px, 1276 KB) | s2-security-800.webp | 19 KB | Clean. Keypad grid is correct and legible: 1 2 3 / 4 5 6 / 7 8 9 / * 0 #. Devices are white, so green appears only as edge accents. |

## S3 — isometric flat (flat vector, no outlines)

| PNG | WebP | WebP size | Notes |
|---|---|---|---|
| s3-fiber.png (1254px, 1200 KB) | s3-fiber-800.webp | 26 KB | Clean. Slate-blue jackets, white ferrules, green tip glows. Subject sits slightly right of center. |
| s3-tv.png (1254px, 941 KB) | s3-tv-800.webp | 7 KB | Clean. Regenerated once: first pass rendered the screen hollow, so the background showed through the bezel. Now opaque. |
| s3-security.png (1254px, 1037 KB) | s3-security-800.webp | 18 KB | Keypad is a correct 3x4 grid with the right characters, but the isometric projection makes the rows run diagonally, so it reads as staggered at a glance. Regenerated once; the second pass is the same geometry and is correct, just visually diagonal by nature of the projection. |

## Cross-cutting notes

- No text, logos, or watermarks anywhere in the set. The only characters are the twelve keypad glyphs, which are correct in all three security images.
- All nine sit on a flat navy field with margin on all sides, so a center crop to 9:16 or 4:5 for phone will hold.
- Subject scale is not matched across the three subjects within a style. If they run side by side in one row, the fiber image reads larger than the TV image and may need per-image scaling in CSS.

## S3 fiber replacement candidates (f1 / f2 / f3)

The original `s3-fiber` is blue-on-blue and carries neon tip glows, so it does not sit with `s3-tv` and `s3-security`, whose objects are off-white with slate-blue shaded faces and flat green accents. These three candidates were generated against that white-on-navy language. Pick one to replace `s3-fiber`.

| PNG | WebP | WebP size | Notes |
|---|---|---|---|
| s3-fiber-f1.png (1254px, 525 KB) | s3-fiber-f1-800.webp | 59 KB | Cable bundle, six strands fanning up-right from a white trunk, one green connector tip. Palette and light direction match. Subject mass is heavier than the TV and reaches close to the left and bottom edges, so margin is tighter than the rest of the set. |
| s3-fiber-f2.png (1254px, 1006 KB) | s3-fiber-f2-800.webp | 14 KB | Router with two antennas, three indicator dots, a green fiber line entering at the left and three green signal arcs. Closest match of the three on scale, margin, and light direction. Reads as a product object like the TV and the security devices. |
| s3-fiber-f3.png (1254px, 982 KB) | s3-fiber-f3-800.webp | 9 KB | House with a fiber line running in to a small green connection box. Palette matches, but the house is a single large solid mass and the line exits the bottom-left corner, so it reads as a scene rather than a product object and sits larger than the TV. |
| s3-set-contact.png (2600x520) | n/a | n/a | Contact sheet: f1, f2, f3, s3-tv, s3-security at equal height on navy, for judging scale match. |
