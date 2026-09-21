/* careers-joint.mjs — measures the glance->stages seam and the page's own rhythm. */
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:3120";
const b = await chromium.launch();
for (const vp of [
  { id: "1440", width: 1440, height: 900, dpr: 1, mobile: false },
  { id: "390", width: 390, height: 844, dpr: 2, mobile: true },
]) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, isMobile: vp.mobile, hasTouch: vp.mobile });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/opportunities`, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: "html{scroll-behavior:auto!important} nextjs-portal{display:none!important}" });
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 500) { await p.evaluate((yy) => scrollTo(0, yy), y); await p.waitForTimeout(30); }
  await p.evaluate(() => scrollTo(0, 0));
  await p.waitForTimeout(300);
  const m = await p.evaluate(() => {
    const top = (el) => el.getBoundingClientRect().top + scrollY;
    const bot = (el) => el.getBoundingClientRect().bottom + scrollY;
    const glance = document.querySelector("#glance");
    const gHead = document.querySelector("#glance header");
    const grid = document.querySelector("#glance ol");
    const items = [...document.querySelectorAll("#glance ol > li")];
    const stages = document.querySelector("#stages");
    const sHead = document.querySelector("#stages header");
    const rungs = [...document.querySelectorAll("#stages ol > li")];
    return {
      headBottomToGridRule: Math.round(top(grid) - bot(gHead)),
      gridRuleToRowTwoRule: Math.round(top(items[2]) - top(items[0])),
      gridBottomToStagesRule: Math.round(top(sHead) - bot(grid)),
      glancePadBottom: getComputedStyle(glance).paddingBottom,
      stagesPadTop: getComputedStyle(stages).paddingTop,
      gridClosingRule: getComputedStyle(items[items.length - 1]).borderBottomWidth,
      stagesHeadRule: getComputedStyle(sHead).borderTopWidth,
      stagesHeadPadTop: getComputedStyle(sHead).paddingTop,
      rungGap: rungs.length > 1 ? Math.round(top(rungs[1]) - top(rungs[0])) : null,
      stagesHeadToFirstRung: Math.round(top(rungs[0]) - bot(sHead)),
      /* Comparable joints elsewhere: the page head into the glance rule, and
         the ledger's last rule into the closing band. */
      pageHeadToGlanceRule: Math.round(top(gHead) - bot(document.querySelector("header[class*=pageHead]"))),
      ledgerBottomToCloser: Math.round(top(document.querySelector("#apply")) - bot(document.querySelector("#stages ol"))),
      noteTop: Math.round(top(document.querySelector("#stages > div > p")) - bot(document.querySelector("#stages ol"))),
    };
  });
  console.log(vp.id, JSON.stringify(m, null, 1));
  await ctx.close();
}
await b.close();
