/**
 * Capture + guard for the cinematic /apply page.
 *
 * Loads http://127.0.0.1:3120/apply at 390, 768, 1024, 1440 and 1920. At every
 * width it asserts zero console errors and scrollWidth == clientWidth and saves
 * a full-page shot. At 390 and 1440 it additionally drives the form through its
 * three real states and shoots each one:
 *
 *   empty       — the plate as it arrives
 *   invalid     — required fields after a submit attempt (`:user-invalid`)
 *   success     — the state a real 200 from the API produces
 *
 * The success pass is also the proof the form still submits. The request to
 * /api/public/applications is intercepted, never allowed out, and the captured
 * body is asserted field by field against what was typed — so the run fails if
 * the POST stops happening, changes shape, or loses a field.
 *
 * 390 is checked twice: once on a full 844-tall viewport, and once on 785 —
 * 844 less a 59px safe-area bottom inset — where the submit button must still
 * be fully inside the viewport and every control at least 44px tall.
 *
 * Run:  node docs/cinematic/shots-apply.mjs
 */
import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.CINEMATIC_BASE ?? "http://127.0.0.1:3120";
const URL = `${BASE}/apply`;
const OUT = path.resolve("docs/cinematic/shots-apply");
const SETTLE = 1000;
/** The page's own anti-bot guard: a submit inside 3s of form start is dropped. */
const FORM_GUARD_MS = 3000;
const SAFE_AREA_BOTTOM = 59;
const TAP_TARGET_MIN = 44;

const VIEWPORTS = [
  { name: "390", width: 390, height: 844, states: true },
  { name: "768", width: 768, height: 1024, states: false },
  { name: "1024", width: 1024, height: 768, states: false },
  { name: "1440", width: 1440, height: 900, states: true },
  { name: "1920", width: 1920, height: 1080, states: false },
];

const APPLICANT = {
  name: "Shot Harness",
  phone: "(555) 010-3120",
  email: "harness@example.com",
  city: "Birmingham",
  referredBy: "shots-apply.mjs",
};

const failures = [];
const record = (message) => {
  failures.push(message);
  console.error(`FAIL  ${message}`);
};
const ok = (message) => console.log(`ok    ${message}`);

/**
 * The dev server paints its own floating indicator over the bottom-left corner
 * of every page. It is not part of the design and must not be in a shot.
 */
const HIDE_DEV_OVERLAY = "nextjs-portal, [data-nextjs-toolbar], #__next-build-watcher { display: none !important }";

/**
 * Walk the page once so every `data-reveal` has intersected. Without this a
 * full-page screenshot captures whatever never entered the viewport at its
 * pre-reveal opacity, and half the page is missing from the evidence.
 */
async function fireReveals(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.7));
    const end = document.documentElement.scrollHeight;
    for (let y = 0; y < end; y += step) {
      window.scrollTo({ top: y, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo({ top: end, behavior: "instant" });
    await new Promise((r) => setTimeout(r, 160));
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(SETTLE);
}

/** Scroll an element to just under the fixed header and let motion settle. */
async function scrollTo(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, top - 88), behavior: "instant" });
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, selector);
  await page.waitForTimeout(SETTLE);
}

async function fillApplication(page) {
  await page.fill("#apply-name", APPLICANT.name);
  await page.fill("#apply-phone", APPLICANT.phone);
  await page.fill("#apply-email", APPLICANT.email);
  await page.fill("#apply-city", APPLICANT.city);
  await page.fill("#apply-referred-by", APPLICANT.referredBy);
}

/* ---------------------------------------------------------------------------
   The three form states, at one width.
   --------------------------------------------------------------------------- */
async function captureFormStates(context, vp) {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  // Nothing real ever leaves this script. The route is fulfilled locally and
  // the body it was given is what the assertions below are made against.
  const posted = [];
  await page.route("**/api/public/applications", async (route) => {
    const request = route.request();
    posted.push({ method: request.method(), body: request.postData() });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, applicationId: "intercepted-by-shots-apply" }),
    });
  });

  const openedAt = Date.now();
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY }).catch(() => {});
  await page.waitForTimeout(SETTLE);

  // --- empty --------------------------------------------------------------
  await scrollTo(page, "#apply-form");
  await page.screenshot({ path: path.join(OUT, `form-${vp.name}-empty.png`) });

  // --- validation error ---------------------------------------------------
  // A real submit attempt on an empty required set. Native constraint
  // validation blocks it, so no handler runs and no request is made; the
  // fields flip to :user-invalid, which is the state being photographed.
  await page.fill("#apply-email", "not-an-email");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(400);
  const invalidCount = await page.evaluate(
    () => document.querySelectorAll("form input:user-invalid").length,
  );
  if (invalidCount < 1) record(`${vp.name}: no field entered :user-invalid after a failed submit`);
  else ok(`${vp.name}: ${invalidCount} field(s) marked invalid after a failed submit`);
  if (posted.length) record(`${vp.name}: an invalid form still POSTed to the applications API`);
  await scrollTo(page, "#apply-form");
  await page.screenshot({ path: path.join(OUT, `form-${vp.name}-invalid.png`) });

  // --- mobile reachability, on the inset viewport --------------------------
  if (vp.name === "390") {
    await page.setViewportSize({ width: vp.width, height: vp.height - SAFE_AREA_BOTTOM });
    await page.waitForTimeout(300);
    await page.locator('button[type="submit"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const reach = await page.evaluate(() => {
      const el = document.querySelector('button[type="submit"]');
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height, vh: window.innerHeight };
    });
    if (reach.bottom > reach.vh || reach.top < 0) {
      record(
        `390+inset: submit button is not fully in view (top ${reach.top.toFixed(0)}, bottom ${reach.bottom.toFixed(0)}, viewport ${reach.vh})`,
      );
    } else {
      ok(`390+inset: submit fully in view, ${reach.height.toFixed(0)}px tall on a ${reach.vh}px viewport`);
    }

    // This page's own controls only. The header and footer links belong to the
    // shared chrome in src/app/_cinematic, which this route does not own, and
    // the honeypot is a 1px box on purpose.
    const small = await page.evaluate((min) => {
      const out = [];
      const nodes = document.querySelectorAll(
        'form input:not([tabindex="-1"]), form button, main a[href="#apply-form"], main a[href="/"]',
      );
      for (const el of nodes) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.height < min) out.push(`${el.tagName.toLowerCase()}#${el.id || "-"} ${r.height.toFixed(0)}px`);
      }
      return out;
    }, TAP_TARGET_MIN);
    if (small.length) record(`390+inset: tap targets under ${TAP_TARGET_MIN}px -> ${small.join(", ")}`);
    else ok(`390+inset: every field and page button clears ${TAP_TARGET_MIN}px`);

    await page.screenshot({ path: path.join(OUT, `form-390-inset.png`) });
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(300);
  }

  // --- success, and the proof the POST still happens -----------------------
  await fillApplication(page);
  const elapsed = Date.now() - openedAt;
  if (elapsed < FORM_GUARD_MS + 250) await page.waitForTimeout(FORM_GUARD_MS + 250 - elapsed);
  await page.click('button[type="submit"]');
  await page.waitForSelector("#done-title", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(SETTLE);

  if (posted.length !== 1) {
    record(`${vp.name}: expected exactly 1 POST to the applications API, saw ${posted.length}`);
  } else {
    const { method, body } = posted[0];
    if (method !== "POST") record(`${vp.name}: applications request used ${method}, not POST`);
    let parsed = null;
    try {
      parsed = JSON.parse(body ?? "null");
    } catch {
      record(`${vp.name}: applications request body was not JSON: ${String(body).slice(0, 120)}`);
    }
    if (parsed) {
      for (const [key, value] of Object.entries(APPLICANT)) {
        if (parsed[key] !== value) {
          record(`${vp.name}: POST body ${key} was ${JSON.stringify(parsed[key])}, expected ${JSON.stringify(value)}`);
        }
      }
      if ("website" in parsed) record(`${vp.name}: POST body leaked the honeypot field`);
      const extra = Object.keys(parsed).filter((k) => !(k in APPLICANT));
      if (extra.length) record(`${vp.name}: POST body carried unexpected keys -> ${extra.join(", ")}`);
      ok(`${vp.name}: POST /api/public/applications carried all five fields intact`);
    }
  }

  const doneVisible = await page.locator("#done-title").count();
  if (!doneVisible) record(`${vp.name}: the success state did not render after a 200`);
  else ok(`${vp.name}: success state rendered`);

  await page.screenshot({ path: path.join(OUT, `form-${vp.name}-success.png`) });
  await page.screenshot({ path: path.join(OUT, `form-${vp.name}-success-full.png`), fullPage: true });

  if (consoleErrors.length) {
    record(`${vp.name} (form states): ${consoleErrors.length} console error(s): ${consoleErrors.join(" // ")}`);
  }

  await page.close();
}

/* ---------------------------------------------------------------------------
   Main pass.
   --------------------------------------------------------------------------- */
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
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const response = await page.goto(URL, { waitUntil: "networkidle" });
  if (!response || response.status() !== 200) {
    record(`${vp.name}: page responded ${response ? response.status() : "no response"}`);
  }
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY }).catch(() => {});
  await page.waitForTimeout(SETTLE);

  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (widths.scrollWidth !== widths.clientWidth) {
    record(`${vp.name}: scrollWidth ${widths.scrollWidth} != clientWidth ${widths.clientWidth}`);
  }

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

  // Section shots at the two reviewed widths, so the composition is reviewable
  // and not only the form.
  if (vp.states) {
    for (const [name, selector] of [
      ["next", "#next"],
      ["know", "#good-to-know"],
    ]) {
      if (!(await page.locator(selector).count())) {
        record(`${vp.name}: selector ${selector} matched nothing`);
        continue;
      }
      await scrollTo(page, selector);
      await page.screenshot({ path: path.join(OUT, `vp-${vp.name}-${name}.png`) });
    }
  }

  await fireReveals(page);
  await page.screenshot({ path: path.join(OUT, `fullpage-${vp.name}.png`), fullPage: true });

  if (consoleErrors.length) {
    record(`${vp.name}: ${consoleErrors.length} console error(s): ${consoleErrors.join(" // ")}`);
  } else {
    ok(`${vp.name}: 0 console errors, scrollWidth == clientWidth (${widths.clientWidth})`);
  }

  if (vp.states) await captureFormStates(context, vp);

  await context.close();
}

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} failure(s).`);
  process.exit(1);
}
console.log(`\nAll checks passed. Shots in ${OUT}`);
