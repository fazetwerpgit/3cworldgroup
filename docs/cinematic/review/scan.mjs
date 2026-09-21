import { chromium } from "playwright";
const [route, w, h, tag] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]];
const offs = process.argv.slice(6).map(Number);
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
await p.goto("http://127.0.0.1:3120" + route, { waitUntil: "networkidle" });
await p.addStyleTag({ content: "html{scroll-behavior:auto !important} nextjs-portal{display:none !important}" });
await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => requestAnimationFrame(r)); } window.scrollTo(0, 0); });
await p.waitForTimeout(900);
for (const [i, y] of offs.entries()) {
  await p.evaluate((yy) => window.scrollTo(0, yy), y);
  await p.waitForTimeout(550);
  await p.screenshot({ path: `docs/cinematic/review/shots/${tag}-${i}.png` });
}
console.log("wrote", offs.length);
await b.close();
