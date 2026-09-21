import { chromium } from "playwright";
import { decodePng } from "./png.mjs";
import fs from "node:fs";
const B = "http://127.0.0.1:3120";
const routes = ["/", "/about", "/services", "/opportunities", "/apply"];
const tmp = "/tmp/claude-1000/-home-fazetwerpnerd69-dev-3cworldgroup/8775fa2d-1e5a-44cb-bbfb-e4c983885754/scratchpad/lum.png";
const b = await chromium.launch();
for (const r of routes) {
  const ctx = await b.newContext({ viewport: { width: 1740, height: 1000 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(B + r, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: "html{scroll-behavior:auto !important} nextjs-portal{display:none!important}" });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(x => requestAnimationFrame(x)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(900);
  const secs = await p.evaluate(() => [...document.querySelectorAll("section, header")]
    .filter(s => s.querySelector("img") && s.getBoundingClientRect().height > 200)
    .map((s, n) => { s.setAttribute("data-lum", String(n));
      return { n, id: s.id || (s.className.split(/\s+/)[0] || "?").replace(/^.*__/, "") }; }));
  const name = r === "/" ? "home" : r.slice(1);
  for (const { n, id } of secs) {
    const el = await p.$(`[data-lum="${n}"]`);
    await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(250);
    try { await el.screenshot({ path: tmp }); } catch { continue; }
    const img = decodePng(fs.readFileSync(tmp));
    const ch = img.channels;
    let sum = 0, cnt = 0, bright = 0;
    for (let y = 0; y < img.height; y += 3) for (let x = 0; x < img.width; x += 3) {
      const i = (y * img.width + x) * ch;
      const l = 0.2126 * img.pixels[i] + 0.7152 * img.pixels[i + 1] + 0.0722 * img.pixels[i + 2];
      sum += l; cnt++; if (l > 90) bright++;
    }
    console.log(`${name.padEnd(14)} ${id.padEnd(22)} mean ${(sum / cnt).toFixed(1).padStart(6)}   >90: ${((bright / cnt) * 100).toFixed(1)}%`);
  }
  await ctx.close();
}
await b.close();
