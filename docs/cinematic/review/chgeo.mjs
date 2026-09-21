import { chromium } from "playwright";
const b = await chromium.launch();
for (const W of [1740, 1440]) {
const ctx = await b.newContext({ viewport: { width: W, height: 1000 } });
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:3120/", { waitUntil: "networkidle" });
await p.addStyleTag({ content: "html{scroll-behavior:auto !important} nextjs-portal{display:none!important}" });
for (let i = 0; i < 3; i++) {
  await p.evaluate(async (i) => {
    const el = document.querySelectorAll("[data-chapter]")[i];
    const y = el.getBoundingClientRect().top + scrollY - innerHeight * 0.3;
    const from = scrollY;
    for (let k = 1; k <= 24; k++) { scrollTo(0, from + ((y - from) * k) / 24); await new Promise(r => requestAnimationFrame(r)); }
  }, i);
  await p.waitForTimeout(600);
  const g = await p.evaluate(() => {
    const st = document.querySelector("[data-chapter-stage]").getBoundingClientRect();
    const tops = [...document.querySelectorAll("[data-chapter]")].map(c => Math.round(c.getBoundingClientRect().top));
    return { stageTop: Math.round(st.top), stageH: Math.round(st.height), tops,
             active: document.querySelector("[data-active-chapter]").dataset.activeChapter };
  });
  console.log(W, "scrollTo ch"+i, JSON.stringify(g));
}
await ctx.close();
}
await b.close();
