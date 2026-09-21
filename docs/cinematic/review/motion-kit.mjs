/*
  node docs/cinematic/review/motion-kit.mjs

  The interaction-state probe for the shared kit. It photographs every button
  and link grammar in all four states a pointer or a keyboard can put it in —
  rest, hover, focus-visible, held — on both grounds, and it measures the one
  thing a screenshot cannot show: whether anything next to a pressed control
  moves while it is held.

  Focus is reached by pressing Tab, never by calling focus(). Chromium only
  matches :focus-visible when the focus arrived from the keyboard, so a
  programmatic focus() would photograph a ring that no reader ever sees.

  Shots land in .tmpshots/motion/kit/. Dev server on 3120 must already be up.
*/

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://127.0.0.1:3120";
const OUT = ".tmpshots/motion/kit";

/* The dev overlay sits in the top-left of every shot, and smooth scrolling
   makes a scrollIntoView race the screenshot that follows it. */
const CALM = `html{scroll-behavior:auto!important} nextjs-portal{display:none!important}`;

const sel = (name) => `[class*="__${name}"]`;

const TARGETS = [
  { id: "btnLime-ink", route: "/", css: `${sel("btnLime")}${sel("btnLg")}`, ground: "ink" },
  { id: "btnGhost-ink", route: "/", css: sel("btnGhost"), ground: "ink" },
  { id: "btnLime-sm-header", route: "/", css: `${sel("btnLime")}${sel("btnSm")}`, ground: "ink" },
  { id: "headerLink", route: "/", css: `${sel("headerNav")} a`, ground: "ink" },
  { id: "footerNav", route: "/", css: `${sel("footerNav")} a`, ground: "ink" },
  { id: "footerLegal", route: "/", css: `${sel("footerLegal")} a`, ground: "ink" },
  /* `.quietLinkInk` composes `.quietLink`, so it carries both class names and
     answers a bare substring match. The ink-ground link is the one that is not
     also the paper one. */
  { id: "quietLink-ink", route: "/", css: `${sel("quietLink")}:not(${sel("quietLinkInk")})`, ground: "ink" },
  { id: "quietLinkInk-paper", route: "/", css: sel("quietLinkInk"), ground: "paper" },
  { id: "inlineLink-paper", route: "/", css: sel("inlineLink"), ground: "paper" },
  { id: "btnLime-contact", route: "/contact", css: `form ${sel("btnLime")}`, ground: "paper" },
];

/* Holding the mouse down on a link and releasing it is a click, and a click on
   a nav link navigates — which would photograph the press state of one page
   and everything after it on another. Cancelling the click in the capture
   phase leaves :active intact and stops the journey; Next's Link checks
   defaultPrevented and stands down too. */
async function swallowClicks(context) {
  await context.addInitScript(() => {
    window.addEventListener("click", (event) => event.preventDefault(), true);
  });
}

async function settle(page, route) {
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: CALM });
  await page.waitForTimeout(400);
}

/* The fixed header owns the top 80px, so scrollIntoViewIfNeeded can leave a
   control sitting under it. Centring is the only placement that is safe for
   every target on every route. */
async function centre(page, locator) {
  await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    window.scrollBy(0, r.top + r.height / 2 - window.innerHeight / 2);
  });
  await page.waitForTimeout(260);
}

/* A shot of the control and just enough of what surrounds it to judge the ring
   against the ground it is standing on. */
async function shot(page, locator, file) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`no box for ${file}`);
  const view = page.viewportSize();
  const pad = 26;
  const x = Math.max(0, Math.min(box.x - pad, view.width - 1));
  const y = Math.max(0, Math.min(box.y - pad, view.height - 1));
  const width = Math.min(box.width + pad * 2, view.width - x);
  const height = Math.min(box.height + pad * 2, view.height - y);
  if (width < 2 || height < 2) throw new Error(`clip collapsed for ${file}`);
  await page.screenshot({ path: `${OUT}/${file}.png`, clip: { x, y, width, height } });
}

/* Walk the tab order until the element we want holds focus. */
async function tabTo(page, locator, limit = 60) {
  await page.evaluate(() => {
    document.activeElement instanceof HTMLElement && document.activeElement.blur();
  });
  const handle = await locator.elementHandle();
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press("Tab");
    const hit = await page.evaluate((el) => document.activeElement === el, handle);
    if (hit) return true;
  }
  return false;
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const notes = [];

  /* ---- desktop: four states per target ---------------------------------- */
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await swallowClicks(desktop);
  const page = await desktop.newPage();

  let currentRoute = null;
  for (const target of TARGETS) {
    if (target.route !== currentRoute) {
      await settle(page, target.route);
      currentRoute = target.route;
    }
    const el = page.locator(target.css).first();
    if ((await el.count()) === 0) {
      notes.push(`MISSING  ${target.id} — no match for ${target.css}`);
      continue;
    }
    await el.scrollIntoViewIfNeeded();
    await centre(page, el);

    /* The previous target was left focused by the Tab walk, and a ring in a
       shot named "rest" is a lie. */
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(280);
    await shot(page, el, `${target.id}-1-rest`);

    await el.hover();
    await page.waitForTimeout(320);
    await shot(page, el, `${target.id}-2-hover`);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(260);

    const focused = await tabTo(page, el);
    await page.waitForTimeout(260);
    await shot(page, el, `${target.id}-3-focus`);
    if (!focused) notes.push(`NO FOCUS ${target.id} — never reached by Tab`);
    await page.keyboard.press("Escape");

    /* Held, with the neighbour measured on both sides of the press. */
    const box = await el.boundingBox();
    const neighbour = await el.evaluate((node) => {
      const next = node.nextElementSibling ?? node.parentElement?.nextElementSibling;
      if (!next) return null;
      next.setAttribute("data-press-neighbour", "");
      const r = next.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(280);
    await shot(page, el, `${target.id}-4-active`);
    const after = await page.evaluate(() => {
      const next = document.querySelector("[data-press-neighbour]");
      if (!next) return null;
      const r = next.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    await page.mouse.up();
    await page.evaluate(() => {
      document.querySelectorAll("[data-press-neighbour]").forEach((n) =>
        n.removeAttribute("data-press-neighbour"));
    });

    if (neighbour && after) {
      const moved = Math.max(
        Math.abs(neighbour.x - after.x), Math.abs(neighbour.y - after.y),
        Math.abs(neighbour.w - after.w), Math.abs(neighbour.h - after.h),
      );
      notes.push(`${moved < 0.5 ? "PRESS ok " : "PRESS MOVED"} ${target.id} — neighbour delta ${moved.toFixed(2)}px`);
    } else {
      notes.push(`press     ${target.id} — no neighbour to measure`);
    }
  }
  await desktop.close();

  /* ---- phone: hover must not exist, the press still must ----------------- */
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true,
  });
  await swallowClicks(phone);
  const small = await phone.newPage();
  await settle(small, "/");
  const hoverCapable = await small.evaluate(() => matchMedia("(hover: hover)").matches);
  notes.push(`${hoverCapable ? "PHONE HOVER CAPABLE" : "phone ok "} — (hover: hover) is ${hoverCapable}`);

  const tapTarget = small.locator(`${sel("btnLime")}${sel("btnLg")}`).first();
  await tapTarget.scrollIntoViewIfNeeded();
  await centre(small, tapTarget);
  await shot(small, tapTarget, "phone-1-rest");
  const tapBox = await tapTarget.boundingBox();
  await small.mouse.move(tapBox.x + tapBox.width / 2, tapBox.y + tapBox.height / 2);
  await small.mouse.down();
  await small.waitForTimeout(280);
  await shot(small, tapTarget, "phone-2-held");
  await small.mouse.up();

  const toggle = small.locator(sel("menuToggle")).first();
  await small.evaluate(() => window.scrollTo(0, 0));
  await small.waitForTimeout(300);
  await shot(small, toggle, "phone-3-menuToggle-rest");
  const tb = await toggle.boundingBox();
  await small.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await small.mouse.down();
  await small.waitForTimeout(260);
  await shot(small, toggle, "phone-4-menuToggle-held");
  await small.mouse.up();
  await phone.close();

  /* ---- the reveal cascade, caught in flight ------------------------------ */
  /* Screenshots cost tens of milliseconds each, so the strip is not a
     stopwatch: each frame reports the elapsed time it was actually taken at.
     What it is for is the one question a still can answer — whether the three
     rows are visibly at different points in the same move, or arriving as one
     block. */
  const flight = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const moving = await flight.newPage();
  /* Careers, not About: the About values list carries a stagger written in its
     own module, and the point of this strip is the one the kit hands out. */
  await settle(moving, "/opportunities");
  const group = moving.locator(sel("glanceList")).first();
  if (await group.count()) {
    await group.evaluate((list) => {
      list.querySelectorAll("[data-reveal]").forEach((el) => el.removeAttribute("data-shown"));
      list.scrollIntoView({ block: "center" });
    });
    const t0 = Date.now();
    for (let frame = 0; frame < 5; frame += 1) {
      await shot(moving, group, `cascade-${frame}-${Date.now() - t0}ms`);
      await moving.waitForTimeout(70);
    }
    notes.push("cascade   — /opportunities glance list captured in flight");
  } else {
    notes.push("cascade   — no glance list found on /opportunities");
  }
  await flight.close();

  /* ---- the reveal, sampled from before hydration ------------------------- */
  /* A transition declared on the pre-state has a finished element to animate
     away from, so the recorder has to be running before React touches the
     page — addInitScript is the only place early enough. The viewport is tall
     on purpose: the race only exists for an element that is already on screen
     when `data-motion` lands. */
  const recorded = await browser.newContext({ viewport: { width: 1440, height: 1500 } });
  await recorded.addInitScript(() => {
    window.__frames = [];
    const sample = () => {
      const el = document.querySelector("[data-reveal]");
      if (el) {
        window.__frames.push({
          t: performance.now(),
          opacity: getComputedStyle(el).opacity,
          shown: el.hasAttribute("data-shown"),
          motion: el.closest("[data-motion]") !== null,
        });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const traced = await recorded.newPage();
  await settle(traced, "/");
  const trace = await traced.evaluate(() => {
    const frames = window.__frames;
    const first = frames.findIndex((f) => f.shown);
    if (first < 1) return { error: "never shown" };
    const before = frames.slice(0, first);
    const after = frames.slice(first);
    const landed = after.find((f) => Number(f.opacity) > 0.995);
    return {
      framesBeforeShown: before.length,
      lastPreShownOpacity: before[before.length - 1].opacity,
      maxPreShownOpacity: Math.max(...before.filter((f) => f.motion).map((f) => Number(f.opacity))),
      startOpacity: after[0].opacity,
      riseMs: landed ? Math.round(landed.t - after[0].t) : null,
    };
  });
  notes.push(`reveal    — ${JSON.stringify(trace)}`);
  await traced.screenshot({ path: `${OUT}/reveal-trace-top.png` });
  await recorded.close();

  /* ---- reduced motion: nothing hidden, nothing waiting ------------------- */
  const calm = await browser.newContext({
    viewport: { width: 1440, height: 900 }, reducedMotion: "reduce",
  });
  const still = await calm.newPage();
  await settle(still, "/");
  const gate = await still.evaluate(() => {
    const root = document.querySelector("[data-reveal]")?.closest("[data-motion]");
    const hidden = [...document.querySelectorAll("[data-reveal]")].filter(
      (el) => Number(getComputedStyle(el).opacity) < 0.99,
    ).length;
    return { motionAttr: root ? root.getAttribute("data-motion") : null, reveals: document.querySelectorAll("[data-reveal]").length, hidden };
  });
  notes.push(`${gate.hidden === 0 ? "reduced ok" : "REDUCED HIDDEN"} — data-motion=${gate.motionAttr}, ${gate.hidden}/${gate.reveals} reveals under full opacity`);
  await still.screenshot({ path: `${OUT}/reduced-1-top.png` });
  await still.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.55));
  await still.waitForTimeout(400);
  await still.screenshot({ path: `${OUT}/reduced-2-mid.png` });
  await calm.close();

  await browser.close();
  console.log(notes.join("\n"));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
