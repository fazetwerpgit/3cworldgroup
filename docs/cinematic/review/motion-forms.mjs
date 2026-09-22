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

    // The success panel replaces the form, so focus must be moved deliberately
    // or it falls to <body>; and the live region has to fill AFTER it mounts or
    // nothing is announced.
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? { tag: el.tagName, text: (el.textContent || "").trim().slice(0, 40) } : null;
    });
    check(
      `${route} ${name} focus on success heading`,
      focused !== null && /^H[1-3]$/.test(focused.tag),
      JSON.stringify(focused),
    );
    await page.waitForTimeout(350);
    const live = (await page.locator('[role=status]').last().innerText()).trim();
    check(`${route} ${name} status region filled`, live.length > 0, JSON.stringify(live.slice(0, 40)));
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

// ------------------------------------------------------------- validation
// Submitting an empty form: every required field must name its own problem,
// point at it with aria-describedby, and the alert region must summarise.
for (const [name, viewport] of [
  ["390", { width: 390, height: 844 }],
  ["1440", { width: 1440, height: 900 }],
]) {
  for (const [route, fields] of [
    ["contact", ["contact-name", "contact-email", "contact-subject", "contact-message"]],
    ["apply", ["apply-name", "apply-phone", "apply-email", "apply-city"]],
  ]) {
    const { page, posted } = await makePage(viewport);
    await page.goto(`${BASE}/${route}`, { waitUntil: "networkidle" });
    const form = page.locator("form").first();

    // Geometry before, so the error lines can be shown not to move anything.
    // Document coordinates, not viewport: native validation focuses and scrolls
    // to the first invalid control, and a scrolled page is not a moved layout.
    const geometry = (f) =>
      [...f.querySelectorAll("input, select, textarea")].map((el) =>
        Math.round(el.getBoundingClientRect().top + window.scrollY),
      );
    const before = await form.evaluate(geometry);

    await form.locator("button[type=submit]").click();
    await page.waitForTimeout(400);

    check(`${route} ${name} blocked submit sends nothing`, posted.length === 0, `${posted.length} posted`);

    const described = await page.evaluate((ids) =>
      ids.map((id) => {
        const el = document.getElementById(id);
        const target = el && el.getAttribute("aria-describedby");
        const node = target ? document.getElementById(target) : null;
        return {
          id,
          invalid: el?.getAttribute("aria-invalid"),
          text: node ? (node.textContent || "").trim() : null,
          // The error must NOT be inside the label, or it becomes part of the
          // control's accessible name.
          insideLabel: node ? !!node.closest("label") : null,
        };
      }),
    fields);

    for (const row of described) {
      check(
        `${route} ${name} ${row.id} explains itself`,
        row.invalid === "true" && !!row.text && row.text.length > 0 && row.insideLabel === false,
        JSON.stringify(row),
      );
    }

    const summary = (await form.locator("[role=alert]").innerText()).trim();
    check(`${route} ${name} alert summarises`, summary.length > 0, JSON.stringify(summary));

    const after = await form.evaluate(geometry);
    check(
      `${route} ${name} no layout shift`,
      before.length === after.length && before.every((t, i) => Math.abs(t - after[i]) <= 1),
      `${JSON.stringify(before)} → ${JSON.stringify(after)}`,
    );

    await page.locator(`#${fields[0]}`).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/${route}-${name}-invalid.png` });

    // Typing into one field clears that field's message, and the summary goes
    // with the last of them.
    await page.fill(`#${fields[0]}`, "Test Person");
    await page.waitForTimeout(150);
    const cleared = await page.evaluate((id) => document.getElementById(id)?.getAttribute("aria-invalid"), fields[0]);
    check(`${route} ${name} clears on valid input`, cleared === null, String(cleared));
    await page.close();
  }
}

// ------------------------------------------------------------------ drafts
// Typed answers survive leaving the page and coming back, and are gone once
// the form has actually been sent.
for (const [route, probe] of [
  ["contact", { field: "#contact-name", other: "#contact-message", key: "3c:contact-draft" }],
  ["apply", { field: "#apply-name", other: "#apply-email", key: "3c:apply-draft" }],
]) {
  const { page, posted } = await makePage({ width: 1440, height: 900 });
  await page.goto(`${BASE}/${route}`, { waitUntil: "networkidle" });
  await page.fill(probe.field, "Test Person");
  await page.fill(probe.other, route === "contact" ? "Half a message." : "test@example.com");
  await page.waitForTimeout(700);

  // Leave by clicking a real link, which is a client-side navigation, then come
  // back the way a reader would.
  await page.goto(`${BASE}/services`, { waitUntil: "networkidle" });
  await page.goBack({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  check(
    `${route} draft restored after back`,
    (await page.inputValue(probe.field)) === "Test Person",
    JSON.stringify(await page.inputValue(probe.field)),
  );

  const stored = await page.evaluate((key) => window.sessionStorage.getItem(key), probe.key);
  check(`${route} draft holds no honeypot`, stored !== null && !stored.includes("website"), String(stored).slice(0, 80));

  // Finish the form and send it; the draft must not outlive the submit.
  if (route === "contact") {
    await page.fill("#contact-email", "test@example.com");
    await page.selectOption("#contact-subject", "services");
    await page.fill("#contact-message", "Mocked message.");
  } else {
    await page.fill("#apply-phone", "555-0100");
    await page.fill("#apply-city", "Dallas");
  }
  await page.locator("form").first().locator("button[type=submit]").click();
  await page.waitForSelector(route === "contact" ? "text=Message sent." : "text=That is step", { timeout: 5000 });
  await page.waitForTimeout(700);
  check(`${route} one request on send`, posted.length === 1, `${posted.length}`);
  check(
    `${route} draft cleared after send`,
    (await page.evaluate((key) => window.sessionStorage.getItem(key), probe.key)) === null,
  );
  await page.close();
}

// A stored draft must not beat the `?ref=` in the link the applicant just
// followed: the referral belongs to this visit, the draft to the last one.
{
  const { page } = await makePage({ width: 1440, height: 900 });
  await page.goto(`${BASE}/apply`, { waitUntil: "networkidle" });
  await page.evaluate(() =>
    window.sessionStorage.setItem("3c:apply-draft", JSON.stringify({ name: "Test Person", referredBy: "OLD-REF" })),
  );
  await page.goto(`${BASE}/apply?ref=NEW-REF`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  check(
    "apply url ref beats stored ref",
    (await page.inputValue("#apply-referred-by")) === "NEW-REF",
    JSON.stringify(await page.inputValue("#apply-referred-by")),
  );
  check(
    "apply draft still restores the rest",
    (await page.inputValue("#apply-name")) === "Test Person",
    JSON.stringify(await page.inputValue("#apply-name")),
  );
  await page.close();
}

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
