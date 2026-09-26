import { chromium } from 'playwright';
const out = '/tmp/claude-1000/-home-fazetwerpnerd69-dev-3cworldgroup/a1360a2f-1e42-41eb-b8f9-11f3322ff49d/scratchpad';
const b = await chromium.launch();
for (const [w,hh,name] of [[1440,900,'desk'],[390,844,'phone']]) {
  const p = await b.newPage({ viewport: { width: w, height: hh }, deviceScaleFactor: 1 });
  const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
  await p.goto('http://localhost:3120/design-lab/announce', { waitUntil: 'networkidle', timeout: 90000 });
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' }); await p.waitForTimeout(800);
  // screenshot the scroller content fully
  const H = await p.evaluate(() => { const m=document.getElementById('rep-main'); return m ? m.scrollHeight : document.body.scrollHeight; });
  await p.setViewportSize({ width: w, height: Math.min(H+120, 4000) });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/announce-${name}.png`, fullPage: true });
  console.log(name, H, errs.slice(0,5));
}
await b.close();
