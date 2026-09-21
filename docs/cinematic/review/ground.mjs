// node docs/cinematic/review/ground.mjs [width] — runs of ink vs paper ground down each route, with lime CTA positions
import { chromium } from "playwright";
const width = Number(process.argv[2] || 390);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 } });
for (const route of ["/", "/about", "/services", "/opportunities", "/contact", "/apply"]) {
  await page.goto(`http://localhost:3120${route}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "html{scroll-behavior:auto !important}" });
  await page.evaluate(async () => { for (let i = 0; i < document.body.scrollHeight; i += 400) { window.scrollTo(0, i); await new Promise(r => setTimeout(r, 30)); } window.scrollTo(0, 0); });
  const data = await page.evaluate(() => {
    // Page heads are top-level <header>s with a photo over ink; they count as ink runs and carry a CTA.
    const secs = [...document.querySelectorAll("main > header, main > div > header, main > section, main > div > section, section[id], footer")].filter(s => s.getBoundingClientRect().height > 40);
    const lum = (el) => { let e = el; while (e) { const bg = getComputedStyle(e).backgroundColor; const m = bg.match(/\d+/g); if (m && m[3] !== "0" && !(m[0]==="0"&&m[1]==="0"&&m[2]==="0"&&bg.includes("0)"))) { return (0.299*m[0]+0.587*m[1]+0.114*m[2]); } e = e.parentElement; } return 255; };
    const out = secs.map(s => { const r = s.getBoundingClientRect(); return { id: s.id || s.tagName.toLowerCase(), top: Math.round(r.top + scrollY), h: Math.round(r.height), ground: (lum(s) < 90 || s.tagName === "HEADER" || /hero/.test(s.className)) ? "ink" : "paper", ctas: [...s.querySelectorAll("a[class*=btnLime], button[class*=btnLime]")].map(a => a.textContent.trim().slice(0, 28)) }; });
    return { height: document.body.scrollHeight, out };
  });
  const runs = []; for (const s of data.out) { const last = runs.at(-1); if (last && last.ground === s.ground) { last.h += s.h; last.ids.push(s.id); last.ctas.push(...s.ctas); } else runs.push({ ground: s.ground, h: s.h, ids: [s.id], ctas: [...s.ctas] }); }
  console.log(`${route} @${width} total ${data.height}px`);
  for (const r of runs) console.log(`  ${r.ground.padEnd(5)} ${String(r.h).padStart(5)}px  ${r.ids.join("+")}${r.ctas.length ? "  CTA: " + r.ctas.join(" | ") : ""}`);
}
await browser.close();
