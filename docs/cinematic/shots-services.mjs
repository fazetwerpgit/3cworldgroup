/**
 * Capture + guard for the cinematic Services page.
 *
 * Loads http://127.0.0.1:3120/services at 390, 768, 1024, 1440 and 1920, and at
 * every one of them asserts zero console errors and scrollWidth == clientWidth,
 * then saves a full-page shot. At 1440 and 390 it also saves a real-viewport
 * shot per section, scrolled to that section's top with motion allowed to
 * settle.
 *
 * It additionally *measures* the closing section rather than trusting the eye.
 * The display type there sits on the territory map — a night image with a lime
 * network running through the middle of it — so the script hides the copy,
 * screenshots the backdrop, and computes the worst-case contrast of the white
 * line and the lime line against the brightest pixel each one actually covers,
 * at 1440 and at 390. Both must clear 4.5:1 or the run fails. (The homepage's
 * r3-shots.mjs also asserts an edge-luminance floor there; this page's closing
 * image is deep ocean at both outer edges by nature, so that floor is not a
 * meaningful guard here and is deliberately not carried over.)
 *
 * The PNG decoder and the contrast maths are the ones from r3-shots.mjs: no new
 * packages are allowed on these pages, and zlib plus five scanline filters is
 * all it takes to read what Playwright writes.
 *
 * Run:  node docs/cinematic/shots-services.mjs
 */
import { chromium } from "playwright";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import path from "node:path";

const BASE = process.env.CINEMATIC_BASE ?? "http://127.0.0.1:3120";
const URL = `${BASE}/services`;
const OUT = path.resolve("docs/cinematic/shots-services");
const SETTLE = 1200;
const CONTRAST_FLOOR = 4.5;

const VIEWPORTS = [
  { name: "390", width: 390, height: 844, sections: true },
  { name: "768", width: 768, height: 1024, sections: false },
  { name: "1024", width: 1024, height: 768, sections: false },
  { name: "1440", width: 1440, height: 900, sections: true },
  { name: "1920", width: 1920, height: 1080, sections: false },
];

/** Every authored section of the page, in reading order. */
const SECTIONS = [
  ["head", "header[class*='pageHead']"],
  ["sell", "#what-you-sell"],
  ["fiber", "#fiber"],
  ["tv", "#tv"],
  ["security", "#security"],
  ["bundle", "#bundle"],
  ["closing", "#closing"],
];

const failures = [];

function record(message) {
  failures.push(message);
  console.error(`FAIL  ${message}`);
}

/* -------------------------------------------------------------------------
   Minimal PNG reader: eight-bit truecolour, non-interlaced.
   ------------------------------------------------------------------------- */
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data.readUInt8(8);
      const colorType = data.readUInt8(9);
      const interlace = data.readUInt8(12);
      if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`unsupported PNG: depth ${depth} colour ${colorType} interlace ${interlace}`);
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let pos = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y === 0 ? null : pixels.subarray((y - 1) * stride, y * stride);

    for (let x = 0; x < stride; x += 1) {
      const rawByte = line[x];
      const a = x >= channels ? out[x - channels] : 0;
      const b = prior ? prior[x] : 0;
      const c = prior && x >= channels ? prior[x - channels] : 0;
      let value;
      switch (filter) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + a;
          break;
        case 2:
          value = rawByte + b;
          break;
        case 3:
          value = rawByte + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          value = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`unknown PNG filter ${filter}`);
      }
      out[x] = value & 0xff;
    }
  }

  return { width, height, channels, pixels };
}

const toLinear = (v) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

const luminance = (r, g, b) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Brightest relative luminance inside a rect of a decoded image. */
function peakLuminance(image, rect) {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(image.width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(image.height, Math.ceil(rect.y + rect.height));
  let peak = 0;
  for (let y = y0; y < y1; y += 1) {
    const row = y * image.width * image.channels;
    for (let x = x0; x < x1; x += 1) {
      const i = row + x * image.channels;
      const l = luminance(image.pixels[i], image.pixels[i + 1], image.pixels[i + 2]);
      if (l > peak) peak = l;
    }
  }
  return peak;
}

const WHITE = luminance(255, 255, 255);
const LIME = luminance(0x8d, 0xc6, 0x3f);

async function measureClosingContrast(page, vpName, outFile) {
  await page.evaluate(() => {
    const el = document.querySelector("#closing");
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: "instant" });
  });
  await page.waitForTimeout(SETTLE);

  const geometry = await page.evaluate(() => {
    const title = document.querySelector("#closing-title");
    const lime = title?.querySelector("span");
    if (!title || !lime) return null;
    const textNode = [...title.childNodes].find(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length,
    );
    if (!textNode) return null;
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const box = (r) => ({ x: r.left, y: r.top, width: r.width, height: r.height });
    return { white: box(range.getBoundingClientRect()), lime: box(lime.getBoundingClientRect()) };
  });
  if (!geometry) return record(`${vpName}: closing title not found, contrast unmeasured`);

  const clip = { x: 0, y: 0, width: page.viewportSize().width, height: page.viewportSize().height };

  // Hide the copy so the shot is the backdrop the copy sits on, and keep it in
  // flow (visibility, not display) so nothing reflows under it.
  await page.evaluate(() => {
    const inner = document.querySelector("#closing-title")?.closest("div");
    if (inner) inner.style.visibility = "hidden";
  });
  await page.waitForTimeout(120);
  const shot = await page.screenshot({ clip });
  await page.evaluate(() => {
    const inner = document.querySelector("#closing-title")?.closest("div");
    if (inner) inner.style.visibility = "";
  });

  const image = decodePng(shot);
  const results = [
    ["white display line", peakLuminance(image, geometry.white), WHITE],
    ["lime display line", peakLuminance(image, geometry.lime), LIME],
  ];

  for (const [label, backdrop, ink] of results) {
    const ratio = contrast(ink, backdrop);
    const line = `${label}: ${ratio.toFixed(2)}:1 against its brightest backdrop pixel`;
    if (ratio < CONTRAST_FLOOR) record(`${vpName} closing ${line} (floor ${CONTRAST_FLOOR})`);
    else console.log(`ok    ${vpName} closing ${line}`);
  }

  await writeFile(outFile, shot);
}

const browser = await chromium.launch();
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  const response = await page.goto(URL, { waitUntil: "networkidle" });
  if (!response || response.status() !== 200) {
    record(`${vp.name}: page responded ${response ? response.status() : "no response"}`);
  }
  await page.waitForTimeout(SETTLE);

  // --- the route is in the group and its nav item is current ---------------
  const current = await page.evaluate(
    () => document.querySelector('header a[aria-current="page"]')?.textContent?.trim() ?? null,
  );
  if (current !== "Services") record(`${vp.name}: current nav link is ${JSON.stringify(current)}, expected "Services"`);

  // --- no horizontal overflow ----------------------------------------------
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (widths.scrollWidth !== widths.clientWidth) {
    record(`${vp.name}: scrollWidth ${widths.scrollWidth} != clientWidth ${widths.clientWidth}`);
  }

  // --- viewport shot per section, at the two reviewed widths ----------------
  if (vp.sections) {
    for (const [name, selector] of SECTIONS) {
      const found = await page.locator(selector).count();
      if (!found) {
        record(`${vp.name}: selector ${selector} matched nothing`);
        continue;
      }
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: Math.max(0, top - 8), behavior: "instant" });
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }, selector);
      await page.waitForTimeout(SETTLE);
      await page.screenshot({ path: path.join(OUT, `vp-${vp.name}-${name}.png`) });
    }
  }

  // Any element wider than the viewport is the usual overflow culprit; name it.
  const wide = await page.evaluate(() => {
    const out = [];
    const limit = document.documentElement.clientWidth + 1;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > limit || r.right > limit + 1 || r.left < -1) {
        if (getComputedStyle(el).position === "fixed") continue;
        out.push(`${el.tagName.toLowerCase()}.${el.className}`.slice(0, 120));
      }
    }
    return out.slice(0, 8);
  });
  if (wide.length) console.warn(`${vp.name}: wide/offscreen elements -> ${wide.join(" | ")}`);

  if (vp.sections) {
    await measureClosingContrast(page, vp.name, path.join(OUT, `measure-${vp.name}-closing-backdrop.png`));
  }

  // --- full page, top of document ------------------------------------------
  // Every reveal on this page fires once, on intersection. A fullPage
  // screenshot taken from the top of an unvisited document therefore captures
  // the pre-reveal state of everything below the fold — three empty
  // photographs and an empty paper chapter — which is a picture of the
  // observer, not of the page. Walk the document first so every reveal has
  // fired, then come back and shoot.
  await page.evaluate(async () => {
    const step = Math.floor(window.innerHeight * 0.75);
    const wait = () => new Promise((r) => setTimeout(r, 120));
    for (let top = 0; top < document.body.scrollHeight; top += step) {
      window.scrollTo({ top, behavior: "instant" });
      await wait();
    }
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
    await wait();
  });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(SETTLE);
  await page.screenshot({ path: path.join(OUT, `fullpage-${vp.name}.png`), fullPage: true });

  if (consoleErrors.length) {
    record(`${vp.name}: ${consoleErrors.length} console error(s): ${consoleErrors.join(" // ")}`);
  } else {
    console.log(`ok    ${vp.name}: 0 console errors, scrollWidth == clientWidth (${widths.clientWidth})`);
  }

  await context.close();
}

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} failure(s).`);
  process.exit(1);
}
console.log(`\nAll checks passed. Shots in ${OUT}`);
