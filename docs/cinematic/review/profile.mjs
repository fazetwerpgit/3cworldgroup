import { chromium } from "playwright";
import { decodePng } from "./png.mjs";
import fs from "node:fs";
const B = "http://127.0.0.1:3120";
const tmp = "/tmp/claude-1000/-home-fazetwerpnerd69-dev-3cworldgroup/8775fa2d-1e5a-44cb-bbfb-e4c983885754/scratchpad/pf.png";
const T = [["/", "closing"], ["/about", "closing"], ["/opportunities", "apply"], ["/apply", "closing"], ["/", "hero"]];
const b = await chromium.launch();
for (const [route, sec] of T) {
  const ctx = await b.newContext({ viewport: { width: 1740, height: 1000 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(B + route, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: "html{scroll-behavior:auto !important} nextjs-portal{display:none!important}" });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(x => requestAnimationFrame(x)); } });
  await p.waitForTimeout(800);
  let el = await p.$(`#${sec}`);
  if (!el) el = await p.$(`[class*=${sec}]`);
  if (!el) { console.log("MISS", route, sec); await ctx.close(); continue; }
  await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  if (process.env.NOSCRIM) { await p.addStyleTag({ content: `#${sec}::after,#${sec}::before,[class*=${sec}]::after,[class*=${sec}]::before{background:none !important}` }); await p.waitForTimeout(250); }
  await el.screenshot({ path: tmp });
  const img = decodePng(fs.readFileSync(tmp)); const ch = img.channels;
  const cols = 10, band = Math.floor(img.width / cols);
  const out = [];
  for (let c = 0; c < cols; c++) {
    let s = 0, n = 0;
    for (let y = 0; y < img.height; y += 2) for (let x = c * band; x < (c + 1) * band; x += 2) {
      const i = (y * img.width + x) * ch;
      s += 0.2126 * img.pixels[i] + 0.7152 * img.pixels[i + 1] + 0.0722 * img.pixels[i + 2]; n++;
    }
    out.push(Math.round(s / n));
  }
  console.log(`${route} #${sec}  ${img.width}x${img.height}  cols: ${out.join(" ")}`);
  await ctx.close();
}
await b.close();
