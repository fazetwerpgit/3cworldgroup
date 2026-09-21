import { chromium } from "playwright";
import { decodePng } from "./png.mjs";
import fs from "node:fs";
const B = "http://127.0.0.1:3120";
const tmp = "/tmp/claude-1000/-home-fazetwerpnerd69-dev-3cworldgroup/8775fa2d-1e5a-44cb-bbfb-e4c983885754/scratchpad/cs.png";
// route, section id, css selector of the img, current pos
const T = [
  ["/", "closing", ".closingArt, [class*=closingArt]", "50% 58%"],
  ["/about", "closing", "[class*=closingArt]", "50% 55%"],
  ["/apply", "closing", "[class*=closingArt]", "50% 62%"],
  ["/opportunities", "apply", "[class*=applyArt], [class*=closingArt]", "50% 58%"],
  ["/opportunities", "glance", "[class*=glanceArt], [class*=glanceImage]", "62% 58%"],
  ["/about", "pageHead", "[class*=pageHeadImage]", "62% 48%"],
];
const b = await chromium.launch();
const mean = (path) => {
  const img = decodePng(fs.readFileSync(path)); const ch = img.channels;
  let s = 0, c = 0;
  for (let y = 0; y < img.height; y += 3) for (let x = 0; x < img.width; x += 3) {
    const i = (y * img.width + x) * ch;
    s += 0.2126 * img.pixels[i] + 0.7152 * img.pixels[i + 1] + 0.0722 * img.pixels[i + 2]; c++;
  }
  return s / c;
};
for (const [route, sec, sel, cur] of T) {
  const ctx = await b.newContext({ viewport: { width: 1740, height: 1000 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(B + route, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: "html{scroll-behavior:auto !important} nextjs-portal{display:none!important}" });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(x => requestAnimationFrame(x)); } });
  await p.waitForTimeout(800);
  const target = sec === "pageHead" ? "header" : `#${sec}`;
  const el = await p.$(target);
  if (!el) { console.log("MISS", route, sec); await ctx.close(); continue; }
  await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  const row = [];
  const xs = sec === "glance" ? ["40%", "48%", "56%", "62%"] : ["50%"];
  for (const X of xs) for (const Y of ["18%", "26%", "34%", "42%", "50%", "58%", "66%"]) {
    await p.evaluate(([s, pos]) => { document.querySelectorAll(s).forEach(i => i.style.objectPosition = pos); }, [sel, `${X} ${Y}`]);
    await p.waitForTimeout(160);
    await el.screenshot({ path: tmp });
    row.push(`${X} ${Y}=${mean(tmp).toFixed(0)}`);
  }
  console.log(`${route} #${sec} (now ${cur})  ${row.join("  ")}`);
  await ctx.close();
}
await b.close();
