import { chromium } from "playwright";
const out = process.argv[2];
const b = await chromium.launch();
for (const port of [3120, 3122]) {
  const p = await b.newPage({ viewport: { width: 1740, height: 1000 } });
  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: "html{scroll-behavior:auto!important}" });
  const H = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < H; y += 600) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(90); }
  await p.waitForTimeout(500); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/home-${port}.png`, fullPage: true });
  await p.close();
}
await b.close(); console.log("ok");
