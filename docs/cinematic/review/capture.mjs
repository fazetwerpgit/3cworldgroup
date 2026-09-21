// Adversarial review harness. Cold-loads /, then CLIENT-SIDE navigates by
// clicking nav links, capturing viewport-sized shots at scroll positions.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3120";
const OUT = path.resolve("docs/cinematic/review/shots");
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { id: "390", width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { id: "430", width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { id: "1740", width: 1740, height: 1000, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

// label => nav link text to click (null = the cold-load home)
const PAGES = [
  { id: "home", path: "/", click: null },
  { id: "about", path: "/about", click: "About" },
  { id: "services", path: "/services", click: "Services" },
  { id: "careers", path: "/opportunities", click: "Careers" },
  { id: "contact", path: "/contact", click: "Contact" },
  { id: "apply", path: "/apply", click: "Apply" },
];

const report = [];

async function openMenuIfNeeded(page, vp) {
  if (vp.width >= 1000) return false;
  const toggle = page.locator("header button[aria-expanded]").first();
  if (!(await toggle.count())) return false;
  const expanded = await toggle.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await toggle.click();
    await page.waitForTimeout(250);
  }
  return true;
}

async function clickNav(page, vp, label) {
  const opened = await openMenuIfNeeded(page, vp);
  const scope = opened ? page.locator("header [hidden=false], header div[id]").last() : page.locator("header nav, header");
  // Prefer a visible link with exact text inside the header.
  const links = page.locator("header a", { hasText: new RegExp(`^${label}$`, "i") });
  const n = await links.count();
  for (let i = 0; i < n; i++) {
    const l = links.nth(i);
    if (await l.isVisible()) {
      await l.click();
      return true;
    }
  }
  // Apply on mobile sheet has longer text
  if (label === "Apply") {
    const alt = page.locator("header a[href='/apply']");
    const m = await alt.count();
    for (let i = 0; i < m; i++) {
      const l = alt.nth(i);
      if (await l.isVisible()) { await l.click(); return true; }
    }
  }
  return false;
}

async function audit(page, vp, pageId) {
  return await page.evaluate(({ vpWidth }) => {
    const out = {};
    out.scrollWidth = document.documentElement.scrollWidth;
    out.clientWidth = document.documentElement.clientWidth;
    out.innerWidth = window.innerWidth;
    out.overflow = document.documentElement.scrollWidth > window.innerWidth;
    out.docHeight = document.documentElement.scrollHeight;

    // widest offenders when overflowing
    out.wideEls = [];
    if (out.overflow) {
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth + 1 && r.width > 4 && r.height > 4) {
          out.wideEls.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || "")).slice(0, 90),
            right: Math.round(r.right),
            width: Math.round(r.width),
          });
        }
      }
      out.wideEls = out.wideEls.slice(0, 12);
    }

    // unrevealed
    out.unrevealed = Array.from(document.querySelectorAll("[data-reveal]:not([data-shown])")).map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || "").slice(0, 80),
        opacity: cs.opacity,
        top: Math.round(r.top + window.scrollY),
        text: (el.textContent || "").trim().slice(0, 60),
      };
    });

    // any element effectively invisible but containing text
    out.invisibleText = [];
    for (const el of document.querySelectorAll("main *, header *, footer *")) {
      const cs = getComputedStyle(el);
      if (parseFloat(cs.opacity) < 0.05 && (el.textContent || "").trim().length > 12) {
        const r = el.getBoundingClientRect();
        if (r.width > 10 && r.height > 6) {
          out.invisibleText.push({
            tag: el.tagName.toLowerCase(),
            cls: String(el.className || "").slice(0, 70),
            text: (el.textContent || "").trim().slice(0, 50),
          });
        }
      }
    }
    out.invisibleText = out.invisibleText.slice(0, 10);

    // tap targets
    out.smallTaps = [];
    for (const el of document.querySelectorAll("a, button, summary, input, select, textarea, [role=button]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      if (r.width < 44 || r.height < 44) {
        out.smallTaps.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || "").slice(0, 60),
          text: (el.textContent || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 34),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
    }

    // small text
    out.smallText = [];
    const seen = new Map();
    for (const el of document.querySelectorAll("main *, footer *, header *")) {
      if (!el.childNodes.length) continue;
      let direct = "";
      for (const n of el.childNodes) if (n.nodeType === 3) direct += n.textContent;
      direct = direct.trim();
      if (direct.length < 3) continue;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      if (fs < 16) {
        const key = `${el.tagName}|${String(el.className || "").slice(0, 40)}|${fs}`;
        if (!seen.has(key)) seen.set(key, { tag: el.tagName.toLowerCase(), cls: String(el.className || "").slice(0, 55), fs: +fs.toFixed(1), text: direct.slice(0, 40) });
      }
    }
    out.smallText = Array.from(seen.values()).sort((a, b) => a.fs - b.fs).slice(0, 24);

    // headline size on the page hero / first h1
    const h1 = document.querySelector("h1");
    if (h1) {
      const cs = getComputedStyle(h1);
      const r = h1.getBoundingClientRect();
      out.h1 = { fs: Math.round(parseFloat(cs.fontSize)), lh: cs.lineHeight, w: Math.round(r.width), h: Math.round(r.height), text: h1.textContent.trim().slice(0, 70) };
    }
    // section vertical gaps: measure each top-level section height + padding
    out.sections = Array.from(document.querySelectorAll("main > *, main > * > section, main section, main header")).slice(0, 24).map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || "",
        cls: String(el.className || "").slice(0, 46),
        h: Math.round(r.height),
        padT: cs.paddingTop,
        padB: cs.paddingBottom,
        bg: cs.backgroundColor,
      };
    });
    return out;
  }, { vpWidth: vp.width });
}

async function scrollAndShoot(page, vp, pageId) {
  const shots = [];
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = vp.height;
  let y = 0;
  let i = 0;
  const maxY = Math.max(0, h - vh);
  // step through in 600px increments to trigger reveals
  while (y < maxY) {
    await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
    await page.waitForTimeout(150);
    y += 600;
  }
  await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), maxY);
  await page.waitForTimeout(600);

  // now capture at evenly spaced positions covering the page
  const positions = [];
  const count = Math.max(4, Math.min(10, Math.ceil(h / vh)));
  for (let k = 0; k < count; k++) positions.push(Math.round((maxY * k) / (count - 1)));
  positions[0] = 0;
  for (const pos of positions) {
    await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), pos);
    await page.waitForTimeout(550);
    const got = await page.evaluate(() => Math.round(window.scrollY));
    if (Math.abs(got - pos) > 8) { await page.waitForTimeout(900); }
    const f = path.join(OUT, `${pageId}-${vp.id}-y${String(pos).padStart(5, "0")}.png`);
    await page.screenshot({ path: f });
    shots.push(f);
    i++;
  }
  return shots;
}

(async () => {
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      userAgent: vp.isMobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
        : undefined,
    });
    await ctx.addInitScript(() => {
      const st = document.createElement('style');
      st.textContent = 'html{scroll-behavior:auto !important}';
      const add = () => document.head && document.head.appendChild(st);
      if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).slice(0, 200)));
    page.on("requestfailed", (r) => errors.push("REQFAIL: " + r.url().slice(0, 140) + " " + (r.failure()?.errorText || "")));

    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1400);

    for (const p of PAGES) {
      const before = errors.length;
      if (p.click) {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.waitForTimeout(200);
        const ok = await clickNav(page, vp, p.click);
        if (!ok) {
          report.push({ vp: vp.id, page: p.id, navClickFailed: true });
          await page.goto(BASE + p.path, { waitUntil: "networkidle" });
        }
        await page.waitForURL(`**${p.path}`, { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1500);
      }
      const url = page.url();
      const shots = await scrollAndShoot(page, vp, p.id);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(300);
      const a = await audit(page, vp, p.id);
      report.push({ vp: vp.id, page: p.id, url, reachedBy: p.click ? "nav-click" : "cold-load", errors: errors.slice(before), shots: shots.map((s) => path.basename(s)), ...a });
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.resolve("docs/cinematic/review/audit.json"), JSON.stringify(report, null, 2));
  console.log("done", report.length);
})();
