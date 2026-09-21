import { chromium } from "playwright";
const b = await chromium.launch();
const sites = [["vivint","https://www.vivint.com/careers"],["aptive","https://goaptive.com/careers"],["sunrun","https://www.sunrun.com/careers"],["robert-half","https://www.roberthalf.com/us/en"]];
for (const [n,u] of sites) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  try { await p.goto(u, { waitUntil: "domcontentloaded", timeout: 25000 }); await p.waitForTimeout(2500);
    await p.screenshot({ path: `docs/cinematic/ad-explore/refs/${n}.png`, fullPage: false }); console.log("ok", n); }
  catch (e) { console.log("fail", n, String(e).slice(0,80)); }
  await p.close();
}
await b.close();
