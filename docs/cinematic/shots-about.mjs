/**
 * Capture + guard for the cinematic About page (/about).
 *
 * Loads http://127.0.0.1:3120/about at 390, 768, 1024, 1440 and 1920. At every
 * width it asserts zero console errors and scrollWidth == clientWidth, then
 * saves a full-page shot. At 1440 and 390 it also saves a real-viewport shot
 * per authored section.
 *
 * Two things on this page sit on photography rather than on a flat ground — the
 * opening band and the closing plate — so both are measured rather than eyed.
 * The script hides the copy, screenshots the backdrop, and computes the
 * worst-case contrast of each display line against the brightest pixel that
 * line actually covers. Both must clear 4.5:1, and the closing photograph must
 * still be *present* at the outer eighths or the darkening has eaten it.
 *
 * Run:  node docs/cinematic/shots-about.mjs
 */
import { chromium } from "playwright";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import path from "node:path";

const BASE = process.env.CINEMATIC_BASE ?? "http://127.0.0.1:3120";
const OUT = path.resolve("docs/cinematic/shots-about");
const SETTLE = 1200;
const CONTRAST_FLOOR = 4.5;
const EDGE_FLOOR = 0.08;

const VIEWPORTS = [
  { name: "390", width: 390, height: 844, sections: true },
  { name: "768", width: 768, height: 1024, sections: false },
  { name: "1024", width: 1024, height: 768, sections: false },
  { name: "1440", width: 1440, height: 900, sections: true },
  { name: "1920", width: 1920, height: 1080, sections: false },
];

/** Every authored section of the page, in reading order. */
const SECTIONS = [
  ["head", "main > header"],
  ["story", "#story"],
  ["mission", "#mission"],
  ["values", "#values"],
  ["serve", "#who-we-serve"],
  ["leadership", "#leadership"],
  ["closing", "#closing"],
];

const failures = [];

function record(message) {
  failures.push(message);
  console.error(`FAIL  ${message}`);
}

/* -------------------------------------------------------------------------
   A minimal PNG reader, lifted from r3-shots.mjs: no new packages are allowed
   in this language and none of pngjs/sharp/jimp is installed, so the eight-bit
   truecolour non-interlaced subset Playwright writes is decoded here.
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
const DIM = luminance(0xb5, 0xc4, 0xda);

/** Scroll a section to the top of the viewport and let motion settle. */
async function scrollTo(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, top - 8), behavior: "instant" });
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, selector);
  await page.waitForTimeout(SETTLE);
}

/**
 * Measure display copy that sits on a photograph. `lines` is a list of
 * [label, selector, inkLuminance, mode]; the whole `hideSelector` subtree is
 * made invisible (not display:none, so nothing reflows) for the backdrop shot.
 *
 * `mode` decides which rect is measured, and it matters: a centred block-level
 * heading's border box runs the full width of the shell, so measuring that
 * would grade the type against parts of the photograph no glyph ever covers.
 *   "text" — a Range over the element's own direct text nodes, i.e. the real
 *            line boxes of the words. The honest rect for a heading.
 *   "self" — the element's own box. Correct for an inline span.
 */
async function measureOnPhoto(page, vpName, { section, hideSelector, lines, outFile, edges }) {
  await scrollTo(page, section);

  const geometry = await page.evaluate((specs) => {
    const box = (r) => ({ x: r.left, y: r.top, width: r.width, height: r.height });
    const union = (rects) => {
      const live = rects.filter((r) => r.width > 0 && r.height > 0);
      if (!live.length) return null;
      return {
        x: Math.min(...live.map((r) => r.left)),
        y: Math.min(...live.map((r) => r.top)),
        width: Math.max(...live.map((r) => r.right)) - Math.min(...live.map((r) => r.left)),
        height: Math.max(...live.map((r) => r.bottom)) - Math.min(...live.map((r) => r.top)),
      };
    };
    return specs.map(([label, selector, mode]) => {
      const el = document.querySelector(selector);
      if (!el) return [label, null];
      if (mode !== "text") return [label, box(el.getBoundingClientRect())];
      const rects = [];
      for (const node of el.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        rects.push(...range.getClientRects());
      }
      return [label, union(rects)];
    });
  }, lines.map(([label, selector, , mode]) => [label, selector, mode ?? "text"]));

  const clip = { x: 0, y: 0, width: page.viewportSize().width, height: page.viewportSize().height };

  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement) el.style.visibility = "hidden";
  }, hideSelector);
  await page.waitForTimeout(120);
  const shot = await page.screenshot({ clip });
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement) el.style.visibility = "";
  }, hideSelector);

  const image = decodePng(shot);

  for (const [index, [label, rect]] of geometry.entries()) {
    if (!rect || rect.width < 1 || rect.height < 1) {
      record(`${vpName} ${section}: ${label} not measurable`);
      continue;
    }
    const ink = lines[index][2];
    const ratio = contrast(ink, peakLuminance(image, rect));
    const line = `${label}: ${ratio.toFixed(2)}:1 against its brightest backdrop pixel`;
    if (ratio < CONTRAST_FLOOR) record(`${vpName} ${section} ${line} (floor ${CONTRAST_FLOOR})`);
    else console.log(`ok    ${vpName} ${section} ${line}`);
  }

  // The other half of the brief on a closing plate: the photograph has to be
  // present, not scrimmed into flat navy. Sample the outer eighths.
  if (edges) {
    const edge = Math.max(
      peakLuminance(image, { x: 0, y: clip.height * 0.2, width: clip.width * 0.125, height: clip.height * 0.5 }),
      peakLuminance(image, {
        x: clip.width * 0.875,
        y: clip.height * 0.2,
        width: clip.width * 0.125,
        height: clip.height * 0.5,
      }),
    );
    const edgeLine = `edge peak luminance ${edge.toFixed(4)} (flat navy is ~0.016)`;
    if (edge < EDGE_FLOOR) record(`${vpName} ${section} ${edgeLine} — the photograph is not reading`);
    else console.log(`ok    ${vpName} ${section} ${edgeLine}`);
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

  const response = await page.goto(`${BASE}/about`, { waitUntil: "networkidle" });
  if (!response || response.status() !== 200) {
    record(`${vp.name}: page responded ${response ? response.status() : "no response"}`);
  }
  await page.waitForTimeout(SETTLE);

  // The dev overlay is a fixed badge that sits on top of the page's own bottom
  // left corner. It is not part of the design and it obscures what is.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });

  // --- no horizontal overflow ----------------------------------------------
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (widths.scrollWidth !== widths.clientWidth) {
    record(`${vp.name}: scrollWidth ${widths.scrollWidth} != clientWidth ${widths.clientWidth}`);
  }

  // --- the nav item for this route is the current one ----------------------
  const current = await page.evaluate(() =>
    [...document.querySelectorAll('a[aria-current="page"]')].map((a) => a.getAttribute("href")),
  );
  if (!current.includes("/about")) record(`${vp.name}: /about is not marked aria-current in the chrome`);

  // --- viewport shot per section, at the two reviewed widths ----------------
  if (vp.sections) {
    for (const [name, selector] of SECTIONS) {
      if (!(await page.locator(selector).count())) {
        record(`${vp.name}: selector ${selector} matched nothing`);
        continue;
      }
      await scrollTo(page, selector);
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

  // --- the two places copy sits on, or next to, a photograph ---------------
  if (vp.sections) {
    await measureOnPhoto(page, vp.name, {
      section: "#closing",
      hideSelector: "#closing-inner",
      lines: [
        ["closing white line", "#closing-title", WHITE, "text"],
        ["closing lime line", "#closing-title span", LIME, "self"],
        ["closing eyebrow", "#closing-eyebrow", DIM, "text"],
      ],
      outFile: path.join(OUT, `measure-${vp.name}-closing-backdrop.png`),
      edges: true,
    });

    // The opening band has no copy on it, but the figures rail sits right under
    // its lower fade. Two things to hold: the fade has actually reached navy by
    // the time the first figure starts, and the photograph is still reading in
    // the band itself rather than being scrimmed flat.
    await measureOnPhoto(page, vp.name, {
      section: "#story",
      hideSelector: "#story dl",
      lines: [["first figure label", "#story dl > div:first-child dd", DIM, "text"]],
      outFile: path.join(OUT, `measure-${vp.name}-figures-backdrop.png`),
      edges: false,
    });

    await scrollTo(page, "#story");
    const bandRect = await page.evaluate(() => {
      const el = document.querySelector("#story-band");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      // The fixed header floats over the top of the band and its wordmark is
      // pure white, so measuring from the band's own top edge would grade the
      // chrome, not the photograph. Start below whatever the header occupies.
      const header = document.querySelector("header")?.getBoundingClientRect();
      const top = Math.max(r.top, header ? header.bottom + 4 : r.top);
      return { x: r.left, y: top, width: r.width, height: r.bottom - top };
    });
    if (!bandRect) {
      record(`${vp.name}: #story-band not found`);
    } else {
      const image = decodePng(
        await page.screenshot({
          clip: { x: 0, y: 0, width: vp.width, height: vp.height },
        }),
      );
      const peak = peakLuminance(image, bandRect);
      const line = `opening band peak luminance ${peak.toFixed(4)} (flat navy is ~0.016)`;
      if (peak < EDGE_FLOOR) record(`${vp.name} #story ${line} — the photograph is not reading`);
      else console.log(`ok    ${vp.name} #story ${line}`);
    }
  }

  // --- full page, top of document ------------------------------------------
  // Walk the whole document first. Every reveal on this page fires once, on
  // intersection, so a full-page shot taken without having scrolled past a
  // section would photograph that section at opacity 0 and look like a bug the
  // page does not have.
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.7);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo({ top: y, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 140));
    }
  });
  await page.waitForTimeout(SETTLE);
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
