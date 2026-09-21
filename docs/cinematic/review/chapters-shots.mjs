/*
  Shots of the "Three things happen at every door" section, one pass per
  viewport, at each of the three chapter states plus the release.

  Run it with a label — `node ... before` — and it writes into
  .tmpshots/motion/chapters/<label>/. Run it twice around a change and the
  two folders are the before/after board.
*/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3120";
const LABEL = process.argv[2] || "now";
const OUT = `.tmpshots/motion/chapters/${LABEL}`;
const VPS = [
  ["1440x900", 1440, 900],
  ["1920x1080", 1920, 1080],
  ["1366x640", 1366, 640],
  ["390x844", 390, 844],
  ["360x780", 360, 780],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

for (const [name, width, height] of VPS) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    const s = document.createElement("style");
    s.textContent = "html{scroll-behavior:auto!important}nextjs-portal{display:none!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
  });
  const page = await ctx.newPage();
  /*
    Group requests by the SOURCE photograph, not by URL. Two elements showing
    the same file at two different `sizes` resolve to two different srcset
    entries, which are two different URLs and therefore two downloads of the
    same picture — exactly the thing being checked, and invisible if you only
    count distinct URLs.
  */
  const byPhoto = new Map();
  page.on("response", (r) => {
    const u = r.url();
    if (!/\/_next\/image|\.webp/.test(u)) return;
    let key = u;
    try {
      const q = new URL(u).searchParams.get("url");
      if (q) key = q;
    } catch {}
    if (!byPhoto.has(key)) byPhoto.set(key, new Set());
    byPhoto.get(key).add(u);
  });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  const geom = await page.evaluate(() => {
    const sticky = document.querySelector("[data-chapter-stage]");
    const chs = [...document.querySelectorAll("[data-chapter]")];
    const cap = document.querySelector("[data-stage-caption]");
    const list = chs[0]?.parentElement;
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    return {
      stickyH: Math.round(r(sticky)?.height || 0),
      captionH: cap ? Math.round(r(cap).height + parseFloat(getComputedStyle(cap).marginTop)) : 0,
      beats: chs.map((c) => Math.round(r(c).height)),
      listBottomPad: list ? Math.round(parseFloat(getComputedStyle(list).paddingBottom)) : 0,
      fade: getComputedStyle(document.querySelector("[data-layer]")).transitionDuration,
    };
  });
  console.log(`${name} sticky=${geom.stickyH} caption=${geom.captionH} beats=${geom.beats.join("/")} listPad=${geom.listBottomPad} fade=${geom.fade}`);

  /*
    Below 900px there is no sticky stage and `data-active-chapter` never moves,
    so walking the states would shoot the top of the page three times. Shoot
    each chapter where it sits instead — which is the layout, and the only
    thing there is to look at down here.
  */
  if (width < 900) {
    const tops = await page.evaluate(() =>
      [...document.querySelectorAll("[data-chapter]")].map((c) => Math.round(c.getBoundingClientRect().top + scrollY)));
    for (const [i, t] of tops.entries()) {
      await page.evaluate((v) => scrollTo(0, v), Math.max(0, t - 40));
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/${name}-chapter${i}.png` });
    }
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);
    const chapterPhotosN = [...byPhoto.entries()].filter(([k]) => /home-threshold|home-room|security-garage/.test(k));
    console.log(`   chapter photos fetched: ${chapterPhotosN.map(([k, urls]) => `${k.split("/").pop()}x${urls.size}`).join(" ")}`);
    await ctx.close();
    continue;
  }

  // One frame per chapter state, taken at the scroll where that state begins.
  const top = await page.evaluate(() => {
    const c = document.querySelector("[data-chapter]").parentElement.parentElement;
    return Math.round(c.getBoundingClientRect().top + scrollY);
  });
  const states = new Set();
  for (let y = Math.max(0, top - height); y < top + 3200; y += 24) {
    await page.evaluate((v) => scrollTo(0, v), y);
    await page.waitForTimeout(24);
    const a = await page.evaluate(() => document.querySelector("[data-chapter-stage]")?.dataset.activeChapter ?? "-");
    if (!states.has(a)) {
      states.add(a);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${name}-chapter${a}.png` });
    }
  }
  await page.evaluate((v) => scrollTo(0, v), top + 3400);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}-release.png` });

  const chapterPhotos = [...byPhoto.entries()].filter(([k]) => /home-threshold|home-room|security-garage/.test(k));
  const multi = chapterPhotos.filter(([, urls]) => urls.size > 1);
  console.log(`   chapter photos fetched: ${chapterPhotos.map(([k, urls]) => `${k.split("/").pop()}x${urls.size}`).join(" ")}${multi.length ? "  <-- FETCHED TWICE" : ""}`);
  await ctx.close();
}
await browser.close();
console.log(`shots in ${OUT}`);
