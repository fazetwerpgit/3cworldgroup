/*
  node docs/cinematic/review/motion-pages.mjs

  The Services and About motion pass, watched in a real browser.

  It captures the Services head 100ms and 800ms after load, each service row
  mid-reveal and settled, the About three C's mid-reveal and settled, and two
  control runs — reduced motion and JavaScript off — where everything must be
  visible immediately. It also asserts the two things this pass is not allowed
  to break: no horizontal overflow, and a figure whose box is identical before
  and after its photograph reveals.

  Shots land in .tmpshots/motion/pages/. Nothing is written to the repo.
*/

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://127.0.0.1:3120";
const OUT = ".tmpshots/motion/pages";

// Scroll behaviour and the dev overlay both ruin a screenshot taken mid-reveal.
const CALM = `html{scroll-behavior:auto!important} nextjs-portal{display:none!important}`;

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
  { name: "1366short", width: 1366, height: 640 },
  { name: "390", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
];

const failures = [];
const notes = [];

function check(ok, message) {
  if (ok) return;
  failures.push(message);
}

async function newPage(browser, vp, opts = {}) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile ?? false,
    hasTouch: vp.hasTouch ?? false,
    deviceScaleFactor: vp.deviceScaleFactor ?? 1,
    ...opts,
  });
  // Injected at document start, not after load: the head has to already be calm
  // when the 100ms frame is taken, and `addStyleTag` needs a <head> to exist.
  await context.addInitScript((css) => {
    const write = () => {
      const style = document.createElement("style");
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    };
    if (document.documentElement) write();
    else document.addEventListener("readystatechange", write, { once: true });
  }, CALM);
  const page = await context.newPage();
  return { context, page };
}

/* Assert the page never scrolls sideways — a translate that spilled would show up here. */
async function assertNoHScroll(page, label) {
  const over = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  check(
    over.scrollWidth <= over.innerWidth + 1,
    `${label}: horizontal overflow (${over.scrollWidth} > ${over.innerWidth})`,
  );
}

/* ------------------------------------------------------------------ */
/* Services head: the entrance keyed on [data-entered]                 */
/* ------------------------------------------------------------------ */
async function servicesHead(browser, vp) {
  const { context, page } = await newPage(browser, vp);
  await page.goto(`${BASE}/services`, { waitUntil: "commit" });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${OUT}/services-head-100ms-${vp.name}.png` });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/services-head-800ms-${vp.name}.png` });

  // The primary call to action has to be hittable the whole time, not only once settled.
  const cta = page.locator("header a", { hasText: "Start selling" }).first();
  const box = await cta.boundingBox();
  check(box !== null && box.height > 0, `services head ${vp.name}: CTA has no box`);
  const blocked = await page.evaluate(() => {
    const el = document.querySelector("header a");
    if (!el) return "missing";
    return getComputedStyle(el).pointerEvents;
  });
  check(blocked !== "none", `services head ${vp.name}: CTA pointer-events is none`);

  const settled = await page.evaluate(() => {
    const head = document.querySelector("header h1");
    return head ? Number(getComputedStyle(head).opacity) : -1;
  });
  check(settled > 0.99, `services head ${vp.name}: headline never reached opacity 1 (${settled})`);

  await assertNoHScroll(page, `services head ${vp.name}`);
  await context.close();
}

/* ------------------------------------------------------------------ */
/* Services rows: mid-reveal, settled, and a figure box that holds     */
/* ------------------------------------------------------------------ */
async function servicesRows(browser, vp) {
  const { context, page } = await newPage(browser, vp);
  await page.goto(`${BASE}/services`, { waitUntil: "load" });
  await page.waitForTimeout(400);

  // Document coordinates, not viewport: the box is compared across a scroll,
  // so a viewport-relative rect would report the scroll itself as movement.
  const figureBox = (sel) =>
    page.evaluate((s) => {
      const el = document.querySelector(`${s} div[class*="bandArt"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round((r.top + window.scrollY) * 100) / 100,
        left: Math.round((r.left + window.scrollX) * 100) / 100,
        width: Math.round(r.width * 100) / 100,
        height: Math.round(r.height * 100) / 100,
      };
    }, sel);

  const ids = ["fiber", "tv", "security"];
  for (const id of ids) {

    // Park the row just below the fold, then bring it in, so the reveal is
    // actually triggered by entering the viewport rather than already fired.
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, Math.max(0, top - window.innerHeight - 200));
    }, `#${id}`);
    await page.waitForTimeout(350);

    const before = await figureBox(`#${id}`);

    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, Math.max(0, top - window.innerHeight * 0.2));
    }, `#${id}`);

    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/services-${id}-mid-${vp.name}.png` });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/services-${id}-settled-${vp.name}.png` });

    const after = await figureBox(`#${id}`);
    check(
      before &&
        after &&
        Math.abs(before.top - after.top) < 0.5 &&
        Math.abs(before.left - after.left) < 0.5 &&
        Math.abs(before.width - after.width) < 0.5 &&
        Math.abs(before.height - after.height) < 0.5,
      `services ${id} ${vp.name}: figure box moved (${JSON.stringify(before)} -> ${JSON.stringify(after)})`,
    );

    const state = await page.evaluate((sel) => {
      const row = document.querySelector(sel);
      if (!row) return null;
      const copy = row.hasAttribute("data-reveal") ? row : null;
      const img = row.querySelector("img");
      const last = row.querySelector("ul");
      return {
        img: img ? Number(getComputedStyle(img).opacity) : -1,
        list: last ? Number(getComputedStyle(last).opacity) : -1,
        copyShown: copy ? copy.hasAttribute("data-shown") : false,
      };
    }, `#${id}`);
    check(state && state.img > 0.99, `services ${id} ${vp.name}: photo settled at ${state?.img}`);
    check(state && state.list > 0.99, `services ${id} ${vp.name}: point list settled at ${state?.list}`);

    await assertNoHScroll(page, `services ${id} ${vp.name}`);
  }

  await context.close();
}

/* ------------------------------------------------------------------ */
/* About: the three C's                                                */
/* ------------------------------------------------------------------ */
async function aboutValues(browser, vp) {
  const { context, page } = await newPage(browser, vp);
  await page.goto(`${BASE}/about`, { waitUntil: "load" });
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    const el = document.querySelector("#values");
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, top - window.innerHeight - 200));
  });
  await page.waitForTimeout(350);

  const artBefore = await page.evaluate(() => {
    const img = document.querySelector("#values img");
    if (!img) return null;
    const r = img.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), t: getComputedStyle(img).transform };
  });

  await page.evaluate(() => {
    const el = document.querySelector("#values");
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, top - window.innerHeight * 0.12));
  });

  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/about-values-mid-${vp.name}.png` });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/about-values-mid2-${vp.name}.png` });
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${OUT}/about-values-settled-${vp.name}.png` });

  const artAfter = await page.evaluate(() => {
    const img = document.querySelector("#values img");
    if (!img) return null;
    const r = img.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), t: getComputedStyle(img).transform };
  });
  check(
    artBefore && artAfter && artBefore.w === artAfter.w && artBefore.h === artAfter.h && artBefore.t === artAfter.t,
    `about values ${vp.name}: background photograph moved (${JSON.stringify(artBefore)} -> ${JSON.stringify(artAfter)})`,
  );

  const rows = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("#values dl > div").forEach((row) => {
      const dt = row.querySelector("dt");
      const dd = row.querySelector("dd");
      out.push({
        shown: row.hasAttribute("data-shown"),
        delay: getComputedStyle(row).transitionDelay,
        row: Number(getComputedStyle(row).opacity),
        dt: dt ? Number(getComputedStyle(dt).opacity) : -1,
        dd: dd ? Number(getComputedStyle(dd).opacity) : -1,
      });
    });
    return out;
  });
  check(rows.length === 3, `about values ${vp.name}: expected 3 rows, got ${rows.length}`);
  rows.forEach((r, i) => {
    check(r.row > 0.99, `about values ${vp.name}: row ${i + 1} settled at ${r.row}`);
    // One reveal per row: the term and its line never carry their own opacity.
    check(r.dt === 1 && r.dd === 1, `about values ${vp.name}: row ${i + 1} animates its children`);
  });
  notes.push(`about values ${vp.name} delays: ${rows.map((r) => r.delay).join(" / ")}`);

  await assertNoHScroll(page, `about values ${vp.name}`);
  await context.close();
}

/* ------------------------------------------------------------------ */
/* Controls: reduced motion, and JavaScript off                        */
/* ------------------------------------------------------------------ */
async function control(browser, vp, mode) {
  const opts =
    mode === "reduced" ? { reducedMotion: "reduce" } : { javaScriptEnabled: false };
  const { context, page } = await newPage(browser, vp, opts);

  for (const route of ["services", "about"]) {
    await page.goto(`${BASE}/${route}`, { waitUntil: "load" });
    await page.waitForTimeout(250);

    const hidden = await page.evaluate(() => {
      const out = [];
      const sel = [
        "header h1",
        "header p",
        "#fiber img",
        "#fiber h3",
        "#fiber ul",
        "#tv img",
        "#security img",
        "#values dl > div",
        "#values dt",
        "#values dd",
      ];
      sel.forEach((s) => {
        document.querySelectorAll(s).forEach((el) => {
          const cs = getComputedStyle(el);
          if (Number(cs.opacity) < 0.99) out.push(`${s} opacity ${cs.opacity}`);
          if (cs.transform !== "none" && !/matrix\(1, 0, 0, 1, 0, 0\)/.test(cs.transform)) {
            // A crop scale is legitimate; a translate is not.
            const m = cs.transform.match(/matrix\(([^)]+)\)/);
            if (m) {
              const parts = m[1].split(",").map(Number);
              if (Math.abs(parts[4]) > 0.5 || Math.abs(parts[5]) > 0.5) {
                out.push(`${s} translated ${cs.transform}`);
              }
            }
          }
        });
      });
      return out;
    });
    check(hidden.length === 0, `${mode} ${route} ${vp.name}: not fully visible — ${hidden.join("; ")}`);

    await page.screenshot({
      path: `${OUT}/${mode}-${route}-${vp.name}.png`,
      fullPage: false,
    });
    if (mode === "reduced") await assertNoHScroll(page, `${mode} ${route} ${vp.name}`);
  }

  await context.close();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    await servicesHead(browser, vp);
    await servicesRows(browser, vp);
    await aboutValues(browser, vp);
  }

  // Controls only need one wide and one phone frame: they are about state, not layout.
  for (const vp of [VIEWPORTS[0], VIEWPORTS[3]]) {
    await control(browser, vp, "reduced");
    await control(browser, vp, "nojs");
  }

  await browser.close();

  notes.forEach((n) => console.log(`note  ${n}`));
  if (failures.length) {
    failures.forEach((f) => console.log(`FAIL  ${f}`));
    console.log(`\n${failures.length} failure(s)`);
    process.exitCode = 1;
  } else {
    console.log("\nall checks passed");
  }
  console.log(`shots: ${OUT}`);
}

main();
