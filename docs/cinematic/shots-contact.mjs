/**
 * Capture + guard for the cinematic Contact page.
 *
 * Loads http://127.0.0.1:3120/contact at 390, 768, 1024, 1440 and 1920. At each
 * width it asserts zero console errors and scrollWidth == clientWidth, and saves
 * a full-page shot. At 390 and 1440 it also drives the form and saves its three
 * real states — the browser refusing an empty submit, the form filled, and the
 * sent panel.
 *
 * Nothing is ever sent. Every request the page makes is intercepted: anything
 * that is not a GET, and anything at all that leaves 127.0.0.1, is aborted and
 * recorded, and the run fails if the list is not empty. The submit handler on
 * this form is deliberately simulated (no backend is connected to it yet), so
 * the proof that it still runs is its own `console.log("Form submitted:", …)`
 * plus the sent panel replacing the form — both asserted below.
 *
 * Run:  node docs/cinematic/shots-contact.mjs
 */
import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.CINEMATIC_BASE ?? "http://127.0.0.1:3120";
const URL_UNDER_TEST = `${BASE}/contact`;
const OUT = path.resolve("docs/cinematic/shots-contact");
const SETTLE = 1200;

const VIEWPORTS = [
  { name: "390", width: 390, height: 844, form: true },
  { name: "768", width: 768, height: 1024, form: false },
  { name: "1024", width: 1024, height: 768, form: false },
  { name: "1440", width: 1440, height: 900, form: true },
  { name: "1920", width: 1920, height: 1080, form: false },
];

const failures = [];

function record(message) {
  failures.push(message);
  console.error(`FAIL  ${message}`);
}

/**
 * Walk the page top to bottom a viewport at a time, then come back. Every
 * reveal on this page fires once, on entry, so a full-page screenshot taken
 * from a document that was never scrolled photographs the pre-reveal state —
 * which is not what anyone will see. The sweep is how the shot shows the page.
 */
async function sweep(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = page.viewportSize().height;
  for (let top = 0; top < height; top += Math.round(step * 0.75)) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top);
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(SETTLE);
}

/** Scroll an element to the top of the viewport and let motion settle. */
async function scrollTo(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, top - 8), behavior: "instant" });
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, selector);
  await page.waitForTimeout(400);
}

/**
 * The form, end to end, at one width. Saves three states and asserts that the
 * preserved handler still runs and that nothing left the machine.
 */
async function driveForm(page, name, logs) {
  await scrollTo(page, "#message");

  // --- 1. the browser refusing an empty submit -----------------------------
  await page.locator("#message form button[type=submit]").click();
  await page.waitForTimeout(300);
  const stillThere = await page.locator("#message form").count();
  if (stillThere !== 1) {
    record(`${name}: an empty submit was accepted — the form is gone`);
  }
  const invalid = await page.evaluate(() => {
    const form = document.querySelector("#message form");
    return form instanceof HTMLFormElement ? !form.checkValidity() : null;
  });
  if (invalid !== true) {
    record(`${name}: empty form reported valid (checkValidity -> ${invalid})`);
  }
  await scrollTo(page, "#message");
  await page.screenshot({ path: path.join(OUT, `form-${name}-invalid.png`) });

  // --- 2. filled -----------------------------------------------------------
  await page.fill("#contact-name", "Jordan Reyes");
  await page.fill("#contact-email", "jordan@example.com");
  await page.fill("#contact-phone", "(555) 123-4567");
  await page.selectOption("#contact-subject", "partnership");
  await page.fill(
    "#contact-message",
    "I run a small sales crew in the Southeast and want to talk about bringing them across.",
  );
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await scrollTo(page, "#message");
  await page.screenshot({ path: path.join(OUT, `form-${name}-filled.png`) });

  // Every value survived the controlled-input round trip.
  const values = await page.evaluate(() => ({
    name: document.querySelector("#contact-name")?.value,
    email: document.querySelector("#contact-email")?.value,
    phone: document.querySelector("#contact-phone")?.value,
    subject: document.querySelector("#contact-subject")?.value,
    message: document.querySelector("#contact-message")?.value,
  }));
  for (const [field, value] of Object.entries(values)) {
    if (!value) record(`${name}: field ${field} lost its value (${JSON.stringify(value)})`);
  }

  // --- 3. sent -------------------------------------------------------------
  const before = logs.length;
  await page.locator("#message form button[type=submit]").click();
  await page.waitForSelector("#message [aria-live=polite]", { timeout: 5000 });
  await page.waitForTimeout(500);
  await scrollTo(page, "#message");
  await page.screenshot({ path: path.join(OUT, `form-${name}-sent.png`) });

  const ran = logs.slice(before).some((line) => line.startsWith("Form submitted:"));
  if (!ran) {
    record(`${name}: the preserved submit handler did not run (no "Form submitted:" log)`);
  }
  const gone = await page.locator("#message form").count();
  if (gone !== 0) record(`${name}: the sent panel did not replace the form`);
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
  const logs = [];
  const blocked = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
    else if (msg.type() === "log") logs.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  // Nothing leaves this machine, and nothing that is not a GET is allowed at
  // all. A real message cannot be sent from this run even if the page tried.
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = request.url();
    const local = url.startsWith(BASE) || url.startsWith("data:") || url.startsWith("blob:");
    if (request.method() !== "GET" || !local) {
      blocked.push(`${request.method()} ${url}`);
      return route.abort();
    }
    return route.continue();
  });

  const response = await page.goto(URL_UNDER_TEST, { waitUntil: "networkidle" });
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

  // --- the nav item for this page is the current one ------------------------
  const current = await page.locator('header a[aria-current="page"]').first().getAttribute("href");
  if (current !== "/contact") {
    record(`${vp.name}: header current link is ${current}, expected /contact`);
  }

  // --- full page, with every reveal already fired ---------------------------
  await sweep(page);
  await page.screenshot({ path: path.join(OUT, `fullpage-${vp.name}.png`), fullPage: true });

  // Nothing visible is left behind its reveal by the time the page is
  // photographed. The head's continuation line is `display: none` below 1024 —
  // it has no box to observe there, and nothing to reveal.
  const unrevealed = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll("[data-reveal]:not([data-shown])")).filter(
        (el) => el.getClientRects().length > 0,
      ).length,
  );
  if (unrevealed) record(`${vp.name}: ${unrevealed} element(s) never revealed`);

  if (vp.form) await driveForm(page, vp.name, logs);

  if (blocked.length) {
    record(`${vp.name}: ${blocked.length} non-GET or off-host request(s): ${blocked.join(" // ")}`);
  }
  if (consoleErrors.length) {
    record(`${vp.name}: ${consoleErrors.length} console error(s): ${consoleErrors.join(" // ")}`);
  } else {
    console.log(
      `ok    ${vp.name}: 0 console errors, scrollWidth == clientWidth (${widths.clientWidth}), 0 requests sent`,
    );
  }

  await context.close();
}

/* -------------------------------------------------------------------------
   The two degraded renders the motion law promises: reduced motion on, and
   scripting off entirely. In both, MotionRoot never sets `data-motion="on"`,
   so nothing may be left hidden — the page is simply its finished state, the
   continuation line included.
   ------------------------------------------------------------------------- */
for (const mode of [
  { name: "reduced-motion", options: { reducedMotion: "reduce" } },
  { name: "no-js", options: { javaScriptEnabled: false } },
]) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    ...mode.options,
  });
  const page = await context.newPage();
  await page.goto(URL_UNDER_TEST, { waitUntil: "networkidle" });
  await page.waitForTimeout(SETTLE);

  const hidden = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("h1, h2, a, p, line")) {
      const cs = getComputedStyle(el);
      if (Number(cs.opacity) < 0.99) out.push(`${el.tagName.toLowerCase()} opacity ${cs.opacity}`);
      if (el.tagName === "line" && Number(cs.strokeDashoffset) > 0.001) {
        out.push(`line dashoffset ${cs.strokeDashoffset}`);
      }
    }
    return out.slice(0, 6);
  });
  if (hidden.length) record(`${mode.name}: content left hidden -> ${hidden.join(" | ")}`);
  else console.log(`ok    ${mode.name}: nothing hidden, line drawn`);

  await page.screenshot({ path: path.join(OUT, `state-${mode.name}.png`), fullPage: true });
  await context.close();
}

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} failure(s).`);
  process.exit(1);
}
console.log(`\nAll checks passed. Shots in ${OUT}`);
