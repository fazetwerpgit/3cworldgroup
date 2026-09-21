/*
  node docs/cinematic/review/motion-home.mjs [hero|chapters|route|nav|all]

  The homepage motion pass, checked in a real browser rather than read off the
  stylesheet. Three set pieces, one section each:

    hero      the entrance has to be finished inside ~0.7s, the photograph has
              to be sharp and unscaled the whole way through, and Apply has to
              be the element under its own centre from the first frame.
    chapters  every sampled scroll position must have exactly one opaque top
              layer, and it must be the chapter the reading line says it is —
              forwards, backwards, after a jump, and across a resize.
    route     stops arrive 01 → 04, and none of them is visible before the
              stroke has passed its own fraction of the path.
    nav       a client-side navigation and a back must not run the entrance
              twice or leave a second set of observers behind.
    slow      on a device too slow to hydrate inside the safety timer, the copy
              must never go visible and then hidden again.

  Screenshots land in .tmpshots/motion/home/. Read them; the numbers below only
  say a state was reached, not that it looked right.
*/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3120";
const OUT = ".tmpshots/motion/home";
const CSS = `html{scroll-behavior:auto!important} nextjs-portal{display:none!important}`;
const only = process.argv[2] || "all";
const run = (name) => only === "all" || only === name;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const fails = [];
const check = (ok, label) => {
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) fails.push(label);
};

const newPage = async (opts = {}) => {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...opts });
  await ctx.addInitScript(() => {
    const s = document.createElement("style");
    s.textContent = "html{scroll-behavior:auto!important} nextjs-portal{display:none!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
  });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log("   console.error:", m.text());
  });
  return { ctx, page };
};

/* ------------------------------------------------------------------ hero -- */
if (run("hero")) {
  console.log("\n== HERO ==");
  const VPS = [
    ["1440x900", { width: 1440, height: 900 }, {}],
    ["1920x1080", { width: 1920, height: 1080 }, {}],
    ["1366x640", { width: 1366, height: 640 }, {}],
    ["390x844", { width: 390, height: 844 }, { isMobile: true, hasTouch: true }],
  ];
  for (const [label, viewport, extra] of VPS) {
    const { ctx, page } = await newPage({ viewport, ...extra });
    // The clock is `data-entered`, not load: that attribute IS the entrance's
    // zero, it is what every transition delay is measured from, and it is the
    // first moment the stylesheet is certainly live. Anchoring on load instead
    // sampled a frame before first paint, where there is no hero to measure
    // and the buttons have not been positioned yet.
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-entered]", { timeout: 10000 });
    const t0 = Date.now();
    const frames = [];
    for (const ms of [0, 100, 150, 300, 500, 750]) {
      const wait = ms - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      const state = await page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const css = (el) => (el ? getComputedStyle(el) : null);
        const art = q('[data-hero-art]');
        const actions = document.querySelector('[class*="heroActions"]');
        const link = actions?.querySelector("a");
        let hit = "none";
        if (link) {
          const r = link.getBoundingClientRect();
          const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          hit = el === link || link.contains(el) ? "link" : (el?.tagName || "none");
        }
        const a = css(art);
        const ac = css(actions);
        return {
          entered: !!document.querySelector("[data-entered]"),
          artFilter: a?.filter,
          artTransform: a?.transform,
          actionsOpacity: ac ? Number(ac.opacity).toFixed(3) : null,
          actionsPointer: ac?.pointerEvents,
          actionsVisibility: ac?.visibility,
          hit,
        };
      });
      // The real elapsed time, not the intended one: each evaluate is a round
      // trip to a dev server and the samples drift late. The screenshots and
      // the computed budget below are the evidence; these are a sanity trace.
      frames.push([ms, state, Date.now() - t0]);
      await page.screenshot({ path: `${OUT}/hero-${label}-${String(ms).padStart(3, "0")}ms.png` });
    }
    console.log(` ${label}`);
    for (const [ms, s, actual] of frames) {
      console.log(`   ${String(ms).padStart(3)}ms (t+${String(actual).padStart(4)}ms)  actions.opacity=${s.actionsOpacity} hit=${s.hit} filter=${s.artFilter} transform=${s.artTransform}`);
    }
    const noFilter = frames.every(([, s]) => s.artFilter === "none");
    // A pure translate keeps matrix c/b at 0 and a/d at exactly 1 — any scale
    // or blur entrance would show up in one of these two lines.
    const noScale = frames.every(([, s]) => {
      const m = /matrix\(([^)]*)\)/.exec(s.artTransform || "");
      if (!m) return s.artTransform === "none";
      const n = m[1].split(",").map(Number);
      return Math.abs(n[0] - 1) < 0.001 && Math.abs(n[3] - 1) < 0.001;
    });
    const clickable = frames.every(([, s]) => s.hit === "link");
    const usable = frames.every(([, s]) => s.actionsPointer !== "none" && s.actionsVisibility === "visible");
    const finished = Number(frames[frames.length - 1][1].actionsOpacity) > 0.999;
    const at750 = frames.find(([ms]) => ms === 750)[1];
    check(noFilter, `${label} hero photo carries no filter during the entrance`);
    check(noScale, `${label} hero photo is never scaled during the entrance`);
    check(clickable, `${label} Apply is the element under its own centre from 0ms on`);
    check(usable, `${label} actions keep pointer-events and visibility throughout`);
    check(finished && at750.entered, `${label} entrance finished by 750ms`);
    await ctx.close();
  }

  // Frame-by-frame, inside the page. A round-tripped evaluate is far too slow
  // to see the first 50ms of an entrance, and the first 50ms is exactly where
  // the pre-state bug lived: a transition declared on the [data-motion="on"]
  // rule starts easing the finished page towards hidden during the two frames
  // before data-entered, so the real entrance began from 0.84 opacity and a
  // fraction of its travel. This rAF trace is the only way to prove it does
  // not: the last frame before data-entered must be AT the pre-state, snapped,
  // not part-way towards it.
  for (const [label, viewport] of [["1440x900", { width: 1440, height: 900 }], ["390x844", { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => {
      window.__trace = [];
      const readY = (el) => {
        const t = getComputedStyle(el).transform;
        if (!t || t === "none") return 0;
        const n = /matrix\(([^)]*)\)/.exec(t);
        return n ? Number(n[1].split(",")[5]) : 0;
      };
      const start = () => {
        const lede = document.querySelector('[class*="heroLede"]');
        const span = document.querySelector('[class*="heroLine"] > span');
        if (!lede || !span) return requestAnimationFrame(start);
        const tick = () => {
          window.__trace.push({
            t: Math.round(performance.now()),
            motion: !!document.querySelector('[data-motion="on"]'),
            entered: !!document.querySelector("[data-entered]"),
            lede: Number(getComputedStyle(lede).opacity),
            lineY: Math.round(readY(span) * 100) / 100,
            lineH: Math.round(span.getBoundingClientRect().height),
          });
          if (window.__trace.length < 240) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      };
      document.addEventListener("DOMContentLoaded", start);
    });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-entered]", { timeout: 10000 });
    await page.waitForTimeout(1200);
    const trace = await page.evaluate(() => window.__trace);
    const pre = trace.filter((f) => f.motion && !f.entered);
    const post = trace.filter((f) => f.entered);
    const enteredAt = post.length ? post[0].t : null;
    const at = (ms) => post.find((f) => f.t - enteredAt >= ms) || post[post.length - 1];
    const lineH = trace[trace.length - 1].lineH || 1;
    const full = lineH * 1.05;
    console.log(` ${label} rAF trace: ${trace.length} frames, ${pre.length} between data-motion and data-entered`);
    for (const f of pre) console.log(`   pre    t=${f.t} lede=${f.lede.toFixed(3)} lineY=${f.lineY} (pre-state is ${full.toFixed(1)}px)`);
    for (const ms of [0, 20, 50, 200, 700]) {
      const f = at(ms);
      console.log(`   +${String(ms).padStart(3)}ms lede=${f.lede.toFixed(3)} lineY=${f.lineY}`);
    }
    if (pre.length) {
      const last = pre[pre.length - 1];
      check(last.lede <= 0.02, `${label} lede is snapped to 0, not easing, before data-entered (${last.lede.toFixed(3)})`);
      check(last.lineY >= full * 0.95, `${label} headline is snapped to its full ${full.toFixed(0)}px mask rise before data-entered (${last.lineY}px)`);
    } else {
      console.log("   (no frame sampled between data-motion and data-entered)");
    }
    // Travel is measured from the snapped pre-state, not from the first frame
    // after data-entered: the expo curve is so front-loaded that it is already
    // a fifth of the way home by the time that frame paints. Taking the first
    // post frame as the start is what makes a working entrance look truncated.
    const startY = pre.length ? pre[pre.length - 1].lineY : Math.max(...post.map((f) => f.lineY));
    const endY = post[post.length - 1].lineY;
    const travel = startY - endY;
    const dip = Math.min(...post.map((f) => f.lede));
    console.log(`   entrance travel=${travel.toFixed(2)}px of ${full.toFixed(0)}px (${startY} → ${endY})   lowest lede opacity=${dip.toFixed(3)}`);
    check(travel >= full * 0.95 && Math.abs(endY) < 1, `${label} headline entrance travels its full mask rise (${travel.toFixed(1)}px / ${full.toFixed(0)}px)`);
    check(dip <= 0.02, `${label} lede entrance starts from 0 (${dip.toFixed(3)})`);
    check(post[post.length - 1].lede > 0.999, `${label} lede entrance finishes at full opacity`);
    // At 700ms the budget is spent: the headline is home and the lede is solid.
    const f700 = at(700);
    check(Math.abs(f700.lineY) < 1 && f700.lede > 0.999,
      `${label} settled at 700ms (lineY=${f700.lineY}px lede=${f700.lede.toFixed(3)})`);
    await ctx.close();
  }

  /*
    The warm-cache flash, which is what the pre-paint gate exists to fix.
    `data-motion` used to be set in an effect, so on a primed cache the finished
    hero painted readable for ~170ms, was snapped hidden for two frames, and
    animated back in — a content-then-hide flicker on every repeat visit. The
    boot script in (cinematic)/layout.tsx now sets the attribute before the
    parser reaches the hero, so the first frame that has the copy in it is
    already the pre-state.

    Proving that needs a recorder running BEFORE the hero exists, so this one
    ticks from document_start and records whether the copy is present yet rather
    than waiting for it. Any frame where the copy exists, is not entered, and is
    readable is the flash.
  */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const prime = await ctx.newPage();
    await prime.goto(BASE + "/", { waitUntil: "networkidle" });
    await prime.close();
    await ctx.addInitScript(() => {
      window.__warm = [];
      const tick = () => {
        const lede = document.querySelector('[class*="heroLede"]');
        const root = document.documentElement;
        window.__warm.push({
          t: Math.round(performance.now()),
          present: !!lede,
          lede: lede ? Number(getComputedStyle(lede).opacity) : null,
          motion: root ? root.dataset.motion === "on" : false,
          entered: root ? !!root.dataset.entered : false,
        });
        if (window.__warm.length < 400) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const page = await ctx.newPage();
    const noise = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") noise.push(m.text());
    });
    page.on("pageerror", (e) => noise.push(String(e)));
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("html[data-entered]", { timeout: 10000 });
    await page.waitForTimeout(1200);
    const warm = await page.evaluate(() => window.__warm);
    const firstPresent = warm.find((f) => f.present);
    const enteredFrame = warm.find((f) => f.entered);
    const flash = warm.filter((f) => f.present && !f.entered && f.lede > 0.02);
    console.log(`   warm reload: ${warm.length} frames, copy first present at t=${firstPresent?.t}ms (motion=${firstPresent?.motion} lede=${firstPresent?.lede}), data-entered at t=${enteredFrame?.t}ms`);
    check(!!firstPresent && firstPresent.motion && firstPresent.lede <= 0.02,
      `warm reload: the first painted frame with the hero copy in it is the pre-state (lede=${firstPresent?.lede})`);
    check(flash.length === 0,
      `warm reload: hero copy never paints readable before the entrance (${flash.length} flash frames)`);
    const post = warm.filter((f) => f.entered);
    const settled = post.find((f) => f.t - post[0].t >= 700) || post[post.length - 1];
    check(settled.lede > 0.999, `warm reload: entrance still lands by 700ms (lede=${settled.lede})`);
    // The boot script writes an attribute React did not render. If React
    // objected to that it would say so here, and <html> would need
    // suppressHydrationWarning.
    const hydration = noise.filter((t) => /hydrat/i.test(t));
    if (noise.length) console.log("   console:", noise.slice(0, 3).join(" | "));
    check(hydration.length === 0, `warm reload: no hydration warning${hydration.length ? " — " + hydration[0] : ""}`);
    await page.screenshot({ path: `${OUT}/hero-warm.png` });
    await ctx.close();
  }

  /*
    The console, cold and across the group. The boot script writes an attribute
    on <html> that React did not render, and React compares the DOM against the
    RSC payload when it hydrates that element — so without
    `suppressHydrationWarning` on <html> it logs a mismatch on every page in the
    group. That attribute plus the suppression is Next.js's documented
    "preventing flash before hydration" pattern, not a way of silencing a real
    mismatch: the suppression covers this element's own attributes and nothing
    in its subtree, so a genuine mismatch anywhere else still reports.
  */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const noise = [];
    const routes = ["/", "/services", "/about", "/opportunities", "/contact"];
    for (const route of routes) {
      // A fresh page in a fresh context is a cold load for the first route and
      // a warm one after that, which is both states in one pass.
      const page = await ctx.newPage();
      page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning") noise.push(`${route}: ${m.text()}`);
      });
      page.on("pageerror", (e) => noise.push(`${route}: ${e}`));
      await page.goto(BASE + route, { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      await page.close();
    }
    const hydration = noise.filter((t) => /hydrat|did not match|server rendered/i.test(t));
    console.log(`   console across ${routes.length} routes (cold then warm): ${noise.length} messages, ${hydration.length} about hydration`);
    for (const n of noise.slice(0, 2)) console.log("     " + n.slice(0, 140));
    check(hydration.length === 0, `no hydration warning on any route${hydration.length ? " — " + hydration[0].slice(0, 160) : ""}`);
    await ctx.close();
  }

  // Scripting off: the boot script never runs, so no attribute is ever set and
  // the served page is the finished page. This is the failure mode the gate is
  // written this way round to avoid, so it is checked rather than assumed.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.screenshot({ path: `${OUT}/hero-nojs.png` });
    // Read the served markup, not the DOM: with scripting off there is no way
    // to run a query in the page, and the served markup is the whole point —
    // the gate attribute must appear in neither.
    const html = await page.content();
    const gated = /<html[^>]*data-motion/i.test(html);
    // The headline is two spans, so match one line rather than the sentence.
    const headline = /next chapter/.test(html);
    console.log(`   js off: data-motion on <html>=${gated}, headline present=${headline}`);
    check(!gated && headline, "js off: no data-motion attribute, headline served finished");
    await ctx.close();
  }

  // Where exactly does the last transition land? Measured, not assumed.
  const { ctx, page } = await newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const budget = await page.evaluate(() => {
    const read = (sel, prop) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const c = getComputedStyle(el);
      const dur = c.transitionDuration.split(",").map((v) => parseFloat(v) * (v.includes("ms") ? 0.001 : 1));
      const del = c.transitionDelay.split(",").map((v) => parseFloat(v) * (v.includes("ms") ? 0.001 : 1));
      return { prop, end: Math.max(...dur.map((d, i) => d + (del[i % del.length] || 0))) };
    };
    return [
      read('[class*="heroLine"]:nth-child(1) > span'),
      read('[class*="heroLine"]:nth-child(2) > span'),
      read('[class*="heroLede"]'),
      read('[class*="heroActions"]'),
      read('[class*="heroRail"]'),
    ];
  });
  console.log("   budget (delay+duration, seconds):", budget.map((b) => b && b.end.toFixed(2)).join(" / "));
  check(Math.max(...budget.map((b) => (b ? b.end : 0))) <= 0.72, "hero entrance budget <= 0.72s");
  await ctx.close();
}

/* -------------------------------------------------------------- chapters -- */
const chapterState = (page) =>
  page.evaluate(() => {
    const stage = document.querySelector("[data-chapter-stage]");
    const layers = [...document.querySelectorAll("[data-layer]")];
    const chs = [...document.querySelectorAll("[data-chapter]")];
    const clearance = Math.min(112, Math.max(76, innerHeight * 0.11));
    const targetY = clearance + (innerHeight - clearance) * 0.5;
    let expected = 0;
    chs.forEach((c, i) => {
      if (c.getBoundingClientRect().top <= targetY) expected = i;
    });
    const op = layers.map((l) => Number(getComputedStyle(l).opacity));
    return {
      active: Number(stage?.dataset.activeChapter ?? -1),
      expected,
      opacity: op.map((o) => o.toFixed(3)),
      opaque: op.filter((o) => o > 0.999).length,
      topOpaque: op.lastIndexOf(op.filter((o) => o > 0.999).pop() ?? -1),
      y: Math.round(scrollY),
    };
  });

if (run("chapters")) {
  console.log("\n== CHAPTERS ==");
  for (const [w, h] of [[1440, 900], [1440, 700]]) {
    const { ctx, page } = await newPage({ viewport: { width: w, height: h } });
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const span = await page.evaluate(() => {
      const col = document.querySelector("[data-chapter-stage]").parentElement.getBoundingClientRect();
      return { top: Math.round(col.top + scrollY), bottom: Math.round(col.bottom + scrollY) };
    });
    const ys = [];
    for (let y = Math.max(0, span.top - h * 0.8); y < span.bottom + 200; y += Math.round(h / 6)) ys.push(y);

    const walk = async (list, tag) => {
      let bad = 0;
      let blank = 0;
      for (const y of list) {
        await page.evaluate((v) => scrollTo(0, v), y);
        await page.waitForTimeout(700); // past the 0.6s settle
        const s = await chapterState(page);
        if (s.active !== s.expected) {
          bad++;
          console.log(`   ${tag} y=${y} active=${s.active} expected=${s.expected} op=${s.opacity}`);
        }
        if (s.opaque < 1) {
          blank++;
          console.log(`   ${tag} y=${y} NO OPAQUE LAYER op=${s.opacity}`);
        }
      }
      check(bad === 0, `${w}x${h} ${tag}: active layer matches the reading line at every sample`);
      check(blank === 0, `${w}x${h} ${tag}: at least one layer fully opaque at every sample`);
    };

    await walk(ys, "forward");
    await walk([...ys].reverse(), "backward");

    // Mid-crossfade: sample 200ms into a swap, when both layers are live.
    await page.evaluate((v) => scrollTo(0, v), ys[0]);
    await page.waitForTimeout(700);
    const swapY = ys[Math.floor(ys.length / 2)];
    await page.evaluate((v) => scrollTo(0, v), swapY);
    await page.waitForTimeout(200);
    const mid = await chapterState(page);
    console.log(`   mid-crossfade @200ms  op=${mid.opacity} active=${mid.active}`);
    check(mid.opaque >= 1, `${w}x${h} mid-crossfade still has an opaque layer under the fade`);
    await page.screenshot({ path: `${OUT}/chapters-${w}x${h}-mid.png` });

    // Jump to the bottom of the document and straight back to the top.
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(500);
    const top = await chapterState(page);
    check(top.active === top.expected && top.opaque >= 1, `${w}x${h} jump bottom→top settles on chapter ${top.expected}`);

    // Resize across the phone breakpoint and back.
    await page.evaluate((v) => scrollTo(0, v), swapY);
    await page.waitForTimeout(500);
    const before = await chapterState(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(700);
    const after = await chapterState(page);
    console.log(`   resize 1440→390→1440  before=${before.active} after=${after.active} expected=${after.expected} op=${after.opacity}`);
    check(after.active === after.expected && after.opaque >= 1, `${w}x${h} resize round trip leaves the right image showing`);
    await page.screenshot({ path: `${OUT}/chapters-${w}x${h}-resize.png` });
    await ctx.close();
  }
}

/* ----------------------------------------------------------------- route -- */
const routeState = (page) =>
  page.evaluate(() => {
    const sec = document.querySelector("[data-route-section]");
    // Read the svg that is actually on screen. Both are in the DOM at every
    // width and the hidden one keeps its own state, so picking the wide path
    // on a phone reported a finished line while the rail had drawn one step.
    const line = [...document.querySelectorAll('[class*="routeLine"]')]
      .find((el) => el.getBoundingClientRect().width > 0 || el.getBoundingClientRect().height > 0);
    // The stacked rail's offset is authored as a calc() over --rail-progress,
    // and Chrome hands that back unresolved, so fall back to the variable the
    // calc is made of rather than reporting NaN. The wide line is a plain
    // number and reads straight off.
    const rail = sec.style.getPropertyValue("--rail-progress") || "-";
    const raw = getComputedStyle(line).strokeDashoffset;
    const off = parseFloat(raw);
    const fraction = Number.isFinite(off) ? 1 - off : (rail === "-" ? null : Number(rail));
    return {
      drawn: !!sec.dataset.drawn,
      dashoffset: Number.isFinite(off) ? off : raw,
      drawnFraction: fraction,
      rail,
      stops: [...document.querySelectorAll("[data-stop]")].map((s) => ({
        at: Number(s.dataset.at),
        atSm: Number(s.dataset.atSm),
        arrived: !!s.dataset.arrived,
        card: Number(getComputedStyle(s.querySelector('[class*="routeStopCard"]')).opacity),
        dot: getComputedStyle(s.querySelector('[class*="routeDot"]')).transform,
      })),
      art: [...document.querySelectorAll('[class*="routeArtItem"]')].map((a) => Number(getComputedStyle(a).opacity)),
    };
  });

if (run("route")) {
  console.log("\n== ROUTE ==");
  for (const [w, h] of [[1440, 900], [1920, 1080]]) {
    const { ctx, page } = await newPage({ viewport: { width: w, height: h } });
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    // The trigger is the canvas at 55% of the viewport, not the section top.
    const secTop = await page.evaluate(() =>
      Math.round(document.querySelector("[data-route-draw]").getBoundingClientRect().top + scrollY));
    // Park just under the trigger line, then cross it in one step.
    await page.evaluate((y) => scrollTo(0, y), secTop - h * 0.62);
    await page.waitForTimeout(400);
    const before = await routeState(page);
    check(!before.drawn, `${w}x${h} not drawn before the trigger line`);
    // The pre-state must be a snap, not an ease. If a duration is declared on
    // the [data-motion="on"] rule, the four stops spend it fading OUT of the
    // finished page the moment JS hydrates, and the draw then starts from
    // wherever that fade-out got to. Zero here is the whole guarantee.
    const idle = await page.evaluate(() => {
      const dur = (sel) => getComputedStyle(document.querySelector(sel)).transitionDuration;
      return {
        card: dur('[class*="routeStopCard"]'),
        art: dur('[class*="routeArtItem"]'),
        dot: dur('[class*="routeDot"]'),
        line: dur('[class*="routeSvgWide"] [class*="routeLine"]'),
      };
    });
    console.log(`   pre-draw transition durations: ${JSON.stringify(idle)}`);
    check(Object.values(idle).every((d) => /^0s(,\s*0s)*$/.test(d)),
      `${w}x${h} pre-draw state snaps — no transition declared before data-drawn`);

    await page.evaluate((y) => scrollTo(0, y), secTop - h * 0.5);
    const t0 = Date.now();
    const samples = [];
    for (const ms of [0, 300, 600, 900, 1200, 1500]) {
      const wait = ms - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      const s = await routeState(page);
      samples.push([ms, s]);
      await page.screenshot({ path: `${OUT}/route-${w}x${h}-${String(ms).padStart(4, "0")}ms.png` });
    }
    console.log(` ${w}x${h}`);
    for (const [ms, s] of samples) {
      console.log(`   ${String(ms).padStart(4)}ms drawn=${s.drawnFraction?.toFixed(3)} cards=${s.stops.map((x) => x.card.toFixed(2)).join(" ")} art=${s.art.map((a) => a.toFixed(2)).join(" ")}`);
    }
    // Order: whenever a stop is visible, every earlier stop is at least as visible.
    let ordered = true;
    let early = [];
    for (const [ms, s] of samples) {
      for (let i = 1; i < s.stops.length; i++) {
        if (s.stops[i].card > s.stops[i - 1].card + 0.02) ordered = false;
      }
      // A stop must not be visible before the stroke has passed its fraction.
      for (const stop of s.stops) {
        if (stop.card > 0.02 && s.drawnFraction !== null && s.drawnFraction + 0.02 < stop.at) {
          early.push(`${ms}ms stop@${stop.at} card=${stop.card.toFixed(2)} line=${s.drawnFraction.toFixed(3)}`);
        }
      }
    }
    check(ordered, `${w}x${h} stops become visible in order 01→04`);
    check(early.length === 0, `${w}x${h} no stop visible before the line passes its fraction${early.length ? " — " + early.join("; ") : ""}`);
    const last = samples[samples.length - 1][1];
    check(last.drawnFraction > 0.999 && last.stops.every((s) => s.card > 0.999) && last.art.every((a) => a > 0.999),
      `${w}x${h} settled complete by 1500ms`);

    // Jump past in one step, wait, come back.
    const { ctx: c2, page: p2 } = await newPage({ viewport: { width: w, height: h } });
    await p2.goto(BASE + "/", { waitUntil: "networkidle" });
    await p2.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await p2.waitForTimeout(1600);
    await p2.evaluate((y) => scrollTo(0, y), secTop - h * 0.4);
    await p2.waitForTimeout(400);
    const jumped = await routeState(p2);
    console.log(`   jump-past: drawn=${jumped.drawnFraction?.toFixed(3)} cards=${jumped.stops.map((x) => x.card.toFixed(2)).join(" ")}`);
    check(jumped.drawnFraction > 0.999 && jumped.stops.every((s) => s.card > 0.999),
      `${w}x${h} jump-past settles into the completed state`);
    await p2.screenshot({ path: `${OUT}/route-${w}x${h}-jumppast.png` });
    await c2.close();
    await ctx.close();
  }

  // Phone: step by step, rail behind it.
  {
    const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const stopTops = await page.evaluate(() =>
      [...document.querySelectorAll("[data-stop]")].map((s) => Math.round(s.getBoundingClientRect().top + scrollY)));
    const seen = [];
    for (let i = 0; i < stopTops.length; i++) {
      await page.evaluate((y) => scrollTo(0, y), stopTops[i] - 844 * 0.6);
      await page.waitForTimeout(700);
      const s = await routeState(page);
      seen.push(s);
      console.log(`   390 step ${i + 1}: arrived=${s.stops.map((x) => (x.arrived ? "y" : "-")).join("")} rail=${s.rail} drawn=${s.drawnFraction?.toFixed(3)} cards=${s.stops.map((x) => x.card.toFixed(2)).join(" ")}`);
      await page.screenshot({ path: `${OUT}/route-390-step${i + 1}.png` });
    }
    const stepwise = seen.every((s, i) => s.stops[i].arrived && s.stops[i].card > 0.9);
    check(stepwise, "390 each step reveals as it enters view");
    check(seen.every((s, i) => i === 0 || Number(s.rail) >= Number(seen[i - 1].rail)),
      "390 rail advances monotonically with the steps");
    const end = seen[seen.length - 1];
      console.log(`   390 rail end=${end.rail} railDashoffset=${end.dashoffset}`);
    check(Number(end.rail) >= 0.95, "390 rail reaches the last step");
    await ctx.close();
  }

  // Reduced motion: the finished page, immediately.
  {
    const { ctx, page } = await newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    const y = await page.evaluate(() =>
      Math.round(document.querySelector("[data-route-section]").getBoundingClientRect().top + scrollY));
    await page.evaluate((v) => scrollTo(0, v - 100), y);
    await page.waitForTimeout(300);
    const s = await routeState(page);
    const motionOn = await page.evaluate(() => !!document.querySelector('[data-motion="on"]'));
    console.log(`   reduced: motion=${motionOn ? "on" : "off"} drawn=${s.drawnFraction?.toFixed(3)} cards=${s.stops.map((x) => x.card.toFixed(2)).join(" ")} art=${s.art.map((a) => a.toFixed(2)).join(" ")}`);
    check(!motionOn && s.drawnFraction > 0.999 && s.stops.every((x) => x.card > 0.999) && s.art.every((a) => a > 0.999),
      "reduced motion: line complete and every stop present immediately");
    await page.screenshot({ path: `${OUT}/route-reduced.png` });
    await ctx.close();
  }
}

/* ------------------------------------------------------------------ slow -- */
/*
  The two-gate regression, which only exists on a slow device.

  The boot script hides the copy before the first paint and hands the job of
  revealing it to MotionRoot. If hydration has not arrived in 1.5s the script
  gives up and removes `data-motion`, so the page snaps to the finished state it
  was served in — correct on its own. The bug was what happened next: hydration
  that arrives late still arrives, and MotionRoot used to set `data-motion` again
  and hide copy the reader had been reading for a second. Measured at 390 with a
  10x throttle the hero was readable for 1.16s before vanishing; at 20x, 3.4s.

  The script now leaves `data-motion-bailed` behind and MotionRoot honours it for
  the life of the document. What this section looks for is that shape in the
  trace — any frame at full opacity followed later by a hidden one — because the
  end state is correct either way and only the path between tells them apart.
*/
if (run("slow")) {
  console.log("\n== SLOW HYDRATION ==");
  for (const [label, viewport] of [["1440x900", { width: 1440, height: 900 }], ["390x844", { width: 390, height: 844 }]]) {
    for (const rate of [1, 10, 20]) {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => {
        window.__s = [];
        const tick = () => {
          const lede = document.querySelector('[class*="heroLede"]');
          const d = document.documentElement.dataset;
          window.__s.push({
            t: Math.round(performance.now()),
            o: lede ? Number(getComputedStyle(lede).opacity) : null,
            m: d.motion === "on" ? 1 : 0,
            e: d.entered ? 1 : 0,
            b: d.motionBailed ? 1 : 0,
          });
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      if (rate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate });
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      // Long enough for the 1.5s timer to fire AND for a throttled hydration to
      // land afterwards, which is the window the two gates used to collide in.
      await page.waitForTimeout(rate >= 20 ? 12000 : rate >= 10 ? 8000 : 4000);
      const f = await page.evaluate(() => window.__s);
      const seen = f.filter((x) => x.o !== null);
      // visible -> hidden: full opacity at some frame, under 0.1 at a later one.
      let visibleAt = -1;
      let regressAt = -1;
      for (const x of seen) {
        if (visibleAt < 0 && x.o > 0.99) visibleAt = x.t;
        else if (visibleAt >= 0 && x.o < 0.1) { regressAt = x.t; break; }
      }
      const bailed = seen.some((x) => x.b === 1);
      const mid = seen.filter((x) => x.o > 0.02 && x.o < 0.98).length;
      const last = seen[seen.length - 1];
      console.log(`   ${label} ${String(rate).padStart(2)}x  bailed=${bailed} visibleAt=${visibleAt}ms hiddenAgainAt=${regressAt < 0 ? "never" : regressAt + "ms"} entranceFrames=${mid} final=${last ? last.o.toFixed(2) : "?"}`);
      check(regressAt < 0, `${label} ${rate}x: hero copy never goes visible then hidden`);
      check(!!last && last.o > 0.99, `${label} ${rate}x: hero copy ends visible (${last ? last.o.toFixed(2) : "?"})`);
      if (rate === 1) {
        check(!bailed && mid > 2, `${label} 1x: the entrance still plays (${mid} intermediate frames, bailed=${bailed})`);
      }
      await ctx.close();
    }
  }
}

/* ------------------------------------------------------------------- nav -- */
if (run("nav")) {
  console.log("\n== ROUTE CHANGES ==");
  const { ctx, page } = await newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  // Count how many times data-entered is written, across the whole visit.
  await page.evaluate(() => {
    window.__entered = 0;
    new MutationObserver((rs) => {
      for (const r of rs) if (r.target.hasAttribute("data-entered")) window.__entered++;
      // documentElement, not body: that is where both state attributes live now
      // (the gate has to exist before the parser reaches <body>).
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-entered"], subtree: true });
  });
  await page.waitForTimeout(600);
  const counts = () =>
    page.evaluate(() => ({
      entered: window.__entered,
      reveal: document.querySelectorAll("[data-reveal]").length,
      shown: document.querySelectorAll("[data-reveal][data-shown]").length,
      motion: document.querySelectorAll('[data-motion="on"]').length,
      root: document.querySelectorAll("[data-entered]").length,
    }));
  const first = await counts();
  console.log("   home:", JSON.stringify(first));

  await page.click('header a[href="/about"]');
  await page.waitForURL("**/about");
  await page.waitForTimeout(900);
  const about = await counts();
  console.log("   /about:", JSON.stringify(about));

  await page.goBack();
  await page.waitForURL(BASE + "/");
  await page.waitForTimeout(1200);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(900);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(900);
  const back = await counts();
  console.log("   back on home:", JSON.stringify(back));

  check(back.root === 1 && back.motion === 1, "one motion root, one data-entered element after back");
  check(back.entered <= 2, `data-entered written once per page visit (writes=${back.entered})`);
  check(back.shown === back.reveal, `every [data-reveal] shown after a full scroll (${back.shown}/${back.reveal})`);
  check(errors.length === 0, `no page errors during navigation${errors.length ? " — " + errors[0] : ""}`);
  await page.screenshot({ path: `${OUT}/nav-back-home.png` });
  await ctx.close();

  /*
    Entrances are once per PAGE VISIT, not once per session: every client-side
    navigation has to replay them. Two things have to be true on each arrival,
    and only a per-frame recorder can see either.

    The entrance runs. Proven by the head element passing through intermediate
    values rather than appearing at its final one — a collapsed transition looks
    identical to a finished one in any single sample.

    Nothing finished is painted first. `data-entered` is still set from the route
    you came from when React commits the new page, so clearing it in a passive
    effect is one frame too late: the arrival paints fully formed, then blinks to
    its hidden state and animates. MotionRoot clears it in a layout effect for
    that reason, and `finished` below is the count of painted frames on the new
    path that still had the attribute. It must be zero.

    Throttled 4x, because this is a race and an unthrottled machine wins it by
    luck rather than by construction.
  */
  {
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx2.addInitScript(() => {
      window.__t = [];
      const tick = () => {
        // The page's own head: the hero on home, the kit's head column on an
        // interior route. NOT `[class*="headTitle"]` — attribute substring
        // matching is case sensitive and the kit class is `pageHeadTitle`, so
        // that spelling silently matches nothing and every head looks static.
        const h = document.querySelector('[class*="pageHeadCol"] > *, [class*="heroLine"] > span');
        const r = document.querySelector("[data-reveal]");
        const hdr = document.querySelector('[class*="__header"]');
        window.__t.push({
          p: location.pathname,
          e: document.documentElement.dataset.entered ? 1 : 0,
          bt: document.documentElement.dataset.booted ? 1 : 0,
          hdr: hdr ? Number(getComputedStyle(hdr).opacity) : null,
          ho: h ? Number(getComputedStyle(h).opacity) : null,
          ro: r ? Number(getComputedStyle(r).opacity) : null,
        });
        if (window.__t.length > 3000) window.__t.splice(0, 1500);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const p2 = await ctx2.newPage();
    const cdp = await ctx2.newCDPSession(p2);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await p2.goto(BASE + "/", { waitUntil: "networkidle" });
    await p2.waitForTimeout(1000);

    // `from` is read BEFORE the navigation rather than off the first recorded
    // frame: the buffer can be cleared and the route swapped inside one frame,
    // and a segment keyed on its own first sample then finds no transition.
    const arrive = async (label, act) => {
      const from = await p2.evaluate(() => { window.__t.length = 0; return location.pathname; });
      await act();
      await p2.waitForTimeout(1100);
      const t = await p2.evaluate(() => window.__t);
      const seg = t.slice(Math.max(0, t.findIndex((f) => f.p !== from)));
      const mid = (k) => seg.filter((f) => f[k] !== null && f[k] > 0.02 && f[k] < 0.98).length;
      // Frames painted on the new route while `data-entered` was still set from
      // the old one. The entrance's own frames come after and do not count.
      const cleared = seg.findIndex((f) => f.e === 0);
      const r = {
        finished: cleared < 0 ? 99 : cleared,
        head: mid("ho"),
        reveal: mid("ro"),
        // The site header lives in the layout and never unmounts, so it must
        // NOT replay: it is keyed on `data-booted`, which is set with the first
        // entrance and never removed. Any dip here is the flicker that keying
        // it on `data-entered` used to cause on every arrival.
        headerDip: seg.filter((f) => f.hdr !== null && f.hdr < 0.98).length,
        bootLost: seg.filter((f) => f.bt === 0).length,
      };
      console.log(`   ${label.padEnd(22)} finishedFramesFirst=${r.finished} headMidFrames=${r.head} revealMidFrames=${r.reveal} headerDipFrames=${r.headerDip} framesWithoutBooted=${r.bootLost}`);
      return r;
    };

    let worst = 0;
    let dead = 0;
    let headerReplays = 0;
    let bootLost = 0;
    const tally = (r) => {
      worst = Math.max(worst, r.finished);
      if (r.head + r.reveal < 3) dead++;
      headerReplays += r.headerDip;
      bootLost += r.bootLost;
    };
    for (let i = 0; i < 3; i++) {
      for (const href of ["/services", "/about"]) {
        tally(await arrive(`arrive ${href} run ${i}`, async () => {
          await p2.click(`header a[href="${href}"]`);
          await p2.waitForURL(`**${href}`);
        }));
      }
    }
    // Back and forward reach the same code path through the history API.
    for (let i = 0; i < 2; i++) {
      tally(await arrive(`goBack run ${i}`, () => p2.goBack()));
      tally(await arrive(`goForward run ${i}`, () => p2.goForward()));
    }
    check(worst === 0, `no finished frame is painted before the entrance on any arrival (worst=${worst})`);
    check(dead === 0, `every arrival replays an entrance (${dead} arrivals with nothing animating)`);
    check(headerReplays === 0, `the site header never replays its entrance on a navigation (${headerReplays} dipped frames)`);
    check(bootLost === 0, `data-booted survives every navigation (${bootLost} frames without it)`);
    await ctx2.close();
  }
}

await browser.close();
console.log(`\n${fails.length ? `${fails.length} FAILED:` : "all checks passed"}`);
for (const f of fails) console.log("  - " + f);
process.exit(fails.length ? 1 : 0);
