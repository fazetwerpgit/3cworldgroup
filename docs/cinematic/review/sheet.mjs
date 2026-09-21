import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const dir = path.resolve(process.argv[2]), out = process.argv[3], cols = Number(process.argv[4] || 3);
const files = fs.readdirSync(dir).filter(f => f.endsWith(".png")).sort();
const html = `<body style="margin:0;background:#1a1a1a;display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px">` +
  files.map(f => `<div style="position:relative;background:#000"><img src="${encodeURIComponent(f)}" style="width:100%;display:block"><div style="position:absolute;left:0;bottom:0;background:#000d;color:#8dc63f;font:13px monospace;padding:3px 6px">${f.replace(".png", "")}</div></div>`).join("") + `</body>`;
const page = path.join(dir, "_sheet.html");
fs.writeFileSync(page, html);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1560, height: 100 } });
await p.goto("file://" + page); await p.waitForTimeout(2500);
await p.screenshot({ path: out, fullPage: true });
await b.close();
fs.unlinkSync(page);
console.log(files.length, "tiles");
