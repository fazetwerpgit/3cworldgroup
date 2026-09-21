/*
  node docs/cinematic/review/audit-route.mjs

  The route draw's mechanism, in isolation. It used to scrub: this script
  stepped the scroll position and read `--route-progress` back off the section.
  There is no scroll progress any more. The draw is one fixed-length stroke that
  MotionRoot starts once, by setting `data-drawn` on the section as its top
  crosses ~74% of the viewport, and each stop's transition-delay is its own
  `--route-at` fraction of the shared `--route-draw`.

  So what there is to check is the mechanism's wiring: the pre-draw state holds
  before the trigger, the stroke and the stops are on the same clock afterwards,
  and each stop's measured arrival matches `at × draw` rather than drifting from
  it. motion-home.mjs covers the visual timeline and the other viewports.
*/
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3120";
const CSS = `html{scroll-behavior:auto !important}nextjs-portal{display:none!important}`;
const H = 1000;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1740, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.addStyleTag({ content: CSS });
await page.waitForTimeout(600);

const read = () =>
  page.evaluate(() => {
    const sec = document.querySelector("[data-route-section]");
    const line = [...document.querySelectorAll('[class*="routeLine"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const c = getComputedStyle(line);
    return {
      drawn: sec.dataset.drawn || "-",
      drawDuration: getComputedStyle(document.querySelector('[class*="routeLine"]').closest("svg").parentElement)
        .getPropertyValue("--route-draw").trim(),
      dasharray: c.strokeDasharray,
      dashoffset: parseFloat(c.strokeDashoffset),
      lineTransition: c.transitionDuration + " " + c.transitionTimingFunction,
      stops: [...document.querySelectorAll("[data-stop]")].map((s) => {
        const card = s.querySelector('[class*="routeStopCard"]');
        const dot = s.querySelector('[class*="routeDot"]');
        return {
          at: s.dataset.at,
          routeAt: getComputedStyle(s).getPropertyValue("--route-at").trim(),
          cardDelay: getComputedStyle(card).transitionDelay,
          card: Number(getComputedStyle(card).opacity).toFixed(2),
          dot: getComputedStyle(dot).transform,
        };
      }),
      art: [...document.querySelectorAll('[class*="routeArtItem"]')].map((a) => ({
        delay: getComputedStyle(a).transitionDelay,
        opacity: Number(getComputedStyle(a).opacity).toFixed(2),
      })),
    };
  });

// The stroke starts off the canvas's own box crossing 55% of the viewport,
// not the section's top: the section opens ~240px of heading above the drawing.
const canvasTop = await page.evaluate(() =>
  Math.round(document.querySelector("[data-route-draw]").getBoundingClientRect().top + scrollY));

// 1 — parked below the trigger: nothing drawn, every stop still held back.
await page.evaluate((y) => scrollTo(0, y), canvasTop - H * 0.62);
await page.waitForTimeout(400);
const before = await read();
console.log("BEFORE TRIGGER");
console.log(`  data-drawn=${before.drawn}  --route-draw=${before.drawDuration}`);
console.log(`  line dasharray=${before.dasharray} dashoffset=${before.dashoffset} transition=${before.lineTransition}`);
console.log(`  cards=${before.stops.map((s) => s.card).join(" ")}  art=${before.art.map((a) => a.opacity).join(" ")}`);

// 2 — cross it, and watch the stroke and the stops advance together.
await page.evaluate((y) => scrollTo(0, y), canvasTop - H * 0.5);
const t0 = Date.now();
console.log("\nAFTER TRIGGER (elapsed / line drawn / card opacities)");
const seen = new Map();
for (const ms of [0, 200, 400, 600, 800, 1000, 1200, 1400, 1600]) {
  const wait = ms - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  const s = await read();
  const elapsed = Date.now() - t0;
  s.stops.forEach((stop, i) => {
    if (!seen.has(i) && Number(stop.card) > 0.02) seen.set(i, elapsed);
  });
  console.log(`  t+${String(elapsed).padStart(4)}ms  drawn=${(1 - s.dashoffset).toFixed(3)}  cards=${s.stops.map((x) => x.card).join(" ")}  art=${s.art.map((a) => a.opacity).join(" ")}`);
}

// 3 — the delays the CSS actually resolved, against at × draw.
const after = await read();
const draw = parseFloat(after.drawDuration) * (after.drawDuration.endsWith("ms") ? 1 : 1000);
console.log("\nPER-STOP DELAY (resolved by CSS vs at x draw)");
for (const [i, s] of after.stops.entries()) {
  const expected = Number(s.at) * draw;
  const resolved = parseFloat(s.cardDelay) * (s.cardDelay.includes("ms") ? 1 : 1000);
  const first = seen.get(i);
  console.log(`  stop ${i + 1}  at=${s.at} --route-at=${s.routeAt}  delay=${Math.round(resolved)}ms  expected=${Math.round(expected)}ms  photo delay=${after.art[i].delay}  first visible ~t+${first}ms`);
}
console.log(`\nline transition: ${after.lineTransition}  (linear on purpose: constant pen speed makes at x draw exact)`);

await page.locator("[data-route-section]").screenshot({ path: ".tmpshots/motion/home/audit-route.png" });
await browser.close();
