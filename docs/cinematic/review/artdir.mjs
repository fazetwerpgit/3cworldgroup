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
    const res = await p.evaluate(() => {
      const range = document.createRange();
      const lines = (el) => {
        const rows = new Map();
        const walk = (n) => {
          if (n.nodeType === 3 && n.textContent.trim()) {
            range.selectNodeContents(n);
            for (const rc of range.getClientRects()) {
              if (rc.width < 1) continue;
              const key = Math.round(rc.top);
              let hit = null; for (const k of rows.keys()) if (Math.abs(k - key) <= 8) hit = k;
              const k = hit ?? key; const cur = rows.get(k) || { l: Infinity, r: -Infinity };
              cur.l = Math.min(cur.l, rc.left); cur.r = Math.max(cur.r, rc.right); rows.set(k, cur);
            }
          } else if (n.nodeType === 1 && getComputedStyle(n).display !== "none") for (const c of n.childNodes) walk(c);
        };
        walk(el);
        return [...rows.entries()].sort((a, c) => a[0] - c[0]).map(([, v]) => Math.round(v.r - v.l));
      };
      const h1 = document.querySelector("h1");
      const lime = h1 && h1.querySelector("[class*=Lime], [class*=lime]");
      const imgs = [...document.querySelectorAll("img")].filter((i) => i.getBoundingClientRect().width > 40)
        .map((i) => {
          const rc = i.getBoundingClientRect();
          const src = (i.currentSrc || i.src).replace(/.*(?:url=)?%2F?/, "").replace(/.*\//, "").split("&")[0];
          return { src: decodeURIComponent(src), pos: getComputedStyle(i).objectPosition,
                   box: `${Math.round(rc.width)}x${Math.round(rc.height)}`,
                   sec: (i.closest("section")?.id || i.closest("section")?.className || "?").split(/\s+/)[0] };
        });
      const seen = {}; const dupes = [];
      imgs.forEach((i) => { (seen[i.src] ||= []).push(i.sec); });
      for (const [src, secs] of Object.entries(seen)) if (new Set(secs).size > 1 || secs.length > 1) dupes.push(`${src} -> ${secs.join(", ")}`);
      return { h1: h1 ? lines(h1) : null, limeLines: lime ? lines(lime) : null, imgs, dupes };
    });
    console.log(` ${r}  h1 lines ${JSON.stringify(res.h1)}  lime ${JSON.stringify(res.limeLines)}`);
    if (res.dupes.length) res.dupes.forEach((d) => console.log(`   DUP ${d}`));
    res.imgs.forEach((i) => console.log(`   img ${i.box.padEnd(10)} ${i.pos.padEnd(12)} ${i.sec.padEnd(22)} ${i.src}`));
    await p.context().close();
  }
}
await b.close();
