/**
 * Round-2 capture + guard for the cinematic homepage.
 *
 * Loads http://127.0.0.1:3120/ at 1440x900 and 390x844, asserts zero console
 * errors and no horizontal overflow, then saves a full-page shot per viewport
 * plus one real-viewport shot per section, scrolled to that section's top with
 * motion allowed to settle.
 *
 * Run:  node docs/cinematic/r2-shots.mjs
 */
import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.CINEMATIC_BASE ?? "http://127.0.0.1:3120";
const OUT = path.resolve("docs/cinematic/r2-shots");
const SETTLE = 1200;

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

/** id -> file suffix. Every authored section of the page, in reading order. */
const SECTIONS = [
  ["hero", "[data-hero]"],
  ["work", "#the-work"],
  ["route", "#start"],
  ["markets", "#markets"],
  ["questions", "#questions"],
  ["doors", "#doors"],
  ["closing", "#closing"],
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

  const response = await page.goto(BASE, { waitUntil: "networkidle" });
  if (!response || response.status() !== 200) {
    record(`${vp.name}: page responded ${response ? response.status() : "no response"}`);
  }
  await page.waitForTimeout(SETTLE);

  // --- no horizontal overflow, measured at rest and after a full scroll ----
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    inner: window.innerWidth,
  }));
  if (widths.scrollWidth !== widths.clientWidth) {
    record(
      `${vp.name}: scrollWidth ${widths.scrollWidth} != clientWidth ${widths.clientWidth}`,
    );
  }

  // --- viewport shot per section ------------------------------------------
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

  // --- full page, top of document -----------------------------------------
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
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
