// node docs/cinematic/review/stage.mjs <route> <width> "<selector to center>" <out.png>
// Viewport screenshot (not fullPage) with the selector scrolled to the viewport
// centre, so sticky stages show the frame that is actually active there.
import { chromium } from "playwright";
const [route, w, sel, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: 900 }, deviceScaleFactor: 1 });
await page.goto(`http://localhost:3120${route}`, { waitUntil: "networkidle" });
await page.addStyleTag({ content: "html{scroll-behavior:auto !important} nextjs-portal{display:none !important}" });
await page.evaluate(async (sel) => {
  for (let i = 0; i < document.body.scrollHeight; i += 400) { window.scrollTo(0, i); await new Promise(r => setTimeout(r, 40)); }
  const el = document.querySelector(sel);
  const y = el.getBoundingClientRect().top + window.scrollY - (window.innerHeight - el.getBoundingClientRect().height) / 2;
  window.scrollTo(0, y);
}, sel);
await page.waitForTimeout(900);
await page.screenshot({ path: out });
await browser.close();
console.log("wrote", out);
