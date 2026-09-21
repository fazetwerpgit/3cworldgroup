import { chromium } from "playwright";
const B = "http://127.0.0.1:3120";
const out = process.argv[2];
const T = [["/contact","closing"]];
const b = await chromium.launch();
for (const [r, sec] of T) {
  const ctx = await b.newContext({ viewport: { width: 1740, height: 1000 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(B + r, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: "html{scroll-behavior:auto !important} nextjs-portal{display:none!important}" });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(x => requestAnimationFrame(x)); } });
  await p.waitForTimeout(800);
  let el = await p.$(`#${sec}`) || await p.$(`[class*=${sec}]`);
  await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  await el.screenshot({ path: `${out}/${(r === "/" ? "home" : r.slice(1))}-${sec}.png` });
  await ctx.close();
}
await b.close();
