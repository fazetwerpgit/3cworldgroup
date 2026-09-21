import { chromium } from "playwright";
const B = "http://127.0.0.1:3120";
const routes = ["/", "/about", "/services", "/opportunities", "/contact", "/apply"];
const b = await chromium.launch();
for (const [w, h] of [[1740, 1000], [1440, 900], [390, 844]]) {
  console.log(`===== ${w} =====`);
  for (const r of routes) {
    const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
    await p.goto(B + r, { waitUntil: "networkidle" });
    await p.addStyleTag({ content: "html{scroll-behavior:auto !important}" });
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(x => requestAnimationFrame(x)); } });
    await p.waitForTimeout(700);
    const bad = await p.evaluate(() => {
      const out = [];
      const range = document.createRange();
      const lineBoxes = (el) => {
        // walk text nodes, collect client rects grouped by top
        const rows = new Map();
        const walk = (n) => {
          if (n.nodeType === 3 && n.textContent.trim()) {
            range.selectNodeContents(n);
            for (const rc of range.getClientRects()) {
              if (rc.width < 1 || rc.height < 1) continue;
              const key = Math.round(rc.top);
              let hit = null;
              for (const k of rows.keys()) if (Math.abs(k - key) <= 6) hit = k;
              const k = hit ?? key;
              const cur = rows.get(k) || { l: Infinity, r: -Infinity, t: [] };
              cur.l = Math.min(cur.l, rc.left); cur.r = Math.max(cur.r, rc.right);
              rows.set(k, cur);
            }
          } else if (n.nodeType === 1 && getComputedStyle(n).display !== "none") {
            for (const c of n.childNodes) walk(c);
          }
        };
        walk(el);
        return [...rows.entries()].sort((a, b2) => a[0] - b2[0]).map(([t, v]) => ({ t, w: Math.round(v.r - v.l) }));
      };
      const sel = "h1, h2, h3, [class*=Title], [class*=Lede], [class*=heroTitle], [class*=Accent]";
      for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || !el.textContent.trim()) continue;
        const fs = parseFloat(cs.fontSize);
        const rect = el.getBoundingClientRect();
        if (rect.height < 4) continue;
        const lines = lineBoxes(el);
        if (lines.length < 2) continue;
        const words = el.textContent.trim().split(/\s+/);
        const last = lines[lines.length - 1];
        const maxW = Math.max(...lines.map((l) => l.w));
        // widow: last line under 22% of the widest, or a single short word
        if (last.w > 0 && last.w / maxW < 0.22) {
          out.push({ why: "widow", fs: Math.round(fs), n: lines.length, ratio: +(last.w / maxW).toFixed(2), txt: el.textContent.trim().slice(0, 52), tail: words[words.length - 1] });
        }
      }
      return out;
    });
    if (bad.length) { console.log(` ${r}`); bad.forEach((x) => console.log(`   ${x.why} ${x.fs}px lines=${x.n} last/max=${x.ratio} tail="${x.tail}" :: ${x.txt}`)); }
    await p.context().close();
  }
}
await b.close();
