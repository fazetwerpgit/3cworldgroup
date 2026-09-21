import { chromium } from "playwright";
const B = "http://127.0.0.1:3120";
const out = process.argv[2], W = Number(process.argv[3] || 1740);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: W, height: W > 900 ? 1000 : 844 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto(B + "/", { waitUntil: "networkidle" });
await p.addStyleTag({ content: "html{scroll-behavior:auto !important} nextjs-portal{display:none!important}" });
const n = await p.evaluate(() => document.querySelectorAll("[data-chapter]").length);
for (let i = 0; i < n; i++) {
  await p.evaluate(async (i) => {
    const el = document.querySelectorAll("[data-chapter]")[i];
    const y = el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.3;
    const from = window.scrollY;
    for (let k = 1; k <= 24; k++) {
      window.scrollTo(0, from + ((y - from) * k) / 24);
      await new Promise((r) => requestAnimationFrame(r));
    }
  }, i);
  await p.waitForTimeout(1100);
  const state = await p.evaluate(() => document.querySelector("[data-active-chapter]")?.dataset.activeChapter);
  await p.screenshot({ path: `${out}/ch${i}-active${state}.png` });
  console.log(`chapter ${i} -> active ${state}`);
}
await b.close();
