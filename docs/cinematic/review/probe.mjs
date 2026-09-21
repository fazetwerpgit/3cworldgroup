import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1740, height: 1000 }, deviceScaleFactor: 1 })).newPage();
await p.goto("http://127.0.0.1:3120/services", { waitUntil: "networkidle" });
await p.addStyleTag({ content: "html{scroll-behavior:auto !important}" });
await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => requestAnimationFrame(r)); } });
await p.waitForTimeout(800);
console.log(await p.evaluate(() => {
  const band = document.querySelector("#fiber");
  const art = band.querySelector("[class*=bandArt]");
  const shell = band.querySelector("[class*=bandShell]");
  const copy = band.querySelector("[class*=bandCopy]");
  const body = band.querySelector("[class*=bandBody]");
  const r = (e) => { const x = e.getBoundingClientRect(); return { x: Math.round(x.x), w: Math.round(x.width) }; };
  return JSON.stringify({ band: r(band), art: r(art), shell: r(shell), copy: r(copy), body: r(body),
    shellCS: getComputedStyle(shell).paddingLeft + " / " + getComputedStyle(shell).paddingRight + " maxw " + getComputedStyle(shell).maxWidth,
    cols: getComputedStyle(band).gridTemplateColumns }, null, 1);
}));
await b.close();
