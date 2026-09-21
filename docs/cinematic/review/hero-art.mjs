/*
  The hero photograph: one file per visit, and the right one.

  The hero has two crops, a wide one and a portrait one, and it used to mount
  both as next/image fills with the unwanted one hidden in CSS. `display: none`
  does not stop a browser fetching a srcset and `priority` preloaded both, so
  every visitor downloaded a photograph they never saw. It is one <picture>
  now, and the browser resolves the media query before it fetches.

  So the question this asks is a network question, not a visual one: how many
  hero images does a cold load pull, and which. The visual half is a pixel diff
  against shots taken before the change — the crops, positions and priority are
  all meant to be untouched, so anything but zero is a regression.
*/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3120";
const OUT = ".tmpshots/motion/hero/after";
mkdirSync(OUT, { recursive: true });

const WIDE = "hero-wide.png";
const TALL = "hero-portrait-1600.webp";
const VPS = [
  ["1440x900", 1440, 900, WIDE],
  ["1920x1080", 1920, 1080, WIDE],
  ["390x844", 390, 844, TALL],
  ["360x780", 360, 780, TALL],
];

let failed = 0;
const check = (ok, label) => {
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
};

const browser = await chromium.launch();

for (const [label, width, height, expected] of VPS) {
  // A new context each time: no HTTP cache carried over from the last size.
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    window.__lcp = null;
    new PerformanceObserver((l) => {
      const e = l.getEntries();
      const last = e[e.length - 1];
      window.__lcp = { url: last.url || "", tag: last.element ? last.element.tagName : "", cls: last.element ? String(last.element.className) : "" };
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  const page = await ctx.newPage();
  const hero = [];
  const warnings = [];
  const errors = [];
  page.on("request", (r) => {
    const u = decodeURIComponent(r.url());
    if (/hero-wide|hero-portrait/.test(u)) hero.push(u.includes("url=") ? u.split("url=")[1].split("&")[0] : u);
  });
  page.on("console", (m) => {
    if (m.type() === "warning" && /hero-wide|hero-portrait/.test(m.text())) warnings.push(m.text());
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.locator("[data-hero-art]").screenshot({ path: `${OUT}/${label}.png` });

  const lcp = await page.evaluate(() => window.__lcp);
  const attrs = await page.evaluate(() => {
    const img = document.querySelector("[data-hero-art] img");
    const src = document.querySelector("[data-hero-art] source");
    const cs = getComputedStyle(img);
    return {
      fetchPriority: img.getAttribute("fetchpriority"),
      loading: img.getAttribute("loading") ?? "(absent, which is eager)",
      sizes: img.getAttribute("sizes"),
      sourceMedia: src?.getAttribute("media"),
      objectFit: cs.objectFit,
      objectPosition: cs.objectPosition,
      currentSrc: decodeURIComponent(img.currentSrc).split("url=")[1]?.split("&")[0] ?? img.currentSrc,
      glow: !!document.querySelector("[data-hero-art] [class*='heroGlow']"),
    };
  });
  const files = [...new Set(hero.map((u) => u.split("/").pop()))];
  console.log(`\n   ${label}: ${hero.length} hero request(s) ${JSON.stringify(files)}  crop=${attrs.objectPosition}  fetchpriority=${attrs.fetchPriority}  loading=${attrs.loading}`);
  check(hero.length === 1, `${label} exactly one hero image is requested (${hero.length})`);
  check(files.length === 1 && files[0] === expected, `${label} it is the right one (${files.join(",")}, expected ${expected})`);
  check(attrs.currentSrc.includes(expected), `${label} the element resolved to that same file`);
  check(warnings.length === 0, `${label} no next/image sizes warning (${warnings.length})`);
  check(lcp && lcp.tag === "IMG" && decodeURIComponent(lcp.url).includes(expected),
    `${label} the hero photograph is the Largest Contentful Paint (${lcp ? lcp.tag : "none"})`);
  check(attrs.fetchPriority === "high" && attrs.loading !== "lazy", `${label} it is still eager and high priority`);
  check(attrs.objectFit === "cover", `${label} the crop is unchanged (${attrs.objectFit} ${attrs.objectPosition})`);
  check(attrs.sourceMedia === "(max-width: 900px)", `${label} the picture switches at the width the stylesheet switches at (${attrs.sourceMedia})`);
  check(attrs.glow, `${label} the glow layer is still wired into the art`);
  check(errors.length === 0, `${label} no console errors${errors.length ? " — " + errors[0] : ""}`);
  await ctx.close();
}

/* -------------------------------------------- reduced motion and no script -- */
console.log("\n   reduced motion / no script");
const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const rpage = await rctx.newPage();
const rHero = [];
rpage.on("request", (r) => { if (/hero-wide|hero-portrait/.test(decodeURIComponent(r.url()))) rHero.push(1); });
await rpage.goto(BASE + "/", { waitUntil: "networkidle" });
await rpage.waitForTimeout(900);
const red = await rpage.evaluate(() => {
  const img = document.querySelector("[data-hero-art] img");
  return { opacity: Number(getComputedStyle(img).opacity), drift: getComputedStyle(document.querySelector("[data-hero-art]")).transform };
});
check(rHero.length === 1 && red.opacity > 0.99, `reduced motion: one hero image, fully painted (${rHero.length}, ${red.opacity})`);
await rctx.close();

const nctx = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
const npage = await nctx.newPage();
const nHero = [];
npage.on("request", (r) => { if (/hero-wide|hero-portrait/.test(decodeURIComponent(r.url()))) nHero.push(decodeURIComponent(r.url())); });
await npage.goto(BASE + "/", { waitUntil: "load" });
await npage.waitForTimeout(800);
const nHtml = await npage.content();
check(/<picture>/.test(nHtml) && /hero-portrait-1600/.test(nHtml), "no script: the picture and both crops are in the document");
check(nHero.length === 1 && nHero[0].includes("hero-portrait"), `no script at 390: still exactly one hero image, the portrait (${nHero.length})`);
await nctx.close();

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
