// Throwaway probe: where is the light in the 390 hero slice of the tall home art?
// Renders the source into a 390x780 cover box at a range of object-position X
// values and prints, for each, the max relative luminance of each 4% band of
// frame height. Tells us where a clear scrim window can sit.
import { chromium } from "playwright";

const SRC = process.argv[2] || "/redesign/cinematic/home-street-dusk-960.webp";
const W = Number(process.argv[3] || 390);
const H = Number(process.argv[4] || 780);
const XS = [40, 55, 65, 72, 80, 88, 96, 100];

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: W, height: H } });
await p.goto("http://127.0.0.1:3120/", { waitUntil: "domcontentloaded" });

for (const x of XS) {
  await p.evaluate(
    async ({ x, W, H, SRC }) => {
      document.documentElement.innerHTML =
        `<head><style>html,body{margin:0;background:#000;overflow:hidden}` +
        `img{width:${W}px;height:${H}px;object-fit:cover;object-position:${x}% 50%;display:block}` +
        `</style></head><body><img id="probe" src="${SRC}"></body>`;
      const el = document.getElementById("probe");
      if (!el.complete) await el.decode();
    },
    { x, W, H, SRC }
  );
  await p.waitForTimeout(200);
  const buf = await p.screenshot();
  const { decodePng } = await import("./png.mjs");
  const img = decodePng(buf);
  const bands = [];
  for (let band = 0; band < 25; band++) {
    const y0 = Math.floor((band / 25) * img.height);
    const y1 = Math.floor(((band + 1) / 25) * img.height);
    let max = 0;
    for (let y = y0; y < y1; y += 2) {
      for (let px = 0; px < img.width; px += 3) {
        const i = (y * img.width + px) * img.channels;
        const f = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
        const L = 0.2126 * f(img.pixels[i]) + 0.7152 * f(img.pixels[i + 1]) + 0.0722 * f(img.pixels[i + 2]);
        if (L > max) max = L;
      }
    }
    bands.push(`${band * 4}%:${max.toFixed(2)}`);
  }
  console.log(`x=${x}%`, bands.join(" "));
}
await b.close();
