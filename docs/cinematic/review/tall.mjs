// node docs/cinematic/review/tall.mjs <route> <width> <y> <height> <out.png>
import { chromium } from "playwright";
const [route, w, y, h, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: 900 }, deviceScaleFactor: 1 });
await page.goto(`http://localhost:3120${route}`, { waitUntil: "networkidle" });
await page.addStyleTag({ content: "html{scroll-behavior:auto !important} nextjs-portal{display:none !important}" });
await page.evaluate(async () => {
  for (let i = 0; i < document.body.scrollHeight; i += 400) { window.scrollTo(0, i); await new Promise(r => setTimeout(r, 40)); }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(600);
await page.screenshot({ path: out, clip: { x: 0, y: Number(y), width: Number(w), height: Number(h) }, fullPage: true });
await browser.close();
console.log("wrote", out);
