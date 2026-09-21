// node docs/cinematic/review/contact-trail.mjs [--label x] [--reduced] [--as-before]
//
// Measures the handoff between the raster 3C mark's lime slash and the SVG
// trail that continues it on /contact.
//
// Method, per viewport: settle the page (3s past load so the mark's entrance
// and the line's draw are both finished), read the real boxes out of the DOM,
// then photograph the joint at deviceScaleFactor 3 and fit a line to the lime
// centreline on each side of it. Both fits stand CLEAR of the joint — 6 to 34
// CSS px up into the raster, 4.5 to 30 down into the vector — because the two
// strokes now deliberately overlap across it, and a sample that straddles the
// overlap measures the sum of the two lines rather than either one. Each fit is
// extrapolated to the joint row: the gap between them is the offset, and the
// difference of the two slopes is the angle delta. Nothing is eyeballed and
// nothing is read off the CSS — the CSS is what is under test.
//
// `--as-before` puts the pre-fix geometry back over the top with !important and
// a DOM attribute, so the two columns of the report are the same measurement of
// two different geometries rather than two different measurements.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = "http://127.0.0.1:3120";
const OUT = ".tmpshots/motion/contact-trail";
const TMP = `${OUT}/.raw`;
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const args = process.argv.slice(2);
const label = (args[args.indexOf("--label") + 1] ?? "run").replace(/[^a-z0-9-]/gi, "");
const reduced = args.includes("--reduced");
const asBefore = args.includes("--as-before");

/** The geometry as it stood before round 15, reimposed on the live page. */
const BEFORE_CSS = `
  [class*="headArt"] { --line-run: calc(0.7018 * var(--drop)) !important; }
  [class*="headLine"] { overflow: hidden !important; right: 53.57% !important; }
  [class*="headNode"] { right: calc(53.57% + var(--line-run)) !important; }
  [class*="headLinePath"] { stroke-width: 3px !important; }
`;

const VIEWPORTS = [
  { w: 1280, h: 800, dsf: 3 },
  { w: 1440, h: 900, dsf: 3 },
  { w: 1440, h: 900, dsf: 2 },
  { w: 1600, h: 900, dsf: 3 },
  { w: 1800, h: 1000, dsf: 3 },
  { w: 1920, h: 1080, dsf: 3 },
  { w: 960, h: 900, dsf: 3 },
  { w: 390, h: 844, dsf: 3 },
];

/** Decode a PNG to a flat RGB buffer through ImageMagick (no image deps here). */
function decode(png) {
  const p = `${TMP}/scratch.png`;
  writeFileSync(p, png);
  const ppm = execFileSync("magick", [p, "-depth", "8", "ppm:-"], {
    maxBuffer: 1 << 28,
  });
  let i = 0;
  const tok = [];
  while (tok.length < 4) {
    while (ppm[i] === 32 || ppm[i] === 10 || ppm[i] === 9 || ppm[i] === 13) i += 1;
    const s = i;
    while (ppm[i] !== 32 && ppm[i] !== 10 && ppm[i] !== 9 && ppm[i] !== 13) i += 1;
    tok.push(ppm.toString("ascii", s, i));
  }
  i += 1;
  return { w: +tok[1], h: +tok[2], off: i, buf: ppm };
}

/** How lime a pixel is, over navy. Zero for the ground and for the white and
 *  grey streets in the plate, positive only for the lime outline and stroke. */
function limeness(r, g, b) {
  const v = g - Math.max(r, b * 0.72);
  return v > 12 ? v : 0;
}

/** Weighted centroid of the lime band on one row, inside a window. */
function rowCentre(img, y, cx, halfWindow) {
  let sw = 0;
  let sx = 0;
  let peak = 0;
  const x0 = Math.max(0, Math.round(cx - halfWindow));
  const x1 = Math.min(img.w - 1, Math.round(cx + halfWindow));
  for (let x = x0; x <= x1; x += 1) {
    const i = img.off + 3 * (y * img.w + x);
    const w = limeness(img.buf[i], img.buf[i + 1], img.buf[i + 2]);
    if (w > 0) {
      sw += w;
      sx += w * (x + 0.5);
      if (w > peak) peak = w;
    }
  }
  return sw > 0 ? { c: sx / sw, mass: sw, width: sw / peak } : null;
}

/** Least squares x = a + slope*y over rows [y0, y1], tracking the band with a
 *  running guess so neighbouring streets in the plate never enter the window.
 *  `nearRows` (optional) re-solves the intercept alone over the rows closest to
 *  the joint: a long arm measures a noisy blurred stroke's ANGLE well but makes
 *  its POSITION at the joint sensitive to that angle, and the near rows measure
 *  the position directly. One fit, two windows, no circularity — the slope is
 *  still whatever the pixels say. */
function fitSide(img, y0, y1, cxAt, slopeGuess, halfWindow, nearRows = 0) {
  const pts = [];
  let cx = cxAt;
  const step = y1 >= y0 ? 1 : -1;
  for (let y = y0; step > 0 ? y <= y1 : y >= y1; y += step) {
    const r = rowCentre(img, y, cx, halfWindow);
    if (!r) continue;
    pts.push({ y: y + 0.5, ...r });
    cx = r.c + slopeGuess * step;
  }
  if (pts.length < 6) return null;
  let sy = 0;
  let sx = 0;
  let syy = 0;
  let sxy = 0;
  for (const q of pts) {
    sy += q.y;
    sx += q.c;
    syy += q.y * q.y;
    sxy += q.y * q.c;
  }
  const n = pts.length;
  const slope = (n * sxy - sy * sx) / (n * syy - sy * sy);
  let a = (sx - slope * sy) / n;
  if (nearRows) {
    const near = pts.slice(0, nearRows);
    a = near.reduce((t, q) => t + (q.c - slope * q.y), 0) / near.length;
  }
  let rms = 0;
  for (const q of pts) rms += (q.c - (a + slope * q.y)) ** 2;
  const widths = pts.map((q) => q.width).sort((p, q) => p - q);
  return {
    n,
    slope,
    at: (y) => a + slope * y,
    rms: Math.sqrt(rms / n),
    width: widths[Math.floor(widths.length / 2)],
  };
}

/*
  Where the raster's centreline crosses the mark's bottom edge, as a fraction of
  the mark's width in from its RIGHT edge. Fitted per width off the file over the
  rows each width actually shows at 6-70 CSS px above the joint; the seven fits
  land between 0.53697 and 0.53712, so one constant covers every breakpoint to
  better than 0.1px. This is the figure the CSS has to reproduce, and comparing
  it against the live box is the sub-0.1px half of the verification — the pixel
  fit below carries about 0.4px of noise on a stroke this soft.
*/
const FILE_FRAC_R = 0.53703;

const browser = await chromium.launch();
const rows = [];
let failures = 0;

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: vp.dsf,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  await page.goto(`${BASE}/contact`, { waitUntil: "networkidle" });
  if (asBefore) {
    await page.addStyleTag({ content: BEFORE_CSS });
    await page.evaluate(() => {
      const line = document.querySelector('[class*="headArt"] line');
      line?.setAttribute("x1", "100");
      line?.setAttribute("y1", "0");
    });
  }
  await page.waitForTimeout(3000);

  // Put the joint near the middle of the viewport before anything is read or
  // photographed: at some widths it sits below the fold, and a clip that falls
  // outside the viewport cannot be screenshotted.
  await page.evaluate(() => {
    const art = document.querySelector('[class*="headArt"]');
    const svg = art?.querySelector("svg");
    if (!svg) return;
    const b = svg.getBoundingClientRect();
    const want = b.top + window.scrollY - window.innerHeight / 2;
    window.scrollTo(0, Math.max(0, Math.round(want)));
  });
  await page.waitForTimeout(700);

  const geo = await page.evaluate(() => {
    const art = document.querySelector('[class*="headArt"]');
    const img = art?.querySelector("img");
    const svg = art?.querySelector("svg");
    const node = art?.querySelector('span[class*="headNode"]');
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom };
    };
    const cs = (el, props) =>
      el ? Object.fromEntries(props.map((p) => [p, getComputedStyle(el)[p]])) : null;
    const path = svg?.querySelector("line");
    return {
      scrollY: window.scrollY,
      art: r(art),
      img: r(img),
      svg: r(svg),
      node: r(node),
      artTransform: getComputedStyle(art).transform,
      imgTransform: getComputedStyle(img).transform,
      shown: art?.hasAttribute("data-shown") ?? false,
      motion: document.documentElement.dataset.motion ?? document.querySelector("[data-motion]")?.dataset.motion ?? null,
      svgStyle: cs(svg, ["overflow", "width", "height", "right", "top"]),
      strokeWidth: path ? getComputedStyle(path).strokeWidth : null,
      dashoffset: path ? getComputedStyle(path).strokeDashoffset : null,
      nodeOpacity: node ? getComputedStyle(node).opacity : null,
      artOpacity: art ? getComputedStyle(art).opacity : null,
    };
  });

  // The joint is the bottom of the mark, which is the top of the SVG box.
  const jointY = geo.svg.y;
  const jointX = geo.svg.right; // the line starts at the box's top-right corner
  const d = vp.dsf;
  const pad = 82; // css px around the joint
  const clip = {
    x: Math.max(0, Math.round(jointX - pad)),
    y: Math.max(0, Math.round(jointY - pad)),
    width: pad * 2,
    height: pad * 2,
  };
  const png = await page.screenshot({ clip });
  const img = decode(png);

  // Device-pixel coordinates of the joint inside the crop.
  const jx = (jointX - clip.x) * d;
  const jy = (jointY - clip.y) * d;
  const slopeDev = -0.7035; // dx per dy, down-left; only a tracking guess
  // Clear of the overlap on both sides, and clear of the node at the far end.
  const upFrom = Math.round(6 * d);
  const upTo = Math.round(70 * d);
  const downFrom = Math.round(4.5 * d);
  const downTo = Math.round(Math.min(30, geo.svg.h - 9) * d);
  const track = (y) => jx + slopeDev * (y - jy);
  const near = Math.round(12 * d);

  const raster = fitSide(img, Math.round(jy) - upFrom, Math.round(jy) - upTo, track(jy - upFrom), slopeDev, 7 * d, near);
  const vector = fitSide(img, Math.round(jy) + downFrom, Math.round(jy) + downTo, track(jy + downFrom), slopeDev, 7 * d, near);

  const rec = {
    vp: `${vp.w}x${vp.h}@${vp.dsf}`,
    geo,
    // The gap between where the SVG's start actually landed and where the file
    // says the raster's centreline leaves the mark. Layout, not pixels.
    layoutOffsetPx: geo.svg.right - (geo.art.right - FILE_FRAC_R * geo.art.w),
  };
  if (!raster || !vector) {
    rec.error = `fit failed (raster ${!!raster}, vector ${!!vector})`;
    failures += 1;
  } else {
    const offset = (vector.at(jy) - raster.at(jy)) / d;
    const degR = (Math.atan(-raster.slope) * 180) / Math.PI;
    const degV = (Math.atan(-vector.slope) * 180) / Math.PI;
    Object.assign(rec, {
      offsetPx: offset,
      rasterDeg: degR,
      vectorDeg: degV,
      angleDelta: degV - degR,
      rasterWidthPx: (raster.width * Math.abs(Math.cos(Math.atan(raster.slope)))) / d,
      vectorWidthPx: (vector.width * Math.abs(Math.cos(Math.atan(vector.slope)))) / d,
      rasterRms: raster.rms / d,
      vectorRms: vector.rms / d,
      cssStroke: geo.strokeWidth,
    });
    if (Math.abs(offset) > 0.5 || Math.abs(degV - degR) > 0.3) failures += 1;
  }
  rows.push(rec);

  // A 3x zoom of the joint for the owner.
  const shot = `${OUT}/${label}-${vp.w}x${vp.h}-dsf${vp.dsf}${reduced ? "-reduced" : ""}`;
  writeFileSync(`${shot}-raw.png`, png);
  const side = Math.round(44 * d);
  execFileSync("magick", [
    `${shot}-raw.png`,
    "-crop", `${side}x${side}+${Math.round(jx - side / 2)}+${Math.round(jy - side / 2)}`,
    "+repage",
    "-filter", "point",
    "-resize", "300%",
    `${shot}-zoom.png`,
  ]);
  await page.close();
}

await browser.close();
rmSync(`${TMP}/scratch.png`, { force: true });

const f = (v, n = 2) => (typeof v === "number" ? v.toFixed(n) : String(v));
console.log(`\n=== contact trail joint — ${label}${reduced ? " (reduced motion)" : ""} ===`);
console.log(
  ["viewport", "layout off", "offset px", "raster deg", "svg deg", "dAngle", "raster w", "svg w", "css stroke", "shown"]
    .map((s) => s.padStart(11))
    .join(""),
);
for (const r of rows) {
  if (r.error) {
    console.log(`${r.vp.padStart(11)}  ${r.error} (layout off ${f(r.layoutOffsetPx)})`);
    continue;
  }
  console.log(
    [
      r.vp,
      f(r.layoutOffsetPx),
      f(r.offsetPx),
      f(r.rasterDeg, 2),
      f(r.vectorDeg, 2),
      f(r.angleDelta, 2),
      f(r.rasterWidthPx),
      f(r.vectorWidthPx),
      r.cssStroke,
      String(r.geo.shown),
    ]
      .map((s) => String(s).padStart(11))
      .join(""),
  );
}
for (const r of rows) {
  console.log(
    `${r.vp}: img transform ${r.geo.imgTransform}, art transform ${r.geo.artTransform}, dashoffset ${r.geo.dashoffset}, node opacity ${r.geo.nodeOpacity}, art opacity ${r.geo.artOpacity}, svg overflow ${r.geo.svgStyle?.overflow}, svg box ${f(r.geo.svg.w)}x${f(r.geo.svg.h)}, mark ${f(r.geo.img.w)}x${f(r.geo.img.h)}`,
  );
}
writeFileSync(`${OUT}/${label}${reduced ? "-reduced" : ""}.json`, JSON.stringify(rows, null, 2));
console.log(`\n${failures} viewport(s) outside tolerance (offset <= 0.5px, angle <= 0.3deg).`);
