import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "http://127.0.0.1:3120";
const OUT = process.argv[2] || "docs/cinematic/shots-r8";
const routes = (process.argv[3] ? process.argv[3].split(",").map(r => [r === "home" ? "/" : r === "careers" ? "/opportunities" : "/" + r, r]) : [["/", "home"], ["/about", "about"], ["/services", "services"],
                ["/opportunities", "careers"], ["/contact", "contact"], ["/apply", "apply"]]);
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
for (const [w, h] of [[1740, 1000], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  for (const [route, name] of routes) {
    await p.goto(BASE + route, { waitUntil: "networkidle" });
    await p.addStyleTag({ content: "html{scroll-behavior:auto !important} nextjs-portal{display:none !important}" });
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => requestAnimationFrame(r)); }
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 400));
      window.scrollTo(0, 0);
    });
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}/${name}-${w}-1hero.png` });
    // two mid sections at the thirds of the section run
    for (const [n, slot] of [["2mid", 0], ["3mid", 1]]) {
      const got = await p.evaluate((slot) => {
        const secs = [...document.querySelectorAll("main section, main > div > section")]
          .filter((s) => s.getBoundingClientRect().height > 240 && !s.closest("footer"));
        if (!secs.length) return null;
        // distinct thirds: never land on the same section twice
        const last = secs.length - 1;
        let a = Math.min(last, Math.round(last * 0.34));
        let b = Math.min(last, Math.round(last * 0.7));
        if (b <= a) b = Math.min(last, a + 1);
        if (b === a && a > 0) a = a - 1;
        const s = secs[slot === 0 ? a : b];
        const hdr = document.querySelector("header");
        const y = s.getBoundingClientRect().top + window.scrollY - (hdr ? hdr.getBoundingClientRect().height : 0) - 6;
        window.scrollTo(0, Math.max(0, Math.round(y)));
        return s.id || s.className.split(/\s+/)[0].replace(/^.*__/, "");
      }, slot);
      await p.waitForTimeout(700);
      await p.screenshot({ path: `${OUT}/${name}-${w}-${n}-${got}.png` });
    }
    // footer
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}/${name}-${w}-4footer.png` });
    console.log(name, w, "done");
  }
  await ctx.close();
}
await b.close();
