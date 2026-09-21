import { chromium } from "playwright";
const B = "http://127.0.0.1:3120";
const routes = ["/", "/about", "/services", "/opportunities", "/contact", "/apply"];
const b = await chromium.launch();
for (const [w, h] of [[390, 844], [430, 932], [1740, 1000]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  for (const r of routes) {
    await p.goto(B + r, { waitUntil: "networkidle" });
    await p.addStyleTag({ content: "html{scroll-behavior:auto !important}" });
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(x => requestAnimationFrame(x)); } window.scrollTo(0, 0); });
    await p.waitForTimeout(700);
    const res = await p.evaluate(() => {
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const small = [], tiny = [];
      for (const el of document.querySelectorAll("a[href], button")) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        /* WCAG 2.2 SC 2.5.8 exempts a link set in a sentence: its size is
           determined by the line it sits in, and padding it out would break
           the paragraph. Skip inline anchors whose parent carries other text;
           everything that is its own control still has to clear 24px. */
        const display = getComputedStyle(el).display;
        if (display === "inline" && el.parentElement) {
          const own = (el.textContent || "").trim();
          const around = (el.parentElement.textContent || "").trim();
          if (around.length > own.length + 2) continue;
        }
        if (r.height < 24) small.push(`${el.tagName}:${(el.textContent || "").trim().slice(0, 22)}=${r.height.toFixed(0)}`);
      }
      for (const el of document.querySelectorAll("p,span,a,li,label,div,small,em,strong")) {
        if (!el.firstChild || el.firstChild.nodeType !== 3 || !el.textContent.trim()) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 11 && el.getBoundingClientRect().height > 0) tiny.push(`${(el.textContent || "").trim().slice(0, 22)}=${fs}`);
      }
      return { overflow: +overflow.toFixed(1), small: [...new Set(small)], tiny: [...new Set(tiny)] };
    });
    const flag = (res.overflow > 1 || res.small.length || res.tiny.length) ? " <<<" : "";
    console.log(`${w} ${r.padEnd(16)} hOverflow=${res.overflow} under24=${res.small.length} under11px=${res.tiny.length}${flag}`);
    if (res.small.length) console.log("   small:", res.small.join(" | "));
    if (res.tiny.length) console.log("   tiny :", res.tiny.join(" | "));
  }
  await ctx.close();
}
await b.close();
