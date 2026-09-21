import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:3120/services",{waitUntil:"networkidle"});
await p.waitForTimeout(1000);
await p.locator("header button[aria-expanded]").first().click();
await p.waitForTimeout(400);
console.log("menu open:", await p.locator("header button[aria-expanded]").first().getAttribute("aria-expanded"));
// tap the always-visible lime Apply in headerActions (not the sheet link)
await p.locator("header [class*=headerActions] a[href='/apply']").click();
await p.waitForURL("**/apply",{timeout:8000});
await p.waitForTimeout(1200);
console.log("url:", p.url());
console.log("menu STILL open:", await p.locator("header button[aria-expanded]").first().getAttribute("aria-expanded"));
console.log("sheet hidden attr:", await p.locator("header div[id]").first().getAttribute("hidden"));
await p.screenshot({path:"docs/cinematic/review/shots/BUG-menu-persists-after-apply-390.png"});
// back button test
await p.goBack(); await p.waitForTimeout(1000);
console.log("after back, menu open:", await p.locator("header button[aria-expanded]").first().getAttribute("aria-expanded"));
await b.close();
