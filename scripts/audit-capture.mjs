// Visual-audit capture harness. Logs into the portal once, then for each
// route captures light/dark/mobile screenshots, console+page errors, and an
// interactive-element census. Read-only: it never clicks anything.
//
//   node scripts/audit-capture.mjs --out .audit/g1 /portal/dashboard /portal/sales
//   node scripts/audit-capture.mjs --out .audit/login --no-auth /portal
//
// Env: AUDIT_EMAIL / AUDIT_PASSWORD override the default QA bot credentials.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
if (outIdx === -1) {
  console.error('Usage: node scripts/audit-capture.mjs --out <dir> [--no-auth] <route> [route...]');
  process.exit(1);
}
const outDir = args[outIdx + 1];
const noAuth = args.includes('--no-auth');
const routes = args.filter((a, i) => a.startsWith('/') && i !== outIdx + 1);
if (routes.length === 0) {
  console.error('No routes given.');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const EMAIL = process.env.AUDIT_EMAIL || 'qa-e2e-1@3cworldgroup.test';
const PASSWORD = process.env.AUDIT_PASSWORD || `${process.env.E2E_BOT_SECRET}#1`;
const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:3000';

const slug = (r) => r.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'root';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const results = [];

if (!noAuth) {
  await page.goto(`${BASE}/portal`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/portal/dashboard', { timeout: 30_000 });
  await page.waitForTimeout(1500);
}

for (const route of routes) {
  const name = slug(route);
  const errors = [];
  const onConsole = (msg) => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 300));
  };
  const onError = (err) => errors.push(`pageerror: ${String(err).slice(0, 300)}`);
  page.on('console', onConsole);
  page.on('pageerror', onError);

  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 45_000 });
  } catch {
    // capture whatever rendered
  }
  await page.waitForTimeout(1800); // let entrance animations settle + data land

  // Light desktop
  await page.screenshot({ path: join(outDir, `${name}--light.png`) });

  // Dark desktop
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outDir, `${name}--dark.png`) });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));

  // Mobile light
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, `${name}--mobile.png`) });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);

  // Interactive-element census (visibility + disabled state, no clicking)
  const census = await page.evaluate(() => {
    const els = [...document.querySelectorAll('a[href], button, [role="button"], input, select, textarea')];
    const seen = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const visible = r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      if (!visible) continue;
      seen.push({
        tag: el.tagName.toLowerCase(),
        text: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '')
          .trim()
          .slice(0, 60),
        href: el.getAttribute('href') || undefined,
        disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true' || undefined,
        tiny: r.width < 24 || r.height < 24 || undefined, // touch-target smell
      });
    }
    return seen;
  });

  page.off('console', onConsole);
  page.off('pageerror', onError);

  results.push({ route, screenshots: [`${name}--light.png`, `${name}--dark.png`, `${name}--mobile.png`], consoleErrors: errors, interactive: census });
  console.log(`captured ${route} (${census.length} interactive elements, ${errors.length} console errors)`);
}

writeFileSync(join(outDir, 'census.json'), JSON.stringify(results, null, 2));
await browser.close();
console.log(`done -> ${outDir}`);
