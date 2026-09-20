/**
 * Capture + guard for the cinematic Careers page (/opportunities).
 *
 * Loads http://127.0.0.1:3120/opportunities at 390, 768, 1024, 1440 and 1920.
 * At every width it asserts a 200, zero console errors and
 * scrollWidth == clientWidth, then saves a full-page shot. At 1440 and 390 it
 * also saves a real-viewport shot per section, scrolled to that section's top
 * with the reveals allowed to settle.
 *
 * Run:  node docs/cinematic/shots-careers.mjs
 */
import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.CINEMATIC_BASE ?? "http://127.0.0.1:3120";
const URL = `${BASE}/opportunities`;
const OUT = path.resolve("docs/cinematic/shots-careers");
const SETTLE = 1000;

const VIEWPORTS = [
  { name: "390", width: 390, height: 844, sections: true },
  { name: "768", width: 768, height: 1024, sections: false },
  { name: "1024", width: 1024, height: 768, sections: false },
  { name: "1440", width: 1440, height: 900, sections: true },
  { name: "1920", width: 1920, height: 1080, sections: false },
];

/** Every authored section of the page, in reading order. */
const SECTIONS = [
  ["head", "h1"],
  ["glance", "#glance"],
  ["path", "#how-it-works"],
  ["earnings", "#earnings"],
  ["closing", "#apply"],
];

const failures = [];

function record(message) {
  failures.push(message);
  console.error(`FAIL  ${message}`);
}

const browser = await chromium.launch();
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  const response = await page.goto(URL, { waitUntil: "networkidle" });
  if (!response || response.status() !== 200) {
    record(`${vp.name}: page responded ${response ? response.status() : "no response"}`);
  }
  await page.waitForTimeout(SETTLE);

  // --- no horizontal overflow ----------------------------------------------
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (widths.scrollWidth !== widths.clientWidth) {
    record(`${vp.name}: scrollWidth ${widths.scrollWidth} != clientWidth ${widths.clientWidth}`);
  }

  // --- the nav item for this route has to read as current -------------------
  const current = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[aria-current="page"]')).map((a) => a.textContent.trim()),
  );
  if (!current.includes("Careers")) {
    record(`${vp.name}: no nav link marked aria-current="page" for Careers (saw ${JSON.stringify(current)})`);
  }

  // --- viewport shot per section, at the two reviewed widths ----------------
  if (vp.sections) {
    for (const [name, selector] of SECTIONS) {
      const found = await page.locator(selector).count();
      if (!found) {
        record(`${vp.name}: selector ${selector} matched nothing`);
        continue;
      }
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: Math.max(0, top - 8), behavior: "instant" });
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }, selector);
      await page.waitForTimeout(SETTLE);
      await page.screenshot({ path: path.join(OUT, `vp-${vp.name}-${name}.png`) });
    }
  }

  // Any element wider than the viewport is the usual overflow culprit; name it.
  const wide = await page.evaluate(() => {
    const out = [];
    const limit = document.documentElement.clientWidth + 1;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > limit || r.right > limit + 1 || r.left < -1) {
        if (getComputedStyle(el).position === "fixed") continue;
        out.push(`${el.tagName.toLowerCase()}.${el.className}`.slice(0, 120));
      }
    }
    return out.slice(0, 8);
  });
  if (wide.length) console.warn(`${vp.name}: wide/offscreen elements -> ${wide.join(" | ")}`);

  // --- full page, top of document ------------------------------------------
  // Walk the whole document first. Every reveal is fired by an
  // IntersectionObserver, and `fullPage` resizes the capture rather than
  // scrolling, so anything that never entered a real viewport would be
  // photographed at `opacity: 0` and the shot would show voids the page does
  // not actually have.
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo({ top: y, behavior: "instant" });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(SETTLE);
  await page.screenshot({ path: path.join(OUT, `fullpage-${vp.name}.png`), fullPage: true });

  if (consoleErrors.length) {
    record(`${vp.name}: ${consoleErrors.length} console error(s): ${consoleErrors.join(" // ")}`);
  } else {
    console.log(`ok    ${vp.name}: 0 console errors, scrollWidth == clientWidth (${widths.clientWidth})`);
  }

  await context.close();
}

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} failure(s).`);
  process.exit(1);
}
console.log(`\nAll checks passed. Shots in ${OUT}`);
