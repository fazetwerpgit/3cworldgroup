import { chromium } from "playwright";
const b = await chromium.launch(); 
for (const [w,h] of [[1740,1000],[390,844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://localhost:3120/about", { waitUntil: "networkidle" });
  const el = p.locator('img[src*="doorhanger-dusk"]').first();
  await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
  await p.screenshot({ path: `docs/cinematic/shots-r9/about-${w}-fig.png` });
  await p.close();
}
await b.close(); console.log("fig done");
