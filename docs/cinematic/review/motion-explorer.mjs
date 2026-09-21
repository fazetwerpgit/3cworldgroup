/*
  Market selector + FAQ motion probe.

  Drives the real page on the dev server: clicks every market, clicks chips
  faster than the animation can finish, walks the list with the keyboard, then
  opens, swaps and hammers the FAQ rows — asserting the things that break when
  an animated disclosure is wrong (a plate that changes height, a row left with
  an inline height on it, an answer clipped, a stuck state after rapid clicks).
  Runs the whole set twice: once normally, once with reduced motion, where
  every toggle must land instantly and still be correct.

  node docs/cinematic/review/motion-explorer.mjs
*/
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://127.0.0.1:3120";
const OUT = ".tmpshots/motion/explorer";
const CSS = "html{scroll-behavior:auto !important} nextjs-portal{display:none!important}";

const VIEWPORTS = [
  { tag: "1440", width: 1440, height: 900, isMobile: false },
  { tag: "390", width: 390, height: 844, isMobile: true },
];

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const motion of ["no-preference", "reduce"]) {
  for (const vp of VIEWPORTS) {
    const label = `${vp.tag}-${motion === "reduce" ? "reduced" : "motion"}`;
    console.log(`\n=== ${label} ===`);

    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
      reducedMotion: motion === "reduce" ? "reduce" : "no-preference",
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(`${BASE}/#markets`, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: CSS });
    await page.waitForTimeout(400);

    /* ---------------- market selector ---------------- */
    const chips = page.locator('[aria-label="Markets"] button');
    const chipCount = await chips.count();
    check(chipCount === 5, "five market chips", `got ${chipCount}`);

    const plateBody = page.locator('[class*="cityPlateBody"]').first();
    await plateBody.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);

    const heights = [];
    for (let i = 0; i < chipCount; i += 1) {
      await chips.nth(i).click();
      await page.waitForTimeout(100);
      await page.screenshot({ path: `${OUT}/${label}-market${i}-mid.png` });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/${label}-market${i}-settled.png` });

      const box = await plateBody.boundingBox();
      heights.push(Math.round(box.height));

      const state = await page.evaluate((i) => {
        const list = document.querySelector('[aria-label="Markets"]');
        const buttons = [...list.querySelectorAll("button")];
        const bar = list.lastElementChild;
        const chip = buttons[i];
        const barBox = bar.getBoundingClientRect();
        const chipBox = chip.getBoundingClientRect();
        const panels = [...document.querySelectorAll('[class*="cityPlatePanel"]')];
        return {
          pressed: buttons.map((b) => b.getAttribute("aria-pressed")),
          indicatorReady: list.dataset.indicator || null,
          barVisible: getComputedStyle(bar).display !== "none",
          dx: Math.round(barBox.left - chipBox.left),
          dw: Math.round(barBox.width - chipBox.width),
          dy: Math.round(barBox.bottom - chipBox.bottom),
          activePanels: panels.filter((p) => p.hasAttribute("data-active")).length,
          activeVisible: panels[i] ? getComputedStyle(panels[i]).visibility : null,
          activeImages: [...document.querySelectorAll("img[data-active]")].length,
        };
      }, i);

      check(state.pressed.filter((p) => p === "true").length === 1 && state.pressed[i] === "true",
        `chip ${i} is the only one pressed`, state.pressed.join(","));
      check(state.indicatorReady === "ready" && state.barVisible, `chip ${i} indicator live`);
      check(Math.abs(state.dx) <= 1 && Math.abs(state.dw) <= 1 && Math.abs(state.dy) <= 2,
        `chip ${i} indicator sits on the chip`, `dx=${state.dx} dw=${state.dw} dy=${state.dy}`);
      check(state.activePanels === 1 && state.activeVisible === "visible",
        `chip ${i} one visible panel`, `${state.activePanels}/${state.activeVisible}`);
      check(state.activeImages === 1, `chip ${i} one active image`, String(state.activeImages));
    }

    check(new Set(heights).size === 1, "plate body height identical across all five markets", heights.join(","));

    // Five chips inside 300ms: the last click must win, cleanly.
    await page.evaluate(async () => {
      const buttons = [...document.querySelectorAll('[aria-label="Markets"] button')];
      for (const b of buttons) {
        b.click();
        await new Promise((r) => setTimeout(r, 50));
      }
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${label}-market-rapid.png` });
    const rapid = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('[aria-label="Markets"] button')];
      const panels = [...document.querySelectorAll('[class*="cityPlatePanel"]')];
      const last = buttons.length - 1;
      const chipBox = buttons[last].getBoundingClientRect();
      const barBox = document.querySelector('[aria-label="Markets"]').lastElementChild.getBoundingClientRect();
      return {
        pressed: buttons[last].getAttribute("aria-pressed"),
        pressedTotal: buttons.filter((b) => b.getAttribute("aria-pressed") === "true").length,
        activePanels: panels.filter((p) => p.hasAttribute("data-active")).length,
        panelOpacity: getComputedStyle(panels[last]).opacity,
        dx: Math.round(barBox.left - chipBox.left),
        dy: Math.round(barBox.bottom - chipBox.bottom),
      };
    });
    check(rapid.pressed === "true" && rapid.pressedTotal === 1 && rapid.activePanels === 1,
      "rapid chip clicks land on the last one", JSON.stringify(rapid));
    check(Number(rapid.panelOpacity) === 1, "panel is fully opaque after the rapid run", rapid.panelOpacity);
    check(Math.abs(rapid.dx) <= 1 && Math.abs(rapid.dy) <= 2, "indicator caught up", `dx=${rapid.dx} dy=${rapid.dy}`);

    // Keyboard: focus chip 0, ArrowRight, selection and focus both move.
    await chips.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    const kb = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('[aria-label="Markets"] button')];
      return {
        focused: buttons.indexOf(document.activeElement),
        pressed: buttons.findIndex((b) => b.getAttribute("aria-pressed") === "true"),
      };
    });
    check(kb.focused === 1 && kb.pressed === 1, "ArrowRight moves selection and focus", JSON.stringify(kb));
    await page.keyboard.press("End");
    await page.waitForTimeout(400);
    const kbEnd = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('[aria-label="Markets"] button')];
      return { focused: buttons.indexOf(document.activeElement), pressed: buttons.findIndex((b) => b.getAttribute("aria-pressed") === "true") };
    });
    check(kbEnd.focused === 4 && kbEnd.pressed === 4, "End jumps to the last market", JSON.stringify(kbEnd));

    // The live region is a status node of its own now: the panels are
    // permanent, so only this text actually changes on selection.
    const status = page.locator('[role="status"]').first();
    check((await status.textContent()).trim() === "Grand Rapids, Michigan selected",
      "status node follows the keyboard", (await status.textContent()).trim());
    await page.keyboard.press("Home");
    await page.waitForTimeout(300);
    check((await status.textContent()).trim() === "Dallas, Texas selected",
      "status node follows Home", (await status.textContent()).trim());
    await chips.nth(2).click();
    await page.waitForTimeout(300);
    check((await status.textContent()).trim() === "Southern California selected",
      "status node follows a click", (await status.textContent()).trim());
    check((await page.locator('[class*="cityPlateBody"][aria-live]').count()) === 0,
      "panel container no longer claims to be a live region");
    const statusBox = await status.boundingBox();
    check(statusBox.width <= 2 && statusBox.height <= 2, "status node is visually hidden", JSON.stringify(statusBox));
    await page.screenshot({ path: `${OUT}/${label}-market-keyboard.png` });

    /* ---------------- FAQ ---------------- */
    const rows = page.locator("details");
    const rowCount = await rows.count();
    check(rowCount === 6, "six FAQ rows", String(rowCount));
    check((await page.locator("details[name]").count()) === 0, "name attribute removed once JS runs");

    await rows.nth(0).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    const summaries = page.locator("details > summary");
    await summaries.nth(0).click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${OUT}/${label}-faq-open-mid.png` });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${label}-faq-open-settled.png` });

    const opened = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("details")];
      const r = rows[0];
      const body = r.querySelector("div");
      return {
        open: r.open,
        inlineHeight: r.style.height,
        inlineOverflow: r.style.overflow,
        rowHeight: Math.round(r.getBoundingClientRect().height),
        contentBottom: Math.round(body.getBoundingClientRect().bottom),
        rowBottom: Math.round(r.getBoundingClientRect().bottom),
      };
    });
    check(opened.open, "row 1 open");
    check(opened.inlineHeight === "" && opened.inlineOverflow === "", "row 1 left no inline height/overflow",
      `${opened.inlineHeight}|${opened.inlineOverflow}`);
    check(opened.contentBottom <= opened.rowBottom + 1, "row 1 answer is not clipped",
      `content ${opened.contentBottom} vs row ${opened.rowBottom}`);

    // Open row 2 while row 1 is open: exactly one stays open.
    await summaries.nth(1).click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${OUT}/${label}-faq-swap-mid.png` });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${label}-faq-swap-settled.png` });
    const swapped = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("details")];
      return {
        open: rows.map((r) => r.open),
        inline: rows.map((r) => r.style.height || "-"),
      };
    });
    check(swapped.open.filter(Boolean).length === 1 && swapped.open[1],
      "exclusive accordion: only row 2 open", swapped.open.join(","));
    check(swapped.inline.every((h) => h === "-"), "no inline heights left after the swap", swapped.inline.join(","));

    // Five clicks on row 1 inside ~300ms.
    await page.evaluate(async () => {
      const s = document.querySelectorAll("details > summary")[0];
      for (let i = 0; i < 5; i += 1) {
        s.click();
        await new Promise((r) => setTimeout(r, 55));
      }
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${label}-faq-rapid.png` });
    const hammered = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("details")];
      const r = rows[0];
      const body = r.querySelector("div");
      return {
        open: r.open,
        openCount: rows.filter((x) => x.open).length,
        inline: rows.map((x) => x.style.height || "-"),
        overflow: rows.map((x) => x.style.overflow || "-"),
        mark: getComputedStyle(r.querySelector("svg")).transform,
        contentBottom: Math.round(body.getBoundingClientRect().bottom),
        rowBottom: Math.round(r.getBoundingClientRect().bottom),
        bodyVisible: body.getBoundingClientRect().height > 20,
      };
    });
    check(hammered.openCount <= 1, "rapid clicks leave at most one row open", String(hammered.openCount));
    check(hammered.inline.every((h) => h === "-") && hammered.overflow.every((o) => o === "-"),
      "rapid clicks leave no inline height/overflow", `${hammered.inline.join(",")} | ${hammered.overflow.join(",")}`);
    check(!hammered.open || (hammered.bodyVisible && hammered.contentBottom <= hammered.rowBottom + 1),
      "if it ended open the answer is fully visible", JSON.stringify(hammered));
    check(hammered.open ? hammered.mark !== "none" : true, "mark rotated when open", hammered.mark);

    if (motion === "reduce") {
      // Toggle must be done inside one frame, no animation running.
      const instant = await page.evaluate(async () => {
        const rows = [...document.querySelectorAll("details")];
        for (const r of rows) if (r.open) r.querySelector("summary").click();
        await new Promise((r) => requestAnimationFrame(r));
        const s = document.querySelectorAll("details > summary")[2];
        s.click();
        await new Promise((r) => requestAnimationFrame(r));
        const r = rows[2];
        return {
          open: r.open,
          inline: r.style.height,
          running: r.getAnimations().length,
          height: Math.round(r.getBoundingClientRect().height),
        };
      });
      check(instant.open && instant.inline === "" && instant.running === 0 && instant.height > 80,
        "reduced motion toggles instantly", JSON.stringify(instant));

      // A 60ms sample: React has committed, and a 200ms entrance would still
      // be mid-flight if one had been started. The page carries a global
      // transition-property:all at 0s, so zero-duration entries are discounted.
      const chipInstant = await page.evaluate(async () => {
        const buttons = [...document.querySelectorAll('[aria-label="Markets"] button')];
        buttons[2].click();
        await new Promise((r) => setTimeout(r, 60));
        const panels = [...document.querySelectorAll('[class*="cityPlatePanel"]')];
        return {
          pressed: buttons[2].getAttribute("aria-pressed"),
          opacity: getComputedStyle(panels[2]).opacity,
          timed: panels[2].getAnimations().filter((a) => (a.effect?.getTiming().duration || 0) > 0).length,
        };
      });
      check(chipInstant.pressed === "true" && Number(chipInstant.opacity) === 1 && chipInstant.timed === 0,
        "reduced motion market swap is instant", JSON.stringify(chipInstant));
    } else {
      // Positive control: without reduced motion the entrance must actually run.
      const chipAnimated = await page.evaluate(async () => {
        const buttons = [...document.querySelectorAll('[aria-label="Markets"] button')];
        buttons[0].click();
        await new Promise((r) => setTimeout(r, 40));
        const panels = [...document.querySelectorAll('[class*="cityPlatePanel"]')];
        const live = panels[0].getAnimations().filter((a) => (a.effect?.getTiming().duration || 0) > 0);
        return { count: live.length, opacity: getComputedStyle(panels[0]).opacity };
      });
      check(chipAnimated.count === 1 && Number(chipAnimated.opacity) < 1,
        "market panel entrance actually runs", JSON.stringify(chipAnimated));

      const faqAnimated = await page.evaluate(async () => {
        const s = document.querySelectorAll("details > summary")[3];
        s.click();
        await new Promise((r) => setTimeout(r, 60));
        const row = document.querySelectorAll("details")[3];
        return {
          count: row.getAnimations().filter((a) => (a.effect?.getTiming().duration || 0) > 0).length,
          overflow: row.style.overflow,
          inline: row.style.height !== "",
        };
      });
      check(faqAnimated.count === 1 && faqAnimated.overflow === "hidden" && faqAnimated.inline,
        "FAQ height animation actually runs", JSON.stringify(faqAnimated));
    }

    /* ---------------- the mark turns with the height ---------------- */
    if (motion !== "reduce") {
      const markAngle = await page.evaluate(async () => {
        const angle = (m) => {
          if (m === "none") return 0;
          const [a, b] = m.slice(m.indexOf("(") + 1, -1).split(",").map(Number);
          return Math.round(Math.abs((Math.atan2(b, a) * 180) / Math.PI));
        };
        const rows = [...document.querySelectorAll("details")];
        // Settle to a known state first: a row still finishing a close is
        // open===true with a closed intent, and clicking it would reopen it.
        for (const r of rows) if (r.open) r.querySelector("summary").click();
        await new Promise((r) => setTimeout(r, 500));
        const row = rows[0];
        const svg = row.querySelector("svg");
        row.querySelector("summary").click();
        await new Promise((r) => setTimeout(r, 500));
        const before = angle(getComputedStyle(svg).transform);
        row.querySelector("summary").click();
        await new Promise((r) => setTimeout(r, 60));
        const during = angle(getComputedStyle(svg).transform);
        const heightStillRunning = row.getAnimations().some((a) => (a.effect?.getTiming().duration || 0) > 0);
        await new Promise((r) => setTimeout(r, 400));
        return { before, during, heightStillRunning, after: angle(getComputedStyle(svg).transform) };
      });
      check(markAngle.before > 120 && markAngle.during < 100 && markAngle.after === 0,
        "mark un-rotates with the height, not after it", JSON.stringify(markAngle));
    }

    /* ---------------- touch leaves no stuck hover ---------------- */
    if (vp.isMobile) {
      await page.locator("details > summary").nth(2).scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await page.locator("details > summary").nth(2).tap();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${label}-tap-faq.png` });
      const tapped = await page.evaluate(() => {
        const summaries = [...document.querySelectorAll("details > summary")];
        return { tapped: getComputedStyle(summaries[2]).color, idle: getComputedStyle(summaries[4]).color };
      });
      check(tapped.tapped === tapped.idle, "tapped question is not stuck lime", JSON.stringify(tapped));

      await page.locator('[aria-label="Markets"] button').nth(1).scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await page.locator('[aria-label="Markets"] button').nth(1).tap();
      await page.waitForTimeout(400);
      await page.locator('[aria-label="Markets"] button').nth(3).tap();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${label}-tap-chip.png` });
      const chipTap = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('[aria-label="Markets"] button')];
        const wash = (el) => getComputedStyle(el, "::before").transform;
        return { stale: wash(buttons[1]), idle: wash(buttons[0]), selected: wash(buttons[3]) };
      });
      check(chipTap.stale === chipTap.idle && chipTap.selected !== chipTap.idle,
        "previously tapped chip is not stuck washed", JSON.stringify(chipTap));
    }

    check(errors.length === 0, "no console errors", errors.slice(0, 3).join(" | "));
    await ctx.close();
  }
}

await browser.close();
console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
process.exit(failures === 0 ? 0 : 1);
