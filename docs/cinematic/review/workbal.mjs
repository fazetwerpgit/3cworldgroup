import { chromium } from "playwright";
const b = await chromium.launch();
for (const [w, h] of [[1740, 1000], [1440, 900], [1280, 800]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
  await p.goto("http://127.0.0.1:3120/", { waitUntil: "networkidle" });
  await p.addStyleTag({ content: "html{scroll-behavior:auto !important} nextjs-portal{display:none !important}" });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => requestAnimationFrame(r)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => {
    const lay = document.querySelector("[class*=workLayout]");
    const col = document.querySelector("[class*=stageColumn]");
    const stage = document.querySelector("[data-chapter-stage]");
    const chapters = [...document.querySelectorAll("[data-chapter]")];
    const rail = document.querySelector("[class*=heroRail]");
    const g = (e) => { const x = e.getBoundingClientRect(); return { w: Math.round(x.width), h: Math.round(x.height) }; };
    return { layout: g(lay), col: g(col), stage: g(stage), copyCol: g(lay.children[1]),
             chapterH: chapters.map(c => Math.round(c.getBoundingClientRect().height)),
             railFs: getComputedStyle(rail.querySelector("span")).fontSize,
             stickyTop: getComputedStyle(stage).top, vh: window.innerHeight,
             emptyUnderStage: Math.round(window.innerHeight - parseFloat(getComputedStyle(stage).top) - stage.getBoundingClientRect().height) };
  });
  console.log(w, JSON.stringify(r));
  // park the work section so the stage is pinned
  const top = await p.evaluate(() => document.querySelector("[class*=workLayout]").getBoundingClientRect().top + scrollY);
  await p.evaluate((y) => window.scrollTo(0, y), top + 400);
  await p.waitForTimeout(600);
  await p.screenshot({ path: `docs/cinematic/review/shots/R8-home-work-${w}.png` });
  await p.context().close();
}
await b.close();
