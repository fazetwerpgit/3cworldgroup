import { chromium } from "playwright";
import { decodePng } from "./png.mjs";
import fs from "node:fs";
const B = "http://127.0.0.1:3120";
const tmp = "/tmp/claude-1000/-home-fazetwerpnerd69-dev-3cworldgroup/8775fa2d-1e5a-44cb-bbfb-e4c983885754/scratchpad/st.png";
const T = [["/", "closing"], ["/about", "closing"], ["/opportunities", "apply"], ["/opportunities", "glance"], ["/about", "story"], ["/", "doors"]];
const b = await chromium.launch();
const mean = (path) => { const img = decodePng(fs.readFileSync(path)); const ch = img.channels;
  let s = 0, c = 0; for (let y = 0; y < img.height; y += 3) for (let x = 0; x < img.width; x += 3) { const i = (y * img.width + x) * ch;
    s += 0.2126 * img.pixels[i] + 0.7152 * img.pixels[i + 1] + 0.0722 * img.pixels[i + 2]; c++; } return s / c; };
for (const [route, sec] of T) {
  const ctx = await b.newContext({ viewport: { width: 1740, height: 1000 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(B + route, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: "html{scroll-behavior:auto !important} nextjs-portal{display:none!important}" });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(x => requestAnimationFrame(x)); } });
  await p.waitForTimeout(800);
  const el = await p.$(`#${sec}`);
  await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  await el.screenshot({ path: tmp }); const before = mean(tmp);
  const imgs = await p.evaluate((s) => [...document.querySelector(`#${s}`).querySelectorAll("img")]
    .map(i => `${i.className} :: ${getComputedStyle(i).objectPosition} :: ${getComputedStyle(i).opacity}`), sec);
  await p.addStyleTag({ content: `#${sec}::after, #${sec}::before, #${sec} [class*=crim], #${sec} [class*=Scrim]{opacity:0 !important; background:none !important}` });
  await p.waitForTimeout(250);
  await el.screenshot({ path: tmp }); const after = mean(tmp);
  console.log(`${route} #${sec}: scrim-on ${before.toFixed(0)}  scrim-off ${after.toFixed(0)}`);
  imgs.forEach(i => console.log("    " + i));
  await ctx.close();
}
await b.close();
