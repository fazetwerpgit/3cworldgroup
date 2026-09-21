// Measure dead vertical gaps, header/menu backgrounds, and text-over-photo contrast.
import { chromium } from "playwright";
import fs from "node:fs";
import { decodePng } from "./png.mjs";

const BASE = "http://127.0.0.1:3120";
const ROUTES = ["/", "/about", "/services", "/opportunities", "/contact", "/apply"];
const out = {};

const killSmooth = () => {
  const st = document.createElement("style");
  st.textContent = "html{scroll-behavior:auto !important}";
  const add = () => document.head && document.head.appendChild(st);
  if (document.head) add(); else document.addEventListener("DOMContentLoaded", add);
};

const rel = (r, g, b) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

(async () => {
  const browser = await chromium.launch();

  for (const vpDef of [
    { id: "390", width: 390, height: 844, m: true },
    { id: "1740", width: 1740, height: 1000, m: false },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vpDef.width, height: vpDef.height }, deviceScaleFactor: 1, isMobile: vpDef.m, hasTouch: vpDef.m });
    await ctx.addInitScript(killSmooth);
    const page = await ctx.newPage();

    for (const r of ROUTES) {
      await page.goto(BASE + r, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      // scroll everything into view so reveals fire
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < h; y += 500) {
        await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: "instant" }), y);
        await page.waitForTimeout(60);
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(400);

      const gaps = await page.evaluate(() => {
        // For each top-level section in <main>, find the topmost and bottommost
        // element that actually paints text or an image, and report the empty
        // band above and below it inside that section.
        const paints = (el) => {
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) < 0.05) return false;
          if (el.tagName === "IMG" || el.tagName === "SVG" || el.tagName === "svg") return true;
          let direct = "";
          for (const n of el.childNodes) if (n.nodeType === 3) direct += n.textContent;
          return direct.trim().length > 0;
        };
        const res = [];
        for (const sec of document.querySelectorAll("main > *")) {
          const sr = sec.getBoundingClientRect();
          let top = Infinity, bottom = -Infinity, topEl = "", botEl = "";
          for (const el of sec.querySelectorAll("*")) {
            if (!paints(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.height < 2 || r.width < 2) continue;
            if (r.top < top) { top = r.top; topEl = (el.textContent || el.tagName).trim().slice(0, 30); }
            if (r.bottom > bottom) { bottom = r.bottom; botEl = (el.textContent || el.tagName).trim().slice(0, 30); }
          }
          if (top === Infinity) continue;
          res.push({
            tag: sec.tagName.toLowerCase(),
            id: sec.id || "",
            cls: String(sec.className || "").split(" ").map(s=>s.replace(/^.*__/,"")).join(" ").slice(0, 44),
            secH: Math.round(sr.height),
            padTop: Math.round(top - sr.top),
            padBot: Math.round(sr.bottom - bottom),
            first: topEl, last: botEl,
          });
        }
        // gap between consecutive sections = padBot of prev + padTop of next
        for (let i = 1; i < res.length; i++) res[i].deadAbove = res[i - 1].padBot + res[i].padTop;
        return res;
      });
      out[`${vpDef.id}${r}`] = { gaps };
    }

    // header / menu backgrounds
    await page.goto(BASE + "/services", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const tg = page.locator("header button[aria-expanded]").first();
    if (await tg.isVisible().catch(() => false)) { await tg.click(); await page.waitForTimeout(400); }
    out[`${vpDef.id}-chrome`] = await page.evaluate(() => {
      const hdr = document.querySelector("header");
      const sheet = document.querySelector("header div[id]");
      const g = (el) => { if (!el) return null; const c = getComputedStyle(el); return { bg: c.backgroundColor, bd: c.backdropFilter, z: c.zIndex, pos: c.position, h: Math.round(el.getBoundingClientRect().height) }; };
      return { header: g(hdr), sheet: g(sheet) };
    });
    await ctx.close();
  }

  // ---- contrast of text over photography ---------------------------------
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx2.addInitScript(killSmooth);
  const p2 = await ctx2.newPage();
  out.contrast = [];
  const TARGETS = [
    { route: "/", sel: "[class*=heroRail] [class*=railLabel], [class*=heroRail] a, [class*=heroRail] span", label: "hero chapter rail" },
    { route: "/", sel: "h1", label: "home h1" },
    { route: "/about", sel: "h1", label: "about h1" },
    { route: "/services", sel: "h1", label: "services h1" },
    { route: "/opportunities", sel: "h1", label: "careers h1" },
    { route: "/apply", sel: "h1", label: "apply h1" },
  ];
  for (const t of TARGETS) {
    await p2.goto(BASE + t.route, { waitUntil: "networkidle" });
    await p2.waitForTimeout(1300);
    const info = await p2.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)), w: Math.round(r.width), h: Math.round(r.height), color: getComputedStyle(el).color, fs: getComputedStyle(el).fontSize };
    }, t.sel);
    if (!info || info.h < 3 || info.y > 844) { out.contrast.push({ ...t, note: "not found / offscreen" }); continue; }
    await p2.evaluate((sel) => {
      const el = document.querySelector(sel);
      // hide the text itself and everything else that paints over the photo
      for (const e of document.querySelectorAll("h1,h2,p,a,button,span,li,svg")) e.style.visibility = "hidden";
      void el;
    }, t.sel);
    await p2.waitForTimeout(250);
    const clip = { x: info.x, y: info.y, width: Math.max(2, Math.min(info.w, 390 - info.x)), height: Math.max(2, Math.min(info.h, 844 - info.y)) };
    const buf = await p2.screenshot({ clip });
    const png = decodePng(buf);
    const ch = png.channels;
    let maxL = 0, sum = 0, n = 0;
    for (let i = 0; i < png.pixels.length; i += ch) {
      const L = rel(png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]);
      if (L > maxL) maxL = L;
      sum += L; n++;
    }
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(info.color);
    const tl = m ? rel(+m[1], +m[2], +m[3]) : 1;
    out.contrast.push({ ...t, fs: info.fs, color: info.color, meanBackdropL: +(sum / n).toFixed(4), maxBackdropL: +maxL.toFixed(4), worstRatio: +ratio(tl, maxL).toFixed(2), meanRatio: +ratio(tl, sum / n).toFixed(2) });
  }
  await ctx2.close();

  await browser.close();
  fs.writeFileSync("docs/cinematic/review/measure.json", JSON.stringify(out, null, 2));
  console.log("measure done");
})();
