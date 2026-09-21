// node docs/cinematic/review/menu.mjs — phone menu sheet: open, Escape, open, navigate closes
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:3120/", { waitUntil: "networkidle" });
const toggle = page.locator("button[aria-expanded]").first();
const state = async () => (await toggle.getAttribute("aria-expanded")) + " sheetHidden=" + (await page.locator("[id][hidden]").count());
await toggle.click(); console.log("after open:", await state());
await page.keyboard.press("Escape"); console.log("after esc :", await state());
await toggle.click(); console.log("after open:", await state());
await page.locator("[class*=menuSheet] a[href='/about']").click(); await page.waitForURL("**/about"); await page.waitForTimeout(300);
console.log("after nav :", await state(), page.url());
await page.goBack(); await page.waitForTimeout(300); console.log("after back:", await state(), page.url());
await browser.close();
