import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3120";
const OUT = "/home/fazetwerpnerd69/dev/3cwg-cinematic/.tmpshots/motion/pages";
const fails = [];
const note = (s) => console.log(s);

const browser = await chromium.launch();

async function probe404(w, h, tag, mobile = false) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    ...(mobile ? { isMobile: true, deviceScaleFactor: 3, hasTouch: true } : {}),
  });
  const errs = [];
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/Failed to load resource.*404/.test(t) || /webpack-hmr|hot-update/.test(t)) return;
    errs.push(t);
  });
  const res = await page.goto(`${BASE}/nope`, { waitUntil: "networkidle" });
  if (res.status() !== 404) fails.push(`${tag}: status ${res.status()}`);

  const m = await page.evaluate(() => {
    const shell = document.querySelector("main")?.parentElement;
    const footer = document.querySelector("footer");
    const cs = getComputedStyle(shell);
    return {
      shellDisplay: cs.display,
      shellDir: cs.flexDirection,
      shellMin: cs.minHeight,
      shellH: shell.getBoundingClientRect().height,
      mainFlex: getComputedStyle(document.querySelector("main")).flexGrow,
      footerBottom: footer.getBoundingClientRect().bottom,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      docH: document.documentElement.scrollHeight,
      innerH: window.innerHeight,
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    };
  });
  note(`${tag}: display=${m.shellDisplay}/${m.shellDir} minH=${m.shellMin} shellH=${m.shellH.toFixed(0)} mainFlexGrow=${m.mainFlex} footerBottom=${m.footerBottom.toFixed(0)} innerH=${m.innerH} docH=${m.docH} body=${m.bodyBg}`);

  if (m.footerBottom < m.innerH - 1) fails.push(`${tag}: footer bottom ${m.footerBottom.toFixed(0)} above viewport bottom ${m.innerH}`);
  // The page may still scroll a little on a phone: the footer alone is tall.
  // What matters is that it never ends short of the bottom edge.
  if (m.bodyBg !== "rgb(6, 23, 53)") fails.push(`${tag}: body ground ${m.bodyBg}`);
  if (m.scrollW !== m.innerW) fails.push(`${tag}: h-overflow ${m.scrollW} vs ${m.innerW}`);
  if (errs.length) fails.push(`${tag}: console ${errs[0]}`);

  await page.screenshot({ path: `${OUT}/not-found-${tag}.png`, fullPage: true });
  await ctx.close();
}

await probe404(1440, 900, "1440");
await probe404(1920, 1080, "1920");
await probe404(390, 844, "390", true);

// Other routes must be untouched.
for (const [w, h] of [[1366, 640], [1920, 1080]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  for (const route of ["/", "/contact", "/about"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => {
      const shell = document.querySelector("main")?.parentElement;
      const cs = getComputedStyle(shell);
      return {
        display: cs.display,
        minH: cs.minHeight,
        mainGrow: getComputedStyle(document.querySelector("main")).flexGrow,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        docH: document.documentElement.scrollHeight,
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      };
    });
    note(`${route} ${w}x${h}: display=${m.display} minH=${m.minH} mainGrow=${m.mainGrow} body=${m.bodyBg} docH=${m.docH}`);
    if (m.display !== "block") fails.push(`${route} ${w}: shell display ${m.display}`);
    if (m.minH !== "auto" && m.minH !== "0px") fails.push(`${route} ${w}: shell minH ${m.minH}`);
    if (m.mainGrow !== "0") fails.push(`${route} ${w}: main flex-grow ${m.mainGrow}`);
    if (m.bodyBg === "rgb(6, 23, 53)") fails.push(`${route} ${w}: body ground changed`);
    if (m.scrollW !== m.innerW) fails.push(`${route} ${w}: h-overflow`);
  }
  await ctx.close();
}

await browser.close();
console.log(fails.length ? "FAIL\n" + fails.join("\n") : "ALL CHECKS PASSED");
process.exit(fails.length ? 1 : 0);
