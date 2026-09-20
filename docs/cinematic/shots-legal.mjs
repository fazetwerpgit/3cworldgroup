/**
 * Capture + guard for the two legal routes (/privacy, /terms).
 *
 * They are the quietest pages in the group — flat page head, one paper section,
 * no photography — so there is nothing to measure for contrast here. What has
 * to hold is that they are the *same site*: the cinematic chrome, the kit's
 * page head, a seam under it, zero console errors and no horizontal overflow at
 * either reviewed width.
 *
 * Saves a viewport shot of the head and of the top of the document body at 1440
 * and 390, plus a full-page shot at each.
 *
 * Run:  node docs/cinematic/shots-legal.mjs
 */
import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.CINEMATIC_BASE ?? "http://127.0.0.1:3120";
const OUT = path.resolve("docs/cinematic/shots-legal");
const SETTLE = 900;

const ROUTES = [
  { name: "privacy", href: "/privacy", title: "Privacy Policy", clauses: 12 },
  { name: "terms", href: "/terms", title: "Terms of Service", clauses: 15 },
];

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

const failures = [];
const record = (message) => {
  failures.push(message);
  console.error(`FAIL  ${message}`);
};

async function scrollTo(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, top - 8), behavior: "instant" });
  }, selector);
  await page.waitForTimeout(SETTLE);
}

const browser = await chromium.launch();
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const route of ROUTES) {
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

    const response = await page.goto(`${BASE}${route.href}`, { waitUntil: "networkidle" });
    if (!response || response.status() !== 200) {
      record(`${route.name} ${vp.name}: responded ${response ? response.status() : "no response"}`);
    }
    await page.waitForTimeout(SETTLE);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });

    // --- the page is in the cinematic group, not the old chrome --------------
    const shape = await page.evaluate(() => ({
      chrome: !!document.querySelector('header a[href="/apply"]'),
      wrapper: !!document.querySelector(".public-site"),
      h1: document.querySelector("h1")?.textContent?.trim() ?? null,
      h2s: document.querySelectorAll("main h2").length,
      effective: /last updated:\s*may 6, 2026/i.test(document.body.innerText),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    if (!shape.chrome) record(`${route.name} ${vp.name}: cinematic chrome missing`);
    if (shape.wrapper) record(`${route.name} ${vp.name}: still inside the old .public-site wrapper`);
    if (shape.h1 !== route.title) record(`${route.name} ${vp.name}: h1 is ${JSON.stringify(shape.h1)}`);
    if (shape.h2s !== route.clauses) {
      record(`${route.name} ${vp.name}: ${shape.h2s} clause headings, expected ${route.clauses}`);
    }
    if (!shape.effective) record(`${route.name} ${vp.name}: effective date missing`);
    if (shape.scrollWidth !== shape.clientWidth) {
      record(`${route.name} ${vp.name}: scrollWidth ${shape.scrollWidth} != clientWidth ${shape.clientWidth}`);
    }

    // --- the measure stays readable ------------------------------------------
    const measure = await page.evaluate(() => {
      const p = document.querySelector("main section section p");
      return p ? Math.round(p.getBoundingClientRect().width) : null;
    });
    if (measure === null) record(`${route.name} ${vp.name}: no clause paragraph found`);
    else console.log(`ok    ${route.name} ${vp.name}: first clause paragraph ${measure}px wide`);

    // --- shots ---------------------------------------------------------------
    await page.screenshot({ path: path.join(OUT, `vp-${route.name}-${vp.name}-head.png`) });
    await scrollTo(page, "main section:nth-of-type(1)");
    await page.screenshot({ path: path.join(OUT, `vp-${route.name}-${vp.name}-body.png`) });
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
    await page.waitForTimeout(SETTLE);
    await page.screenshot({ path: path.join(OUT, `vp-${route.name}-${vp.name}-close.png`) });

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(SETTLE);
    await page.screenshot({ path: path.join(OUT, `fullpage-${route.name}-${vp.name}.png`), fullPage: true });

    if (consoleErrors.length) {
      record(`${route.name} ${vp.name}: ${consoleErrors.length} console error(s): ${consoleErrors.join(" // ")}`);
    } else {
      console.log(`ok    ${route.name} ${vp.name}: 0 console errors, no overflow (${shape.clientWidth})`);
    }

    await context.close();
  }
}

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} failure(s).`);
  process.exit(1);
}
console.log(`\nAll checks passed. Shots in ${OUT}`);
