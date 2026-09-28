import { chromium } from 'playwright';
const out = '/tmp/claude-1000/-home-fazetwerpnerd69-dev-3cworldgroup/a1360a2f-1e42-41eb-b8f9-11f3322ff49d/scratchpad/ls';
const only = process.argv[2];
const b = await chromium.launch();
for (const [w, h, tag, mobile] of [[390, 844, 'p', true], [1440, 900, 'd', false]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.goto('http://localhost:3120/design-lab/logsale-c', { waitUntil: 'networkidle' });
  await pg.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: out + '/' + tag + '-entry.png' });
  await pg.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Enter manually/.test(b.textContent)).click());
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: out + '/' + tag + '-details.png' });
  await pg.evaluate(() => { const m = document.getElementById('rep-main'); m.scrollTop = m.scrollHeight; window.scrollTo(0, document.body.scrollHeight); });
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: out + '/' + tag + '-details-end.png' });
  await pg.goto('http://localhost:3120/design-lab/logsale-c?state=scan', { waitUntil: 'networkidle' });
  await pg.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: out + '/' + tag + '-scan.png' });
  console.log(tag, 'errors:', errs.length ? errs : 'none');
  await ctx.close();
}
await b.close();
