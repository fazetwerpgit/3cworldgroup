import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:3120/services",{waitUntil:"networkidle"});
await p.waitForTimeout(1000);
const read = () => p.evaluate(() => {
  const sheet = document.querySelector("header div[id]");
  const hdr = document.querySelector("header");
  const cs = sheet ? getComputedStyle(sheet) : null;
  const after = getComputedStyle(hdr, "::after");
  return {
    bodyOverflow: getComputedStyle(document.body).overflow,
    sheetBg: cs ? cs.backgroundColor : null,
    sheetZ: cs ? cs.zIndex : null,
    backdrop: after.content !== "none" ? after.backgroundColor : "none",
  };
});
console.log("closed:", await read());
await p.locator("header button[aria-expanded]").first().click();
await p.waitForTimeout(500);
console.log("open  :", await read());
await p.screenshot({path:"docs/cinematic/review/shots/FIX-menu-open-390.png"});
// can the page behind scroll?
const y0 = await p.evaluate(() => window.scrollY);
await p.mouse.wheel(0, 900);
await p.waitForTimeout(400);
console.log("scrollY while open:", y0, "->", await p.evaluate(() => window.scrollY));
await p.locator("header button[aria-expanded]").first().click();
await p.waitForTimeout(400);
console.log("after close:", await read());
await b.close();
