import { chromium } from "playwright";
const out = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto("http://127.0.0.1:3120/", { waitUntil: "networkidle" });
const routes = [["/", "home"], ["/about", "about"], ["/services", "services"], ["/opportunities", "careers"], ["/contact", "contact"], ["/apply", "apply"]];
for (const [href, name] of routes) {
  if (href !== "/") {
    await p.evaluate(() => window.scrollTo(0, 0));
    // At 390 the primary nav is hidden and the routes live in the menu sheet,
    // so open it first and click the sheet's copy of the link, not the
    // display:none one still in the DOM above it.
    await p.locator('header button[aria-expanded="false"]').first().click();
    await p.locator(`header a[href="${href}"]`).last().click();
    await p.waitForURL(`**${href}`);
    await p.waitForTimeout(600);
    // Round 6 — the sheet used to stay open across a client navigation and had
    // to be closed by hand here or it painted over the new route. SiteHeader
    // resets it on the pathname now, so this asserts instead of repairing: if
    // the sheet is ever open once the route has settled, the shot below would
    // be of a menu rather than of the page.
    const stillOpen = await p.locator('header button[aria-expanded="true"]').count();
    if (stillOpen) throw new Error(`menu sheet still open after navigating to ${href}`);
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
