/*
  careers-refine.mjs — R16 on /opportunities: the 2x2 glance grid, the renamed
  stages chapter, and the markets link in the head.

  node docs/cinematic/review/careers-refine.mjs [tag]

  Shoots the two viewports the round is judged at, measures the grid's own
  hairlines against the paper they stand on, resolves both outbound hrefs, and
  follows the markets link to check the target heading clears the fixed header.
*/
import { chromium } from "playwright";
import fs from "node:fs";

const tag = process.argv[2] || "after";
const BASE = "http://127.0.0.1:3120";
const OUT = ".tmpshots/motion/careers/refine";
fs.mkdirSync(OUT, { recursive: true });

const CSS = "html{scroll-behavior:auto!important} nextjs-portal{display:none!important}";

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = ([r, g, b]) => 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
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
  await page.waitForTimeout(400);

  const boxes = await page.evaluate(() => {
    const r = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: b.top + scrollY, height: b.height, width: b.width };
    };
    return { glance: r("#glance"), stages: r("#stages"), head: r("header[class*=pageHead]") };
  });

  const shoot = async (name, box) => {
    await page.screenshot({
      path: `${OUT}/${tag}-${vp.id}-${name}.png`,
      clip: { x: 0, y: box.top, width: vp.width, height: Math.min(box.height, 6000) },
      fullPage: true,
    });
  };
  await shoot("glance", boxes.glance);
  await shoot("stages", boxes.stages);
  /* The head, so the markets link is judged next to the eyebrow it answers,
     and a tight crop of the eyebrow line itself. */
  await shoot("head", { top: 0, height: Math.min(boxes.head.height, vp.height * 1.4) });
  const eb = await page.locator("[class*=headEyebrow]").boundingBox();
  if (eb) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    await page.screenshot({
      path: `${OUT}/${tag}-${vp.id}-eyebrow.png`,
      clip: {
        x: Math.max(0, eb.x - 20),
        y: Math.max(0, eb.y - 30),
        width: Math.min(vp.width, eb.width + 160),
        height: eb.height + 70,
      },
    });
  }
  /* The joint: glance foot into the stages head, one frame. */
  await shoot("joint", {
    top: Math.max(0, boxes.glance.top + boxes.glance.height - 420),
    height: 900,
  });

  const probe = await page.evaluate(() => {
    const cs = (sel, prop) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el)[prop] : null;
    };
    const sec = document.querySelector("#glance");
    const items = [...document.querySelectorAll("#glance ol > li")];
    const stages = document.querySelector("#stages");
    const link = document.querySelector('a[href="/#markets"]');
    const rects = items.map((el) => {
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y + scrollY), w: Math.round(b.width), h: Math.round(b.height) };
    });
    const note = document.querySelector("#glance ol > li:first-child p:last-of-type");
    return {
      sectionBg: getComputedStyle(sec).backgroundColor,
      stagesBg: getComputedStyle(stages).backgroundColor,
      glanceHeight: Math.round(sec.getBoundingClientRect().height),
      stagesHeading: document.querySelector("#stages-title")?.innerText.replace(/\n/g, " "),
      itemCount: items.length,
      itemRects: rects,
      columns: getComputedStyle(document.querySelector("#glance ol")).gridTemplateColumns,
      itemTitle: cs("#glance ol > li h3", "color"),
      itemBody: cs("#glance ol > li p", "color"),
      itemRule: cs("#glance ol > li", "borderTopColor"),
      colRule: cs("#glance ol > li:nth-child(2)", "borderLeftColor"),
      colRuleWidth: cs("#glance ol > li:nth-child(2)", "borderLeftWidth"),
      lastRuleBottom: cs("#glance ol > li:last-child", "borderBottomWidth"),
      noteText: note?.innerText,
      noteColor: note ? getComputedStyle(note).color : null,
      stageThree: [...document.querySelectorAll("#stages ol > li")].map((li) => li.innerText.replace(/\n/g, " | ")),
      linkText: link?.innerText.trim(),
      linkHref: link?.getAttribute("href"),
      linkBox: link ? (() => { const b = link.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; })() : null,
      linkColor: link ? getComputedStyle(link).color : null,
      applyHrefs: [...document.querySelectorAll('a[href*="apply"]')].map((a) => a.getAttribute("href")),
      revealDelays: items.map((el) => getComputedStyle(el).transitionDelay),
      jointPx: Math.round(stages.getBoundingClientRect().top - (sec.getBoundingClientRect().top + sec.getBoundingClientRect().height)),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      docWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });

  const bg = parse(probe.sectionBg);
  const rows = [
    ["item title", probe.itemTitle],
    ["item body", probe.itemBody],
    ["row hairline", probe.itemRule],
    ["column hairline", probe.colRule],
    ["contractor note", probe.noteColor],
  ]
    .filter(([, v]) => v)
    .map(([name, v]) => {
      const c = parse(v);
      return { name, value: v, ratio: +ratio(over(c, bg), bg).toFixed(2) };
    });

  /* Follow the markets link and check the target heading clears the header. */
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('a[href="/#markets"]');
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(700);
  const anchor = await page.evaluate(() => {
    const sec = document.querySelector("#markets");
    const title = document.querySelector("#markets-title");
    const hdr = document.querySelector("header[class*=header], body > div header, header");
    const hb = hdr ? hdr.getBoundingClientRect() : null;
    return {
      url: location.href,
      sectionFound: !!sec,
      sectionTop: sec ? Math.round(sec.getBoundingClientRect().top) : null,
      titleTop: title ? Math.round(title.getBoundingClientRect().top) : null,
      headerBottom: hb ? Math.round(hb.bottom) : null,
      headerFixed: hdr ? getComputedStyle(hdr).position : null,
      clear: title && hb ? Math.round(title.getBoundingClientRect().top - hb.bottom) : null,
    };
  });
  await page.screenshot({ path: `${OUT}/${tag}-${vp.id}-markets-anchor.png` });

  report[vp.id] = { probe, rows, anchor };

  console.log(`\n=== ${vp.id} ===  glance bg ${probe.sectionBg}, height ${probe.glanceHeight}px`);
  console.log(`overflow ${probe.overflow}px (doc ${probe.docWidth} vs inner ${probe.innerWidth}) -> ${probe.docWidth <= probe.innerWidth ? "OK" : "FAIL"}`);
  console.log(`stages heading: "${probe.stagesHeading}"`);
  console.log(`grid columns: ${probe.columns}  items ${probe.itemCount}`);
  console.log(`item rects: ${probe.itemRects.map((r) => `${r.x},${r.y} ${r.w}x${r.h}`).join("  ")}`);
  console.log(`reveal delays: ${probe.revealDelays.join(", ")}`);
  console.log(`col rule ${probe.colRule} @ ${probe.colRuleWidth}; closing rule width ${probe.lastRuleBottom}`);
  console.log(`note: "${probe.noteText}" ${probe.noteColor}`);
  console.log(`stage rows:\n  ${probe.stageThree.join("\n  ")}`);
  console.log(`link "${probe.linkText}" -> ${probe.linkHref} box ${probe.linkBox?.w}x${probe.linkBox?.h} ${probe.linkColor}`);
  console.log(`apply hrefs: ${[...new Set(probe.applyHrefs)].join(", ")}`);
  console.log(`joint glance->stages ${probe.jointPx}px`);
  for (const r of rows) console.log(`  ${r.name.padEnd(18)} ${r.value.padEnd(28)} ${String(r.ratio).padStart(6)}:1`);
  console.log(`anchor: ${anchor.url} section ${anchor.sectionFound ? "found" : "MISSING"}, title ${anchor.titleTop}px, header bottom ${anchor.headerBottom}px (${anchor.headerFixed}), clear ${anchor.clear}px`);

  await ctx.close();
}

/* The two outbound targets, over HTTP, without submitting anything. */
for (const url of [`${BASE}/apply`, `${BASE}/`, `${BASE}/opportunities`]) {
  const res = await fetch(url, { redirect: "follow" });
  console.log(`GET ${url} -> ${res.status}`);
  report.http = { ...(report.http || {}), [url]: res.status };
}

fs.writeFileSync(`${OUT}/${tag}-report.json`, JSON.stringify(report, null, 2));
await browser.close();
console.log(`\nwrote ${OUT}/${tag}-*.png and ${tag}-report.json`);
