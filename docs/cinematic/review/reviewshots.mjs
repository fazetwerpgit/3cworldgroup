import { chromium } from "playwright";
const BASE = "http://127.0.0.1:3120";
const OUT = "docs/cinematic/shots-r6";
const routes = [["/", "home"], ["/about", "about"], ["/services", "services"],
                ["/opportunities", "careers"], ["/contact", "contact"], ["/apply", "apply"]];
const b = await chromium.launch();

for (const [w, h] of [[1740, 1000], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  for (const [route, name] of routes) {
    await p.goto(BASE + route, { waitUntil: "networkidle" });
    // the kit's smooth scroll smears a naive capture; the dev indicator is not design
    await p.addStyleTag({ content: "html{scroll-behavior:auto !important} nextjs-portal{display:none !important}" });
    // walk the page once so every reveal has fired, then come back
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y); await new Promise((r) => requestAnimationFrame(r));
      }
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 400));
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(900);

    // 1 — hero
    await p.screenshot({ path: `${OUT}/${name}-hero-${w}.png` });

    // 2 — one mid section, its top parked just under the fixed header
    const mid = await p.evaluate(() => {
      const secs = [...document.querySelectorAll("main > section, main > div > section")]
        .filter((s) => s.getBoundingClientRect().height > 200);
      if (!secs.length) return null;
      const s = secs[Math.floor(secs.length / 2)];
      const hdr = document.querySelector("header");
      const y = s.getBoundingClientRect().top + window.scrollY - (hdr ? hdr.getBoundingClientRect().height : 0) - 8;
      window.scrollTo(0, Math.max(0, Math.round(y)));
      return { cls: s.className.split(/\s+/)[0], of: secs.length, i: Math.floor(secs.length / 2) };
    });
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${OUT}/${name}-mid-${w}.png` });

    // 3 — footer
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${OUT}/${name}-footer-${w}.png` });

    console.log(`${String(w).padEnd(5)} ${name.padEnd(9)} mid=${mid ? mid.cls + " (" + (mid.i + 1) + "/" + mid.of + ")" : "none"}`);
  }
  await ctx.close();
}
await b.close();
console.log("review shots written to " + OUT);
