import { chromium } from "playwright";
const [route, sel, w] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: Number(w), height: 900 } });
await p.goto(`http://localhost:3120${route}`, { waitUntil: "networkidle" });
const r = await p.evaluate((s) => { const e = document.querySelector(s); const bb = e.getBoundingClientRect(); return [Math.round(bb.top + scrollY), Math.round(bb.height)]; }, sel);
console.log(r.join(" ")); await b.close();
