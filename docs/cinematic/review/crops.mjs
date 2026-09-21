import { chromium } from "playwright";
import fs from "node:fs";
const B = "http://127.0.0.1:3120";
const out = process.argv[2];
const width = Number(process.argv[3] || 1740);
const routes = ["/", "/about", "/services", "/opportunities", "/contact", "/apply"];
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
for (const r of routes) {
  const ctx = await b.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(B + r, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: "html{scroll-behavior:auto !important} nextjs-portal{display:none!important}" });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(x => requestAnimationFrame(x)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(900);
  const boxes = await p.evaluate(() => [...document.querySelectorAll("img")]
    .filter(i => { const r = i.getBoundingClientRect(); return r.width > 150 && r.height > 90; })
    .map((i, n) => { const el = i.parentElement; el.setAttribute("data-crop", String(n));
      return { n, src: decodeURIComponent((i.currentSrc || i.src)).replace(/^.*\//,"").replace(/[^a-z0-9.-]/gi,"_") }; }));
  const name = r === "/" ? "home" : r.slice(1);
  for (const { n, src } of boxes) {
    const el = await p.$(`[data-crop="${n}"]`);
    try { await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(250);
      await el.screenshot({ path: `${out}/${name}-${n}-${src.replace(/\.\w+$/, "")}.png` }); } catch (e) { console.log("skip", name, n, e.message); }
  }
  console.log(name, boxes.length);
  await ctx.close();
}
await b.close();
