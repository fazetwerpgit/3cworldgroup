// node docs/cinematic/review/motion-forms.mjs
// Form interaction states with the API mocked (nothing real is sent). Same
// page.route pattern as forms.mjs: every /api/public/** call is answered
// locally, so this can run against the dev server without posting anything.
//
// Covers: the pending state while a delayed mock is in flight, the button not
// resizing between idle and pending, a double click producing exactly one
// request, the failure path keeping every typed value, and success appearing
// only after the mocked 200 resolves.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3120";
const OUT = ".tmpshots/motion/forms";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

/** One page with the API mocked. `delay` holds the response open so the
 *  pending state can be photographed; `fail` answers 500 instead of 200. */
async function makePage(viewport, { delay = 0, fail = false } = {}) {
  const page = await browser.newPage({ viewport });
  const posted = [];
  await page.route("**/api/public/**", async (route) => {
    posted.push(route.request().url().replace(/^.*\/api/, "/api"));
    if (delay) await new Promise((r) => setTimeout(r, delay));
    await route.fulfill({
      status: fail ? 500 : 200,
      contentType: "application/json",
      body: JSON.stringify(fail ? { error: "Mock failure" } : { success: true }),
    });
  });
  return { page, posted };
}

// Sequential, never Promise.all: parallel fills on React-controlled inputs
// fight over focus and one of them lands empty, which leaves the form natively
// invalid and the submit never happens — a green run that tested nothing.
const fillContact = async (page) => {
  await page.fill("#contact-name", "Test Person");
  await page.fill("#contact-email", "test@example.com");
  await page.fill("#contact-phone", "555-0100");
  await page.selectOption("#contact-subject", "services");
  await page.fill("#contact-message", "Mocked message.");
};

const fillApply = async (page) => {
  await page.fill("#apply-name", "Test Person");
  await page.fill("#apply-phone", "555-0100");
  await page.fill("#apply-email", "test@example.com");
  const city = page.locator("#apply-city");
  const tag = await city.evaluate((e) => e.tagName);
  tag === "SELECT" ? await city.selectOption({ index: 1 }) : await city.fill("Dallas");
};

const box = (locator) => locator.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 };
});

for (const [name, viewport] of [
  ["390", { width: 390, height: 844 }],
  ["1440", { width: 1440, height: 900 }],
]) {
  // ---------------------------------------------------------------- pending
  for (const route of ["contact", "apply"]) {
    const { page, posted } = await makePage(viewport, { delay: 900 });
    await page.goto(`${BASE}/${route}`, { waitUntil: "networkidle" });
    const form = page.locator("form").first();
    const button = form.locator("button[type=submit]");
    await (route === "contact" ? fillContact(page) : fillApply(page));

    // Focus state, photographed before the submit.
    const firstField = page.locator(route === "contact" ? "#contact-name" : "#apply-name");
    await firstField.focus();
    await page.waitForTimeout(300);
    await firstField.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/${route}-${name}-focus.png` });

    const formValid = await form.evaluate((f) => f.checkValidity());
    check(`${route} ${name} filled form is valid`, formValid);

    const idle = await box(button);
    const idleLabel = (await button.innerText()).trim();

    // Two clicks inside one frame: the second must not reach the network.
    await button.scrollIntoViewIfNeeded();
    // el.click() twice in one task: React has not re-rendered between them, so
    // this is the case `disabled` alone cannot catch.
    await button.evaluate((el) => {
      el.click();
      el.click();
    });
    await page.waitForTimeout(250);

    const pending = await box(button);
    const pendingLabel = (await button.innerText()).trim();
    const disabled = await button.isDisabled();
    const busy = await form.getAttribute("aria-busy");
    await page.screenshot({ path: `${OUT}/${route}-${name}-pending.png` });

    check(`${route} ${name} pending label`, pendingLabel !== idleLabel && /ing/i.test(pendingLabel), `"${idleLabel}" → "${pendingLabel}"`);
    check(`${route} ${name} pending disabled`, disabled);
    check(`${route} ${name} aria-busy`, busy === "true", String(busy));
    check(
      `${route} ${name} button size held`,
      Math.abs(idle.w - pending.w) < 0.6 && Math.abs(idle.h - pending.h) < 0.6,
      `${idle.w}x${idle.h} → ${pending.w}x${pending.h}`,
    );
    check(`${route} ${name} one request`, posted.length === 1, `${posted.length} posted`);

    // Success must not be on screen until the mock resolves.
    const successSel = route === "contact" ? "text=Message sent." : "text=That is step";
    check(`${route} ${name} no early success`, (await page.locator(successSel).count()) === 0);
    await page.waitForSelector(successSel, { timeout: 5000 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${route}-${name}-success.png` });
    check(`${route} ${name} success after 200`, (await page.locator(successSel).count()) === 1);
    await page.close();
  }

  // ---------------------------------------------------------------- failure
  for (const route of ["contact", "apply"]) {
    const { page } = await makePage(viewport, { delay: 300, fail: true });
    await page.goto(`${BASE}/${route}`, { waitUntil: "networkidle" });
    const form = page.locator("form").first();
    const button = form.locator("button[type=submit]");
    await (route === "contact" ? fillContact(page) : fillApply(page));
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await page.waitForTimeout(900);

    const alertText = (await form.locator("[role=alert]").innerText()).trim();
    const nameField = page.locator(route === "contact" ? "#contact-name" : "#apply-name");
    const kept = await nameField.inputValue();
    const emailKept = await page.locator(route === "contact" ? "#contact-email" : "#apply-email").inputValue();
    const reenabled = !(await button.isDisabled());
    const busy = await form.getAttribute("aria-busy");
    await form.locator("[role=alert]").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/${route}-${name}-error.png` });

    check(`${route} ${name} error text`, alertText.length > 0, JSON.stringify(alertText));
    check(`${route} ${name} values kept`, kept === "Test Person" && emailKept === "test@example.com", `${kept} / ${emailKept}`);
    check(`${route} ${name} button re-enabled`, reenabled);
    check(`${route} ${name} aria-busy cleared`, busy === null, String(busy));
    const successSel = route === "contact" ? "text=Message sent." : "text=That is step";
    check(`${route} ${name} no success on failure`, (await page.locator(successSel).count()) === 0);
    await page.close();
  }
}

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
