// Records short motion review clips off the running dev server.
// Read-only against the app: no source edits, no server control.
//   node docs/cinematic/review/motion-record.mjs [clipName ...]
import { chromium } from "playwright";
import { mkdir, rm, readdir, rename } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3120";
const ROOT = path.resolve(import.meta.dirname, "../../..");
const OUT = path.join(ROOT, ".tmpshots/motion/clips");
const RAW = path.join(OUT, "_raw");

const CSS = "html{scroll-behavior:auto!important} nextjs-portal{display:none!important}";

const wait = (page, ms) => page.waitForTimeout(ms);

async function open(browser, { size = { width: 1440, height: 900 }, ...rest } = {}) {
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: rest.deviceScaleFactor ?? 1,
    recordVideo: { dir: RAW, size },
    ...rest,
  });
  await context.addInitScript((css) => {
    const add = () => {
      if (document.getElementById("__motionrec")) return;
      const s = document.createElement("style");
      s.id = "__motionrec";
      s.textContent = css;
      (document.head ?? document.documentElement)?.appendChild(s);
    };
    try { add(); } catch {}
    document.addEventListener("DOMContentLoaded", add);
  }, CSS);
  const page = await context.newPage();
  return { context, page };
}

async function land(page, route, settle = 800) {
  await page.goto(BASE + route, { waitUntil: "load" });
  await wait(page, settle);
}

// ~120px every ~40ms reads like a person on a wheel.
async function wheel(page, total, { step = 120, delay = 40 } = {}) {
  const dir = Math.sign(total) || 1;
  const n = Math.max(1, Math.round(Math.abs(total) / step));
  for (let i = 0; i < n; i++) {
    await page.mouse.wheel(0, dir * step);
    await wait(page, delay);
  }
}

async function scrollTo(page, selector, { frac = 0.5, step = 120, delay = 40, max = 160 } = {}) {
  const vh = page.viewportSize().height;
  let stale = 0;
  let last = null;
  for (let i = 0; i < max; i++) {
    const box = await page.locator(selector).first().boundingBox();
    if (box && box.y <= vh * frac) return true;
    if (box && last !== null && Math.abs(box.y - last) < 2) {
      if (++stale > 3) return false;
    } else stale = 0;
    last = box?.y ?? last;
    await page.mouse.wheel(0, step);
    await wait(page, delay);
  }
  return false;
}

// Interpolated pointer travel; mouse.move({steps}) fires with no delay and reads as a teleport.
async function glide(page, points, ms) {
  const legs = points.length - 1;
  const perLeg = Math.max(1, Math.round(ms / legs / 25));
  await page.mouse.move(points[0][0], points[0][1]);
  for (let i = 0; i < legs; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    for (let s = 1; s <= perLeg; s++) {
      const t = s / perLeg;
      await page.mouse.move(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
      await wait(page, 25);
    }
  }
}

const CLIPS = {
  // 1. Hero entrance, then the pointer drags the road glow across the aerial.
  "hero-desktop": async (browser) => {
    const { context, page } = await open(browser);
    await land(page, "/", 1500);
    await glide(page, [[240, 430], [900, 250], [1100, 330], [1300, 450], [1438, 470]], 3000);
    await wait(page, 900);
    return context;
  },

  // 2. Three chapters down at a reading pace, then back up.
  "chapters-desktop": async (browser) => {
    const { context, page } = await open(browser);
    await land(page, "/");
    await scrollTo(page, "#work-title", { frac: 0.45 });
    await wait(page, 700);
    const titles = page.locator("[data-chapter] h3");
    const n = Math.min(3, await titles.count());
    for (let i = 0; i < n; i++) {
      await scrollTo(page, `[data-chapter]:nth-of-type(${i + 1})`, { frac: 0.4 });
      await wait(page, 1500);
    }
    await wait(page, 800);
    await wheel(page, -1800, { step: 120, delay: 55 });
    return context;
  },

  // 3. Route section: hold while the line draws and the four stops land.
  "route-desktop": async (browser) => {
    const { context, page } = await open(browser);
    await land(page, "/");
    await scrollTo(page, "#start-title", { frac: 0.5, delay: 30 });
    // The four stops reveal in sequence; 2.5s ends the clip before the last one lands.
    await wait(page, 4000);
    await wheel(page, 240, { step: 80, delay: 70 });
    await wait(page, 700);
    // Back to the top, then down again, so the replay is on camera.
    await wheel(page, -7000, { step: 220, delay: 26 });
    await wait(page, 1000);
    // Match pass one's depth, or the stops sit under the fold and never trigger.
    await scrollTo(page, "#start-title", { frac: 0.5, delay: 30 });
    await wheel(page, 240, { step: 80, delay: 70 });
    await wait(page, 4200);
    return context;
  },

  // 4. Market chips, then two FAQ rows.
  "market-faq-desktop": async (browser) => {
    const { context, page } = await open(browser);
    await land(page, "/");
    await scrollTo(page, "#markets-title", { frac: 0.3, delay: 25 });
    await wait(page, 700);
    for (const city of ["Dallas", "Houston", "Southern California", "Lansing", "Grand Rapids"]) {
      await page.getByRole("button", { name: new RegExp(`^${city}`) }).first().click();
      await wait(page, 700);
    }
    await wait(page, 400);
    await scrollTo(page, "#faq-title", { frac: 0.3, delay: 25 });
    await wait(page, 600);
    const rows = page.locator("details summary");
    await rows.nth(0).click();
    await wait(page, 900);
    await rows.nth(2).click();
    await wait(page, 900);
    await rows.nth(2).click();
    await wait(page, 800);
    return context;
  },

  // 5. About: the three C's rows arriving.
  "about-rows-desktop": async (browser) => {
    const { context, page } = await open(browser);
    await land(page, "/about");
    await scrollTo(page, "#values-title", { frac: 0.45, delay: 28 });
    await wait(page, 2400);
    await wheel(page, 260, { step: 100, delay: 70 });
    await wait(page, 1200);
    return context;
  },

  // 6. Services hero entrance plus the first two bands.
  "services-desktop": async (browser) => {
    const { context, page } = await open(browser);
    await land(page, "/services", 2200);
    await scrollTo(page, "#sell-title", { frac: 0.4 });
    await wait(page, 1600);
    await scrollTo(page, "#bundle-title", { frac: 0.4 });
    await wait(page, 1600);
    return context;
  },

  // 7. Contact head: mark rises, trail draws, node lands.
  "contact-desktop": async (browser) => {
    const { context, page } = await open(browser);
    await land(page, "/contact", 0);
    await wait(page, 4200);
    return context;
  },

  // 8. Button hover / press states, then keyboard focus rings.
  "buttons-desktop": async (browser) => {
    const { context, page } = await open(browser);
    // Keeps the press-and-hold from navigating away mid-clip; visual state is untouched.
    await context.addInitScript(() => {
      window.addEventListener("click", (e) => {
        const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
        if (a && !a.getAttribute("href")?.startsWith("#")) e.preventDefault();
      }, true);
    });
    await land(page, "/", 1200);
    const apply = page.locator("section[data-hero] a[href='/apply']").first();
    const box = await apply.boundingBox();
    await glide(page, [[box.x - 180, box.y + 90], [box.x + box.width / 2, box.y + box.height / 2]], 500);
    await wait(page, 700);
    await page.mouse.down();
    await wait(page, 300);
    await page.mouse.up();
    await wait(page, 500);
    const work = page.locator("section[data-hero] a[href='#the-work']").first();
    const wb = await work.boundingBox();
    await glide(page, [[box.x + box.width / 2, box.y + box.height / 2], [wb.x + wb.width / 2, wb.y + wb.height / 2]], 600);
    await wait(page, 900);
    // The press left the sequential-focus start point on the hero link, so a bare
    // Tab walks into page content instead of the nav. Seed it on the skip link.
    await page.mouse.move(700, 780);
    await page.locator("a").first().focus();
    await wait(page, 450);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      await wait(page, 400);
    }
    await wait(page, 500);
    return context;
  },

  // 9. Phone pass, top to footer.
  "mobile-390": async (browser) => {
    const { context, page } = await open(browser, {
      size: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await land(page, "/", 1800);
    await scrollTo(page, "#work-title", { frac: 0.4, step: 120, delay: 32 });
    await wait(page, 600);
    await scrollTo(page, "[data-chapter]:nth-of-type(3)", { frac: 0.4, step: 120, delay: 32 });
    await wait(page, 500);
    await scrollTo(page, "#start-title", { frac: 0.35, step: 130, delay: 30 });
    await wait(page, 1100);
    await scrollTo(page, "#markets-title", { frac: 0.3, step: 140, delay: 26 });
    await wait(page, 500);
    for (const city of ["Houston", "Grand Rapids"]) {
      await page.getByRole("button", { name: new RegExp(`^${city}`) }).first().tap();
      await wait(page, 700);
    }
    await scrollTo(page, "#faq-title", { frac: 0.3, step: 140, delay: 26 });
    await wait(page, 400);
    await page.locator("details summary").nth(0).tap();
    await wait(page, 900);
    await scrollTo(page, "footer", { frac: 0.5, step: 150, delay: 24 });
    await wait(page, 900);
    return context;
  },

  // 11. Client-side nav through every page head entrance, one continuous take.
  "nav-heads-desktop": async (browser) => {
    const { context, page } = await open(browser);
    await land(page, "/", 1600);
    for (const href of ["/services", "/about", "/opportunities", "/contact"]) {
      const link = page.locator(`nav[aria-label="Primary"] a[href="${href}"]`).first();
      const b = await link.boundingBox();
      await glide(page, [[b.x - 140, b.y + 70], [b.x + b.width / 2, b.y + b.height / 2]], 350);
      await wait(page, 250);
      await link.click();
      await page.waitForURL((u) => u.pathname === href, { timeout: 15000 });
      await wait(page, 1900);
    }
    return context;
  },

  // 12. Careers: the 2x2 benefits grid, then the growth stages.
  "careers-desktop": async (browser) => {
    const { context, page } = await open(browser);
    await land(page, "/opportunities", 1700);
    await scrollTo(page, "#glance-title", { frac: 0.4 });
    await wait(page, 2200);
    await scrollTo(page, "#stages-title", { frac: 0.4 });
    await wait(page, 2400);
    return context;
  },

  // 10. Reduced motion: everything present on arrival.
  "reduced-motion-1440": async (browser) => {
    const { context, page } = await open(browser, { reducedMotion: "reduce" });
    await land(page, "/", 1200);
    await wheel(page, 9200, { step: 200, delay: 40 });
    await wait(page, 1400);
    return context;
  },
};

async function main() {
  const want = process.argv.slice(2);
  const names = want.length ? want : Object.keys(CLIPS);
  await mkdir(OUT, { recursive: true });
  await rm(RAW, { recursive: true, force: true });
  await mkdir(RAW, { recursive: true });

  const browser = await chromium.launch();
  // Warm the routes so a dev-server compile does not eat the first seconds.
  const warm = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const wp = await warm.newPage();
  for (const route of ["/", "/about", "/services", "/opportunities", "/contact"]) {
    await wp.goto(BASE + route, { waitUntil: "load" }).catch(() => {});
    await wp.waitForTimeout(600);
  }
  await warm.close();

  for (const name of names) {
    const run = CLIPS[name];
    if (!run) { console.log(`skip ${name}: unknown clip`); continue; }
    const before = new Set(await readdir(RAW));
    const context = await run(browser);
    await context.close(); // flushes the .webm
    const after = await readdir(RAW);
    const fresh = after.filter((f) => !before.has(f) && f.endsWith(".webm"));
    if (!fresh.length) { console.log(`FAIL ${name}: no video written`); continue; }
    await rename(path.join(RAW, fresh[0]), path.join(RAW, `${name}.webm`));
    console.log(`ok ${name}`);
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
