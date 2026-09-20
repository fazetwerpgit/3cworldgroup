import { chromium } from "playwright";
const out = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1740, height: 1000 } });
await p.goto("http://127.0.0.1:3120/", { waitUntil: "networkidle" });
const routes = [["/", "home"], ["/about", "about"], ["/services", "services"], ["/opportunities", "careers"], ["/contact", "contact"], ["/apply", "apply"]];
for (const [href, name] of routes) {
  if (href !== "/") {
    await p.click(`header a[href="${href}"]`);
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
