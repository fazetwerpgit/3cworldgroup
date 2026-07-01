// Generates the PWA icon set from public/logo.png using sharp (bundled with Next).
//   node scripts/generate-pwa-icons.mjs
//
// Outputs into public/icons/:
//   icon-192.png, icon-512.png        (standard, transparent)
//   icon-maskable-192/512.png         (padded on brand navy so no edge-clipping)
//   apple-touch-icon.png (180, navy bg, no alpha — iOS ignores transparency)
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'public/logo.png';
const OUT = 'public/icons';
const NAVY = { r: 10, g: 31, b: 68, alpha: 1 }; // #0A1F44

await mkdir(OUT, { recursive: true });

// Standard transparent icons: contain the logo, transparent background.
async function standard(size) {
  await sharp(SRC)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(`${OUT}/icon-${size}.png`);
}

// Maskable icons: logo inside a safe zone (~80%) on a solid navy square, so Android's
// mask (circle/squircle) never clips the mark.
async function maskable(size) {
  const inner = Math.round(size * 0.8);
  const logo = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(`${OUT}/icon-maskable-${size}.png`);
}

// Apple touch icon: 180x180, solid navy (iOS ignores alpha and adds its own rounding).
async function appleTouch() {
  const inner = 140;
  const logo = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: 180, height: 180, channels: 4, background: NAVY } })
    .composite([{ input: logo, gravity: 'center' }])
    .flatten({ background: NAVY })
    .png()
    .toFile(`${OUT}/apple-touch-icon.png`);
}

await standard(192);
await standard(512);
await maskable(192);
await maskable(512);
await appleTouch();

console.log('PWA icons generated in public/icons/');
