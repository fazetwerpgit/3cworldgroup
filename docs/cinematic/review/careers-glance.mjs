/*
  careers-glance.mjs — the /opportunities hero -> glance -> stages run.

  node docs/cinematic/review/careers-glance.mjs before|after

  Shoots the three viewports the round is judged at, reads the colours the
  glance section actually paints from computed styles (so a token swap is
  measured, not asserted), and checks the document never scrolls sideways.
*/
import { chromium } from "playwright";
import fs from "node:fs";

const tag = process.argv[2] || "after";
const BASE = "http://127.0.0.1:3120";
const OUT = ".tmpshots/motion/careers";
fs.mkdirSync(OUT, { recursive: true });

const CSS = "html{scroll-behavior:auto!important} nextjs-portal{display:none!important}";

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = ([r, g, b]) => 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
/* Flatten a possibly-translucent colour (a hairline is rgba) over its ground. */
const over = (fg, bg) => {
  const a = fg[3] ?? 1;
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
};
const parse = (s) => {
  const n = (s.match(/[\d.]+/g) || []).map(Number);
  return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1];
};

const VPS = [
  { id: "1440", width: 1440, height: 900, dpr: 1, mobile: false },
  { id: "1920", width: 1920, height: 1080, dpr: 1, mobile: false },
  { id: "390", width: 390, height: 844, dpr: 2, mobile: true },
];

const browser = await chromium.launch();
const report = {};

for (const vp of VPS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/opportunities`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: CSS });

  /* Walk the page so every reveal has fired before anything is shot. */
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 400) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(40);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  /* The run under review: the hero foot, the glance, and the joint into the
     stages head. Shot as one strip so the joint is judged, not described. */
  const box = await page.evaluate(() => {
    const glance = document.querySelector("#glance");
    const stages = document.querySelector("#stages");
    const head = document.querySelector("main > header, header");
    const gr = glance.getBoundingClientRect();
    const sr = stages.getBoundingClientRect();
    const hr = head.getBoundingClientRect();
    return {
      top: Math.max(0, hr.top + scrollY + hr.height - 260),
      bottom: sr.top + scrollY + Math.min(sr.height, 620),
      glanceTop: gr.top + scrollY,
      glanceBottom: gr.top + scrollY + gr.height,
      stagesTop: sr.top + scrollY,
    };
  });

  await page.evaluate((y) => window.scrollTo(0, y), box.top);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${tag}-${vp.id}-run-a.png` });
  await page.evaluate((y) => window.scrollTo(0, y), box.glanceBottom - vp.height + 320);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${tag}-${vp.id}-run-b.png` });

  /* Full-page strip of the same run, clipped, for reading the rhythm at once. */
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({
    path: `${OUT}/${tag}-${vp.id}-strip.png`,
    clip: { x: 0, y: box.top, width: vp.width, height: Math.min(box.bottom - box.top, 4000) },
    fullPage: true,
  });

  const probe = await page.evaluate(() => {
    const cs = (sel, prop) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return getComputedStyle(el)[prop];
    };
    const sec = document.querySelector("#glance");
    const secBg = getComputedStyle(sec).backgroundColor;
    const stages = document.querySelector("#stages");
    const glanceStyle = getComputedStyle(sec);
    const stagesStyle = getComputedStyle(stages);
    const lastItem = document.querySelector("#glance li:last-child");
    const headRule = document.querySelector("#stages > div > header");
    return {
      sectionBg: secBg,
      stagesBg: getComputedStyle(stages).backgroundColor,
      heading: cs("#glance-title", "color"),
      lede: cs("#glance h2 + p, #glance header p", "color"),
      itemTitle: cs("#glance li h3", "color"),
      itemBody: cs("#glance li p", "color"),
      itemRule: cs("#glance li", "borderTopColor"),
      lastItemRuleBottom: lastItem ? getComputedStyle(lastItem).borderBottomWidth : null,
      lastItemRuleBottomColor: lastItem ? getComputedStyle(lastItem).borderBottomColor : null,
      headRule: cs("#glance > div > header", "borderTopColor"),
      plateBorder: cs("#glance [class*=glanceArt]", "borderTopColor"),
      stagesHeadRule: headRule ? getComputedStyle(headRule).borderTopColor : null,
      /* The joint: glance's own bottom pad, stages' top pad, and the head's. */
      glancePadBottom: glanceStyle.paddingBottom,
      stagesPadTop: stagesStyle.paddingTop,
      stagesHeadPadTop: headRule ? getComputedStyle(headRule).paddingTop : null,
      jointPx: Math.round(stages.getBoundingClientRect().top - (sec.getBoundingClientRect().top + sec.getBoundingClientRect().height)),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      docWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });

  const bg = parse(probe.sectionBg);
  const rows = [
    ["heading", probe.heading],
    ["lede", probe.lede],
    ["item title", probe.itemTitle],
    ["item body", probe.itemBody],
    ["item hairline", probe.itemRule],
    ["head hairline", probe.headRule],
    ["plate border", probe.plateBorder],
    /* The stages hairline stands on the stages' own ground, not the glance's. */
    ["stages head hairline", probe.stagesHeadRule, parse(probe.stagesBg)],
  ]
    .filter(([, v]) => v)
    .map(([name, v, ground]) => {
      const c = parse(v);
      const g = ground || bg;
      return { name, value: v, flattened: over(c, g).map((n) => Math.round(n)), ratio: +ratio(over(c, g), g).toFixed(2) };
    });

  report[vp.id] = { probe, rows };

  console.log(`\n=== ${vp.id} ===  bg ${probe.sectionBg} / stages ${probe.stagesBg}`);
  console.log(`overflow ${probe.overflow}px (doc ${probe.docWidth} vs client ${probe.clientWidth})`);
  console.log(`joint glance->stages ${probe.jointPx}px  (padB ${probe.glancePadBottom} + padT ${probe.stagesPadTop} + head ${probe.stagesHeadPadTop})`);
  console.log(`glance list closing rule: ${probe.lastItemRuleBottomColor} @ ${probe.lastItemRuleBottom}`);
  for (const r of rows) console.log(`  ${r.name.padEnd(22)} ${r.value.padEnd(30)} ${String(r.ratio).padStart(6)}:1`);

  await ctx.close();
}

fs.writeFileSync(`${OUT}/${tag}-report.json`, JSON.stringify(report, null, 2));
await browser.close();
console.log(`\nwrote ${OUT}/${tag}-*.png and ${tag}-report.json`);
