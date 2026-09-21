import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const out = process.argv[2]; mkdirSync(out, { recursive: true });
const b = await chromium.launch();
for (const [w, h, tag, mobile] of [[390, 844, "m", true], [1740, 1000, "d", false]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  await p.goto("http://127.0.0.1:3120/", { waitUntil: "networkidle" });
  await p.addStyleTag({ content: "html{scroll-behavior:auto!important}" });
  for (const [href, name] of [["/", "home"], ["/about", "about"], ["/services", "services"], ["/opportunities", "careers"], ["/contact", "contact"], ["/apply", "apply"]]) {
    if (href !== "/") { await p.goto("http://127.0.0.1:3120" + href, { waitUntil: "networkidle" }); await p.addStyleTag({ content: "html{scroll-behavior:auto!important}" }); }
    const H = await p.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < H; y += Math.round(h * 0.6)) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(90); }
    await p.waitForTimeout(500);
    for (const frac of [0, 0.3, 0.6, 1]) {
      const y = Math.round(frac * (H - h));
      await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(250);
      await p.screenshot({ path: `${out}/${name}-${tag}-${frac}.png` });
    }
  }
  await ctx.close();
}
await b.close(); console.log("done");
