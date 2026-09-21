import { chromium } from "playwright";
const out = process.argv[2];
const b = await chromium.launch();
const W = Number(process.argv[3] || 1740);
const p = await b.newPage({ viewport: { width: W, height: W > 900 ? 1000 : 844 } });
await p.goto("http://127.0.0.1:3120/", { waitUntil: "networkidle" });
const routes = [["/", "home"], ["/about", "about"], ["/services", "services"], ["/opportunities", "careers"], ["/contact", "contact"], ["/apply", "apply"]];
for (const [href, name] of routes) {
  if (href !== "/") {
    // Below 900 the nav lives behind the menu toggle, so the click that proves
    // a client navigation re-runs the reveals has to open the menu first.
    const toggle = await p.$("header button[aria-expanded]");
    if (toggle && (await toggle.isVisible())) {
      await toggle.click();
      await p.waitForTimeout(400);
    }
    await p.click(`a[href="${href}"]:visible`);
    await p.waitForURL(`**${href}`);
    await p.waitForTimeout(600);
  }
  const h = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 700) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(120); }
  await p.waitForTimeout(700);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(300);
  const hidden = await p.evaluate(() => document.querySelectorAll('[data-reveal]:not([data-shown])').length);
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  console.log(name, "unrevealed:", hidden, "height:", h);
}
await b.close();
