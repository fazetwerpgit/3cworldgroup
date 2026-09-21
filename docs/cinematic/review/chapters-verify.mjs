/*
  The chapter stage, checked rather than looked at.

  Four things can go wrong with a sticky crossfade and none of them show up in
  a screenshot: it can flash blank mid-swap, it can queue transitions so the
  photograph keeps changing after you have stopped scrolling, it can flicker
  between two chapters when a chapter top rests on the reading line, and it can
  answer the wrong chapter after a jump. Each of those is a frame-level
  question, so the opacities are recorded inside the page on every animation
  frame and read back afterwards — a round-trip per sample is far too slow to
  catch a 350ms fade.
*/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3120";
const OUT = ".tmpshots/motion/chapters";
mkdirSync(`${OUT}/clip`, { recursive: true });

/*
  Console messages are tagged with the step that produced them, which is worth
  the two lines: a warning during a synthetic resize and a warning while the
  page is being read are not the same finding.

  One advisory here is a property of the development server rather than of the
  page. The first run after a change to an image's `sizes` asks Next for photo
  widths it has never generated, so the file arrives late, and a large image
  that lands late is what Largest-Contentful-Paint is designed to notice — dev
  then advises `loading="eager"` on a photograph three screens down. It shows
  up once, on the run that warmed the cache, and not on any run after it. If
  you are chasing it, delete .next/dev/cache/images and watch it come back once.
*/
let phase = "read";
let failed = 0;
const check = (ok, label) => {
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};

const TRACE = () => {
  const style = document.createElement("style");
  style.textContent = "html{scroll-behavior:auto!important}nextjs-portal{display:none!important}";
  document.addEventListener("DOMContentLoaded", () => {
    document.head.appendChild(style);
    window.__f = [];
    window.__rec = false;
    const tick = () => {
      if (window.__rec) {
        const sticky = document.querySelector("[data-chapter-stage]");
        const layers = [...document.querySelectorAll("[data-layer]")];
        if (sticky && layers.length) {
          window.__f.push({
            t: performance.now(),
            a: sticky.dataset.activeChapter,
            o: layers.map((l) => Number(getComputedStyle(l).opacity)),
            y: Math.round(scrollY),
          });
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
};

const browser = await chromium.launch();
const errors = [];

/* ------------------------------------------------------------ desktop -- */
for (const [label, width, height] of [["1440x900", 1440, 900], ["1920x1080", 1920, 1080], ["1366x640", 1366, 640]]) {
  console.log(`\n== ${label} ==`);
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await ctx.addInitScript(TRACE);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${label} [${phase}] ${m.text()}`);
    else if (m.type() === "warning") errors.push(`${label} [${phase}] ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`${label} ${e.message}`));
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const secTop = await page.evaluate(() => {
    const st = document.querySelector("[data-chapter-stage]");
    return Math.round(st.parentElement.getBoundingClientRect().top + scrollY);
  });
  const colBottom = await page.evaluate(() => {
    const st = document.querySelector("[data-chapter-stage]");
    return Math.round(st.parentElement.getBoundingClientRect().bottom + scrollY);
  });

  const drift = async (from, to, stepPx) => {
    await page.evaluate(() => { window.__f = []; window.__rec = true; });
    const dir = to > from ? 1 : -1;
    for (let y = from; dir > 0 ? y <= to : y >= to; y += stepPx * dir) {
      await page.evaluate((v) => scrollTo(0, v), y);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(900);
    return page.evaluate(() => { window.__rec = false; return window.__f; });
  };

  /*
    Read it the way a person does, then read it backwards — and start at the
    top rather than just above the section. Teleporting to the section on the
    first frame means the hero never paints, so the first large image the
    browser sees is a chapter photograph, and Next's development build
    reasonably concludes the Largest Contentful Paint is an image three
    screens down. No visitor arrives there before the hero has painted.
  */
  phase = "drift";
  for (const [name, a, b] of [["forward", 0, colBottom + 200], ["reverse", colBottom + 200, 0]]) {
    const frames = await drift(a, b, 14);
    const blanks = frames.filter((f) => Math.max(...f.o) < 0.99);
    const states = [...new Set(frames.map((f) => f.a))].join(",");
    const seq = frames.map((f) => f.a).filter((v, i, arr) => v !== arr[i - 1]).join("->");
    console.log(`   ${name}: ${frames.length} frames, states seen ${states}, order ${seq}`);
    check(blanks.length === 0, `${label} ${name}: the stage never dips below a full photograph (${blanks.length} blank frames)`);
    check(states.split(",").sort().join("") === "012", `${label} ${name}: all three chapters take the stage (${states})`);
    // After the last movement the stage must be settled, not still fading.
    const tail = frames[frames.length - 1];
    const expect = tail.o.map((_, i) => (i <= Number(tail.a) ? 1 : 0));
    check(tail.o.every((v, i) => Math.abs(v - expect[i]) < 0.02),
      `${label} ${name}: nothing is still animating once the scroll stops (${tail.o.map((v) => v.toFixed(2)).join(" ")})`);
  }

  phase = "jump";
  // A jump, not a scroll: the answer must come from geometry, not from history.
  await page.evaluate((v) => scrollTo(0, v), 0);
  await page.waitForTimeout(400);
  await page.evaluate((v) => scrollTo(0, v), colBottom - 200);
  await page.waitForTimeout(700);
  const jumped = await page.evaluate(() => document.querySelector("[data-chapter-stage]").dataset.activeChapter);
  check(jumped === "2", `${label} a jump straight to the end of the section lands on chapter 3 (got ${jumped})`);

  phase = "jitter";
  // The band: park a chapter top on the reading line and jitter across it.
  const jitter = await page.evaluate(async () => {
    const chs = [...document.querySelectorAll("[data-chapter]")];
    const st = document.querySelector("[data-chapter-stage]");
    const clearance = Math.min(112, Math.max(76, innerHeight * 0.11));
    const line = clearance + (innerHeight - clearance) * 0.5;
    const y = chs[1].getBoundingClientRect().top + scrollY - line;
    scrollTo(0, Math.round(y));
    await new Promise((r) => setTimeout(r, 500));
    const start = st.dataset.activeChapter;
    let flips = 0;
    const mo = new MutationObserver((rs) => { flips += rs.length; });
    mo.observe(st, { attributes: true, attributeFilter: ["data-active-chapter"] });
    for (let i = 0; i < 40; i++) {
      scrollTo(0, Math.round(y) + (i % 2 ? 3 : -3));
      await new Promise((r) => requestAnimationFrame(r));
    }
    await new Promise((r) => setTimeout(r, 400));
    mo.disconnect();
    return { start, flips, end: st.dataset.activeChapter };
  });
  console.log(`   boundary jitter: ${jitter.flips} changes (${jitter.start} -> ${jitter.end})`);
  check(jitter.flips === 0, `${label} a chapter resting on the reading line does not trade the stage (${jitter.flips} changes)`);

  // The caption and the active number say the same thing as the photograph.
  const agree = await page.evaluate(() => {
    const st = document.querySelector("[data-chapter-stage]");
    const a = Number(st.dataset.activeChapter);
    const caps = [...document.querySelectorAll("[data-caption]")];
    const chs = [...document.querySelectorAll("[data-chapter]")];
    const shownCap = caps.findIndex((c) => Number(getComputedStyle(c).opacity) > 0.9);
    const rule = getComputedStyle(chs[a].querySelector("[class*='chapterNumber']"), "::after").transform;
    const heights = caps.map((c) => Math.round(c.getBoundingClientRect().height));
    const bodyOpacity = chs.map((c) => Number(getComputedStyle(c.querySelector("p:last-of-type")).opacity));
    return { a, shownCap, current: chs.findIndex((c) => c.dataset.current === "true"), rule, heights, bodyOpacity };
  });
  console.log(`   caption=${agree.shownCap} current=${agree.current} activeRule=${agree.rule} captionHeights=${agree.heights.join("/")}`);
  check(agree.shownCap === agree.a && agree.current === agree.a,
    `${label} the caption and the highlighted number both follow the photograph`);
  check(new Set(agree.heights).size === 1, `${label} the caption is the same height in all three states (${agree.heights.join("/")})`);
  check(agree.rule !== "none" && !/scale\(0|matrix\(0/.test(agree.rule), `${label} the active chapter carries its rule (${agree.rule})`);
  check(agree.bodyOpacity.every((o) => o > 0.99), `${label} no chapter's description is faded down (${agree.bodyOpacity.join(" ")})`);

  // Resize across the breakpoint and back.
  phase = "resize";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const narrow = await page.evaluate(() => ({
    stageHidden: getComputedStyle(document.querySelector("[data-chapter-stage]").parentElement).display === "none",
    arts: [...document.querySelectorAll("[class*='chapterArt']")].filter((a) => getComputedStyle(a).display !== "none").length,
  }));
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(600);
  const backWide = await page.evaluate(() => {
    const st = document.querySelector("[data-chapter-stage]");
    return { a: st.dataset.activeChapter, sticky: getComputedStyle(st).position, h: Math.round(st.getBoundingClientRect().height) };
  });
  check(narrow.stageHidden && narrow.arts === 3, `${label} narrow drops the sticky stage for three inline images (${narrow.arts})`);
  check(backWide.sticky === "sticky" && backWide.h > 200, `${label} resizing back restores the sticky stage (${backWide.h}px)`);
  check(backWide.a === "2" || backWide.a === "1" || backWide.a === "0", `${label} the stage still holds an answer after a resize (${backWide.a})`);
  phase = "read";
  await ctx.close();
}

/* ------------------------------------------------------------- narrow -- */
for (const [label, width, height] of [["390x844", 390, 844], ["360x780", 360, 780]]) {
  console.log(`\n== ${label} ==`);
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await ctx.addInitScript(TRACE);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${label} [${phase}] ${m.text()}`);
    else if (m.type() === "warning") errors.push(`${label} [${phase}] ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`${label} ${e.message}`));
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  const m = await page.evaluate(async () => {
    const chs = [...document.querySelectorAll("[data-chapter]")];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // Read past them, then come back: these three are one-time by design.
    const order = chs.map((c) => {
      const art = c.querySelector("[class*='chapterArt']");
      return { artTop: Math.round(art.getBoundingClientRect().top), textTop: Math.round(c.querySelector("h3").getBoundingClientRect().top), artH: Math.round(art.getBoundingClientRect().height) };
    });
    for (let y = 0; y < document.body.scrollHeight; y += innerHeight * 0.4) { scrollTo(0, y); await wait(160); }
    const shownAfterRead = chs.filter((c) => c.dataset.shown).length;
    scrollTo(0, 0); await wait(600);
    return {
      order,
      once: chs.every((c) => c.hasAttribute("data-reveal-once")),
      shownAfterRead,
      stillShown: chs.filter((c) => c.dataset.shown).length,
      sticky: chs.map((c) => getComputedStyle(c).position).every((p) => p === "static"),
      vh: innerHeight,
    };
  });
  console.log(`   image heights ${m.order.map((o) => o.artH).join("/")} of ${m.vh}vh; shown after a read ${m.shownAfterRead}/3, still shown back at the top ${m.stillShown}/3`);
  check(m.order.every((o) => o.artTop < o.textTop), `${label} every chapter is image then text, in reading order`);
  check(m.order.every((o) => o.artH < m.vh * 0.5), `${label} the images are modest, not a screen each (max ${Math.max(...m.order.map((o) => o.artH))}px)`);
  check(m.once, `${label} the three chapters are marked one-time`);
  check(m.shownAfterRead === 3 && m.stillShown === 3, `${label} each chapter fades in once and stays in (${m.stillShown}/3)`);
  check(m.sticky, `${label} nothing is sticky in the narrow layout`);
  await ctx.close();
}

/* ------------------------------------- reduced motion, and no script -- */
console.log("\n== reduced motion / no script ==");
const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", deviceScaleFactor: 1 });
const rpage = await rctx.newPage();
await rpage.goto(BASE + "/", { waitUntil: "networkidle" });
await rpage.waitForTimeout(600);
const red = await rpage.evaluate(async () => {
  const st = document.querySelector("[data-chapter-stage]");
  const chs = [...document.querySelectorAll("[data-chapter]")];
  const y = chs[2].getBoundingClientRect().top + scrollY - innerHeight * 0.5;
  scrollTo(0, Math.round(y));
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));
  const layers = [...document.querySelectorAll("[data-layer]")];
  return {
    dur: getComputedStyle(layers[0]).transitionDuration,
    capDur: getComputedStyle(document.querySelector("[data-caption]")).transitionDuration,
    immediate: Number(getComputedStyle(layers[2]).opacity),
    a: st.dataset.activeChapter,
    copy: chs.every((c) => Number(getComputedStyle(c).opacity) > 0.99),
  };
});
/*
  Not `=== "0s"`. The site-wide reduced-motion reset in globals.css sets
  `transition-duration: 0.01ms !important`, which outranks this section's own
  `transition: none` and is what every element on the page reports. A hundredth
  of a millisecond is a switch, not a fade; the question is whether anything
  measurable is left, so the bar is a millisecond.
*/
const instant = (v) => parseFloat(v) < 0.001;
check(instant(red.dur) && instant(red.capDur), `reduced motion: the photograph and its caption switch with no transition (${red.dur}/${red.capDur})`);
check(red.immediate > 0.99 && red.a === "2", `reduced motion: the third photograph is there within two frames (${red.immediate})`);
check(red.copy, "reduced motion: every chapter's copy is simply present");
await rctx.close();

const nctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
const npage = await nctx.newPage();
await npage.goto(BASE + "/", { waitUntil: "load" });
const html = await npage.content();
check(/The conversation/.test(html) && /The right fit/.test(html) && /The follow-through/.test(html), "no script: all three chapters are in the document");
check(/data-active-chapter="0"/.test(html), "no script: the stage opens on the first photograph");
await nctx.close();

/*
  Two of Next's development-only image advisories show up on this page. Both
  are printed rather than swallowed, and neither is treated as a failure,
  because neither is an error and neither exists in a production build.

    · The hero carries two photographs, a wide one and a portrait one, and
      hides whichever does not suit the window. Each is `fill` with
      `sizes="100vw"`, so at the width where it is `display: none` Next
      measures it at zero and says 100vw is wrong — the desktop load complains
      about the portrait, the phone load about the wide one. 100vw is right for
      the layout that shows each. This predates this work and belongs to the
      hero, not to the chapters; the underlying cost is that a hidden `fill`
      image with `priority` is still fetched, so each visitor pulls a hero they
      never see. Worth fixing where the hero is owned, with a media-switched
      `<picture>` rather than two always-mounted images.

    · At 1366x640, reading the whole page under the frame recorder makes a
      chapter photograph an LCP candidate and Next advises `loading="eager"`.
      Taking that advice would be wrong: the photograph is three screens down,
      and making it eager would cost every visitor a download before the fold.
      It does not appear at any other viewport.

  Everything else — any error, and any warning that is not one of these two —
  fails the run.
*/
const DEV_IMAGE_ADVISORIES = [
  { name: "next/image sizes hint on the hero's two photographs", re: /hero-portrait-1600\.webp|hero-wide\.png/ },
  { name: "next/image LCP hint on a chapter photograph at 1366x640", re: /was detected as the Largest Contentful Paint/ },
];
const advisories = errors.filter((e) => DEV_IMAGE_ADVISORIES.some((a) => a.re.test(e)));
const real = errors.filter((e) => !DEV_IMAGE_ADVISORIES.some((a) => a.re.test(e)));
for (const a of DEV_IMAGE_ADVISORIES) {
  const n = errors.filter((e) => a.re.test(e)).length;
  if (n) console.log(`   dev-only advisory, not a failure: ${n}x ${a.name}`);
}
check(real.length === 0, `no console errors, and no warnings beyond Next's dev image advisories (${advisories.length} advisories)${real.length ? " — " + real[0] : ""}`);

/* ----------------------------------------------------------- the clip -- */
const vctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: `${OUT}/clip`, size: { width: 1440, height: 900 } },
});
await vctx.addInitScript(TRACE);
const vpage = await vctx.newPage();
await vpage.goto(BASE + "/", { waitUntil: "networkidle" });
await vpage.waitForTimeout(700);
const vTop = await vpage.evaluate(() => Math.round(document.querySelector("[data-chapter-stage]").parentElement.getBoundingClientRect().top + scrollY));
for (let y = Math.max(0, vTop - 700); y < vTop + 1900; y += 10) {
  await vpage.evaluate((v) => scrollTo(0, v), y);
  await vpage.waitForTimeout(16);
}
await vpage.waitForTimeout(900);
await vctx.close();
console.log(`\nclip in ${OUT}/clip`);

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
