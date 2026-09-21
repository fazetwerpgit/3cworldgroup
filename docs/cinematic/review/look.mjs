import { chromium } from "playwright";
const BASE = "http://127.0.0.1:3120";
const [route, w, h, tag, mode] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5], process.argv[6] || "full"];
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
await p.goto(BASE + route, { waitUntil: "networkidle" });
await p.addStyleTag({ content: "html{scroll-behavior:auto !important} nextjs-portal{display:none !important}" });
await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => requestAnimationFrame(r)); } window.scrollTo(0, 0); });
await p.waitForTimeout(900);
if (mode === "full") await p.screenshot({ path: `docs/cinematic/review/shots/${tag}.png`, fullPage: true });
else { await p.evaluate((y) => window.scrollTo(0, y), +mode); await p.waitForTimeout(600); await p.screenshot({ path: `docs/cinematic/review/shots/${tag}.png` }); }
console.log("wrote", tag, "docH", await p.evaluate(() => document.body.scrollHeight));
await b.close();
