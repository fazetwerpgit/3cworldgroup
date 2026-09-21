/* Round 5 — measured contrast of the copy that sits on photography.
   Hides every text colour, screenshots the backdrop behind each block, and
   compares the block's own colour against the BRIGHTEST pixel that block
   actually covers. The PNG reader is lifted from r3-shots.mjs: no new packages
   are allowed here and none of pngjs/sharp/jimp is installed. */
import { chromium } from "playwright";
import { inflateSync } from "node:zlib";

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


const TARGETS = [
  ["/about", "About head lede", "header p[class*=pageHeadLede]"],
  ["/services", "Services head lede", "header p[class*=pageHeadLede]"],
  ["/services", "band 01 body", "[id=fiber] p[class*=bandBody]"],
  ["/services", "band 01 list", "[id=fiber] ul[class*=bandList]"],
  ["/services", "band 02 body", "[id=tv] p[class*=bandBody]"],
  ["/services", "band 03 body", "[id=security] p[class*=bandBody]"],
  ["/opportunities", "Careers head lede", "header p[class*=pageHeadLede]"],
  ["/contact", "Contact head lede", "header p[class*=pageHeadLede]"],
  ["/apply", "Apply head lede", "header p[class*=pageHeadLede]"],
  ["/apply", "apply aside body", "p[class*=asideBody]"],

  /* The four full-bleed closing bands. Their scrims were opened up in round 7
     so the photograph reads as a photograph; these rows are what stops that
     from being done by eye. Lime is the tightest of the three every time. */
  ["/", "home closing lime", "#closing [class*=closingLime], #closing h2 span"],
  ["/", "home closing lede", "#closing p[class*=closingLede]"],
  ["/about", "about closing lime", "#closing h2 span"],
  ["/opportunities", "careers closing lime", "#apply h2 span"],
  ["/apply", "apply closing lime", "[class*=closing] h2 span"],
  ["/contact", "contact closing lime", "#closing h2 span"],
  ["/apply", "apply closing lede", "[class*=closing] p[class*=closingLede]"],
  /* About, Careers and Contact close on a display line and the lime button,
     with no supporting line under the head — the earlier anti-slop pass took
     out the unverified claims that used to sit there and nothing replaced
     them, which is right: a poster closer does not owe the reader a sentence.
     Home and Apply still carry a lede and are still measured. These rows were
     deleted rather than made optional, so a selector that misses anywhere else
     still fails loudly instead of being quietly skipped. */
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1740, height: 1000 } });
const fails = [];

for (const [route, label, selector] of TARGETS) {
  await page.goto("http://127.0.0.1:3120" + route, { waitUntil: "networkidle" });
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 700) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(400);

  const probe = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      top: el.getBoundingClientRect().top + window.scrollY,
      color: cs.color.match(/[\d.]+/g).slice(0, 3).map(Number),
      size: parseFloat(cs.fontSize),
      weight: Number(cs.fontWeight) || 400,
    };
  }, selector);
  if (!probe) { console.log("MISSING  " + route + "  " + selector); fails.push(route + " " + label + ": selector missed"); continue; }

  /* Park the block by absolute document position rather than scrollIntoView:
     the reveals are still settling, and a rect measured before they finish
     lands somewhere else by the time the screenshot is taken. */
  await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 400)), probe.top);
  await page.waitForTimeout(800);

  /* Hide the type and the drawn markers, keep every real background.
     The pseudo reset is scoped to text-bearing elements on purpose: the list
     ticks it is there to remove are li::before, but the full-bleed section
     scrims are section::after, and a blanket *::after reset deleted them and
     measured the closing bands against the raw unscrimmed photograph. */
  await page.addStyleTag({
    content:
      "*{color:transparent!important;text-shadow:none!important;text-decoration-color:transparent!important}" +
      ":is(p,li,span,h1,h2,h3,h4,a,button,em,strong,dt,dd)::before," +
      ":is(p,li,span,h1,h2,h3,h4,a,button,em,strong,dt,dd)::after" +
      "{background:transparent!important;border-color:transparent!important}",
  });
  await page.waitForTimeout(250);

  /* Measure the LINE BOXES, not the element box. A centred <p> is as wide as
     its column even when the sentence in it is half that, and sampling the
     empty half was reporting the brightest pixel of a photograph no glyph ever
     sits on — which is how the closing eyebrows read as 2:1 failures while
     their text was over a scrim the whole time. Range rects are the glyphs. */
  const rects = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    const range = document.createRange();
    const out = [];
    const walk = (n) => {
      if (n.nodeType === 3 && n.textContent.trim()) {
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width >= 2 && r.height >= 2) out.push(r);
      } else if (n.nodeType === 1 && getComputedStyle(n).display !== "none") {
        for (const c of n.childNodes) walk(c);
      }
    };
    walk(el);
    const src = out.length ? out : [el.getBoundingClientRect()];
    return src
      .map((r) => {
        const x = Math.max(0, Math.round(r.x));
        const y = Math.max(0, Math.round(r.y));
        return {
          x,
          y,
          width: Math.min(Math.round(r.right), window.innerWidth) - x,
          height: Math.min(Math.round(r.bottom), window.innerHeight) - y,
        };
      })
      .filter((r) => r.width > 1 && r.height > 1);
  }, selector);
  if (!rects.length) { console.log("MISSING  " + route + "  " + selector); fails.push(route + " " + label + ": no line boxes"); continue; }
  let peak = 0;
  for (const rect of rects) {
    const shot = await page.screenshot({ clip: rect });
    const image = decodePng(shot);
    peak = Math.max(peak, peakLuminance(image, { x: 0, y: 0, width: image.width, height: image.height }));
  }
  const ratio = contrast(luminance(...probe.color), peak);
  const large = probe.size >= 24 || (probe.size >= 18.66 && probe.weight >= 700);
  const floor = large ? 3 : 4.5;
  const ok = ratio >= floor;
  if (!ok) fails.push(route + " " + label + ": " + ratio.toFixed(2) + ":1 under " + floor);
  console.log((ok ? "PASS  " : "FAIL  ") + route.padEnd(16) + label.padEnd(20) + ratio.toFixed(2) + ":1   floor " + floor);
}

await browser.close();
if (fails.length) { console.log("\n" + fails.join("\n")); process.exit(1); }
console.log("\nevery measured block clears its floor");
