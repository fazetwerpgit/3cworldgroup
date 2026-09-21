/*
  node docs/cinematic/review/motion-glow.mjs [light|register|absent|lazy|resize|chrome|seq|all]

  The hero's pointer glow, checked against the photograph rather than the
  stylesheet. The layer is the same frame's own lit roads, so the only honest
  test is a pixel diff against the identical frame with the layer removed:

    light     roads under the pointer get brighter; the lake, which has no
              road in it, must not. If a 200px box centred on open water
              changes at all, the effect is a spotlight and it has failed.
    register  peak forced to 1 and the radius past the frame, so the whole
              glow layer shows. Its diff against the plain hero IS the road
              network; if it lands off the roads the two layers are not in
              register.
    absent    phone and reduced motion: no element, and no request for the
              file. A 300KB decoration must never be fetched on a phone.
    lazy      and not on desktop either until a mouse actually arrives: no
              request at load, exactly one after the first pointerenter.
    resize    a window dragged from 800px up to 1440px lights. The listeners
              follow the media query rather than one read at mount.
    chrome    the header, the apply bar and the copy's own contrast are
              unchanged with the pointer sitting on them.
    seq       six frames of the pointer crossing the frame, for the recording.

  Screenshots land in .tmpshots/motion/glow/. The numbers only say a state was
  reached; read the pictures.
*/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = "http://127.0.0.1:3120";
const OUT = ".tmpshots/motion/glow";
const GLOW_FILE = "hero-wide-glow-bloom.webp";
const only = process.argv[2] || "all";
const run = (name) => only === "all" || only === name;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const fails = [];
const check = (ok, label) => {
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) fails.push(label);
};

const magick = (args) => execFileSync("magick", args, { encoding: "utf8" }).trim();
const rmse = (a, b) => {
  try {
    execFileSync("magick", ["compare", "-metric", "RMSE", a, b, "null:"], { encoding: "utf8" });
    return 0;
  } catch (e) {
    const m = /\(([0-9.]+)\)/.exec(String(e.stderr || ""));
    return m ? Number(m[1]) * 100 : NaN; // percent of full scale
  }
};
const meanLum = (f) => Number(magick([f, "-colorspace", "Gray", "-format", "%[fx:mean*100]", "info:"]));
/* The disc test. A spotlight lifts every pixel it covers, so its difference
   image has a raised FLOOR; roads lighting up lift a few percent of pixels a
   long way and leave the rest alone. Median and max separate the two where a
   mean cannot: a mean of 1 is the same number either way. */
const liftStats = (on, off) => {
  const diff = `${on.replace(/\.png$/, "")}-diff.png`;
  magick([on, off, "-compose", "difference", "-composite", "-colorspace", "Gray", diff]);
  const [median, max, mean] = magick([
    diff, "-format", "%[fx:median*100] %[fx:maxima*100] %[fx:mean*100]", "info:",
  ]).split(/\s+/).map(Number);
  return { median, max, mean, diff };
};

const newPage = async (opts = {}) => {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...opts });
  await ctx.addInitScript(() => {
    const s = document.createElement("style");
    s.textContent = "html{scroll-behavior:auto!important} nextjs-portal{display:none!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
  });
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("   console.error:", m.text());
  });
  return { ctx, page, requests };
};

/* The glow layer is a background-image placed with `cover` at 50% 42%, the
   same placement .heroImageWide gets from object-fit. This is that placement
   solved backwards: a pixel in the 1774x887 source, answered as a point on
   screen, so a hover target can be named in the picture rather than measured
   off a screenshot at each width. */
const NAT = { w: 1774, h: 887 };
const POINTS = {
  intersection: [957, 397], // the lit crossroads, the brightest thing in the layer
  lake: [1085, 163], // the middle of the lake: the layer is empty here
  houses: [1191, 584], // a lit cul-de-sac cluster
  forest: [1610, 770], // dark canopy, no road within 110px of it in any direction
};
const toViewport = async (page, src) =>
  page.evaluate(
    ({ src, NAT }) => {
      const art = document.querySelector("[data-hero-art]");
      const r = art.getBoundingClientRect();
      const scale = Math.max(r.width / NAT.w, r.height / NAT.h);
      const ox = (r.width - NAT.w * scale) * 0.5;
      const oy = (r.height - NAT.h * scale) * 0.42;
      return { x: Math.round(r.left + ox + src[0] * scale), y: Math.round(r.top + oy + src[1] * scale) };
    },
    { src, NAT },
  );

const setGlow = (page, on) =>
  page.evaluate((on) => {
    const el = document.querySelector("[data-hero-art] > div:last-child");
    el.style.display = on ? "" : "none";
  }, on);

const forceGlow = (page, peak, radius) =>
  page.evaluate(
    ({ peak, radius }) => {
      const el = document.querySelector("[data-hero-art] > div:last-child");
      el.style.setProperty("--glow-peak", String(peak));
      el.style.setProperty("--glow-r", radius);
    },
    { peak, radius },
  );

const leaveHero = async (page, vp) => {
  await page.mouse.move(vp.width / 2, vp.height - 4);
  await page.waitForTimeout(450);
};
const clipBox = (pt, size, vp) => {
  const half = size / 2;
  return {
    x: Math.max(0, Math.min(vp.width - size, pt.x - half)),
    y: Math.max(0, Math.min(vp.height - size, pt.y - half)),
    width: size,
    height: size,
  };
};

const VPS = [
  ["1440x900", { width: 1440, height: 900 }],
  ["1920x1080", { width: 1920, height: 1080 }],
];

/* ----------------------------------------------------------------- light -- */
if (run("light")) {
  console.log("\n== LIGHT ==");
  for (const [tag, vp] of VPS) {
    const { ctx, page } = await newPage({ viewport: vp });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);

    for (const [name, src] of Object.entries(POINTS)) {
      const pt = await toViewport(page, src);
      await page.mouse.move(pt.x, pt.y);
      await page.waitForTimeout(800); // drift settles, opacity is up
      const clip = clipBox(pt, 200, vp);
      const on = `${OUT}/${tag}-${name}-on.png`;
      const off = `${OUT}/${tag}-${name}-off.png`;
      await page.screenshot({ path: on, clip });
      await setGlow(page, false);
      await page.waitForTimeout(120);
      await page.screenshot({ path: off, clip });
      await setGlow(page, true);
      await page.waitForTimeout(120);

      const d = rmse(on, off);
      const s = liftStats(on, off);
      console.log(
        `   ${tag} ${name.padEnd(13)} rmse ${d.toFixed(3)}%  lift median ${s.median.toFixed(3)} mean ${s.mean.toFixed(3)} max ${s.max.toFixed(1)}`,
      );
      // Two different gates, because the samples are two different questions.
      //
      // `forest` is the disc test and the only one that can fail it cleanly:
      // 220 source px of canopy with no road in it, sitting under the middle
      // of the glow. A torch would print a bright arc across it. Nothing may
      // move there at all.
      //
      // On a road sample the floor is allowed a level or two — a 200px box
      // centred on the brightest junction in the frame is mostly road, so its
      // median IS road, not a background lift. What still has to hold is that
      // the peak runs far ahead of the floor.
      if (name === "forest") {
        check(d < 0.35, `${tag} forest: no disc over empty canopy (rmse ${d.toFixed(3)}% < 0.35)`);
        check(s.median <= 0.4, `${tag} forest: median lift ${s.median.toFixed(3)} is at most one 8-bit level`);
        check(s.mean < 0.5, `${tag} forest: mean lift ${s.mean.toFixed(3)} under one level`);
      } else {
        check(s.median <= 1.0, `${tag} ${name}: floor stays down — median lift ${s.median.toFixed(3)} <= 1.0`);
        check(s.max > 8 * s.median || s.median === 0, `${tag} ${name}: peak ${s.max.toFixed(1)} runs ahead of the floor`);
      }
      if (name !== "lake" && name !== "forest") {
        check(d > 0.6, `${tag} ${name}: roads visibly brighter (rmse ${d.toFixed(3)}% > 0.6)`);
      }

      if (name === "lake") {
        // The one box on this frame that is entirely open water, measured off
        // the source picture: 1020-1150 x 158-174, inside the far shore's
        // lamp row. If a disc exists anywhere it exists here, with the
        // pointer parked on it and no road to hide behind.
        const water = await page.evaluate(
          ({ NAT }) => {
            const r = document.querySelector("[data-hero-art]").getBoundingClientRect();
            const sc = Math.max(r.width / NAT.w, r.height / NAT.h);
            const ox = r.left + (r.width - NAT.w * sc) * 0.5;
            const oy = r.top + (r.height - NAT.h * sc) * 0.42;
            const x = Math.round(ox + 1020 * sc);
            const y = Math.round(oy + 158 * sc);
            return { x, y, width: Math.round(130 * sc), height: Math.round(16 * sc) };
          },
          { NAT },
        );
        const wOn = `${OUT}/${tag}-water-on.png`;
        const wOff = `${OUT}/${tag}-water-off.png`;
        await page.screenshot({ path: wOn, clip: water });
        await setGlow(page, false);
        await page.waitForTimeout(120);
        await page.screenshot({ path: wOff, clip: water });
        await setGlow(page, true);
        await page.waitForTimeout(120);
        const wd = rmse(wOn, wOff);
        const ws = liftStats(wOn, wOff);
        console.log(
          `   ${tag} open water    rmse ${wd.toFixed(3)}%  lift median ${ws.median.toFixed(3)} mean ${ws.mean.toFixed(3)} max ${ws.max.toFixed(1)}`,
        );
        // 0.392 is one 8-bit level out of 255 — the floor PNG can express, not
        // a change. The gate is "at most one level", which is the strongest
        // claim a screenshot can carry.
        check(ws.median <= 0.4, `${tag} open water: median lift ${ws.median.toFixed(3)} is at most one 8-bit level`);
        check(ws.mean < 0.5, `${tag} open water: mean lift ${ws.mean.toFixed(3)} under one level`);
      }
    }

    // (d) no pointer: the whole hero must be the plain photograph again.
    await leaveHero(page, vp);
    const heroClip = { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 700) };
    const restOn = `${OUT}/${tag}-rest-on.png`;
    const restOff = `${OUT}/${tag}-rest-off.png`;
    await page.screenshot({ path: restOn, clip: heroClip });
    await setGlow(page, false);
    await page.waitForTimeout(120);
    await page.screenshot({ path: restOff, clip: heroClip });
    const dRest = rmse(restOn, restOff);
    check(dRest < 0.08, `${tag} no pointer: hero identical with layer removed (rmse ${dRest.toFixed(3)}%)`);
    await ctx.close();
  }
}

/* -------------------------------------------------------------- register -- */
if (run("register")) {
  console.log("\n== REGISTER ==");
  for (const [tag, vp] of [["1280x800", { width: 1280, height: 800 }], ...VPS]) {
    const { ctx, page } = await newPage({ viewport: vp });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    const pt = await toViewport(page, POINTS.intersection);
    await page.mouse.move(pt.x, pt.y);
    await page.waitForTimeout(800);
    await forceGlow(page, 1, "4000px");
    await page.waitForTimeout(250);

    const clip = { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 700) };
    const full = `${OUT}/${tag}-register-on.png`;
    const plain = `${OUT}/${tag}-register-off.png`;
    await page.screenshot({ path: full, clip });
    await setGlow(page, false);
    await page.waitForTimeout(150);
    await page.screenshot({ path: plain, clip });

    // The difference is the glow layer alone. Amplified and laid back over the
    // plain frame in magenta: if it traces the roads the layers are in
    // register, if it ghosts beside them they are not.
    const diff = `${OUT}/${tag}-register-diff.png`;
    magick([full, plain, "-compose", "difference", "-composite", "-colorspace", "Gray", "-auto-level", diff]);
    magick([
      plain, "(", diff, "-fill", "magenta", "-tint", "100", ")",
      "-compose", "screen", "-composite", `${OUT}/${tag}-register-overlay.png`,
    ]);
    console.log(`   ${tag} wrote ${diff} + overlay`);
    await ctx.close();
  }
  check(true, "register sheets written (read them)");
}

/* ---------------------------------------------------------------- absent -- */
if (run("absent")) {
  console.log("\n== ABSENT ==");
  const cases = [
    ["390x844", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
    ["1440-reduced", { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }],
  ];
  for (const [tag, opts] of cases) {
    const { ctx, page, requests } = await newPage(opts);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    const display = await page.evaluate(() => {
      const el = document.querySelector("[data-hero-art] > div:last-child");
      return el ? getComputedStyle(el).display : "missing";
    });
    check(display === "none", `${tag}: glow layer display:none (got ${display})`);
    const fetched = requests.filter((u) => u.includes(GLOW_FILE));
    check(fetched.length === 0, `${tag}: ${GLOW_FILE} never requested (${fetched.length} requests)`);
    await page.screenshot({ path: `${OUT}/${tag}-hero.png`, clip: { x: 0, y: 0, width: opts.viewport.width, height: Math.min(opts.viewport.height, 844) } });
    await ctx.close();
  }
  // And the desktop control: with a pointer in the frame it IS fetched, or
  // the layer is doing nothing. See the `lazy` section for the other half —
  // that a desktop load WITHOUT a pointer fetches nothing.
  const { ctx, page, requests } = await newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const pt = await toViewport(page, POINTS.intersection);
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(1000);
  check(requests.some((u) => u.includes(GLOW_FILE)), `1440 desktop with a pointer: ${GLOW_FILE} is fetched`);
  await ctx.close();
}

/* ------------------------------------------------------------------ lazy -- */
if (run("lazy")) {
  console.log("\n== LAZY ==");
  const vp = { width: 1440, height: 900 };
  const { ctx, page, requests } = await newPage({ viewport: vp });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const atLoad = requests.filter((u) => u.includes(GLOW_FILE)).length;
  check(atLoad === 0, `desktop load with no pointer: ${GLOW_FILE} not requested (${atLoad})`);
  check(
    await page.evaluate(() => !document.querySelector("[data-hero-art]").hasAttribute("data-glow-armed")),
    "hero art is not armed before a pointer arrives",
  );

  const pt = await toViewport(page, POINTS.intersection);
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(1200);
  const afterEnter = requests.filter((u) => u.includes(GLOW_FILE)).length;
  check(afterEnter === 1, `one request after the first pointerenter (${afterEnter})`);
  check(
    await page.evaluate(() => document.querySelector("[data-hero-art]").dataset.glowArmed === "true"),
    "hero art armed on pointerenter",
  );

  // Leave and come back: armed stays on, so the second entrance paints from
  // cache rather than asking for the file again.
  await leaveHero(page, vp);
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(900);
  const afterSecond = requests.filter((u) => u.includes(GLOW_FILE)).length;
  check(afterSecond === 1, `still one request after a second entrance (${afterSecond})`);

  // And it still lights, late-loaded.
  const clip = clipBox(pt, 200, vp);
  const on = `${OUT}/lazy-on.png`;
  const off = `${OUT}/lazy-off.png`;
  await page.screenshot({ path: on, clip });
  await setGlow(page, false);
  await page.waitForTimeout(150);
  await page.screenshot({ path: off, clip });
  const d = rmse(on, off);
  check(d > 0.6, `lazily loaded layer still lights the roads (rmse ${d.toFixed(3)}% > 0.6)`);
  await ctx.close();
}

/* ---------------------------------------------------------------- resize -- */
if (run("resize")) {
  console.log("\n== RESIZE ==");
  // Starts below the breakpoint, where nothing is bound, then widens. A
  // one-shot matchMedia read at mount leaves this window dead until the next
  // navigation; the change subscription is what makes it light.
  const { ctx, page, requests } = await newPage({ viewport: { width: 800, height: 900 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  check(
    requests.filter((u) => u.includes(GLOW_FILE)).length === 0,
    "800px: glow file not requested",
  );

  const vp = { width: 1440, height: 900 };
  await page.setViewportSize(vp);
  await page.waitForTimeout(700);
  const pt = await toViewport(page, POINTS.intersection);
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(1200);

  const drift = await page.evaluate(() => {
    const a = document.querySelector("[data-hero-art]");
    return { drift: a.style.getPropertyValue("--drift-x"), glow: a.dataset.glow, armed: a.dataset.glowArmed };
  });
  check(drift.glow === "on", `after resize 800 -> 1440 the glow is live (data-glow=${drift.glow})`);
  check(drift.drift !== "", `after resize the drift is bound too (--drift-x=${drift.drift || "unset"})`);

  const clip = clipBox(pt, 200, vp);
  const on = `${OUT}/resize-on.png`;
  const off = `${OUT}/resize-off.png`;
  await page.screenshot({ path: on, clip });
  await setGlow(page, false);
  await page.waitForTimeout(150);
  await page.screenshot({ path: off, clip });
  const d = rmse(on, off);
  const st = liftStats(on, off);
  console.log(`   resized 800 -> 1440  rmse ${d.toFixed(3)}%  peak lift ${st.max.toFixed(1)}`);
  check(d > 0.6, `resized window lights the roads (rmse ${d.toFixed(3)}% > 0.6)`);
  await ctx.close();
}

/* ---------------------------------------------------------------- chrome -- */
if (run("chrome")) {
  console.log("\n== CHROME ==");
  const vp = { width: 1440, height: 900 };
  const { ctx, page } = await newPage({ viewport: vp });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  // Pointer parked on the lede: the copy's own ground must not change.
  const lede = await page.evaluate(() => {
    const p = document.querySelector("[data-hero] p");
    const r = p.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), r: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } };
  });
  await page.mouse.move(lede.x, lede.y);
  await page.waitForTimeout(800);
  const cOn = `${OUT}/copy-on.png`;
  const cOff = `${OUT}/copy-off.png`;
  await page.screenshot({ path: cOn, clip: lede.r });
  await setGlow(page, false);
  await page.waitForTimeout(150);
  await page.screenshot({ path: cOff, clip: lede.r });
  await setGlow(page, true);
  const lumOn = meanLum(cOn);
  const lumOff = meanLum(cOff);
  console.log(`   lede ground lum  on ${lumOn.toFixed(3)}  off ${lumOff.toFixed(3)}  delta ${(lumOn - lumOff).toFixed(3)}`);
  check(Math.abs(lumOn - lumOff) < 0.35, `copy contrast unchanged under the pointer (delta ${(lumOn - lumOff).toFixed(3)})`);

  // Scroll past the hero: the apply bar arrives, the header condenses, and the
  // glow layer has gone with its own section.
  await page.mouse.move(700, 400);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 1400));
  await page.waitForTimeout(700);
  const state = await page.evaluate(() => {
    const bar = document.querySelector("[data-apply-bar]");
    const header = document.querySelector("header");
    const el = document.querySelector("[data-hero-art] > div:last-child");
    return {
      bar: bar ? bar.dataset.visible === "true" : "no-bar",
      condensed: header ? header.dataset.condensed === "true" : "no-header",
      glowBottom: Math.round(el.getBoundingClientRect().bottom),
    };
  });
  console.log(`   after scroll: applyBar=${state.bar} condensed=${state.condensed} glowBottom=${state.glowBottom}`);
  check(state.bar === true, "apply bar visible after the hero leaves");
  check(state.glowBottom <= 0, "glow layer is off screen with its section");
  await page.screenshot({ path: `${OUT}/scrolled.png` });
  await ctx.close();
}

/* ------------------------------------------------------------------- seq -- */
if (run("seq")) {
  console.log("\n== SEQ ==");
  const vp = { width: 1440, height: 900 };
  const { ctx, page } = await newPage({ viewport: vp });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const a = await toViewport(page, [380, 620]);
  const b = await toViewport(page, [1420, 300]);
  for (let i = 0; i < 6; i += 1) {
    const t = i / 5;
    await page.mouse.move(Math.round(a.x + (b.x - a.x) * t), Math.round(a.y + (b.y - a.y) * t));
    await page.waitForTimeout(i === 0 ? 700 : 220);
    await page.screenshot({ path: `${OUT}/seq-${i}.png`, clip: { x: 0, y: 0, width: vp.width, height: 700 } });
  }
  magick([...Array.from({ length: 6 }, (_, i) => `${OUT}/seq-${i}.png`), "-resize", "700x", "-append", `${OUT}/seq-sheet.png`]);
  check(true, "6-frame sequence + seq-sheet.png written");
  await ctx.close();
}

await browser.close();
console.log(`\n${fails.length ? `FAILED (${fails.length}):\n  ${fails.join("\n  ")}` : "ALL PASS"}`);
process.exit(fails.length ? 1 : 0);
