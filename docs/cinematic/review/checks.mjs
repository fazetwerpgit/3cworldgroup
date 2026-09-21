// Secondary checks: axe, reduced motion, JS off, mobile menu, hero legibility.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3120";
const OUT = path.resolve("docs/cinematic/review/shots");
fs.mkdirSync(OUT, { recursive: true });
const AXE = fs.readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const ROUTES = ["/", "/about", "/services", "/opportunities", "/contact", "/apply"];
const out = {};

const killSmooth = () => {
  const st = document.createElement("style");
  st.textContent = "html{scroll-behavior:auto !important}";
  const add = () => document.head && document.head.appendChild(st);
  if (document.head) add(); else document.addEventListener("DOMContentLoaded", add);
};

(async () => {
  const browser = await chromium.launch();

  // ---- axe on each route, mobile + desktop ---------------------------------
  out.axe = [];
  for (const vp of [{ id: "390", width: 390, height: 844, m: true }, { id: "1740", width: 1740, height: 1000, m: false }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.m ? 3 : 1, isMobile: vp.m, hasTouch: vp.m });
    await ctx.addInitScript(killSmooth);
    const page = await ctx.newPage();
    for (const r of ROUTES) {
      await page.goto(BASE + r, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      await page.addScriptTag({ content: AXE });
      const res = await page.evaluate(async () => {
        const r = await window.axe.run(document, { resultTypes: ["violations"] });
        return r.violations.map((v) => ({
          id: v.id, impact: v.impact, help: v.help,
          nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(" "), summary: (n.failureSummary || "").replace(/\s+/g, " ").slice(0, 170) })),
          count: v.nodes.length,
        }));
      });
      out.axe.push({ vp: vp.id, route: r, violations: res });
    }
    await ctx.close();
  }

  // ---- reduced motion + JS off --------------------------------------------
  out.reduced = [];
  for (const r of ["/", "/services"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    await ctx.addInitScript(killSmooth);
    const page = await ctx.newPage();
    await page.goto(BASE + r, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const hidden = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll("main *")) {
        const cs = getComputedStyle(el);
        if (parseFloat(cs.opacity) < 0.05 && (el.textContent || "").trim().length > 10) bad.push(String(el.className || "").slice(0, 60));
      }
      return { motion: document.querySelector("[data-motion]") ? document.querySelector("[data-motion]").dataset.motion : null, hidden: bad.slice(0, 8), h: document.documentElement.scrollHeight };
    });
    await page.screenshot({ path: path.join(OUT, `reduced-${r.replace(/\W/g, "") || "home"}-390.png`) });
    out.reduced.push({ route: r, ...hidden });
    await ctx.close();
  }

  out.nojs = [];
  for (const r of ["/", "/about"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(BASE + r, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, `nojs-${r.replace(/\W/g, "") || "home"}-390.png`) });
    const h = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => null);
    out.nojs.push({ route: r, height: h });
    await ctx.close();
  }

  // ---- mobile menu open / close -------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await ctx.addInitScript(killSmooth);
    const page = await ctx.newPage();
    await page.goto(BASE + "/services", { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const t = page.locator("header button[aria-expanded]").first();
    await t.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "menu-open-390.png") });
    out.menu = await page.evaluate(() => {
      const sheet = document.querySelector("header div[id]:not([hidden])") || document.querySelector("header > div:last-child");
      const r = sheet ? sheet.getBoundingClientRect() : null;
      const links = Array.from(document.querySelectorAll("header a")).filter((a) => a.getBoundingClientRect().height > 0);
      return {
        sheet: r ? { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) } : null,
        links: links.map((a) => ({ t: a.textContent.trim().slice(0, 28), h: Math.round(a.getBoundingClientRect().height), y: Math.round(a.getBoundingClientRect().top) })),
        bodyScrollLocked: getComputedStyle(document.body).overflow,
        pageScrollableBehind: document.documentElement.scrollHeight > window.innerHeight,
      };
    });
    // scroll while open — does the sheet stay put?
    await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "menu-open-scrolled-390.png") });
    await t.click();
    await page.waitForTimeout(400);
    out.menuClosed = await page.evaluate(() => document.querySelector("header button[aria-expanded]").getAttribute("aria-expanded"));
    await ctx.close();
  }

  // ---- hero legibility: brightest pixel behind the headline ---------------
  out.heroLegibility = [];
  for (const vp of [{ id: "390", width: 390, height: 844, m: true }, { id: "1740", width: 1740, height: 1000, m: false }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.m, hasTouch: vp.m });
    await ctx.addInitScript(killSmooth);
    const page = await ctx.newPage();
    for (const r of ROUTES) {
      await page.goto(BASE + r, { waitUntil: "networkidle" });
      await page.waitForTimeout(1400);
      const box = await page.evaluate(() => {
        const h1 = document.querySelector("h1");
        if (!h1) return null;
        const b = h1.getBoundingClientRect();
        return { x: Math.max(0, Math.round(b.x)), y: Math.max(0, Math.round(b.y)), w: Math.round(b.width), h: Math.round(b.height), color: getComputedStyle(h1).color };
      });
      if (!box || box.h < 4) { out.heroLegibility.push({ vp: vp.id, route: r, note: "no h1 box" }); continue; }
      // hide copy, screenshot just the backdrop under the headline
      await page.evaluate(() => {
        const h1 = document.querySelector("h1");
        for (const el of document.querySelectorAll("h1, p, a, button, header nav, [class*=Eyebrow], [class*=Actions], [class*=Lede]")) el.style.visibility = "hidden";
        void h1;
      });
      await page.waitForTimeout(250);
      const clip = { x: box.x, y: box.y, width: Math.min(box.w, vp.width - box.x), height: Math.min(box.h, vp.height - box.y) };
      const file = path.join(OUT, `heroback-${r.replace(/\W/g, "") || "home"}-${vp.id}.png`);
      await page.screenshot({ path: file, clip });
      out.heroLegibility.push({ vp: vp.id, route: r, box, file: path.basename(file) });
    }
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.resolve("docs/cinematic/review/checks.json"), JSON.stringify(out, null, 2));
  console.log("checks done");
})();
