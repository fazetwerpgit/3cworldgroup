// node docs/cinematic/review/forms.mjs — Contact + Apply submit paths with the API mocked (nothing real is sent)
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const posted = [];
await page.route("**/api/public/**", async (route) => {
  const req = route.request();
  posted.push({ url: req.url().replace(/^.*\/api/, "/api"), body: req.postDataJSON() });
  const fail = req.url().includes("fail=1") || page.url().includes("fail=1");
  await route.fulfill({ status: fail ? 500 : 200, contentType: "application/json", body: JSON.stringify(fail ? { error: "Mock failure" } : { success: true }) });
});
const fillContact = async () => {
  await page.fill("#contact-name", "Test Person"); await page.fill("#contact-email", "test@example.com");
  await page.selectOption("#contact-subject", "services"); await page.fill("#contact-message", "Mocked message.");
};
// Contact: success
await page.goto("http://localhost:3120/contact", { waitUntil: "networkidle" });
await fillContact(); await page.click("button[type=submit]"); await page.waitForTimeout(500);
console.log("contact ok  :", (await page.locator("text=Message sent.").count()) === 1 ? "success screen" : "NO success screen", JSON.stringify(posted.at(-1)));
// Contact: server failure
await page.goto("http://localhost:3120/contact?fail=1", { waitUntil: "networkidle" });
await fillContact(); await page.click("button[type=submit]"); await page.waitForTimeout(500);
console.log("contact fail:", (await page.locator("form [role=alert]").innerText()).trim() || "NO error text", "| sent screen:", await page.locator("text=Message sent.").count());
// Contact: honeypot filled → no request
posted.length = 0;
await page.goto("http://localhost:3120/contact", { waitUntil: "networkidle" });
await fillContact(); await page.evaluate(() => { const el = document.querySelector("#contact-website"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, "spam"); el.dispatchEvent(new Event("input", { bubbles: true })); });
await page.click("button[type=submit]"); await page.waitForTimeout(400);
console.log("contact bot :", "requests", posted.length, "| success screen", await page.locator("text=Message sent.").count());
// Apply: submitted within 3s of load must now POST
posted.length = 0;
await page.goto("http://localhost:3120/apply", { waitUntil: "domcontentloaded" });
const t0 = Date.now();
await page.fill("#apply-name", "Test Person"); await page.fill("#apply-phone", "5550100"); await page.fill("#apply-email", "test@example.com");
const city = page.locator("#apply-city"); if (await city.count()) { const tag = await city.evaluate((e) => e.tagName); tag === "SELECT" ? await city.selectOption({ index: 1 }) : await city.fill("Dallas"); }
await page.click("form button[type=submit]"); await page.waitForTimeout(600);
console.log("apply fast  :", `${Date.now() - t0}ms after load`, "| POSTs", posted.length, JSON.stringify(posted.at(-1)?.body ?? null));
await browser.close();
